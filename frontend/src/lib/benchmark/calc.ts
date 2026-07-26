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
  endHr: number;           // last HR reading of the interval
  avgCad: number;
  inCadencePct: number;    // % of samples within the cadence band (cadence test)
  // halves of the interval (for aerobic decoupling)
  h1Power: number; h1Hr: number;
  h2Power: number; h2Hr: number;
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
      insight = "Your FTP is estimated from your final sustained ramp step. A higher final step suggests stronger aerobic power.";
      if (map <= 0) confidence = clamp(confidence - 40, 0, 100);
      break;
    }
    case "twenty_min": {
      const avg = round(iv?.avgPower ?? 0);
      const ftp = round(avg * multiplier);
      primary = M("ftp", "Estimated FTP", ftp, "W");
      metrics.push(primary, M("p20", "20-minute power", avg, "W"));
      insight = "Your FTP is scaled from your average 20-minute power. Even pacing gives the most representative estimate.";
      break;
    }
    case "five_min_power": {
      const avg = round(iv?.avgPower ?? 0);
      primary = M("p5", "5-minute power", avg, "W");
      metrics.push(primary, M("maxp5", "Peak in effort", round(iv?.maxPower ?? 0), "W"));
      insight = "This marks your aerobic power ceiling over five minutes.";
      break;
    }
    case "one_min_power": {
      const avg = round(iv?.avgPower ?? 0);
      primary = M("p1", "1-minute power", avg, "W");
      metrics.push(primary, M("maxp1", "Peak in effort", round(iv?.maxPower ?? 0), "W"));
      insight = "This captures your short-duration, sustainable power.";
      break;
    }
    case "sprint_peak": {
      const sprints = cap.intervals.filter((i) => i.kind === "effort");
      const peak = round(Math.max(0, ...sprints.map((s) => s.maxPower)));
      const best8 = round(Math.max(0, ...sprints.map((s) => s.avgPower)));
      primary = M("peak", "Peak power", peak, "W");
      metrics.push(primary, M("p8", "Best 8-second power", best8, "W"));
      insight = "Peak power reflects your neuromuscular sprint capacity.";
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
      const peakHr = round(effort?.endHr ?? 0);
      const afterHr = round(recovery?.endHr ?? 0);
      const drop = clamp(peakHr - afterHr, 0, 120);
      primary = M("hrr", "Heart-rate recovery", drop, "bpm");
      metrics.push(primary, M("peak_hr", "Peak heart rate", peakHr, "bpm"));
      insight = "A larger drop in the recovery window generally reflects better freshness — track the trend over time.";
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
  };
}

export const CONFIDENCE_NOTE =
  "Confidence reflects how complete and steady this test was — not a pass or fail. Lower confidence simply means the estimate is less certain.";
