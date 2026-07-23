import { useEffect } from "react";
import { useFrameCallback, useSharedValue, SharedValue } from "react-native-reanimated";
import { AvatarInputs } from "./avatarConfigs";

export type AvatarMotion = {
  crank: SharedValue<number>;  // radians — near-leg crank angle
  wheel: SharedValue<number>;  // radians — wheel spin
  lean: SharedValue<number>;   // degrees — forward torso lean
  stand: SharedValue<number>;  // 0..1 — out-of-saddle amount (eased)
  effort: SharedValue<number>; // 0..1 — visible effort (eased)
};

// Reference scaling for effort mapping.
const POWER_SCALE = 320; // watts ~ where effort saturates

/** Drives smooth, data-reactive motion values from live trainer inputs.
 * - cadence  -> pedal (crank) speed
 * - power/resistance -> forward lean + effort
 * - isStanding -> eased out-of-saddle amount (sway/bob added downstream)
 * - isPaused -> pedalling & wheels stop, posture eases to idle
 * All easing runs on the UI thread for buttery transitions. */
export function useAvatarAnimation(inputs: AvatarInputs): AvatarMotion {
  const crank = useSharedValue(0);
  const wheel = useSharedValue(0);
  const lean = useSharedValue(6);
  const stand = useSharedValue(0);
  const effort = useSharedValue(0.3);

  // Targets live in shared values so the frame worklet can read them.
  const tCadence = useSharedValue(inputs.cadence);
  const tSpeed = useSharedValue(inputs.speed);
  const tEffort = useSharedValue(0.3);
  const tLean = useSharedValue(6);
  const tStand = useSharedValue(0);
  const paused = useSharedValue(inputs.isPaused ? 1 : 0);

  useEffect(() => {
    const e = Math.max(0, Math.min(1, (inputs.power / POWER_SCALE) * 0.6 + (inputs.resistance / 100) * 0.4));
    tCadence.value = inputs.cadence;
    tSpeed.value = inputs.speed;
    tEffort.value = e;
    tStand.value = inputs.isStanding ? 1 : 0;
    // Standing riders lean a touch more; effort deepens the lean.
    tLean.value = 5 + e * 15 + (inputs.isStanding ? 4 : 0);
    paused.value = inputs.isPaused ? 1 : 0;
  }, [inputs.cadence, inputs.power, inputs.resistance, inputs.speed, inputs.isStanding, inputs.isPaused,
      tCadence, tSpeed, tEffort, tLean, tStand, paused]);

  useFrameCallback((frame) => {
    "worklet";
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const active = paused.value < 0.5 ? 1 : 0;

    // Pedal & wheel advance by real angular speed (frozen when paused).
    const omega = (tCadence.value / 60) * 2 * Math.PI; // rad/s
    crank.value = (crank.value + omega * dt * active) % (Math.PI * 2);
    const wOmega = (tSpeed.value / 30) * 2 * Math.PI * 1.2;
    wheel.value = (wheel.value + wOmega * dt * active) % (Math.PI * 2);

    // Ease posture toward targets (paused -> relax toward idle).
    const k = Math.min(1, dt * 6);
    const leanGoal = active ? tLean.value : 3;
    const standGoal = active ? tStand.value : 0;
    const effGoal = active ? tEffort.value : 0.15;
    lean.value += (leanGoal - lean.value) * k;
    stand.value += (standGoal - stand.value) * k;
    effort.value += (effGoal - effort.value) * k;
  });

  return { crank, wheel, lean, stand, effort };
}
