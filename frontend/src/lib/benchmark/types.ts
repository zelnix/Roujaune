// ─────────────────────────────────────────────────────────────────────────
// ROUJAUNE Benchmark Workouts — shared, reusable type foundation.
// Single source of truth used across every part (library, detail, readiness,
// setup, player, results, history). Data-driven so new tests reuse the same UI.
// ─────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type Ion = ComponentProps<typeof Ionicons>["name"];

export type BenchmarkCategory =
  | "threshold" | "aerobic_power" | "short_power" | "endurance" | "technique" | "recovery";
export type BenchmarkAvailability = "available" | "coming_soon";
export type EffortType = "maximal" | "submaximal";
export type EquipmentKey = "smart_trainer" | "power_meter" | "heart_rate" | "cadence" | "speed";

// ── Test player script (used from the workout-player part onward) ──────────
export type TestIntervalKind =
  | "warmup" | "steady" | "ramp" | "effort" | "recovery" | "cooldown" | "opener" | "block";

export interface TestInterval {
  kind: TestIntervalKind;
  label: string;
  durationSec: number;            // 0 ⇒ open-ended (e.g. ramp-to-exhaustion)
  targetType?: "ftp_pct" | "watts" | "ramp" | "rpe" | "free";
  targetLowPct?: number;
  targetHighPct?: number;
  cadenceLow?: number;
  cadenceHigh?: number;
  rampStartPct?: number;
  rampStartWatts?: number;
  rampStepWatts?: number;
  rampStepSec?: number;
  cue?: string;
}

// ── Calculation config (versioned so historic results keep their formula) ──
export type CalculationMethod =
  | "ramp_map" | "twenty_min" | "five_min_power" | "one_min_power" | "sprint_peak"
  | "aerobic_decoupling" | "cadence_consistency" | "recovery_hrr" | "none";

export interface CalculationConfig {
  method: CalculationMethod;
  multiplier?: number;            // e.g. 0.75 (ramp MAP→FTP), 0.95 (20-min→FTP)
  version: string;
}

// ── Benchmark test definition (the catalog) ────────────────────────────────
export interface BenchmarkTest {
  id: string;
  name: string;
  shortName: string;
  category: BenchmarkCategory;
  availability: BenchmarkAvailability;
  effort: EffortType;             // maximal vs submaximal (drives readiness gating)
  icon: Ion;
  durationMin: number;
  difficulty: string;             // e.g. "Beginner-friendly", "Moderate", "Advanced"
  measures: string[];             // headline metrics, e.g. ["FTP", "MAP"]
  summary: string;                // one-liner for cards
  description: string;            // detail intro
  purpose: string;
  whoFor: string;
  whatItMeasures: string;
  requiredEquipment: EquipmentKey[];
  optionalEquipment: EquipmentKey[];
  indoorCompatible: boolean;
  outdoorCompatible: boolean;
  recommendedFrequency: string;
  warmupSummary: string;
  mainTestSummary: string;
  cooldownSummary: string;
  recoveryRecommendation: string;
  safetyInfo: string;
  intervals: TestInterval[];      // player script (may be empty pre-player)
  calculation: CalculationConfig;
}

// ── Readiness / safety (pre-test flow) ─────────────────────────────────────
export type ReadinessStatus = "ready" | "caution" | "do_not_start";
export type ReadinessAnswer = "yes" | "no";

export interface ReadinessQuestion {
  id: string;
  text: string;
  goodAnswer: ReadinessAnswer;    // the low-risk answer
  danger?: boolean;               // a "bad" answer to this ⇒ Do Not Start
}

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
  ftp: number;
  usingDevData: boolean;
}

// ── Sessions & results (persisted server-side) ─────────────────────────────
export type SessionStatus = "not_started" | "in_progress" | "completed" | "stopped_early" | "abandoned";
export type ResultDecision = "pending" | "accepted" | "excluded";
export type TestQuality = "high" | "moderate" | "low";

export interface BenchmarkSession {
  id: string;
  testId: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  readiness?: ReadinessOutcome;
  readinessAnswers?: Record<string, ReadinessAnswer>;
  equipment?: EquipmentSetup;
  stopReason?: string;
  usingDevData: boolean;
}

export interface ResultMetric { key: string; label: string; value: number; unit: string; }

export interface BenchmarkResult {
  id: string;
  sessionId: string;
  testId: string;
  createdAt: string;
  decision: ResultDecision;
  quality: TestQuality;
  confidence: number;
  metrics: ResultMetric[];
  primaryMetric?: ResultMetric;
  calcVersion: string;
  isDevData: boolean;
  insight?: string;
  notes?: string;
}

// ── Current benchmark profile (headline snapshot on the landing) ───────────
export interface BenchmarkProfile {
  ftp: number | null;
  ftpWkg: number | null;
  fiveMinPower: number | null;
  oneMinPower: number | null;
  sprintPower: number | null;
  aerobicEfficiency: number | null;
  preferredCadence: number | null;
  recoveryResponse: number | null;
  lastBenchmarkDate: string | null;
}

// ── UI helpers ──────────────────────────────────────────────────────────────
export interface CategoryMeta { label: string; color: string; }
