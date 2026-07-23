import { Ionicons } from "@expo/vector-icons";
import { COUCH_TO_ROAD, ctrRideId, type Interval, type Session } from "./programs/couch-to-road";

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
  level?: "Foundation" | "Development" | "Performance";
  environment?: "indoor" | "outdoor";
  segmentSpec?: { label: string; zoneIdx: number; minutes: number; targetPct?: number }[];
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

export type Level = "Foundation" | "Development" | "Performance";
export const LEVEL_META: Record<Level, { label: string; tier: string; color: string }> = {
  Foundation: { label: "Foundation", tier: "Beginner", color: "#55C850" },
  Development: { label: "Development", tier: "Intermediate", color: "#40A9C6" },
  Performance: { label: "Performance", tier: "Advanced", color: "#FFC20A" },
};

// Map the rider's self-rated capability to a workout Level tier.
export const CAPABILITY_TO_LEVEL: Record<string, Level> = {
  beginner: "Foundation", intermediate: "Development", advanced: "Performance",
};

// An explicit, ordered segment spec (minutes) that overrides the auto-builder.
export type SegSpec = { label: string; zoneIdx: number; minutes: number; targetPct?: number };

// Target %FTP presets for the structured endurance library.
const T = { warm: 0.55, warmHi: 0.58, z2low: 0.62, z2: 0.66, z2steady: 0.68, z2up: 0.73, easy: 0.5, tempoLow: 0.78, tempo: 0.83, tempoCtrl: 0.8 };
const wu = (m: number, t = T.warm): SegSpec => ({ label: "Warm-up", zoneIdx: 1, minutes: m, targetPct: t });
const cd = (m: number): SegSpec => ({ label: "Cool-down", zoneIdx: 0, minutes: m, targetPct: T.easy });
const easy = (m: number): SegSpec => ({ label: "Easy", zoneIdx: 0, minutes: m, targetPct: T.easy });

function structured(o: {
  id: string; name: string; typeId: string; typeName: string; color: string; icon: Ion;
  level: Level; difficulty: Workout["difficulty"]; focus: string; description: string;
  tss: number; if: number; zones: Zone[]; spec: SegSpec[];
}): Workout {
  const duration = o.spec.reduce((a, sp) => a + sp.minutes, 0);
  return {
    id: o.id, name: o.name, typeId: o.typeId, typeName: o.typeName, color: o.color, icon: o.icon,
    duration, tss: o.tss, if: o.if, difficulty: o.difficulty, focus: o.focus, description: o.description,
    zones: o.zones, level: o.level, segmentSpec: o.spec,
  };
}

// Build an interval set: n efforts separated by an easy recovery.
function set(n: number, mk: (i: number) => SegSpec, restMin: number): SegSpec[] {
  const a: SegSpec[] = [];
  for (let i = 1; i <= n; i++) {
    a.push(mk(i));
    if (i < n) a.push(easy(restMin));
  }
  return a;
}
const rep = (label: string, zoneIdx: number, minutes: number, targetPct: number): SegSpec => ({ label, zoneIdx, minutes, targetPct });

// ── Structured Indoor Endurance Library (level-based; durations kept within the
// Foundation/Development/Performance limits — no 90-min+ standard indoor rides) ──
const END_COLOR = "#55C850";
const TEMPO_COLOR = "#E8631C";
const STRUCTURED: Workout[] = [
  // 1. Aerobic Base
  structured({ id: "aerobic-base-foundation", name: "Aerobic Base", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "bicycle",
    level: "Foundation", difficulty: "Easy", focus: "Aerobic base", tss: 18, if: 0.6, zones: zones(43, 57, 0, 0, 0, 0),
    description: "A gentle, steady Zone 2 introduction to build your aerobic engine. Stay comfortable and conversational throughout.",
    spec: [wu(8), { label: "Zone 2 Endurance", zoneIdx: 1, minutes: 17, targetPct: T.z2 }, cd(5)] }),
  structured({ id: "aerobic-base-development", name: "Aerobic Base", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "bicycle",
    level: "Development", difficulty: "Moderate", focus: "Aerobic base", tss: 29, if: 0.62, zones: zones(47, 53, 0, 0, 0, 0),
    description: "Two solid Zone 2 blocks with an easy spin between. Builds aerobic efficiency without accumulating fatigue.",
    spec: [wu(10), { label: "Zone 2 Block 1", zoneIdx: 1, minutes: 12, targetPct: T.z2 }, easy(3), { label: "Zone 2 Block 2", zoneIdx: 1, minutes: 12, targetPct: T.z2 }, cd(8)] }),
  structured({ id: "aerobic-base-performance", name: "Aerobic Base", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "bicycle",
    level: "Performance", difficulty: "Hard", focus: "Aerobic base", tss: 44, if: 0.66, zones: zones(40, 60, 0, 0, 0, 0),
    description: "Three upper Zone 2 blocks to deepen aerobic durability. Hold a strong, even effort just below tempo.",
    spec: [wu(12, T.warmHi), { label: "Upper Z2 Block 1", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, easy(3), { label: "Upper Z2 Block 2", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, easy(3), { label: "Upper Z2 Block 3", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, cd(6)] }),

  // 2. Endurance Progression
  structured({ id: "endurance-progression-foundation", name: "Endurance Progression", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "trending-up-outline",
    level: "Foundation", difficulty: "Easy", focus: "Progressive aerobic", tss: 19, if: 0.61, zones: zones(47, 53, 0, 0, 0, 0),
    description: "A gradual build from easy to steady Zone 2. Finish strong — never let it drift into a threshold effort.",
    spec: [{ label: "Easy", zoneIdx: 1, minutes: 8, targetPct: T.warm }, { label: "Lower Zone 2", zoneIdx: 1, minutes: 8, targetPct: T.z2low }, { label: "Steady Zone 2", zoneIdx: 1, minutes: 8, targetPct: T.z2steady }, easy(6)] }),
  structured({ id: "endurance-progression-development", name: "Endurance Progression", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "trending-up-outline",
    level: "Development", difficulty: "Moderate", focus: "Progressive aerobic", tss: 31, if: 0.64, zones: zones(38, 62, 0, 0, 0, 0),
    description: "Step up through the Zone 2 range and finish in upper Zone 2. Keep the progression smooth and controlled.",
    spec: [wu(10), { label: "Lower Zone 2", zoneIdx: 1, minutes: 10, targetPct: T.z2low }, { label: "Steady Zone 2", zoneIdx: 1, minutes: 10, targetPct: T.z2steady }, { label: "Upper Zone 2", zoneIdx: 1, minutes: 8, targetPct: T.z2up }, cd(7)] }),
  structured({ id: "endurance-progression-performance", name: "Endurance Progression", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "trending-up-outline",
    level: "Performance", difficulty: "Hard", focus: "Progressive aerobic", tss: 46, if: 0.68, zones: zones(32, 60, 8, 0, 0, 0),
    description: "A full progression finishing with a short controlled tempo touch. Strong to the line, but never breathless.",
    spec: [wu(12), { label: "Lower Zone 2", zoneIdx: 1, minutes: 12, targetPct: T.z2low }, { label: "Steady Zone 2", zoneIdx: 1, minutes: 12, targetPct: T.z2steady }, { label: "Upper Zone 2", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, { label: "Controlled Tempo", zoneIdx: 2, minutes: 5, targetPct: T.tempoCtrl }, cd(7)] }),

  // 3. Aerobic Endurance Intervals
  structured({ id: "aerobic-intervals-foundation", name: "Aerobic Endurance Intervals", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "repeat-outline",
    level: "Foundation", difficulty: "Easy", focus: "Aerobic intervals", tss: 22, if: 0.62, zones: zones(57, 43, 0, 0, 0, 0),
    description: "Short, repeatable Zone 2 intervals with easy spins between. A friendly first step into structured endurance work.",
    spec: [wu(10), { label: "Zone 2 · 1/3", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, easy(2), { label: "Zone 2 · 2/3", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, easy(2), { label: "Zone 2 · 3/3", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, cd(6)] }),
  structured({ id: "aerobic-intervals-development", name: "Aerobic Endurance Intervals", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "repeat-outline",
    level: "Development", difficulty: "Moderate", focus: "Aerobic intervals", tss: 33, if: 0.66, zones: zones(47, 53, 0, 0, 0, 0),
    description: "Three upper Zone 2 intervals to extend aerobic endurance. Hold each effort steady and even.",
    spec: [wu(10), { label: "Upper Z2 · 1/3", zoneIdx: 1, minutes: 8, targetPct: T.z2up }, easy(2), { label: "Upper Z2 · 2/3", zoneIdx: 1, minutes: 8, targetPct: T.z2up }, easy(2), { label: "Upper Z2 · 3/3", zoneIdx: 1, minutes: 8, targetPct: T.z2up }, cd(7)] }),
  structured({ id: "aerobic-intervals-performance", name: "Aerobic Endurance Intervals", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "repeat-outline",
    level: "Performance", difficulty: "Hard", focus: "Aerobic intervals", tss: 48, if: 0.69, zones: zones(40, 60, 0, 0, 0, 0),
    description: "Three long upper Zone 2 intervals for serious aerobic durability. Strong, sustainable and controlled.",
    spec: [wu(12, T.warmHi), { label: "Upper Z2 · 1/3", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, easy(3), { label: "Upper Z2 · 2/3", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, easy(3), { label: "Upper Z2 · 3/3", zoneIdx: 1, minutes: 12, targetPct: T.z2up }, cd(6)] }),

  // 4. Tempo Endurance Builder
  structured({ id: "tempo-builder-foundation", name: "Tempo Endurance Builder", typeId: "tempo", typeName: "Tempo", color: TEMPO_COLOR, icon: "pulse",
    level: "Foundation", difficulty: "Moderate", focus: "Muscular endurance", tss: 22, if: 0.66, zones: zones(45, 20, 35, 0, 0, 0),
    description: "A first taste of tempo — two short low-tempo efforts. Strong but sustainable, never breathless or competitive.",
    spec: [wu(10), { label: "Low Tempo · 1/2", zoneIdx: 2, minutes: 5, targetPct: T.tempoLow }, easy(3), { label: "Low Tempo · 2/2", zoneIdx: 2, minutes: 5, targetPct: T.tempoLow }, cd(7)] }),
  structured({ id: "tempo-builder-development", name: "Tempo Endurance Builder", typeId: "tempo", typeName: "Tempo", color: TEMPO_COLOR, icon: "pulse",
    level: "Development", difficulty: "Hard", focus: "Muscular endurance", tss: 39, if: 0.72, zones: zones(35, 20, 45, 0, 0, 0),
    description: "Two ten-minute tempo blocks to build muscular endurance. Hold a strong, even effort — controlled, not competitive.",
    spec: [wu(12), { label: "Tempo · 1/2", zoneIdx: 2, minutes: 10, targetPct: T.tempo }, easy(5), { label: "Tempo · 2/2", zoneIdx: 2, minutes: 10, targetPct: T.tempo }, cd(8)] }),
  structured({ id: "tempo-builder-performance", name: "Tempo Endurance Builder", typeId: "tempo", typeName: "Tempo", color: TEMPO_COLOR, icon: "pulse",
    level: "Performance", difficulty: "Hard", focus: "Muscular endurance", tss: 56, if: 0.75, zones: zones(30, 20, 50, 0, 0, 0),
    description: "Three ten-minute tempo efforts for durable, sustainable power. Strong and steady — keep it well short of threshold.",
    spec: [wu(15), { label: "Tempo · 1/3", zoneIdx: 2, minutes: 10, targetPct: T.tempo }, easy(4), { label: "Tempo · 2/3", zoneIdx: 2, minutes: 10, targetPct: T.tempo }, easy(4), { label: "Tempo · 3/3", zoneIdx: 2, minutes: 10, targetPct: T.tempo }, cd(7)] }),

  // 5. Strength Endurance (low-cadence · muscular tension — careful for 50+ joints)
  structured({ id: "strength-endurance-foundation", name: "Strength Endurance", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "barbell-outline",
    level: "Foundation", difficulty: "Moderate", focus: "Low-cadence strength", tss: 23, if: 0.68, zones: zones(73, 0, 27, 0, 0, 0),
    description: "Short low-cadence efforts (70–75 rpm) to build muscular strength. 50+ tip: use a comfortable resistance — never heavy-gear grinding — and back off if your knees, hips or lower back complain. A seated version works well.",
    spec: [wu(10), { label: "70–75 rpm · 1/4", zoneIdx: 2, minutes: 2, targetPct: 0.75 }, easy(2), { label: "70–75 rpm · 2/4", zoneIdx: 2, minutes: 2, targetPct: 0.75 }, easy(2), { label: "70–75 rpm · 3/4", zoneIdx: 2, minutes: 2, targetPct: 0.75 }, easy(2), { label: "70–75 rpm · 4/4", zoneIdx: 2, minutes: 2, targetPct: 0.75 }, cd(6)] }),
  structured({ id: "strength-endurance-development", name: "Strength Endurance", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "barbell-outline",
    level: "Development", difficulty: "Hard", focus: "Low-cadence strength", tss: 37, if: 0.72, zones: zones(63, 0, 37, 0, 0, 0),
    description: "Four-minute low-cadence blocks (65–75 rpm) for muscular endurance. 50+ tip: keep it smooth and controlled, not a grind — reduce resistance the moment a joint feels uncomfortable. Seated version optional.",
    spec: [wu(12), { label: "65–75 rpm · 1/4", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "65–75 rpm · 2/4", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "65–75 rpm · 3/4", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "65–75 rpm · 4/4", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, cd(6)] }),
  structured({ id: "strength-endurance-performance", name: "Strength Endurance", typeId: "climbing", typeName: "Climbing", color: "#C91727", icon: "barbell-outline",
    level: "Performance", difficulty: "Hard", focus: "Low-cadence strength", tss: 48, if: 0.74, zones: zones(62, 0, 38, 0, 0, 0),
    description: "Five four-minute blocks at 60–70 rpm for real muscular durability. 50+ tip: this should never become heavy-gear grinding — protect your knees, hips and back with lighter resistance and a more natural cadence if needed.",
    spec: [wu(15), { label: "60–70 rpm · 1/5", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "60–70 rpm · 2/5", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "60–70 rpm · 3/5", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "60–70 rpm · 4/5", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, easy(3), { label: "60–70 rpm · 5/5", zoneIdx: 2, minutes: 4, targetPct: 0.75 }, cd(6)] }),

  // 6. Indoor Endurance Durability (replaces long 2–5h formats — right stimulus in less time)
  structured({ id: "endurance-durability-foundation", name: "Indoor Endurance Durability", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "infinite-outline",
    level: "Foundation", difficulty: "Easy", focus: "Endurance durability", tss: 27, if: 0.64, zones: zones(48, 52, 0, 0, 0, 0),
    description: "Steady Zone 2 blocks that build durability without the marathon time cost. 50+ tip: change hand position and posture regularly, and keep it comfortable throughout.",
    spec: [{ label: "Easy", zoneIdx: 1, minutes: 10, targetPct: T.warm }, { label: "Steady Z2 · 1/3", zoneIdx: 1, minutes: 7, targetPct: T.z2steady }, easy(2), { label: "Steady Z2 · 2/3", zoneIdx: 1, minutes: 7, targetPct: T.z2steady }, easy(2), { label: "Steady Z2 · 3/3", zoneIdx: 1, minutes: 7, targetPct: T.z2steady }, cd(5)] }),
  structured({ id: "endurance-durability-development", name: "Indoor Endurance Durability", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "infinite-outline",
    level: "Development", difficulty: "Moderate", focus: "Endurance durability", tss: 40, if: 0.66, zones: zones(45, 55, 0, 0, 0, 0),
    description: "Three ten-minute Zone 2 blocks, each with a one-minute higher-cadence lift to keep the legs lively. 50+ tip: shift hand position and cadence often, and ease resistance if anything feels uncomfortable.",
    spec: [wu(12), { label: "Zone 2 · Block 1", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, { label: "Cadence Lift", zoneIdx: 1, minutes: 1, targetPct: T.z2 }, { label: "Zone 2 · Block 1", zoneIdx: 1, minutes: 4, targetPct: T.z2 }, easy(3), { label: "Zone 2 · Block 2", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, { label: "Cadence Lift", zoneIdx: 1, minutes: 1, targetPct: T.z2 }, { label: "Zone 2 · Block 2", zoneIdx: 1, minutes: 4, targetPct: T.z2 }, easy(3), { label: "Zone 2 · Block 3", zoneIdx: 1, minutes: 5, targetPct: T.z2 }, { label: "Cadence Lift", zoneIdx: 1, minutes: 1, targetPct: T.z2 }, { label: "Zone 2 · Block 3", zoneIdx: 1, minutes: 4, targetPct: T.z2 }, cd(7)] }),
  structured({ id: "endurance-durability-performance", name: "Indoor Endurance Durability", typeId: "endurance", typeName: "Endurance", color: END_COLOR, icon: "infinite-outline",
    level: "Performance", difficulty: "Hard", focus: "Endurance durability", tss: 54, if: 0.68, zones: zones(40, 60, 0, 0, 0, 0),
    description: "Three long Zone 2 blocks that each finish in upper Zone 2 — durable endurance in 70 focused minutes. 50+ tip: keep the finishes controlled, vary your position, and reduce resistance any time joints feel it.",
    spec: [wu(15), { label: "Zone 2 · Block 1", zoneIdx: 1, minutes: 11, targetPct: T.z2 }, { label: "Upper Z2 Finish", zoneIdx: 1, minutes: 3, targetPct: T.z2up }, easy(3), { label: "Zone 2 · Block 2", zoneIdx: 1, minutes: 11, targetPct: T.z2 }, { label: "Upper Z2 Finish", zoneIdx: 1, minutes: 3, targetPct: T.z2up }, easy(3), { label: "Zone 2 · Block 3", zoneIdx: 1, minutes: 11, targetPct: T.z2 }, { label: "Upper Z2 Finish", zoneIdx: 1, minutes: 3, targetPct: T.z2up }, cd(7)] }),

  // 7. Threshold Intervals (sustainable power at/near FTP)
  structured({ id: "threshold-intervals-foundation", name: "Threshold Intervals", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    level: "Foundation", difficulty: "Moderate", focus: "Sustainable power", tss: 32, if: 0.82, zones: zones(38, 20, 0, 42, 0, 0),
    description: "A gentle introduction to threshold work — two short efforts just below your limit. 50+ tip: keep your breathing controlled and ease off early if your form starts to fade.",
    spec: [wu(10), ...set(2, (i) => rep(`Threshold · ${i}/2`, 3, 6, 0.92), 4), cd(8)] }),
  structured({ id: "threshold-intervals-development", name: "Threshold Intervals", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    level: "Development", difficulty: "Hard", focus: "Sustainable power", tss: 50, if: 0.87, zones: zones(32, 18, 0, 50, 0, 0),
    description: "Three eight-minute efforts right at threshold to lift your sustainable power. Hold a strong, even cadence and repeatable output across all three.",
    spec: [wu(12), ...set(3, (i) => rep(`Threshold · ${i}/3`, 3, 8, 0.95), 4), cd(8)] }),
  structured({ id: "threshold-intervals-performance", name: "Threshold Intervals", typeId: "threshold", typeName: "Threshold", color: "#FFC20A", icon: "flash",
    level: "Performance", difficulty: "Very Hard", focus: "Sustainable power", tss: 68, if: 0.9, zones: zones(28, 16, 0, 56, 0, 0),
    description: "Four demanding eight-minute threshold efforts for serious FTP gains. Precise pacing throughout — every effort should look the same on power.",
    spec: [wu(14), ...set(4, (i) => rep(`Threshold · ${i}/4`, 3, 8, 0.97), 4), cd(8)] }),

  // 8. VO2 Max Intervals (aerobic ceiling)
  structured({ id: "vo2-intervals-foundation", name: "VO2 Max Intervals", typeId: "vo2max", typeName: "VO2 Max", color: "#40A9C6", icon: "speedometer-outline",
    level: "Foundation", difficulty: "Hard", focus: "Aerobic ceiling", tss: 34, if: 0.85, zones: zones(30, 20, 0, 0, 50, 0),
    description: "Short two-minute efforts to open up your top-end aerobic system. 50+ tip: build into each rep rather than starting flat-out, and stop if you feel light-headed.",
    spec: [wu(10), ...set(4, (i) => rep(`VO2 · ${i}/4`, 4, 2, 1.1), 2), cd(8)] }),
  structured({ id: "vo2-intervals-development", name: "VO2 Max Intervals", typeId: "vo2max", typeName: "VO2 Max", color: "#40A9C6", icon: "speedometer-outline",
    level: "Development", difficulty: "Very Hard", focus: "Aerobic ceiling", tss: 48, if: 0.9, zones: zones(28, 18, 0, 0, 54, 0),
    description: "Classic five-by-three-minute VO2 efforts with equal recovery. Raises your aerobic ceiling and the power you can hold when it really hurts.",
    spec: [wu(12), ...set(5, (i) => rep(`VO2 · ${i}/5`, 4, 3, 1.12), 3), cd(8)] }),
  structured({ id: "vo2-intervals-performance", name: "VO2 Max Intervals", typeId: "vo2max", typeName: "VO2 Max", color: "#40A9C6", icon: "speedometer-outline",
    level: "Performance", difficulty: "Very Hard", focus: "Aerobic ceiling", tss: 60, if: 0.93, zones: zones(26, 16, 0, 0, 58, 0),
    description: "Six brutal three-minute VO2 efforts for the strongest riders. Hold your target on every rep — this is where race-winning fitness is built.",
    spec: [wu(14), ...set(6, (i) => rep(`VO2 · ${i}/6`, 4, 3, 1.13), 3), cd(8)] }),

  // 9. Sprint Power (short, maximal neuromuscular efforts)
  structured({ id: "sprint-power-foundation", name: "Sprint Power", typeId: "sprints", typeName: "Sprints", color: "#A65AE2", icon: "flash-outline",
    level: "Foundation", difficulty: "Moderate", focus: "Explosive power", tss: 24, if: 0.7, zones: zones(45, 40, 0, 0, 0, 15),
    description: "Five short fifteen-second sprints with full recovery. 50+ tip: stay seated or rise smoothly — never lunge — and keep plenty of easy spinning between efforts.",
    spec: [wu(10), ...set(5, (i) => rep(`Sprint · ${i}/5`, 5, 0.25, 1.5), 2.5), cd(6)] }),
  structured({ id: "sprint-power-development", name: "Sprint Power", typeId: "sprints", typeName: "Sprints", color: "#A65AE2", icon: "flash-outline",
    level: "Development", difficulty: "Hard", focus: "Explosive power", tss: 30, if: 0.74, zones: zones(42, 40, 0, 0, 0, 18),
    description: "Six maximal fifteen-second sprints to sharpen your top-end speed and neuromuscular power. Full, unhurried recovery between each.",
    spec: [wu(12), ...set(6, (i) => rep(`Sprint · ${i}/6`, 5, 0.25, 1.5), 2.5), cd(6)] }),
  structured({ id: "sprint-power-performance", name: "Sprint Power", typeId: "sprints", typeName: "Sprints", color: "#A65AE2", icon: "flash-outline",
    level: "Performance", difficulty: "Very Hard", focus: "Explosive power", tss: 38, if: 0.78, zones: zones(40, 38, 0, 0, 0, 22),
    description: "Eight all-out sprints for a race-winning kick. Commit fully to each effort, then recover completely — quality over quantity every time.",
    spec: [wu(12), ...set(8, (i) => rep(`Sprint · ${i}/8`, 5, 0.25, 1.55), 2.5), cd(7)] }),

  // 10. Recovery Spin (very light active recovery)
  structured({ id: "recovery-spin-foundation", name: "Recovery Spin", typeId: "recovery", typeName: "Recovery", color: "#3FBFAE", icon: "heart-outline",
    level: "Foundation", difficulty: "Easy", focus: "Active recovery", tss: 9, if: 0.5, zones: zones(100, 0, 0, 0, 0, 0),
    description: "A short, feather-light spin to promote blood flow and ease the legs. Keep it gentle and high-cadence — this should feel restful, not like training.",
    spec: [rep("Easy Spin", 0, 25, 0.5)] }),
  structured({ id: "recovery-spin-development", name: "Recovery Spin", typeId: "recovery", typeName: "Recovery", color: "#3FBFAE", icon: "heart-outline",
    level: "Development", difficulty: "Easy", focus: "Active recovery", tss: 13, if: 0.5, zones: zones(100, 0, 0, 0, 0, 0),
    description: "An easy thirty-five-minute flush to speed recovery between harder days. Stay strictly in Zone 1 and enjoy the spin.",
    spec: [rep("Easy Spin", 0, 35, 0.52)] }),
  structured({ id: "recovery-spin-performance", name: "Recovery Spin", typeId: "recovery", typeName: "Recovery", color: "#3FBFAE", icon: "heart-outline",
    level: "Performance", difficulty: "Easy", focus: "Active recovery", tss: 18, if: 0.55, zones: zones(85, 15, 0, 0, 0, 0),
    description: "A longer active-recovery spin with a couple of light cadence lifts to keep the legs supple. Still easy throughout — recovery is the goal, not fitness.",
    spec: [rep("Easy Spin", 0, 15, 0.5), rep("Light Lift", 1, 3, 0.62), rep("Easy Spin", 0, 12, 0.5), rep("Light Lift", 1, 3, 0.62), rep("Easy Spin", 0, 10, 0.5)] }),
];

/* ============ From Couch to Road (beginner plan) → catalog workouts ============ */
// The plan is authored in RPE + cadence. Map the low bound of each interval's RPE
// onto a training zone + %FTP so the Live Workout HUD can drive real targets.
function rpeToZone(rpe: string): { zoneIdx: number; targetPct: number } {
  const low = parseInt((rpe.match(/\d+/) || ["3"])[0], 10);
  switch (low) {
    case 1: return { zoneIdx: 0, targetPct: 0.48 };
    case 2: return { zoneIdx: 0, targetPct: 0.55 };
    case 3: return { zoneIdx: 1, targetPct: 0.64 };
    case 4: return { zoneIdx: 1, targetPct: 0.72 };
    case 5: return { zoneIdx: 2, targetPct: 0.80 };
    default: return { zoneIdx: 2, targetPct: 0.86 };
  }
}

function ctrSessionToWorkout(s: Session): Workout {
  const intervals: Interval[] = s.intervals ?? [];
  const spec: SegSpec[] = intervals.map((iv) => {
    const { zoneIdx, targetPct } = rpeToZone(iv.rpe);
    return { label: iv.name, zoneIdx, minutes: iv.minutes, targetPct };
  });
  const duration = spec.reduce((a, sp) => a + sp.minutes, 0);
  const isRecovery = /recovery|confidence|easy/i.test(s.category || s.title || "");
  return {
    id: ctrRideId(s),
    name: s.title,
    typeId: isRecovery ? "recovery" : "endurance",
    typeName: isRecovery ? "Recovery" : "Endurance",
    color: isRecovery ? "#3FBFAE" : END_COLOR,
    icon: "bicycle",
    duration,
    tss: Math.round(duration * 0.6),
    if: 0.6,
    difficulty: "Easy",
    focus: s.category || "Beginner endurance",
    description: s.goal || s.notes || "A From Couch to Road beginner session.",
    zones: zones(30, 50, 20, 0, 0, 0),
    level: "Foundation",
    segmentSpec: spec.length ? spec : [wu(5), easy(10), cd(5)],
  };
}

export const CTR_WORKOUTS: Workout[] = (() => {
  const out: Workout[] = [];
  const seen = new Set<string>();
  for (const phase of COUCH_TO_ROAD.phases) {
    for (const week of phase.weeks) {
      for (const day of week.days) {
        if (day.type === "cycling") {
          const w = ctrSessionToWorkout(day);
          if (!seen.has(w.id)) { seen.add(w.id); out.push(w); }
        }
      }
    }
  }
  return out;
})();

export const WORKOUTS: Workout[] = [
  ...CTR_WORKOUTS,
  ...STRUCTURED,
  // ── Endurance ──
  { id: "endurance-ride", name: "Endurance Ride", typeId: "endurance", typeName: "Endurance", color: "#55C850", icon: "bicycle",
    duration: 105, tss: 70, if: 0.62, difficulty: "Easy", focus: "Aerobic base",
    description: "A long, steady Zone 2 ride to build your aerobic engine and fat-burning efficiency. Keep it conversational the whole way. Best done outdoors where terrain and momentum keep it engaging.",
    zones: zones(10, 75, 15, 0, 0, 0), environment: "outdoor" },
  { id: "long-base-builder", name: "Long Base Builder", typeId: "endurance", typeName: "Endurance", color: "#55C850", icon: "bicycle",
    duration: 150, tss: 95, if: 0.63, difficulty: "Moderate", focus: "Endurance volume",
    description: "Extended endurance ride with a few tempo surges to keep the legs honest. Great weekend base session — take it outdoors for the full experience.",
    zones: zones(8, 68, 20, 4, 0, 0), environment: "outdoor" },
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
    description: "A long climb simulation blending tempo and threshold to prepare for grand-tour style ascents. An outdoor big-mountain day.",
    zones: zones(4, 26, 25, 35, 10, 0), environment: "outdoor" },

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

/* ============================ LIVE INTERVAL SEGMENTS ============================ */
// Each catalog workout is turned into a real, ordered interval timeline so the
// Live HUD can drive its target power, step counter, interval countdown and the
// "next up" preview from the actual session the rider chose (no hardcoded mock).

// Midpoint %FTP and RPE per training zone (Z1..Z6).
const ZONE_FTP = [0.5, 0.65, 0.8, 0.95, 1.12, 1.4];
const ZONE_RPE = [2, 4, 5, 7, 8, 10];
const ZLAB = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];

export type Segment = {
  label: string;
  zoneLabel: string;
  zoneIdx: number;   // 0..5 (Z1..Z6)
  color: string;
  durationSec: number;
  targetPct: number; // fraction of FTP
  rpe: number;
};

function mkSeg(w: Workout, idx: number, label: string, dur: number): Segment {
  return {
    label,
    zoneLabel: ZLAB[idx],
    zoneIdx: idx,
    color: w.zones[idx].color,
    durationSec: dur,
    targetPct: ZONE_FTP[idx],
    rpe: ZONE_RPE[idx],
  };
}

/** Build a structured warm-up → main-set → cool-down timeline from a workout's
 * zone distribution and duration. Segment durations always sum to the total. */
export function buildSegments(w: Workout): Segment[] {
  if (w.duration <= 0) return [mkSeg(w, 0, "Rest & Recover", 0)];

  // Explicit, hand-authored timeline (structured library) takes precedence.
  if (w.segmentSpec && w.segmentSpec.length) {
    return w.segmentSpec.map((sp) => {
      const seg = mkSeg(w, sp.zoneIdx, sp.label, Math.round(sp.minutes * 60));
      if (sp.targetPct != null) seg.targetPct = sp.targetPct;
      return seg;
    });
  }

  const total = Math.round(w.duration * 60);
  const warm = Math.max(120, Math.round(total * 0.12));
  const cool = Math.max(90, Math.round(total * 0.1));
  const mid = Math.max(60, total - warm - cool);

  const working = [2, 3, 4, 5].filter((i) => w.zones[i].pct > 0);
  const pool = working.length ? working : [1];
  const sumPct = pool.reduce((a, i) => a + (w.zones[i].pct || (i === 1 ? 100 : 0)), 0) || 1;

  const segs: Segment[] = [mkSeg(w, 1, "Warm-up", warm)];
  let used = 0;
  pool.forEach((idx, k) => {
    const share = k === pool.length - 1 ? mid - used : Math.round((mid * (w.zones[idx].pct || 100)) / sumPct);
    used += share;
    if (idx >= 3) {
      // Hard zones become repeats separated by short recoveries.
      const reps = Math.min(4, Math.max(2, Math.round(share / 360)));
      const cycle = Math.floor(share / reps);
      const work = Math.max(30, Math.round(cycle * 0.7));
      const rec = Math.max(20, cycle - work);
      let consumed = 0;
      for (let r = 0; r < reps; r++) {
        segs.push(mkSeg(w, idx, `${ZLAB[idx]} Effort ${r + 1}/${reps}`, work));
        consumed += work;
        if (r < reps - 1) {
          segs.push(mkSeg(w, 0, "Recovery", rec));
          consumed += rec;
        }
      }
      const leftover = share - consumed;
      if (leftover !== 0) segs[segs.length - 1].durationSec += leftover;
    } else {
      segs.push(mkSeg(w, idx, idx === 2 ? "Tempo Block" : "Endurance", share));
    }
  });
  segs.push(mkSeg(w, 0, "Cool-down", cool));
  return segs;
}

export type ActiveSegment = {
  index: number;
  total: number;
  segment: Segment;
  elapsedInSeg: number;
  remaining: number;
  next: Segment | null;
};

/** Map the ride's elapsed time onto the segment timeline. */
export function currentSegment(segs: Segment[], elapsedSec: number): ActiveSegment {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const end = acc + s.durationSec;
    if (elapsedSec < end || i === segs.length - 1) {
      const elapsedInSeg = Math.max(0, Math.min(s.durationSec, elapsedSec - acc));
      return {
        index: i,
        total: segs.length,
        segment: s,
        elapsedInSeg,
        remaining: Math.max(0, s.durationSec - elapsedInSeg),
        next: segs[i + 1] ?? null,
      };
    }
    acc = end;
  }
  const last = segs[segs.length - 1];
  return { index: segs.length - 1, total: segs.length, segment: last, elapsedInSeg: 0, remaining: 0, next: null };
}

/** Normalised bar heights (0..1) for the interval profile chart. */
export function segmentProfile(segs: Segment[]): number[] {
  return segs.map((s) => Math.max(0.12, Math.min(1, s.targetPct / 1.4)));
}

export function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Target watts for a segment given the rider's FTP and optional adaptive
 * per-zone bias (e.g. { Z4: 0.04 } → +4% on Z4 targets). */
export function targetWatts(seg: Segment, ftp: number, bias?: Record<string, number> | null): number {
  const b = (bias && bias[seg.zoneLabel]) || 0;
  return Math.round(ftp * seg.targetPct * (1 + b));
}
