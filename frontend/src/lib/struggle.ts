// Real-time "struggle detection" engine for the live workout.
//
// Continuously analyses the rider's telemetry (power / cadence / heart rate,
// plus optional pedal balance) using 10-second rolling averages and a small set
// of physiologically-grounded, personalised signals. A struggle is only flagged
// when TWO OR MORE signals fire together, which avoids false positives from a
// single momentary sensor dropout or a brief soft-pedal.
//
// Pure + framework-free so it can be unit-tested and driven from a hook. All
// state lives inside the StruggleEngine instance; nothing here touches React.

export type StruggleSample = {
  t: number;               // seconds elapsed in the ride
  power: number;           // watts (0 if no power source)
  cadence: number;         // rpm (0 if none)
  hr: number;              // bpm (0 if no wearable)
  target: number;          // current interval target watts
  balance?: number | null; // left-pedal power balance % (advanced power meters)
  remainingSec?: number;   // seconds left in the current interval (0/undefined if unknown)
};

export type StruggleReason =
  | "cadence_decay"
  | "hr_decoupling"
  | "hr_near_max"
  | "power_fade"
  | "power_variability"
  | "w_prime_low"
  | "erg_spiral"
  | "pedal_asymmetry";

export const REASON_LABEL: Record<StruggleReason, string> = {
  cadence_decay: "cadence dropping",
  hr_decoupling: "heart-rate decoupling",
  hr_near_max: "heart rate near max",
  power_fade: "power fading below target",
  power_variability: "choppy, uneven power",
  w_prime_low: "anaerobic tank nearly empty",
  erg_spiral: "ERG mechanical failure — power + cadence collapsing",
  pedal_asymmetry: "pedal stroke going one-sided",
};

// Priority when picking the single "primary" cause to coach on.
const REASON_PRIORITY: StruggleReason[] = [
  "erg_spiral",
  "w_prime_low",
  "hr_near_max",
  "power_fade",
  "hr_decoupling",
  "cadence_decay",
  "power_variability",
  "pedal_asymmetry",
];

export type StruggleConfig = {
  ftp: number;
  maxHr: number;
  age?: number;          // rider age — used to age-adjust W′ recovery (G50 FIT)
  cadLow: number;
  cadHigh: number;
  ergMode: boolean;
  trainerOn: boolean;   // a power/cadence source is streaming
  wearableOn: boolean;  // a heart-rate source is streaming
};

export type StruggleState = {
  active: boolean;
  severity: "none" | "mild" | "high";
  safety: boolean;
  reasons: StruggleReason[];
  primary: StruggleReason | null;
  wPrimePct: number;        // 0..1 of anaerobic reserve remaining
  wBalKj: number;           // W′ balance remaining, in kilojoules
  wPrimeKj: number;         // total W′ (anaerobic) capacity, in kilojoules
  timeToDepletionSec: number | null; // seconds until W′bal hits 0 at the current power (null when not depleting)
  preemptive: boolean;      // predicted to run out of W′ before the interval ends — urgent
  powerDeficitPct: number;  // fraction below target (0.12 = 12% under)
  cadenceVariancePct: number; // coefficient of variation of cadence over the window (0.11 = 11%)
  power: number;            // 10s rolling avg
  cadence: number;          // 10s rolling avg
  hr: number;               // 10s rolling avg
  nearMaxHrPct: number;     // hr / maxHr
  easePct: number;          // recommended ERG target reduction for this state (0.05 = 5%)
};

const IDLE: StruggleState = {
  active: false, severity: "none", safety: false, reasons: [], primary: null,
  wPrimePct: 1, wBalKj: 0, wPrimeKj: 0, timeToDepletionSec: null, preemptive: false,
  powerDeficitPct: 0, cadenceVariancePct: 0, power: 0, cadence: 0, hr: 0, nearMaxHrPct: 0,
  easePct: 0,
};

const WINDOW_SEC = 10;   // rolling analysis window
const WARMUP_SEC = 60;   // grace period — never flag a struggle in the first minute

/** Estimate max heart rate: prefer a measured value, else 220 − age, else 190. */
export function resolveMaxHr(maxHr?: number, age?: number): number {
  if (maxHr && maxHr >= 120 && maxHr <= 230) return Math.round(maxHr);
  if (age && age > 0 && age < 120) return Math.round(220 - age);
  return 190;
}

/** Anaerobic work capacity (W′) estimate in joules, scaled off FTP. */
function estimateWPrime(ftp: number): number {
  return Math.max(9000, Math.round((ftp || 250) * 70));
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export class StruggleEngine {
  private buf: StruggleSample[] = [];
  private cfg: StruggleConfig;
  private wPrime: number;
  private wBal: number;
  private cp: number;
  private lastT = -1;

  constructor(cfg: StruggleConfig) {
    this.cfg = { ...cfg };
    this.cp = cfg.ftp || 250;
    this.wPrime = estimateWPrime(this.cp);
    this.wBal = this.wPrime;
  }

  setConfig(cfg: Partial<StruggleConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
    if (cfg.ftp) {
      this.cp = cfg.ftp;
      const w = estimateWPrime(this.cp);
      // keep the same fraction depleted when FTP changes mid-ride
      const frac = this.wPrime > 0 ? this.wBal / this.wPrime : 1;
      this.wPrime = w;
      this.wBal = w * frac;
    }
  }

  reset() {
    this.buf = [];
    this.wBal = this.wPrime;
    this.lastT = -1;
  }

  /**
   * Skiba W′-balance model: deplete above CP, recover (bi-exponential) below.
   * Age-adjusted decay (G50 FIT): the base recovery time constant (tau) is
   * scaled up — i.e. recovery slowed — the further into the ride we are
   * (accumulated fatigue makes reconstitution less efficient bout-to-bout)
   * and, additively, for riders over 50 (reduced recovery capacity). This
   * prevents the model from ever OVER-estimating remaining anaerobic
   * capacity deep into a session or for a masters athlete.
   */
  private updateWbal(power: number, dt: number, elapsedSec: number) {
    if (dt <= 0 || dt > 5) return;
    if (power > this.cp) {
      this.wBal -= (power - this.cp) * dt;
    } else {
      const dcp = this.cp - power;
      const baseTau = 546 * Math.exp(-0.01 * dcp) + 316;
      const elapsedMin = Math.max(0, elapsedSec) / 60;
      const progressMult = 1 + Math.min(0.8, elapsedMin / 60);          // up to +80% by ~60 min in
      const age = this.cfg.age ?? 0;
      const ageMult = age >= 50 ? 1 + Math.min(0.5, (age - 50) * 0.02) : 1; // up to +50% at 75+
      const tau = baseTau * progressMult * ageMult;
      this.wBal += (this.wPrime - this.wBal) * (1 - Math.exp(-dt / tau));
    }
    this.wBal = Math.max(0, Math.min(this.wPrime, this.wBal));
  }

  push(s: StruggleSample) {
    const dt = this.lastT < 0 ? 0 : s.t - this.lastT;
    this.lastT = s.t;
    if (this.cfg.trainerOn) this.updateWbal(s.power, dt, s.t);
    this.buf.push(s);
    const cutoff = s.t - WINDOW_SEC;
    while (this.buf.length > 2 && this.buf[0].t < cutoff) this.buf.shift();
  }

  wPrimePct(): number {
    return this.wPrime > 0 ? this.wBal / this.wPrime : 1;
  }

  /** W′ balance remaining, in kilojoules. */
  wBalKj(): number {
    return Math.round((this.wBal / 1000) * 10) / 10;
  }

  /** Total W′ (anaerobic work capacity), in kilojoules. */
  wPrimeKj(): number {
    return Math.round((this.wPrime / 1000) * 10) / 10;
  }

  evaluate(): StruggleState {
    const buf = this.buf;
    if (buf.length < 5) return { ...IDLE, wPrimePct: this.wPrimePct(), wBalKj: this.wBalKj(), wPrimeKj: this.wPrimeKj() };
    const nowT = buf[buf.length - 1].t;
    const span = nowT - buf[0].t;
    if (span < WINDOW_SEC * 0.7) return { ...IDLE, wPrimePct: this.wPrimePct(), wBalKj: this.wBalKj(), wPrimeKj: this.wPrimeKj() };

    const { ftp, maxHr, cadLow, cadHigh, ergMode, trainerOn, wearableOn } = this.cfg;
    const powers = buf.map((b) => b.power);
    const cads = buf.map((b) => b.cadence).filter((c) => c > 0);
    const hrs = buf.map((b) => b.hr).filter((h) => h > 0);
    const target = buf[buf.length - 1].target || mean(buf.map((b) => b.target));

    const avgPower = mean(powers);
    const avgCad = cads.length ? mean(cads) : 0;
    const avgHr = hrs.length ? mean(hrs) : 0;
    const nearMaxHrPct = maxHr > 0 && avgHr > 0 ? avgHr / maxHr : 0;
    const powerDeficitPct = target > 0 && avgPower > 0 ? Math.max(0, (target - avgPower) / target) : 0;
    const cadenceVariancePct = avgCad > 0 && cads.length >= 6 ? std(cads, avgCad) / avgCad : 0;

    const reasons: StruggleReason[] = [];

    // 1) Cadence decay — sustained low rpm vs the target window / a 75 rpm floor.
    const cadFloor = Math.min(cadLow - 15, cadLow * 0.83, 75);
    if (trainerOn && avgCad > 0 && avgCad < cadFloor) reasons.push("cadence_decay");

    // 2) Power fade — actual rolling power 10%+ under target (FTP-based target).
    if (trainerOn && target > 0 && powerDeficitPct > 0.1) reasons.push("power_fade");

    // 3) HR near max — sub-maximal work but HR pinned high.
    if (wearableOn && nearMaxHrPct >= 0.93) reasons.push("hr_near_max");

    // 4) HR decoupling — over the window HR drifts UP while power drifts DOWN.
    if (wearableOn && trainerOn && buf.length >= 8) {
      const half = Math.floor(buf.length / 2);
      const p1 = mean(buf.slice(0, half).map((b) => b.power));
      const p2 = mean(buf.slice(half).map((b) => b.power));
      const h1 = mean(buf.slice(0, half).map((b) => b.hr).filter((h) => h > 0));
      const h2 = mean(buf.slice(half).map((b) => b.hr).filter((h) => h > 0));
      if (p1 > 0 && h1 > 0 && p2 < p1 * 0.95 && h2 > h1 * 1.05) reasons.push("hr_decoupling");
    }

    // 5) Power variability — choppy, spiky stroke (high CV) while working hard.
    if (trainerOn && avgPower > ftp * 0.5 && powers.length >= 6) {
      const cv = avgPower > 0 ? std(powers, avgPower) / avgPower : 0;
      if (cv > 0.2) reasons.push("power_variability");
    }

    // 6) W′ balance depletion — anaerobic tank nearly empty. Also compute the
    //    Time-to-Depletion equation (remaining W′bal ÷ (current power − CP))
    //    so we can tell a merely-low tank apart from one that's about to hit
    //    zero *before this interval is even over* — that's the case the coach
    //    needs to act on predictively, before cadence mechanically locks up.
    const curPower = buf[buf.length - 1].power;
    const wattsAboveCp = curPower - this.cp;
    const timeToDepletionSec = wattsAboveCp > 1 ? this.wBal / wattsAboveCp : null;
    const remainingIntervalSec = buf[buf.length - 1].remainingSec ?? 0;
    const lowWPrime = trainerOn && this.wPrimePct() < 0.15;
    if (lowWPrime) reasons.push("w_prime_low");
    const preemptive =
      lowWPrime && timeToDepletionSec != null && remainingIntervalSec > 0 &&
      timeToDepletionSec < remainingIntervalSec;

    // 7) ERG mechanical failure — the "spiral of death": resistance holds the
    //    watts target so cadence collapses instead. Standalone trigger (does
    //    not need any other signal): sustained power deficit for the whole 10s
    //    window, cadence under a fixed 75 rpm mechanical floor, AND an erratic
    //    (high-variance) stroke — i.e. the rider is genuinely bogged down, not
    //    just briefly soft-pedalling.
    if (ergMode && trainerOn && avgCad > 0 && cads.length >= 6 &&
        powerDeficitPct > 0.10 && avgCad < 75 && cadenceVariancePct > 0.10) {
      reasons.push("erg_spiral");
    }

    // 8) Pedal asymmetry — advanced power meter shows the stroke going one-sided.
    const bals = buf.map((b) => b.balance).filter((b): b is number => b != null && b > 0);
    if (bals.length >= 4) {
      const ab = mean(bals);
      if (Math.abs(ab - 50) > 15) reasons.push("pedal_asymmetry");
    }

    // Warm-up grace: allow the true SAFETY case through, otherwise stay quiet.
    const safety =
      wearableOn && nearMaxHrPct >= 0.95 &&
      reasons.includes("cadence_decay") && reasons.includes("power_fade");

    if (nowT < WARMUP_SEC && !safety) {
      return {
        ...IDLE, wPrimePct: this.wPrimePct(), wBalKj: this.wBalKj(), wPrimeKj: this.wPrimeKj(),
        timeToDepletionSec, powerDeficitPct, cadenceVariancePct,
        power: Math.round(avgPower), cadence: Math.round(avgCad), hr: Math.round(avgHr), nearMaxHrPct,
      };
    }

    // ERG mechanical failure and a predicted W′ blow-out are both decisive on
    // their own — neither needs a second signal to justify intervening.
    const active = safety || reasons.includes("erg_spiral") || preemptive || reasons.length >= 2;
    let severity: StruggleState["severity"] = "none";
    if (active) {
      const heavy = safety || preemptive || reasons.includes("erg_spiral") || reasons.length >= 3 ||
        (reasons.includes("hr_near_max") && reasons.length >= 2);
      severity = heavy ? "high" : "mild";
    }
    const primary = active ? (REASON_PRIORITY.find((r) => reasons.includes(r)) ?? reasons[0]) : null;

    // Recommended ERG target reduction: mechanical failure gets a small, precise
    // 5% trim (it fires fast, on a clean signal); a predicted W′ blow-out before
    // the interval ends gets a firmer 12% (protect the rest of the effort without
    // fully bailing); general multi-signal struggle keeps the gentler 8%; a
    // safety trip is a deep 45% drop into active recovery.
    let easePct = 0;
    if (active) {
      easePct = safety ? 0.45 : primary === "erg_spiral" ? 0.05 : preemptive ? 0.12 : 0.08;
    }

    return {
      active, severity, safety, reasons, primary,
      wPrimePct: this.wPrimePct(), wBalKj: this.wBalKj(), wPrimeKj: this.wPrimeKj(),
      timeToDepletionSec, preemptive,
      powerDeficitPct, cadenceVariancePct,
      power: Math.round(avgPower), cadence: Math.round(avgCad), hr: Math.round(avgHr), nearMaxHrPct,
      easePct,
    };
  }
}

/** A logged struggle moment for the post-ride summary/debrief. */
export type StruggleMoment = {
  t: number;                 // ride seconds when it began
  reasons: StruggleReason[];
  primary: StruggleReason | null;
  severity: "mild" | "high";
  safety: boolean;
  segment?: string | null;
};
