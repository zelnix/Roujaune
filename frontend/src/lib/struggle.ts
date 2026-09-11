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
  erg_spiral: "ERG spiral of death",
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
  powerDeficitPct: number;  // fraction below target (0.12 = 12% under)
  power: number;            // 10s rolling avg
  cadence: number;          // 10s rolling avg
  hr: number;               // 10s rolling avg
  nearMaxHrPct: number;     // hr / maxHr
};

const IDLE: StruggleState = {
  active: false, severity: "none", safety: false, reasons: [], primary: null,
  wPrimePct: 1, powerDeficitPct: 0, power: 0, cadence: 0, hr: 0, nearMaxHrPct: 0,
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

  /** Skiba W′-balance model: deplete above CP, recover (bi-exponential) below. */
  private updateWbal(power: number, dt: number) {
    if (dt <= 0 || dt > 5) return;
    if (power > this.cp) {
      this.wBal -= (power - this.cp) * dt;
    } else {
      const dcp = this.cp - power;
      const tau = 546 * Math.exp(-0.01 * dcp) + 316;
      this.wBal += (this.wPrime - this.wBal) * (1 - Math.exp(-dt / tau));
    }
    this.wBal = Math.max(0, Math.min(this.wPrime, this.wBal));
  }

  push(s: StruggleSample) {
    const dt = this.lastT < 0 ? 0 : s.t - this.lastT;
    this.lastT = s.t;
    if (this.cfg.trainerOn) this.updateWbal(s.power, dt);
    this.buf.push(s);
    const cutoff = s.t - WINDOW_SEC;
    while (this.buf.length > 2 && this.buf[0].t < cutoff) this.buf.shift();
  }

  wPrimePct(): number {
    return this.wPrime > 0 ? this.wBal / this.wPrime : 1;
  }

  evaluate(): StruggleState {
    const buf = this.buf;
    if (buf.length < 5) return { ...IDLE, wPrimePct: this.wPrimePct() };
    const nowT = buf[buf.length - 1].t;
    const span = nowT - buf[0].t;
    if (span < WINDOW_SEC * 0.7) return { ...IDLE, wPrimePct: this.wPrimePct() };

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

    const reasons: StruggleReason[] = [];

    // 1) Cadence decay — sustained low rpm vs the target window / a 75 rpm floor.
    const cadFloor = Math.min(cadLow - 15, cadLow * 0.83, 75);
    if (trainerOn && avgCad > 0 && avgCad < cadFloor) reasons.push("cadence_decay");

    // 2) Power fade — actual rolling power 10%+ under target.
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

    // 6) W′ balance depletion — anaerobic tank nearly empty.
    if (trainerOn && this.wPrimePct() < 0.15) reasons.push("w_prime_low");

    // 7) ERG spiral of death — in ERG, cadence collapsing on a high target while
    //    power fades (resistance climbs to hold watts → rider gets bogged down).
    if (ergMode && trainerOn && avgCad > 0 && avgCad < 70 && target >= ftp * 0.85 && powerDeficitPct > 0.08) {
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
        ...IDLE, wPrimePct: this.wPrimePct(), powerDeficitPct,
        power: Math.round(avgPower), cadence: Math.round(avgCad), hr: Math.round(avgHr), nearMaxHrPct,
      };
    }

    const active = safety || reasons.length >= 2;
    let severity: StruggleState["severity"] = "none";
    if (active) {
      const heavy = safety || reasons.length >= 3 ||
        reasons.includes("w_prime_low") || reasons.includes("erg_spiral") ||
        (reasons.includes("hr_near_max") && reasons.length >= 2);
      severity = heavy ? "high" : "mild";
    }
    const primary = active ? (REASON_PRIORITY.find((r) => reasons.includes(r)) ?? reasons[0]) : null;

    return {
      active, severity, safety, reasons, primary,
      wPrimePct: this.wPrimePct(), powerDeficitPct,
      power: Math.round(avgPower), cadence: Math.round(avgCad), hr: Math.round(avgHr), nearMaxHrPct,
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
