// "Ride Beyond" — Roujaune's default ADVANCED 12-week performance plan. Three
// primary rides/week for experienced cyclists. Phase 1 (Weeks 1–4) is authored
// here; Phases 2–3 append when provided. Same shape as the other programs so the
// shared plan engine + Live Workout catalog drive it.
import type { Interval, Session, Week, Phase, Program } from "./couch-to-road";

const iv = (
  name: string,
  minutes: number,
  rpe: string,
  cadence?: string,
  extra?: Partial<Interval>,
): Interval => ({ name, minutes, rpe, ...(cadence ? { cadence } : {}), ...extra });

const restDay = (): Session => ({
  day: "Monday", type: "rest", title: "Complete Rest or Gentle Mobility",
  notes: "No scheduled riding. Optional gentle mobility, hydration, food and sleep.",
});
const recoveryDay = (title: string, duration: string): Session => ({
  day: "Friday", type: "recovery", title, duration, optional: true,
});

// ---------------------------------------------------------------- WEEK 1
const week1: Week = {
  number: 1,
  title: "Establish the Baseline",
  objective:
    "Establish current advanced fitness benchmarks and settle into the rhythm of the program. Finish challenged, not depleted.",
  days: [
    restDay(),
    {
      day: "Tuesday", type: "cycling", title: "Advanced Performance Baseline", rideLabel: "Ride 1",
      duration: "75–90 min", category: "Baseline Assessment and Pacing Control", environment: "Indoor or outdoor",
      goal: "Establish your current aerobic, sustained-power and high-intensity baseline.",
      intervals: [
        iv("Warm-Up", 8, "RPE 2–3", "80–90 rpm"),
        iv("Build", 5, "RPE 3–4"),
        iv("Cadence Spins", 4, "RPE 4", "105–115 rpm"),
        iv("Prep", 3, "RPE 4–5"),
        iv("Aerobic Benchmark", 15, "RPE 4–5", "80–95 rpm"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Sustained Benchmark", 12, "RPE 7", "82–94 rpm"),
        iv("Recovery", 6, "RPE 2–3"),
        iv("VO2 Control 1", 2, "RPE 8"),
        iv("Recovery", 3, "RPE 2"),
        iv("VO2 Control 2", 2, "RPE 8"),
        iv("Recovery", 3, "RPE 2"),
        iv("VO2 Control 3", 2, "RPE 8"),
        iv("Cool-Down", 12, "RPE 1–2", "60–75 rpm"),
      ],
      easierOption: "Complete two VO2 control efforts, or reduce the sustained benchmark to 10 minutes.",
      completionMessage:
        "Your baseline is not an exam — it is the starting point from which your training becomes personal.",
    },
    { day: "Wednesday", type: "strength", title: "Fit Beyond 50 — Cycling Strength", duration: "~30 min" },
    {
      day: "Thursday", type: "cycling", title: "Cadence Range and Aerobic Control", rideLabel: "Ride 2",
      duration: "70–80 min", category: "Pedalling Efficiency", environment: "Indoor or outdoor",
      goal: "Maintain smooth power while changing cadence — stay efficient across pedalling speeds.",
      intervals: [
        iv("Warm-Up", 8, "RPE 2–3"),
        iv("Cadence Spins", 4, "RPE 4", "100–110 rpm"),
        iv("Round 1 · Steady", 6, "RPE 4", "80–85 rpm"),
        iv("Round 1 · Lift", 5, "RPE 5", "90–95 rpm"),
        iv("Round 1 · High", 3, "RPE 5–6", "100–105 rpm"),
        iv("Recovery", 3, "RPE 2–3"),
        iv("Round 2 · Steady", 6, "RPE 4", "80–85 rpm"),
        iv("Round 2 · Lift", 5, "RPE 5", "90–95 rpm"),
        iv("Round 2 · High", 3, "RPE 5–6", "100–105 rpm"),
        iv("Recovery", 3, "RPE 2–3"),
        iv("Tempo 1", 6, "RPE 6", "85–95 rpm"),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Tempo 2", 6, "RPE 6", "85–95 rpm"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete two cadence rounds and one closing tempo interval.",
      completionMessage: "Your cadence may change, but your control should not.",
    },
    recoveryDay("Rest or Gentle Mobility", "optional"),
    {
      day: "Saturday", type: "cycling", title: "Advanced Foundation Endurance Ride", rideLabel: "Ride 3",
      duration: "120–150 min", category: "Aerobic Durability", environment: "Indoor or outdoor",
      goal: "Build the aerobic endurance required for advanced training; finish as strong as you started.",
      intervals: [
        iv("Opening Endurance", 30, "RPE 3", "80–92 rpm"),
        iv("Endurance Block 1", 15, "RPE 5", "80–95 rpm"),
        iv("Recovery", 8, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 5", "80–95 rpm"),
        iv("Recovery", 8, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 5", "80–95 rpm"),
        iv("Final Endurance", 24, "RPE 4–5"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Shorten or omit the final endurance section if form, comfort or fuelling decline.",
      completionMessage:
        "Endurance is measured not by how hard you begin, but by how well you are still riding near the end.",
    },
    { day: "Sunday", type: "recovery", title: "Optional Recovery Spin or Rest", duration: "optional", optional: true },
  ],
  reflection: ["Was the 12-minute benchmark paced evenly?", "Did you finish tired but composed?"],
};

// ---------------------------------------------------------------- WEEK 2
const week2: Week = {
  number: 2,
  title: "Tempo Capacity",
  objective: "Increase sustained aerobic pressure and introduce longer tempo work — smooth, purposeful, repeatable.",
  days: [
    restDay(),
    {
      day: "Tuesday", type: "cycling", title: "Sustained Tempo Development", rideLabel: "Ride 4",
      duration: "80–90 min", category: "Sustainable Speed", environment: "Indoor or outdoor",
      goal: "Sustain a strong pace below threshold — demanding enough to adapt, controlled enough to repeat.",
      intervals: [
        iv("Warm-Up", 8, "RPE 2–3"),
        iv("Build", 5, "RPE 4"),
        iv("Cadence Spins", 3, "RPE 4", "100–110 rpm"),
        iv("Prep", 3, "RPE 5"),
        iv("Tempo 1", 12, "RPE 6", "82–95 rpm"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Tempo 2", 12, "RPE 6", "82–95 rpm"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Tempo 3", 12, "RPE 6", "82–95 rpm"),
        iv("Leg-Speed 1", 1, "RPE 6", "110–120 rpm"),
        iv("Leg-Speed 2", 1, "RPE 6", "110–120 rpm"),
        iv("Cool-Down", 12, "RPE 1–2"),
      ],
      easierOption: "Complete two tempo intervals; keep leg-speed efforts controlled, not maximal.",
      completionMessage: "Tempo should feel strong enough to matter and controlled enough to repeat.",
    },
    { day: "Wednesday", type: "strength", title: "Fit Beyond 50 — Cycling Strength", duration: "~30 min" },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Endurance with Cadence Changes", rideLabel: "Ride 5",
      duration: "75–90 min", category: "Aerobic Stability under Cadence Variation", environment: "Indoor or outdoor",
      goal: "Stay aerobically stable while cadence and resistance change — efficiency for rolling roads and wind.",
      intervals: [
        iv("Warm-Up", 10, "RPE 2–3"),
        iv("Cadence Spins", 3, "RPE 4", "100–110 rpm"),
        iv("Round 1 · Mid", 6, "RPE 4–5", "85–90 rpm"),
        iv("Round 1 · High", 4, "RPE 4–5", "95–100 rpm"),
        iv("Round 1 · Low", 3, "RPE 4–5", "75–80 rpm"),
        iv("Recovery", 3, "RPE 2–3"),
        iv("Round 2 · Mid", 6, "RPE 4–5", "85–90 rpm"),
        iv("Round 2 · High", 4, "RPE 4–5", "95–100 rpm"),
        iv("Round 2 · Low", 3, "RPE 4–5", "75–80 rpm"),
        iv("Recovery", 3, "RPE 2–3"),
        iv("Round 3 · Mid", 6, "RPE 4–5", "85–90 rpm"),
        iv("Round 3 · High", 4, "RPE 4–5", "95–100 rpm"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete three rounds instead of four; avoid grinding at low cadence.",
      completionMessage: "The gear may change. The terrain may change. Your rhythm stays yours.",
    },
    recoveryDay("Rest or Gentle Mobility", "optional"),
    {
      day: "Saturday", type: "cycling", title: "Progressive Endurance Ride", rideLabel: "Ride 6",
      duration: "150–165 min", category: "Progressive Pacing and Endurance Control", environment: "Indoor or outdoor",
      goal: "Build intensity gradually across a long ride — finish stronger than you began, without losing control.",
      intervals: [
        iv("Block 1 · Easy", 45, "RPE 3"),
        iv("Block 2 · Steady", 45, "RPE 4"),
        iv("Block 3 · Strong", 30, "RPE 5"),
        iv("Block 4 · Tempo", 15, "RPE 5–6"),
        iv("Cool-Down", 12, "RPE 1–2"),
      ],
      easierOption: "End after Block 3 if readiness is reduced; keep the final block controlled, never all-out.",
      completionMessage: "A progressive ride becomes stronger, not sloppier.",
    },
    { day: "Sunday", type: "recovery", title: "Optional Recovery Spin or Rest", duration: "optional", optional: true },
  ],
};

// ---------------------------------------------------------------- WEEK 3
const week3: Week = {
  number: 3,
  title: "Threshold Introduction",
  objective: "The most demanding week of Phase 1: threshold control, seated climbing strength and repeated sustained efforts.",
  days: [
    restDay(),
    {
      day: "Tuesday", type: "cycling", title: "Controlled Threshold Development", rideLabel: "Ride 7",
      duration: "85–95 min", category: "Sustained Threshold Power", environment: "Indoor or outdoor",
      goal: "Sustain a demanding effort near threshold — every interval consistent, never over-cooked on the first.",
      intervals: [
        iv("Warm-Up", 8, "RPE 2–3"),
        iv("Build", 5, "RPE 4"),
        iv("Openers", 3, "RPE 6"),
        iv("Prep", 4, "RPE 3–4"),
        iv("Threshold 1", 8, "RPE 7–8", "82–94 rpm"),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Threshold 2", 8, "RPE 7–8", "82–94 rpm"),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Threshold 3", 8, "RPE 7–8", "82–94 rpm"),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Threshold 4", 8, "RPE 7–8", "82–94 rpm"),
        iv("Aerobic Finish", 8, "RPE 5"),
        iv("Cool-Down", 12, "RPE 1–2"),
      ],
      easierOption: "Complete three threshold intervals, or hold them at RPE 7.",
      completionMessage: "Threshold is not chaos — it is controlled discomfort held with purpose.",
    },
    { day: "Wednesday", type: "strength", title: "Fit Beyond 50 — Cycling Strength", duration: "~30 min" },
    {
      day: "Thursday", type: "cycling", title: "Seated Climbing Strength and Control", rideLabel: "Ride 8",
      duration: "75–90 min", category: "Muscular Endurance and Climbing Torque", environment: "Indoor or outdoor",
      goal: "Develop the force for sustained climbing while reinforcing controlled pedalling technique.",
      intervals: [
        iv("Warm-Up", 10, "RPE 2–3"),
        iv("Torque Openers", 3, "RPE 5", "75–80 rpm"),
        iv("Prep", 3, "RPE 3"),
        iv("Seated Climb 1", 6, "RPE 6–7", "60–70 rpm", { position: "Seated" }),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Seated Climb 2", 6, "RPE 6–7", "60–70 rpm", { position: "Seated" }),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Seated Climb 3", 6, "RPE 6–7", "60–70 rpm", { position: "Seated" }),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Seated Climb 4", 6, "RPE 6–7", "60–70 rpm", { position: "Seated" }),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Seated Climb 5", 6, "RPE 6–7", "60–70 rpm", { position: "Seated" }),
        iv("Cadence Finish", 5, "RPE 6", "90–100 rpm"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete three or four seated climbs; keep cadence controllable and stop if knee discomfort develops.",
      completionMessage: "Climbing strength comes from controlled pressure, not from fighting the bicycle.",
    },
    recoveryDay("Rest or Gentle Mobility", "optional"),
    {
      day: "Saturday", type: "cycling", title: "Hills and Endurance", rideLabel: "Ride 9",
      duration: "150–180 min", category: "Climbing Durability", environment: "Indoor or outdoor",
      goal: "Combine aerobic endurance with sustained climbing — controlled power while managing a long ride.",
      intervals: [
        iv("Opening Endurance", 25, "RPE 3–4"),
        iv("Climb 1", 9, "RPE 6", "65–80 rpm"),
        iv("Endurance", 12, "RPE 3–4"),
        iv("Climb 2", 9, "RPE 6", "65–80 rpm"),
        iv("Endurance", 12, "RPE 3–4"),
        iv("Climb 3", 9, "RPE 6", "65–80 rpm"),
        iv("Endurance", 12, "RPE 3–4"),
        iv("Climb 4", 9, "RPE 6", "65–80 rpm"),
        iv("Controlled Endurance Finish", 20, "RPE 3–4"),
        iv("Cool-Down", 12, "RPE 1–2"),
      ],
      easierOption: "Complete three climbs; keep the remaining ride at RPE 3–4.",
      completionMessage: "A strong climber does not conquer the first minute — a strong climber controls the whole ascent.",
    },
    { day: "Sunday", type: "recovery", title: "Optional Recovery Spin or Rest", duration: "optional", optional: true },
  ],
};

// ---------------------------------------------------------------- WEEK 4
const week4: Week = {
  number: 4,
  title: "Consolidate and Reassess",
  weekType: "Reduced-volume consolidation and readiness assessment",
  objective: "Reduce volume while retaining purposeful intensity. Absorb the first three weeks and confirm readiness for Phase 2.",
  days: [
    restDay(),
    {
      day: "Tuesday", type: "cycling", title: "Tempo and Threshold Consolidation", rideLabel: "Ride 10",
      duration: "70–80 min", category: "Maintaining Intensity with Reduced Volume", environment: "Indoor or outdoor",
      goal: "Hold intensity with less total work — sharp, clean, energy remaining at the end.",
      intervals: [
        iv("Warm-Up", 8, "RPE 2–3"),
        iv("Build", 4, "RPE 4"),
        iv("Cadence Spins", 2, "RPE 4", "100–110 rpm"),
        iv("Tempo 1", 10, "RPE 6", "82–95 rpm"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Tempo 2", 10, "RPE 6", "82–95 rpm"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Threshold 1", 6, "RPE 7", "82–94 rpm"),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Threshold 2", 6, "RPE 7", "82–94 rpm"),
        iv("Sharp 1", 0.5, "RPE 8"),
        iv("Sharp 2", 0.5, "RPE 8"),
        iv("Cool-Down", 12, "RPE 1–2"),
      ],
      easierOption: "Complete one threshold interval and two short RPE 8 efforts.",
      completionMessage: "Reduced volume does not mean reduced purpose.",
    },
    { day: "Wednesday", type: "strength", title: "Fit Beyond 50 — Cycling Strength", duration: "~25 min" },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Maintenance and Technique", rideLabel: "Ride 11",
      duration: "60–75 min", category: "Recovery, Aerobic Maintenance and Cadence", environment: "Indoor or outdoor",
      goal: "Easy aerobic maintenance with light, smooth high-cadence work — finish better than you started.",
      intervals: [
        iv("Easy Start", 10, "RPE 2–3"),
        iv("Aerobic", 8, "RPE 3–4"),
        iv("Spin 1", 1, "RPE 4", "105–115 rpm"),
        iv("Recovery", 2, "RPE 2"),
        iv("Spin 2", 1, "RPE 4", "105–115 rpm"),
        iv("Recovery", 2, "RPE 2"),
        iv("Spin 3", 1, "RPE 4", "105–115 rpm"),
        iv("Recovery", 2, "RPE 2"),
        iv("Spin 4", 1, "RPE 4", "105–115 rpm"),
        iv("Aerobic", 8, "RPE 3"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete four high-cadence spins total; keep everything easy.",
      completionMessage: "Fast legs do not need frantic movement. Stay light, smooth and composed.",
    },
    recoveryDay("Rest or Gentle Mobility", "optional"),
    {
      day: "Saturday", type: "cycling", title: "Phase 1 Confidence Endurance Ride", rideLabel: "Ride 12",
      duration: "120–150 min", category: "Phase Consolidation and Readiness", environment: "Indoor or outdoor",
      goal: "Bring together endurance, tempo, threshold, cadence and fuelling — confirm your strength is repeatable.",
      intervals: [
        iv("Opening Endurance", 30, "RPE 3–4"),
        iv("Tempo 1", 15, "RPE 5–6", "82–95 rpm"),
        iv("Recovery", 8, "RPE 3"),
        iv("Tempo 2", 15, "RPE 5–6", "82–95 rpm"),
        iv("Recovery", 6, "RPE 3"),
        iv("Threshold", 8, "RPE 7", "82–94 rpm"),
        iv("Steady Aerobic Finish", 20, "RPE 3–4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Reduce the tempo blocks to 10 minutes and hold the threshold effort at RPE 6.",
      completionMessage: "Phase 1 is complete when your strength feels repeatable — not accidental.",
    },
    { day: "Sunday", type: "recovery", title: "Optional Recovery Spin or Rest", duration: "optional", optional: true },
  ],
  reflection: [
    "Did the tempo efforts feel controlled and the threshold effort evenly paced?",
    "Did cadence remain stable and fuelling effective?",
    "Did you recover normally, with no persistent pain or excessive fatigue?",
    "Are you ready for Phase 2 — Power and Durability?",
  ],
};

const phase1: Phase = {
  number: 1,
  name: "Performance Foundation",
  weeksLabel: "Weeks 1–4",
  objective:
    "Establish the rider's advanced performance baseline and develop the control, aerobic durability and technical efficiency needed for the rest of the program.",
  focus: [
    "Performance assessment and aerobic efficiency.",
    "Tempo control and a threshold introduction.",
    "Cadence development and seated climbing strength.",
    "Progressive endurance toward 2.5–3 hours.",
    "Proactive fuelling and hydration; technique under fatigue.",
    "A reduced-volume Week 4 and a Phase 2 readiness assessment.",
  ],
  cadenceQuote: "Cadence should never be forced at the expense of comfort, coordination or safe technique.",
  weeks: [week1, week2, week3, week4],
  complete: {
    heading: "PHASE 1 COMPLETE — PERFORMANCE FOUNDATION",
    summary: [
      "Four weeks completed; twelve advanced cycling workouts available.",
      "Performance benchmarks established; aerobic efficiency and tempo control developed.",
      "Threshold intervals and seated climbing strength introduced.",
      "Progressive endurance to 2.5–3 hours; proactive fuelling practised.",
      "Reduced-volume consolidation week and Phase 2 readiness assessment completed.",
    ],
    coachMessage:
      "You have built more than fitness — you have established the control, consistency and durability required for advanced performance training. The next phase will ask you to produce more power, climb with greater strength and complete quality work after fatigue accumulates. Ride Beyond — stronger for longer, ready when the road demands more.",
  },
};

export const RIDE_BEYOND: Program = {
  id: "ride-beyond",
  name: "Ride Beyond",
  level: "Advanced",
  durationWeeks: 4,
  phaseCount: 1,
  frequency: "3 rides/week",
  outcome:
    "An advanced 12-week performance plan — sustainable power, endurance, climbing strength, cadence control and performance under fatigue, toward a personalised achievement ride.",
  startDate: "2025-05-12",
  weeklyRhythm: [
    { day: "Mon", session: "Rest" },
    { day: "Tue", session: "Primary Workout" },
    { day: "Wed", session: "FB50 Strength" },
    { day: "Thu", session: "Secondary Workout" },
    { day: "Fri", session: "Rest / Recovery" },
    { day: "Sat", session: "Long Ride" },
    { day: "Sun", session: "Optional Recovery" },
  ],
  phaseTitles: [{ number: 1, name: "Performance Foundation", weeks: "Weeks 1–4" }],
  phases: [phase1],
};

export function rbRideId(s: Session): string {
  const m = s.rideLabel?.match(/Ride\s+(\d+)/i);
  if (m) return `rb-ride-${m[1]}`;
  return `rb-${s.day.toLowerCase()}-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export function rbWeekStart(weekNumber: number): string {
  const [y, m, d] = RIDE_BEYOND.startDate.split("-").map((n) => parseInt(n, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + (weekNumber - 1) * 7);
  return base.toISOString().slice(0, 10);
}
