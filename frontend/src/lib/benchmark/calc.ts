// ─────────────────────────────────────────────────────────────────────────
// Benchmark result calculation service (Part 9). Pure + VERSIONED so a result
// always records the formula version that produced it. Consumes the compact
// per-interval capture the player records during a run and produces headline
// metrics, a 0–100 confidence score and a short, non-diagnostic insight.
//
// SAFETY: results computed from simulated development data carry `isDevData`
// and must NEVER be written to a rider's genuine profile.
// ─────────────────────────────────────────────────────────────────────────
import type { BenchmarkTest, ResultMetric, TestQuality } from "./types";

// ── Per-interval capture recorded live by the player ───────────────────────
export interface IntervalCapture {
  kind: string;
  label: string;
  target: number;          // planned watts (0 if none)
  durationSec: number;     // planned duration (0 = open-ended ramp)
  elapsedSec: number;      // seconds actually ridden in this interval
  avgPower: number;
  maxPower: number;
  avgHr: number;
  maxHr: number;
  endHr: number;           // last HR reading of the interval
  avgCad: number;
  maxCad: number;
  inCadencePct: number;    // % of samples within the cadence band (cadence test)
  // halves of the interval (for aerobic decoupling)
  h1Power: number; h1Hr: number;
  h2Power: number; h2Hr: number;
  // short-effort rolling stats (sprint / 1-min)
  peak1s: number;          // best single-second power
  peak5s: number;          // best rolling 5-second average power
  peak8s: number;          // best rolling 8-second average power
  final10: number;         // average power over the last 10 seconds
  timeToPeakSec: number;   // seconds until the peak second was reached
  // recovery HR at fixed offsets from the start of a recovery interval
  hrAt?: Record<string, number>; // keys "30","60","120","180"
}

export interface RunCapture {
  testId: string;
  intervals: IntervalCapture[];
  totalElapsed: number;
  pauseCount: number;
  rampFinalWatts?: number;   // MAP: last fully-completed ramp stage
  rampStep?: number;
  reachedMain: boolean;      // did the rider reach the main/effort interval
  completedMain: boolean;    // did the main interval run to full duration
  sensorLevel: "A" | "B" | "C" | "D";
  isDevData: boolean;
  rpe: number;
  weightKg?: number;         // for W/kg (omitted when unknown)
  ftp?: number;              // rider's current FTP (for relationship-to-FTP)
  hasHr?: boolean;           // whether HR data was available
}

export interface ComputedResult {
  metrics: ResultMetric[];
  primaryMetric?: ResultMetric;
  confidence: number;        // 0–100
  quality: TestQuality;      // high / moderate / low
  calcVersion: string;
  insight: string;
  method: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Find the interval that carries the "main" effort for a given method. */
function mainInterval(cap: RunCapture): IntervalCapture | undefined {
  // prefer the longest effort/steady/opener/block interval that was ridden
  const candidates = cap.intervals.filter((i) => ["effort", "steady", "block", "opener"].includes(i.kind));
  if (candidates.length) return candidates.sort((a, b) => b.elapsedSec - a.elapsedSec)[0];
  return cap.intervals.filter((i) => i.kind !== "warmup" && i.kind !== "cooldown").sort((a, b) => b.elapsedSec - a.elapsedSec)[0];
}

/** Base confidence from completion + steadiness + sensor level + pauses. */
function baseConfidence(cap: RunCapture, iv?: IntervalCapture): number {
  let c = 100;
  if (!cap.reachedMain) c -= 45;
  else if (!cap.completedMain) c -= 25;
  // sensor level: A best, D lowest (perceived effort only)
  c -= { A: 0, B: 4, C: 12, D: 22 }[cap.sensorLevel];
  // pauses reduce trust in a continuous effort
  c -= clamp(cap.pauseCount, 0, 4) * 6;
  // steadiness: penalise a spiky main interval
  if (iv && iv.avgPower > 0) {
    const spike = iv.maxPower / iv.avgPower;
    if (spike > 1.5) c -= 12;
    else if (spike > 1.25) c -= 6;
  }
  return clamp(round(c), 0, 100);
}

function qualityFrom(confidence: number): TestQuality {
  if (confidence >= 75) return "high";
  if (confidence >= 50) return "moderate";
  return "low";
}

const M = (key: string, label: string, value: number, unit: string): ResultMetric => ({ key, label, value, unit });

// ── Interpretation labels (non-judgemental) ────────────────────────────────
export function pacingLabel(h1: number, h2: number): string {
  if (h1 <= 0) return "Result affected by pacing";
  const fade = ((h1 - h2) / h1) * 100;
  if (fade > 15) return "Started too hard";
  if (fade > 7) return "Uneven pacing";
  if (fade < -5) return "Strong finish";
  if (fade >= -5 && fade <= 3) return "Excellent pacing";
  return "Controlled pacing";
}

export function powerFadeLabel(fadePct: number): string {
  if (fadePct <= 5) return "Strong power retention";
  if (fadePct <= 15) return "Moderate power fade";
  return "Significant power fade";
}

function wkg(watts: number, weightKg?: number): number | null {
  if (!weightKg || weightKg <= 0) return null;
  return Math.round((watts / weightKg) * 100) / 100;
}

/**
 * Compute a benchmark result from a run capture. Uses the test's versioned
 * calculation config (multipliers preserved so historic results are stable).
 */
export function computeResult(test: BenchmarkTest, cap: RunCapture): ComputedResult {
  const { method, multiplier = 1, version } = test.calculation;
  const iv = mainInterval(cap);
  const metrics: ResultMetric[] = [];
  let primary: ResultMetric | undefined;
  let confidence = baseConfidence(cap, iv);
  let insight = "";

  switch (method) {
    case "ramp_map": {
      const map = round(cap.rampFinalWatts ?? 0);
      const ftp = round(map * multiplier);
      primary = M("ftp", "Estimated FTP", ftp, "W");
      metrics.push(primary, M("map", "Maximal Aerobic Power", map, "W"));
      const w = wkg(ftp, cap.weightKg);
      if (w != null) metrics.push(M("ftpWkg", "FTP watts / kg", w, "W/kg"));
      insight = "Your FTP is estimated from your final sustained ramp step. A higher final step suggests stronger aerobic power.";
      if (map <= 0) confidence = clamp(confidence - 40, 0, 100);
      break;
    }
    case "twenty_min": {
      const avg = round(iv?.avgPower ?? 0);
      const ftp = round(avg * multiplier);
      primary = M("ftp", "Estimated FTP", ftp, "W");
      metrics.push(primary, M("p20", "20-minute power", avg, "W"));
      const w = wkg(ftp, cap.weightKg);
      if (w != null) metrics.push(M("ftpWkg", "FTP watts / kg", w, "W/kg"));
      insight = "Your FTP is scaled from your average 20-minute power. Even pacing gives the most representative estimate.";
      break;
    }
    case "five_min_power": {
      const avg = round(iv?.avgPower ?? 0);
      primary = M("p5", "5-minute power", avg, "W");
      metrics.push(primary);
      const w = wkg(avg, cap.weightKg);
      if (w != null) metrics.push(M("p5wkg", "5-minute watts / kg", w, "W/kg"));
      const fade = iv && iv.h1Power > 0 ? round(((iv.h1Power - iv.h2Power) / iv.h1Power) * 100) : 0;
      metrics.push(M("h1", "First-half power", round(iv?.h1Power ?? 0), "W"));
      metrics.push(M("h2", "Second-half power", round(iv?.h2Power ?? 0), "W"));
      metrics.push(M("fade", "Power fade", fade, "%"));
      if (cap.hasHr && iv) { metrics.push(M("avgHr", "Average heart rate", round(iv.avgHr), "bpm")); metrics.push(M("peakHr", "Peak heart rate", round(iv.maxHr), "bpm")); }
      if (iv) { metrics.push(M("avgCad", "Average cadence", round(iv.avgCad), "rpm")); metrics.push(M("maxCad", "Maximum cadence", round(iv.maxCad), "rpm")); }
      if (cap.ftp) metrics.push(M("vsFtp", "Relative to FTP", Math.round((avg / cap.ftp) * 100), "%"));
      const pacing = pacingLabel(iv?.h1Power ?? 0, iv?.h2Power ?? 0);
      insight = `${pacing}. Your five-minute result gives Alberto and Adriana a clearer picture of how you perform during sustained high-intensity efforts.`;
      break;
    }
    case "one_min_power": {
      const avg = round(iv?.avgPower ?? 0);
      primary = M("p1", "1-minute power", avg, "W");
      metrics.push(primary);
      const w = wkg(avg, cap.weightKg);
      if (w != null) metrics.push(M("p1wkg", "1-minute watts / kg", w, "W/kg"));
      metrics.push(M("peak5s", "Peak 5-second power", round(iv?.peak5s ?? 0), "W"));
      metrics.push(M("final10", "Final 10-second power", round(iv?.final10 ?? 0), "W"));
      const fade = iv && iv.peak5s > 0 ? clamp(round(((iv.peak5s - iv.final10) / iv.peak5s) * 100), 0, 100) : 0;
      metrics.push(M("fade", "Power fade", fade, "%"));
      if (iv) { metrics.push(M("avgCad", "Average cadence", round(iv.avgCad), "rpm")); metrics.push(M("maxCad", "Maximum cadence", round(iv.maxCad), "rpm")); }
      if (cap.hasHr && iv) { metrics.push(M("avgHr", "Average heart rate", round(iv.avgHr), "bpm")); metrics.push(M("peakHr", "Maximum heart rate", round(iv.maxHr), "bpm")); }
      insight = `${powerFadeLabel(fade)}. This captures your short-duration, sustainable power.`;
      break;
    }
    case "sprint_peak": {
      const sprints = cap.intervals.filter((i) => i.kind === "effort" && i.label.toLowerCase().startsWith("sprint"));
      const attempts = sprints.map((sp, idx) => ({ idx: idx + 1, peak1s: round(sp.peak1s), peak5s: round(sp.peak5s), best8s: round(sp.peak8s || sp.avgPower), peakCad: round(sp.maxCad), timeToPeak: sp.timeToPeakSec }));
      const best5s = Math.max(0, ...attempts.map((a) => a.peak5s));
      const best8s = Math.max(0, ...attempts.map((a) => a.best8s));
      const peak1s = Math.max(0, ...attempts.map((a) => a.peak1s));
      const peakCad = Math.max(0, ...attempts.map((a) => a.peakCad));
      const bestIdx = attempts.findIndex((a) => a.peak5s === best5s) + 1;
      const diff = attempts.length >= 3 ? attempts[0].peak5s - attempts[2].peak5s : 0;
      const spread = best5s > 0 ? clamp(round((1 - (diff > 0 ? diff : 0) / best5s) * 100), 0, 100) : 0;
      primary = M("peak", "Best 5-second power", best5s, "W");
      metrics.push(primary, M("peak1s", "Peak 1-second power", peak1s, "W"), M("peak8s", "Best 8-second power", best8s, "W"), M("peakCad", "Peak cadence", peakCad, "rpm"), M("repeatability", "Sprint repeatability", spread, "%"));
      const w = wkg(best5s, cap.weightKg);
      if (w != null) metrics.push(M("sprintWkg", "Sprint watts / kg", w, "W/kg"));
      insight = `Best attempt: #${bestIdx || 1}. Peak power reflects your neuromuscular sprint capacity; a small drop across attempts is normal.`;
      break;
    }
    case "aerobic_decoupling": {
      const r1 = iv && iv.h1Hr > 0 ? iv.h1Power / iv.h1Hr : 0;
      const r2 = iv && iv.h2Hr > 0 ? iv.h2Power / iv.h2Hr : 0;
      const decoupling = r1 > 0 ? clamp(((r1 - r2) / r1) * 100, -20, 40) : 0;
      const consistency = iv && iv.avgPower > 0 ? clamp(100 - ((iv.maxPower - iv.avgPower) / iv.avgPower) * 100, 0, 100) : 0;
      primary = M("decoupling", "Heart-rate drift", round(decoupling * 10) / 10, "%");
      metrics.push(primary, M("consistency", "Power consistency", round(consistency), "%"));
      insight = decoupling <= 5
        ? "Low drift — your aerobic efficiency held well across the effort."
        : "Some drift appeared in the second half — a normal marker to track over time.";
      break;
    }
    case "cadence_consistency": {
      const blocks = cap.intervals.filter((i) => i.kind === "block");
      const avgInBand = blocks.length ? round(blocks.reduce((a, b) => a + b.inCadencePct, 0) / blocks.length) : 0;
      const best = blocks.slice().sort((a, b) => b.inCadencePct - a.inCadencePct)[0];
      primary = M("cadence_control", "Cadence control", avgInBand, "%");
      metrics.push(primary);
      if (best) metrics.push(M("preferred_cadence", "Smoothest cadence", round(best.avgCad), "rpm"));
      insight = best
        ? `You were smoothest around ${round(best.avgCad)} rpm. Use this as a comfortable working cadence.`
        : "Cadence control measures how steadily you hold a target cadence.";
      break;
    }
    case "recovery_hrr": {
      const effort = cap.intervals.find((i) => i.kind === "effort");
      const recovery = cap.intervals.find((i) => i.kind === "recovery");
      if (!cap.hasHr) {
        // Perceived-effort recovery benchmark — no HR value produced.
        primary = M("perceivedRecovery", "Perceived recovery", cap.rpe, "RPE");
        metrics.push(primary);
        if (effort) metrics.push(M("effortPower", "Effort power", round(effort.avgPower), "W"));
        insight = "Perceived-effort recovery benchmark — recorded without heart-rate data. We track how your recovery feels over comparable tests.";
        break;
      }
      const endHr = round(effort?.endHr ?? recovery?.maxHr ?? 0);
      const at = recovery?.hrAt || {};
      const hr30 = round(at["30"] ?? 0), hr60 = round(at["60"] ?? 0), hr120 = round(at["120"] ?? 0), hr180 = round(at["180"] ?? 0);
      const drop60 = clamp(endHr - hr60, 0, 150);
      primary = M("hrr", "1-minute HR recovery", drop60, "bpm");
      metrics.push(primary, M("endHr", "Heart rate at end of effort", endHr, "bpm"));
      if (hr30) metrics.push(M("hrr30", "30-second reduction", clamp(endHr - hr30, 0, 150), "bpm"));
      if (hr120) metrics.push(M("hrr120", "2-minute reduction", clamp(endHr - hr120, 0, 150), "bpm"));
      if (hr180) metrics.push(M("hrr180", "3-minute reduction", clamp(endHr - hr180, 0, 150), "bpm"));
      if (effort) metrics.push(M("effortPower", "Effort power", round(effort.avgPower), "W"));
      insight = "A larger drop generally reflects better freshness — but heat, hydration, fatigue, sleep and stress can all influence this. We compare it to your previous comparable tests.";
      break;
    }
    default:
      insight = "Result recorded.";
  }

  return {
    metrics,
    primaryMetric: primary,
    confidence,
    quality: qualityFrom(confidence),
    calcVersion: version,
    insight,
    method,
  };
}

/** Assemble a RunCapture from finalized interval captures + run metadata. */
export function assembleCapture(
  test: BenchmarkTest,
  intervals: IntervalCapture[],
  opts: {
    totalElapsed: number;
    pauseCount: number;
    rampFinalWatts?: number;
    rampStep?: number;
    sensorLevel: "A" | "B" | "C" | "D";
    isDevData: boolean;
    rpe: number;
    weightKg?: number;
    ftp?: number;
    hasHr?: boolean;
  },
): RunCapture {
  const mains = intervals.filter((i) => ["effort", "steady", "block", "opener", "ramp"].includes(i.kind));
  const mainIv = mains.slice().sort((a, b) => b.elapsedSec - a.elapsedSec)[0];
  const reachedMain = !!mainIv && mainIv.elapsedSec > 5;
  const completedMain = !!mainIv && (mainIv.durationSec > 0
    ? mainIv.elapsedSec >= mainIv.durationSec - 1
    : (opts.rampFinalWatts ?? 0) > 0);
  return {
    testId: test.id,
    intervals,
    totalElapsed: opts.totalElapsed,
    pauseCount: opts.pauseCount,
    rampFinalWatts: opts.rampFinalWatts,
    rampStep: opts.rampStep,
    reachedMain,
    completedMain,
    sensorLevel: opts.sensorLevel,
    isDevData: opts.isDevData,
    rpe: opts.rpe,
    weightKg: opts.weightKg,
    ftp: opts.ftp,
    hasHr: opts.hasHr,
  };
}

export const CONFIDENCE_NOTE =
  "Confidence reflects how complete and steady this test was — not a pass or fail. Lower confidence simply means the estimate is less certain.";
