// ─────────────────────────────────────────────────────────────────────────
// The Benchmark Workouts catalog — pure data. Adding a new benchmark means
// adding an entry here; every screen (library, detail, player, results) is
// driven off these definitions. Four core tests are `available`; the rest are
// clearly flagged `coming_soon` so incomplete functionality is never activated.
// ─────────────────────────────────────────────────────────────────────────
import type { BenchmarkTest, BenchmarkCategory, CategoryMeta } from "./types";

export const CATEGORY_META: Record<BenchmarkCategory, CategoryMeta> = {
  ftp: { label: "FTP / Threshold", color: "#C91727" },
  aerobic: { label: "Aerobic", color: "#55C850" },
  neuromuscular: { label: "Neuromuscular", color: "#FFC20A" },
  anaerobic: { label: "Anaerobic", color: "#F5842A" },
  skill: { label: "Skill", color: "#4FA8FF" },
};

export const BENCHMARK_TESTS: BenchmarkTest[] = [
  // ── CORE #1 — Ramp Test ──────────────────────────────────────────────────
  {
    id: "ramp",
    name: "Ramp Test",
    shortName: "Ramp",
    category: "ftp",
    availability: "available",
    intensity: "maximal",
    icon: "trending-up",
    durationMin: 25,
    measures: ["FTP", "MAP"],
    summary: "A short, progressive test to the limit — the quickest way to estimate your FTP.",
    description:
      "Power rises steadily until you can no longer hold the target. It's the fastest, most repeatable way to estimate your Functional Threshold Power and Maximal Aerobic Power.",
    whatItMeasures:
      "Maximal Aerobic Power (MAP) from your final sustained step, which is used to estimate FTP.",
    howItWorks: [
      "Easy warm-up to get your legs ready.",
      "Power increases in small steps every minute.",
      "Keep pedalling as the effort builds — stop when you can't hold the target.",
      "Gentle cool-down to recover.",
    ],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 4–6 weeks",
    intervals: [
      { kind: "warmup", label: "Warm-up", durationSec: 300, targetType: "ftp_pct", targetLowPct: 45, targetHighPct: 55, cue: "Spin easy and relaxed to open the legs." },
      { kind: "ramp", label: "Ramp to exhaustion", durationSec: 0, targetType: "ramp", rampStartWatts: 100, rampStepWatts: 20, rampStepSec: 60, cue: "Hold each step. Keep going until you can't sustain the target." },
      { kind: "cooldown", label: "Cool-down", durationSec: 300, targetType: "ftp_pct", targetLowPct: 40, targetHighPct: 50, cue: "Easy spin — let the heart rate settle." },
    ],
    calculation: { method: "ramp_map", multiplier: 0.75, version: "v1" },
  },

  // ── CORE #2 — Twenty-Minute FTP Test ─────────────────────────────────────
  {
    id: "twenty_min_ftp",
    name: "Twenty-Minute FTP Test",
    shortName: "20-min FTP",
    category: "ftp",
    availability: "available",
    intensity: "maximal",
    icon: "stopwatch",
    durationMin: 55,
    measures: ["FTP"],
    summary: "The classic sustained effort — the gold-standard field estimate of threshold power.",
    description:
      "After a thorough warm-up you ride as hard as you can hold for a full 20 minutes. Your average power for that block estimates your FTP.",
    whatItMeasures: "Your best sustainable 20-minute power, scaled to estimate FTP.",
    howItWorks: [
      "Progressive warm-up with a short opener.",
      "Brief recovery.",
      "Ride the full 20 minutes as strong and even as you can.",
      "Cool-down.",
    ],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 6–8 weeks",
    intervals: [
      { kind: "warmup", label: "Warm-up", durationSec: 600, targetType: "ftp_pct", targetLowPct: 50, targetHighPct: 65, cue: "Build gradually and stay relaxed." },
      { kind: "opener", label: "Opener", durationSec: 300, targetType: "ftp_pct", targetLowPct: 100, targetHighPct: 110, cue: "Short, sharp effort to prime the system." },
      { kind: "recovery", label: "Recovery", durationSec: 300, targetType: "ftp_pct", targetLowPct: 45, targetHighPct: 55, cue: "Spin easy and recover." },
      { kind: "effort", label: "20-minute effort", durationSec: 1200, targetType: "ftp_pct", targetLowPct: 95, targetHighPct: 105, cue: "Settle into your hardest sustainable pace — even and controlled." },
      { kind: "cooldown", label: "Cool-down", durationSec: 600, targetType: "ftp_pct", targetLowPct: 40, targetHighPct: 50, cue: "Well done — spin it out easy." },
    ],
    calculation: { method: "twenty_min", multiplier: 0.95, version: "v1" },
  },

  // ── CORE #3 — Aerobic Efficiency Ride ────────────────────────────────────
  {
    id: "aerobic_efficiency",
    name: "Aerobic Efficiency Ride",
    shortName: "Aerobic Efficiency",
    category: "aerobic",
    availability: "available",
    intensity: "moderate",
    icon: "pulse",
    durationMin: 55,
    measures: ["Aerobic decoupling", "Efficiency factor"],
    summary: "A steady sub-threshold ride that reveals how well your aerobic engine holds up.",
    description:
      "A controlled endurance effort at a steady power. We compare the first and second halves to measure aerobic decoupling — how much your heart rate drifts for the same power.",
    whatItMeasures: "Aerobic decoupling (heart-rate drift) and efficiency factor across a steady effort.",
    howItWorks: [
      "Easy warm-up.",
      "Hold a steady endurance power for the main block.",
      "Keep cadence and position consistent.",
      "Cool-down.",
    ],
    requiresMaximalEffort: false,
    requiredEquipment: ["smart_trainer", "power_meter", "heart_rate"],
    recommendedFrequency: "Every 3–4 weeks",
    intervals: [
      { kind: "warmup", label: "Warm-up", durationSec: 600, targetType: "ftp_pct", targetLowPct: 50, targetHighPct: 60, cue: "Ease into it." },
      { kind: "steady", label: "Steady aerobic block", durationSec: 2400, targetType: "ftp_pct", targetLowPct: 65, targetHighPct: 75, cue: "Hold it steady — smooth and sustainable, breathe easy." },
      { kind: "cooldown", label: "Cool-down", durationSec: 300, targetType: "ftp_pct", targetLowPct: 40, targetHighPct: 50, cue: "Relax and spin down." },
    ],
    calculation: { method: "aerobic_decoupling", version: "v1" },
  },

  // ── CORE #4 — Cadence Control Assessment ─────────────────────────────────
  {
    id: "cadence_control",
    name: "Cadence Control Assessment",
    shortName: "Cadence Control",
    category: "skill",
    availability: "available",
    intensity: "moderate",
    icon: "sync",
    durationMin: 30,
    measures: ["Cadence consistency", "Smoothness"],
    summary: "Hold target cadences at steady power to gauge your pedalling control and range.",
    description:
      "You ride short blocks at different target cadences while keeping power steady. We measure how tightly you can hold each cadence — a marker of pedalling skill and neuromuscular control.",
    whatItMeasures: "How consistently you can hold target cadences across a range at steady power.",
    howItWorks: [
      "Warm-up.",
      "Ride each block at the target cadence shown.",
      "Keep power steady while you change cadence.",
      "Cool-down.",
    ],
    requiresMaximalEffort: false,
    requiredEquipment: ["smart_trainer", "power_meter", "cadence"],
    recommendedFrequency: "Every 4 weeks",
    intervals: [
      { kind: "warmup", label: "Warm-up", durationSec: 300, targetType: "ftp_pct", targetLowPct: 50, targetHighPct: 60, cue: "Free cadence, spin easy." },
      { kind: "block", label: "Cadence 85 rpm", durationSec: 300, targetType: "ftp_pct", targetLowPct: 55, targetHighPct: 65, cadenceLow: 83, cadenceHigh: 87, cue: "Settle to a smooth 85 rpm." },
      { kind: "block", label: "Cadence 95 rpm", durationSec: 300, targetType: "ftp_pct", targetLowPct: 55, targetHighPct: 65, cadenceLow: 93, cadenceHigh: 97, cue: "Lift to 95 rpm — stay smooth." },
      { kind: "block", label: "Cadence 105 rpm", durationSec: 300, targetType: "ftp_pct", targetLowPct: 55, targetHighPct: 65, cadenceLow: 103, cadenceHigh: 107, cue: "Fast legs at 105 rpm — no bouncing." },
      { kind: "block", label: "Cadence 75 rpm", durationSec: 300, targetType: "ftp_pct", targetLowPct: 55, targetHighPct: 65, cadenceLow: 73, cadenceHigh: 77, cue: "Slow it to a strong 75 rpm." },
      { kind: "cooldown", label: "Cool-down", durationSec: 300, targetType: "ftp_pct", targetLowPct: 40, targetHighPct: 50, cue: "Easy spin to finish." },
    ],
    calculation: { method: "cadence_consistency", version: "v1" },
  },

  // ── COMING SOON — foundation entries (metadata only; not activated) ───────
  {
    id: "sprint_power",
    name: "Sprint Power Test",
    shortName: "Sprint Power",
    category: "neuromuscular",
    availability: "coming_soon",
    intensity: "maximal",
    icon: "flash",
    durationMin: 25,
    measures: ["Peak power", "5s power", "15s power"],
    summary: "All-out short sprints to measure your peak neuromuscular power.",
    description: "Maximal short sprints capture your peak and 5/15-second power. Safety-gated and coming in a future update.",
    whatItMeasures: "Peak, 5-second and 15-second maximal power.",
    howItWorks: ["Warm-up with primers.", "Maximal short sprints with full recovery.", "Cool-down."],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 4–6 weeks",
    intervals: [],
    calculation: { method: "none", version: "v1" },
  },
  {
    id: "five_min_map",
    name: "Five-Minute MAP Test",
    shortName: "5-min MAP",
    category: "anaerobic",
    availability: "coming_soon",
    intensity: "maximal",
    icon: "rocket",
    durationMin: 35,
    measures: ["MAP", "VO₂max power"],
    summary: "A five-minute maximal effort to gauge aerobic ceiling and VO₂max power.",
    description: "A sustained five-minute maximal effort estimating maximal aerobic power. Coming in a future update.",
    whatItMeasures: "Best five-minute power (aerobic ceiling / VO₂max power).",
    howItWorks: ["Thorough warm-up.", "Five-minute maximal effort.", "Cool-down."],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 6–8 weeks",
    intervals: [],
    calculation: { method: "none", version: "v1" },
  },
  {
    id: "one_min_anaerobic",
    name: "One-Minute Anaerobic Test",
    shortName: "1-min Anaerobic",
    category: "anaerobic",
    availability: "coming_soon",
    intensity: "maximal",
    icon: "battery-charging",
    durationMin: 25,
    measures: ["Anaerobic capacity", "1-min power"],
    summary: "A one-minute maximal effort to measure anaerobic capacity.",
    description: "A one-minute all-out effort measuring anaerobic capacity. Coming in a future update.",
    whatItMeasures: "Best one-minute power and anaerobic capacity.",
    howItWorks: ["Warm-up.", "One-minute maximal effort.", "Cool-down."],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 4–6 weeks",
    intervals: [],
    calculation: { method: "none", version: "v1" },
  },
  {
    id: "threshold_hold",
    name: "Threshold Hold (TTE)",
    shortName: "Threshold Hold",
    category: "ftp",
    availability: "coming_soon",
    intensity: "hard",
    icon: "hourglass",
    durationMin: 60,
    measures: ["Time to exhaustion", "Threshold durability"],
    summary: "Hold threshold power for as long as possible to measure durability.",
    description: "Ride at threshold until you can no longer hold it, measuring time-to-exhaustion. Coming in a future update.",
    whatItMeasures: "How long you can sustain threshold power (durability).",
    howItWorks: ["Warm-up.", "Hold threshold power to exhaustion.", "Cool-down."],
    requiresMaximalEffort: true,
    requiredEquipment: ["smart_trainer", "power_meter"],
    recommendedFrequency: "Every 8 weeks",
    intervals: [],
    calculation: { method: "none", version: "v1" },
  },
];

export function getBenchmarkTest(id: string): BenchmarkTest | undefined {
  return BENCHMARK_TESTS.find((t) => t.id === id);
}

export const AVAILABLE_TESTS = BENCHMARK_TESTS.filter((t) => t.availability === "available");
