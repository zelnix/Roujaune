import { Ionicons } from "@expo/vector-icons";

type Ion = keyof typeof Ionicons.glyphMap;

export type Zone = { label: string; pct: number; color: string };
export type Workout = {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  color: string;
  icon: Ion;
  duration: number;   // minutes
  tss: number;
  if: number;         // intensity factor
  difficulty: "Easy" | "Moderate" | "Hard" | "Very Hard";
  description: string;
  focus: string;
  zones: Zone[];
};

const Z = {
  z1: "#A7A8A5", // recovery
  z2: "#40A9C6", // endurance
  z3: "#55C850", // tempo
  z4: "#FFC20A", // threshold
  z5: "#E8631C", // vo2
  z6: "#C91727", // anaerobic
};

export const DIFFICULTY_COLOR: Record<Workout["difficulty"], string> = {
  Easy: "#55C850", Moderate: "#40A9C6", Hard: "#F0A500", "Very Hard": "#C91727",
};

const zones = (a: number, b: number, c: number, d: number, e: number, f: number): Zone[] => [
  { label: "Z1", pct: a, color: Z.z1 }, { label: "Z2", pct: b, color: Z.z2 },
  { label: "Z3", pct: c, color: Z.z3 }, { label: "Z4", pct: d, color: Z.z4 },
  { label: "Z5", pct: e, color: Z.z5 }, { label: "Z6", pct: f, color: Z.z6 },
];

export const WORKOUTS: Workout[] = [
  // ── Endurance ──
  { id: "endurance-ride", name: "Endurance Ride", typeId: "endurance", typeName: "Endurance", color: "#55C850", icon: "bicycle",
    duration: 105, tss: 70, if: 0.62, difficulty: "Easy", focus: "Aerobic base",
    description: "A long, steady Zone 2 ride to build your aerobic engine and fat-burning efficiency. Keep it conversational the whole way.",
    zones: zones(10, 75, 15, 0, 0, 0) },
  { id: "long-base-builder", name: "Long Base Builder", typeId: "endurance", typeName: "Endurance", color: "#55C850", icon: "bicycle",
    duration: 150, tss: 95, if: 0.63, difficulty: "Moderate", focus: "Endurance volume",
    description: "Extended endurance ride with a few tempo surges to keep the legs honest. Great weekend base session.",
    zones: zones(8, 68, 20, 4, 0, 0) },
  { id: "fasted-aerobic", name: "Fasted Aerobic Spin", typeId: "endurance", typeName: "Endurance", color: "#55C850", icon: "bicycle",
    duration: 75, tss: 48, if: 0.6, difficulty: "Easy", focus: "Fat metabolism",
    description: "Gentle, controlled aerobic ride to develop metabolic efficiency. Stay strictly in Zone 2.",
    zones: zones(15, 80, 5, 0, 0, 0) },

  // ── Climbing ──
  { id: "threshold-climb", name: "Threshold Climb", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "trending-up",
    duration: 60, tss: 92, if: 0.9, difficulty: "Hard", focus: "Sustained climbing power",
    description: "Long sustained climbing efforts at threshold to build the power you need on real mountains. Hold a strong, even cadence.",
    zones: zones(5, 20, 15, 45, 15, 0) },
  { id: "hill-repeats", name: "Hill Repeats", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "trending-up",
    duration: 75, tss: 88, if: 0.88, difficulty: "Hard", focus: "Climbing strength",
    description: "Repeated hard climbs with recovery descents. Builds muscular endurance and the ability to attack gradients.",
    zones: zones(8, 22, 10, 35, 20, 5) },
  { id: "alpine-simulator", name: "Alpine Simulator", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "trending-up",
    duration: 120, tss: 130, if: 0.85, difficulty: "Very Hard", focus: "Big-mountain endurance",
    description: "A long climb simulation blending tempo and threshold to prepare for grand-tour style ascents.",
    zones: zones(4, 26, 25, 35, 10, 0) },

  // ── Threshold ──
  { id: "sweet-spot-2x20", name: "Sweet Spot 2x20", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    duration: 80, tss: 75, if: 0.85, difficulty: "Hard", focus: "FTP builder",
    description: "Two 20-minute blocks at 88–94% FTP — the most time-efficient way to raise your threshold without excessive fatigue.",
    zones: zones(6, 24, 20, 45, 5, 0) },
  { id: "ftp-4x8", name: "FTP Intervals 4x8", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    duration: 70, tss: 82, if: 0.9, difficulty: "Very Hard", focus: "Raise FTP",
    description: "Four 8-minute efforts just above threshold. Tough but hugely effective for lifting your sustainable power.",
    zones: zones(8, 20, 12, 40, 20, 0) },
  { id: "over-unders", name: "Over-Unders", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    duration: 65, tss: 78, if: 0.88, difficulty: "Hard", focus: "Lactate tolerance",
    description: "Alternating efforts above and below threshold to train your body to clear lactate while still working hard.",
    zones: zones(6, 22, 14, 43, 15, 0) },

  // ── VO2 Max ──
  { id: "vo2-max-intervals", name: "VO2 Max Intervals", typeId: "vo2max", typeName: "VO2 Max", color: "#40A9C6", icon: "speedometer-outline",
    duration: 70, tss: 85, if: 0.92, difficulty: "Very Hard", focus: "Aerobic ceiling",
    description: "Classic 5x3-minute efforts at VO2 max with equal recovery. Raises your aerobic ceiling and top-end sustainable power.",
    zones: zones(10, 25, 8, 12, 45, 0) },
  { id: "vo2-30-30", name: "30/30 Bursts", typeId: "vo2max", typeName: "VO2 Max", color: "#40A9C6", icon: "speedometer-outline",
    duration: 55, tss: 68, if: 0.9, difficulty: "Hard", focus: "Repeatability",
    description: "Alternating 30s hard / 30s easy microbursts. Builds the ability to repeat high-intensity efforts.",
    zones: zones(8, 22, 10, 15, 45, 0) },

  // ── Sprints ──
  { id: "peak-power-sprints", name: "Peak Power Sprints", typeId: "sprints", typeName: "Sprints", color: "#A65AE2", icon: "flash-outline",
    duration: 55, tss: 55, if: 0.82, difficulty: "Hard", focus: "Explosive power",
    description: "Maximal 15-second sprints with full recovery. Develops neuromuscular power and top-end speed.",
    zones: zones(20, 45, 10, 5, 5, 15) },
  { id: "criterium-sim", name: "Criterium Simulator", typeId: "sprints", typeName: "Sprints", color: "#A65AE2", icon: "flash-outline",
    duration: 60, tss: 72, if: 0.88, difficulty: "Very Hard", focus: "Race-winning kick",
    description: "Repeated hard accelerations out of corners followed by surging efforts — just like a crit finish.",
    zones: zones(10, 35, 12, 13, 15, 15) },

  // ── Tempo ──
  { id: "tempo-endurance", name: "Tempo Endurance", typeId: "tempo", typeName: "Tempo", color: "#E8631C", icon: "pulse",
    duration: 80, tss: 78, if: 0.78, difficulty: "Moderate", focus: "Muscular endurance",
    description: "Sustained Zone 3 riding to build muscular endurance and the ability to hold a strong steady pace.",
    zones: zones(8, 30, 55, 7, 0, 0) },
  { id: "time-trial-sim", name: "Time Trial Simulator", typeId: "tempo", typeName: "Tempo", color: "#E8631C", icon: "pulse",
    duration: 70, tss: 85, if: 0.86, difficulty: "Hard", focus: "Sustained pacing",
    description: "A steady, disciplined effort blending tempo and threshold to sharpen your pacing for time trials.",
    zones: zones(6, 20, 40, 30, 4, 0) },

  // ── Recovery ──
  { id: "recovery-spin", name: "Recovery Spin", typeId: "recovery", typeName: "Recovery", color: "#3FBFAE", icon: "heart-outline",
    duration: 40, tss: 22, if: 0.5, difficulty: "Easy", focus: "Active recovery",
    description: "Very light, high-cadence spinning to promote blood flow and speed up recovery between hard days.",
    zones: zones(70, 30, 0, 0, 0, 0) },
  { id: "mobility-flush", name: "Easy Flush Ride", typeId: "recovery", typeName: "Recovery", color: "#3FBFAE", icon: "heart-outline",
    duration: 30, tss: 16, if: 0.48, difficulty: "Easy", focus: "Circulation",
    description: "A short, gentle flush to loosen the legs and reduce fatigue. Keep it feather-light.",
    zones: zones(80, 20, 0, 0, 0, 0) },

  // ── Rest Day ──
  { id: "rest-day", name: "Full Rest Day", typeId: "restday", typeName: "Rest Day", color: "#A7A8A5", icon: "bed-outline",
    duration: 0, tss: 0, if: 0, difficulty: "Easy", focus: "Adaptation",
    description: "Planned complete rest so your body can adapt and grow stronger. Hydrate, eat well and sleep.",
    zones: zones(100, 0, 0, 0, 0, 0) },

  // ── FB50 Sessions ──
  { id: "fb50-glute-activation", name: "FB50 Glute Activation", typeId: "fb50", typeName: "FB50 Session", color: "#9BD84B", icon: "barbell-outline",
    duration: 20, tss: 0, if: 0, difficulty: "Easy", focus: "Pre-ride activation",
    description: "Targeted glute and hip activation to fire the right muscles before you ride, improving power transfer and protecting your knees.",
    zones: zones(100, 0, 0, 0, 0, 0) },
  { id: "fb50-core-stability", name: "FB50 Core & Stability", typeId: "fb50", typeName: "FB50 Session", color: "#9BD84B", icon: "barbell-outline",
    duration: 25, tss: 0, if: 0, difficulty: "Moderate", focus: "Core strength",
    description: "Cyclist-focused core and stability work to hold a stronger, more efficient position on the bike for longer.",
    zones: zones(100, 0, 0, 0, 0, 0) },
  { id: "fb50-post-ride-mobility", name: "FB50 Post-Ride Mobility", typeId: "fb50", typeName: "FB50 Session", color: "#9BD84B", icon: "barbell-outline",
    duration: 18, tss: 0, if: 0, difficulty: "Easy", focus: "Recovery mobility",
    description: "Gentle mobility and stretching to release tight hips, hamstrings and back after riding, aiding recovery.",
    zones: zones(100, 0, 0, 0, 0, 0) },
];

export function getWorkout(id?: string | null): Workout | undefined {
  return WORKOUTS.find((w) => w.id === id);
}
export function workoutsByType(typeId?: string | null): Workout[] {
  if (!typeId || typeId === "all") return WORKOUTS;
  return WORKOUTS.filter((w) => w.typeId === typeId);
}

export type DurationBand = "any" | "short" | "medium" | "long";
export const DURATION_BANDS: { id: DurationBand; label: string }[] = [
  { id: "any", label: "Any length" },
  { id: "short", label: "< 45 min" },
  { id: "medium", label: "45–90 min" },
  { id: "long", label: "> 90 min" },
];
export function inDurationBand(w: Workout, band: DurationBand): boolean {
  if (band === "any") return true;
  if (band === "short") return w.duration > 0 && w.duration < 45;
  if (band === "medium") return w.duration >= 45 && w.duration <= 90;
  return w.duration > 90;
}

export type SortKey = "recommended" | "duration" | "tss" | "intensity";
export const SORTS: { id: SortKey; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "duration", label: "Duration" },
  { id: "tss", label: "TSS" },
  { id: "intensity", label: "Intensity" },
];
export function sortWorkouts(list: Workout[], key: SortKey): Workout[] {
  const arr = [...list];
  if (key === "duration") arr.sort((a, b) => b.duration - a.duration);
  else if (key === "tss") arr.sort((a, b) => b.tss - a.tss);
  else if (key === "intensity") arr.sort((a, b) => b.if - a.if);
  return arr;
}

export function fmtDuration(min: number): string {
  if (min <= 0) return "Rest";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (h) return `${h}h 00m`;
  return `${m} min`;
}
