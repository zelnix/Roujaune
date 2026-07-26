// ─────────────────────────────────────────────────────────────────────────
// ROUJAUNE Benchmark Workouts — shared, reusable type foundation.
// These interfaces are the single source of truth used across every phase
// (library, test-detail, readiness, setup, player, results, history).
// Keeping them data-driven means new benchmark tests reuse the same UI.
// ─────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type Ion = ComponentProps<typeof Ionicons>["name"];

export type BenchmarkCategory = "ftp" | "aerobic" | "neuromuscular" | "anaerobic" | "skill";
export type BenchmarkAvailability = "available" | "coming_soon";
export type BenchmarkIntensity = "moderate" | "hard" | "maximal";
export type EquipmentKey = "smart_trainer" | "power_meter" | "heart_rate" | "cadence" | "speed";

// ── Test player script ─────────────────────────────────────────────────────
export type TestIntervalKind =
  | "warmup" | "steady" | "ramp" | "effort" | "recovery" | "cooldown" | "opener" | "block";

export interface TestInterval {
  kind: TestIntervalKind;
  label: string;
  durationSec: number;            // 0 ⇒ open-ended (e.g. ramp-to-exhaustion); player handles it
  targetType?: "ftp_pct" | "watts" | "ramp" | "rpe" | "free";
  targetLowPct?: number;          // %FTP low bound (for ftp_pct)
  targetHighPct?: number;         // %FTP high bound
  cadenceLow?: number;            // rpm guidance (skill/cadence tests)
  cadenceHigh?: number;
  rampStartPct?: number;          // ramp: starting %FTP (or use rampStartWatts)
  rampStartWatts?: number;
  rampStepWatts?: number;         // ramp: watts added each step
  rampStepSec?: number;           // ramp: seconds per step
  cue?: string;                   // coach cue shown during the interval
}

// ── Calculation config (versioned so historic results keep their formula) ──
export type CalculationMethod =
  | "ramp_map" | "twenty_min" | "aerobic_decoupling" | "cadence_consistency" | "none";

export interface CalculationConfig {
  method: CalculationMethod;
  multiplier?: number;            // e.g. 0.75 (ramp MAP→FTP), 0.95 (20-min→FTP)
  version: string;                // stored with each result; changing config never rewrites history
}

// ── Benchmark test definition (the catalog) ────────────────────────────────
export interface BenchmarkTest {
  id: string;
  name: string;
  shortName: string;
  category: BenchmarkCategory;
  availability: BenchmarkAvailability;
  intensity: BenchmarkIntensity;
  icon: Ion;
  durationMin: number;            // approximate total incl. warm-up / cool-down
  measures: string[];             // e.g. ["FTP", "MAP"]
  summary: string;                // one-liner for cards
  description: string;            // detail page intro
  whatItMeasures: string;
  howItWorks: string[];           // ordered step bullets
  requiresMaximalEffort: boolean; // gates the readiness/safety flow
  requiredEquipment: EquipmentKey[];
  recommendedFrequency: string;   // e.g. "Every 4–6 weeks"
  intervals: TestInterval[];      // player script (empty for coming_soon)
  calculation: CalculationConfig;
}

// ── Readiness / safety ──────────────────────────────────────────────────────
export type ReadinessAnswer = "yes" | "no" | "unsure";
export type ReadinessStatus = "cleared" | "caution" | "blocked";

export interface ReadinessOutcome {
  status: ReadinessStatus;
  message: string;
  respondedAt: string;            // ISO
}

// ── Equipment setup snapshot ────────────────────────────────────────────────
export interface EquipmentSetup {
  trainerConnected: boolean;
  powerConnected: boolean;
  hrConnected: boolean;
  cadenceConnected: boolean;
  ftp: number;                    // FTP used to compute targets for this session
  usingDevData: boolean;          // true ⇒ simulated/development telemetry (never a real result)
}

// ── Sessions & results (persisted server-side from Phase 3/5) ──────────────
export type SessionStatus = "not_started" | "in_progress" | "completed" | "stopped_early" | "abandoned";
export type ResultDecision = "pending" | "accepted" | "excluded";
export type TestQuality = "high" | "moderate" | "low";

export interface SessionSummary {
  avgPower: number;
  maxPower: number;
  avgHr: number;
  maxHr: number;
  avgCadence: number;
  durationSec: number;
}

export interface BenchmarkSession {
  id: string;
  testId: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  readiness?: ReadinessOutcome;
  equipment?: EquipmentSetup;
  stopReason?: string;            // set when stopped_early
  usingDevData: boolean;
  summary?: SessionSummary;
}

export interface ResultMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
}

export interface BenchmarkResult {
  id: string;
  sessionId: string;
  testId: string;
  createdAt: string;              // ISO
  decision: ResultDecision;
  quality: TestQuality;
  confidence: number;             // 0–100
  metrics: ResultMetric[];
  primaryMetric?: ResultMetric;   // e.g. FTP
  calcVersion: string;
  isDevData: boolean;             // true ⇒ from simulated data; excluded from official profile
  insight?: string;               // Alberto/Adriana interpretation (AI or rule-based)
  notes?: string;
}

// ── UI helpers ──────────────────────────────────────────────────────────────
export interface CategoryMeta {
  label: string;
  color: string;
}
