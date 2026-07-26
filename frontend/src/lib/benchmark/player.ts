// ─────────────────────────────────────────────────────────────────────────
// Benchmark Workout Player logic (Part 7). Pure helpers: build a runnable
// timeline from a test's intervals, map interval kinds to workout states,
// generate clearly-labelled simulated telemetry, and select coaching prompts.
// Architecture is sim-first but ready for live sensor injection later.
// ─────────────────────────────────────────────────────────────────────────
import type { BenchmarkTest, TestInterval } from "./types";

export type WorkoutState =
  | "ready" | "warmup" | "main" | "recovery" | "cooldown"
  | "paused" | "stopped_early" | "interrupted" | "incomplete" | "completed";

export const STATE_LABEL: Record<WorkoutState, string> = {
  ready: "Ready", warmup: "Warm-Up", main: "Main Test", recovery: "Recovery",
  cooldown: "Cool-Down", paused: "Paused", stopped_early: "Stopped Early",
  interrupted: "Interrupted", incomplete: "Incomplete", completed: "Completed",
};

export function kindToState(kind: TestInterval["kind"]): WorkoutState {
  if (kind === "warmup") return "warmup";
  if (kind === "cooldown") return "cooldown";
  if (kind === "recovery") return "recovery";
  return "main"; // steady, effort, ramp, opener, block
}

/** Target watts for a %FTP interval (0 when the interval has no power target). */
export function targetWatts(iv: TestInterval, ftp: number): number {
  if (iv.targetType === "ftp_pct" && iv.targetLowPct != null && iv.targetHighPct != null) {
    return Math.round((ftp * (iv.targetLowPct + iv.targetHighPct)) / 2 / 100);
  }
  return 0;
}

export const RAMP_STEP_OPTIONS = [10, 15, 20, 25];

/**
 * Simulated power base for a maximal (RPE) effort, scaled off FTP by the
 * interval's duration: shorter efforts allow higher power. Only used to make
 * development data realistic — never a real target shown to the rider.
 */
export function effortBaseWatts(iv: TestInterval, ftp: number): number {
  if (iv.targetType !== "rpe") return 0;
  const d = iv.durationSec;
  let factor = 1.15;
  if (d <= 10) factor = 2.4;
  else if (d <= 60) factor = 1.7;
  else if (d <= 90) factor = 1.55;
  else if (d <= 360) factor = 1.15;
  return Math.round(ftp * factor);
}

// ── Stop-test reasons ───────────────────────────────────────────────────────
export interface StopReason { id: string; label: string; safety?: boolean; }
export const STOP_REASONS: StopReason[] = [
  { id: "limit", label: "I reached my limit" },
  { id: "equipment", label: "Equipment issue" },
  { id: "traffic", label: "Traffic or road interruption" },
  { id: "pain", label: "Pain or discomfort", safety: true },
  { id: "unwell", label: "Felt unwell", safety: true },
  { id: "other", label: "Other" },
];

export const SAFETY_GUIDANCE =
  "Stop and rest. If you feel pain, dizziness, chest discomfort or breathlessness, seek appropriate medical advice before returning to hard exercise. Your recorded data has been saved.";

// ── Coaching prompts ────────────────────────────────────────────────────────
export const COACH_PROMPTS = {
  before: "Today we are establishing a clear benchmark. The goal is not to prove anything. The goal is to give your training the right starting point.",
  hard: "Stay controlled. Hold the effort you can sustain while keeping your form smooth.",
  finalMinute: "One minute remaining. Stay composed and use what you have left without losing your form.",
  complete: "Benchmark complete. Recover now. Your result will be reviewed before it updates your training profile.",
};

/** Pick the live coaching cue for the current moment. */
export function coachPrompt(state: WorkoutState, remainingSec: number, intervalCue?: string): string {
  if (state === "ready") return COACH_PROMPTS.before;
  if (state === "completed") return COACH_PROMPTS.complete;
  if (state === "main") {
    if (remainingSec > 0 && remainingSec <= 60) return COACH_PROMPTS.finalMinute;
    return intervalCue || COACH_PROMPTS.hard;
  }
  return intervalCue || "";
}

// ── Simulated telemetry (development data) ─────────────────────────────────
function jitter(base: number, pct: number): number {
  return Math.round(base * (1 + (Math.random() - 0.5) * pct));
}

export interface SimReadings { power: number; hr: number; cadence: number; }

/**
 * Produce one simulated telemetry sample around a target. `fade` (0..1) models
 * fatigue/decline for the inject controls. Not real data — never stored as a
 * genuine result.
 */
export function simulateReadings(target: number, state: WorkoutState, cadenceTarget: number | undefined, fade: number): SimReadings {
  const hasTarget = target > 0;
  const effPower = hasTarget ? Math.max(0, jitter(target * (1 - fade * 0.25), 0.06)) : jitter(state === "main" ? 230 : 140, 0.08);
  // HR trails effort; higher in main, lower in recovery/cooldown.
  const hrBase = state === "recovery" || state === "cooldown" ? 120 : state === "main" ? 158 : 132;
  const hr = jitter(hrBase - fade * 6, 0.03);
  const cad = cadenceTarget ? jitter(cadenceTarget, 0.03) : jitter(state === "recovery" ? 82 : 91, 0.04);
  return { power: effPower, hr, cadence: cad };
}
