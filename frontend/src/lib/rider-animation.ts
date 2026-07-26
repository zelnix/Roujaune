// Telemetry → rider-animation derivation engine for the Roujaune Virtual Route.
//
// This layer is deliberately independent of Rive: it takes raw (or simulated)
// telemetry and produces the full `CyclingTelemetry` value set that the Rive
// `CyclingTelemetry` View Model expects. It owns smoothing, pedal/wheel phase
// integration, power→effort and gradient→posture mapping, curvature→lean, and
// the derived boolean states. The Rive component simply pushes these values.

export type RiderArtboard =
  | "Rider_Younger_Male"
  | "Rider_Younger_Female"
  | "Rider_Mature_Male"
  | "Rider_Mature_Female";

/** Raw inputs the app feeds the engine each frame. */
export type RiderInputs = {
  cadenceRpm: number;
  powerWatts: number;
  speedKph: number;
  heartRateBpm?: number;
  gradientPct?: number;
  /** Route curvature -1..1 (right..left); mapped to lean if leanDeg absent. */
  curve?: number;
  /** Optional explicit lean override in degrees. */
  leanDeg?: number;
  ftp?: number;
  isConnected?: boolean;
  isPaused?: boolean;
  isSimulation?: boolean;
  isPedalling?: boolean;   // explicit; otherwise derived
  braking?: boolean;
  signalLost?: boolean;
  emergencyStop?: boolean;
  reducedMotion?: boolean;
  /** Wheel circumference (m) from the selected bike config; defaults to a road wheel. */
  wheelCircumferenceMetres?: number;
};

/** The complete value set bound to the Rive `CyclingTelemetry` View Model. */
export type CyclingTelemetry = {
  // numbers
  cadenceRpm: number;
  powerWatts: number;
  speedKph: number;
  heartRateBpm: number;
  gradientPct: number;
  pedalPhaseDeg: number;
  wheelPhaseDeg: number;
  effort01: number;
  climb01: number;
  descent01: number;
  stand01: number;
  coast01: number;
  brake01: number;
  leanDeg: number;
  bodyBob01: number;
  // booleans
  isConnected: boolean;
  isSimulation: boolean;
  isPaused: boolean;
  isPedalling: boolean;
  isCoasting: boolean;
  isStanding: boolean;
  signalLost: boolean;
  emergencyStop: boolean;
};

export const CYCLING_NUMBER_KEYS: (keyof CyclingTelemetry)[] = [
  "cadenceRpm", "powerWatts", "speedKph", "heartRateBpm", "gradientPct",
  "pedalPhaseDeg", "wheelPhaseDeg", "effort01", "climb01", "descent01",
  "stand01", "coast01", "brake01", "leanDeg", "bodyBob01",
];

export const CYCLING_BOOLEAN_KEYS: (keyof CyclingTelemetry)[] = [
  "isConnected", "isSimulation", "isPaused", "isPedalling", "isCoasting",
  "isStanding", "signalLost", "emergencyStop",
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach toward `target`. */
const approach = (prev: number, target: number, dt: number, tau: number) => {
  if (tau <= 0) return target;
  const a = 1 - Math.exp(-dt / tau);
  return prev + (target - prev) * a;
};
const wrap360 = (v: number) => ((v % 360) + 360) % 360;

const DEFAULT_WHEEL_CIRCUMFERENCE_M = 2.105; // road wheel; overridden per bike

export function createRiderAnimator() {
  // Smoothed / integrated state.
  const s = {
    cad: 0, pow: 0, spd: 0, hr: 0, grad: 0, lean: 0,
    effort: 0, climb: 0, descent: 0, stand: 0, coast: 0, brake: 0, bob: 0,
    pedal: 0, wheel: 0,
  };

  function step(i: RiderInputs, dtSec: number): CyclingTelemetry {
    const dt = clamp(dtSec, 0, 0.1);
    const ftp = i.ftp && i.ftp > 0 ? i.ftp : 250;
    const paused = !!i.isPaused;
    const emergency = !!i.emergencyStop;
    const frozen = paused || emergency;

    // Smooth the primary signals (snappy but stable).
    s.cad = approach(s.cad, Math.max(0, i.cadenceRpm || 0), dt, 0.28);
    s.pow = approach(s.pow, Math.max(0, i.powerWatts || 0), dt, 0.35);
    s.spd = approach(s.spd, Math.max(0, i.speedKph || 0), dt, 0.4);
    s.hr = approach(s.hr, Math.max(0, i.heartRateBpm || 0), dt, 0.8);
    s.grad = approach(s.grad, clamp(i.gradientPct ?? 0, -25, 30), dt, 0.5);

    // Derived pedalling / coasting.
    const pedalling = (i.isPedalling ?? (s.cad > 6)) && !frozen;
    const coastingTarget = (!pedalling && s.spd > 6) || (s.pow < 15 && s.spd > 10 && !frozen) ? 1 : 0;
    s.coast = approach(s.coast, frozen ? 0 : coastingTarget, dt, 0.3);

    // Effort from power (reaches ~1 near a hard sprint of ~1.6× FTP).
    const effortTarget = frozen ? 0 : clamp(s.pow / (ftp * 1.6), 0, 1);
    s.effort = approach(s.effort, effortTarget, dt, 0.4);

    // Posture blends from gradient (+ effort for standing).
    const climbTarget = frozen ? 0 : smoothstep(2, 10, s.grad);
    const descentTarget = frozen ? 0 : smoothstep(2, 12, -s.grad);
    const standTarget = frozen ? 0 : smoothstep(8, 14, s.grad) * smoothstep(0.55, 0.9, s.effort);
    s.climb = approach(s.climb, climbTarget, dt, 0.5);
    s.descent = approach(s.descent, descentTarget, dt, 0.5);
    s.stand = approach(s.stand, standTarget, dt, 0.6);

    // Braking.
    s.brake = approach(s.brake, i.braking && !frozen ? 1 : 0, dt, 0.2);

    // Lean from explicit override or route curvature.
    const leanTarget = clamp(i.leanDeg ?? (i.curve ?? 0) * 15, -18, 18);
    s.lean = approach(s.lean, frozen ? 0 : leanTarget, dt, 0.35);

    // Secondary body bob intensity (out on effort + cadence, damped when coasting).
    const cadNorm = clamp(s.cad / 110, 0, 1);
    const bobTarget = i.reducedMotion || frozen ? 0 : clamp(0.35 + 0.4 * s.effort + 0.35 * cadNorm, 0, 1) * (1 - 0.7 * s.coast);
    s.bob = approach(s.bob, bobTarget, dt, 0.25);

    // Phase integration (crank & wheels advance from cadence & speed).
    if (pedalling && s.coast < 0.5) {
      s.pedal = wrap360(s.pedal + s.cad * 6 * dt);          // 6 deg per rpm-second
    }
    if (!frozen) {
      const circ = i.wheelCircumferenceMetres && i.wheelCircumferenceMetres > 0 ? i.wheelCircumferenceMetres : DEFAULT_WHEEL_CIRCUMFERENCE_M;
      const revPerSec = (s.spd / 3.6) / circ;
      s.wheel = wrap360(s.wheel + revPerSec * 360 * dt);
    }

    return {
      cadenceRpm: Math.round(s.cad),
      powerWatts: Math.round(s.pow),
      speedKph: Math.round(s.spd * 10) / 10,
      heartRateBpm: Math.round(s.hr),
      gradientPct: Math.round(s.grad * 10) / 10,
      pedalPhaseDeg: Math.round(s.pedal * 10) / 10,
      wheelPhaseDeg: Math.round(s.wheel * 10) / 10,
      effort01: Math.round(s.effort * 1000) / 1000,
      climb01: Math.round(s.climb * 1000) / 1000,
      descent01: Math.round(s.descent * 1000) / 1000,
      stand01: Math.round(s.stand * 1000) / 1000,
      coast01: Math.round(s.coast * 1000) / 1000,
      brake01: Math.round(s.brake * 1000) / 1000,
      leanDeg: Math.round(s.lean * 100) / 100,
      bodyBob01: Math.round(s.bob * 1000) / 1000,
      isConnected: i.isConnected ?? false,
      isSimulation: i.isSimulation ?? true,
      isPaused: paused,
      isPedalling: pedalling,
      isCoasting: s.coast > 0.5,
      isStanding: s.stand > 0.5,
      signalLost: !!i.signalLost,
      emergencyStop: emergency,
    };
  }

  return { step };
}
