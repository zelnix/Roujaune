// "Ride Stronger" — an Intermediate cycling program (default for intermediate
// riders). RPE + cadence based, three rides per week. Phase 1 (Weeks 1–4) is
// authored here; Phases 2–3 are appended when provided. Mirrors the couch-to-road
// module shape so the same plan engine + Live Workout catalog can drive it.
import type { Interval, Session, Week, Phase, Program } from "./couch-to-road";

// Compact interval builder — name/minutes/rpe are enough to drive the Live
// Workout timeline (coach cues are generated live from telemetry).
const iv = (
  name: string,
  minutes: number,
  rpe: string,
  cadence?: string,
  extra?: Partial<Interval>,
): Interval => ({ name, minutes, rpe, ...(cadence ? { cadence } : {}), ...extra });

const rest = (): Session => ({
  day: "Sunday", type: "rest", title: "Complete Rest",
  notes: "No scheduled training. Hydration, food, sleep and gentle everyday movement.",
});

// ---------------------------------------------------------------- WEEK 1
const week1: Week = {
  number: 1,
  title: "Establish Your Baseline",
  objective:
    "Establish your current sustainable fitness, cadence, pacing and recovery baseline without maximal testing.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength and Stability", duration: "~30 min" },
    {
      day: "Tuesday", type: "cycling", title: "Intermediate Baseline Ride", rideLabel: "Ride 1",
      duration: "55 min", category: "Baseline and Aerobic Assessment", environment: "Indoor or outdoor",
      goal: "Establish your current sustainable effort, cadence control and recovery response.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm", { position: "Seated", resistance: "Very light" }),
        iv("Warm-Up Build", 7, "RPE 2–3", "70–82 rpm", { resistance: "Light" }),
        iv("Comfortable Aerobic Block", 10, "RPE 3", "72–86 rpm", { resistance: "Light" }),
        iv("Steady Baseline Block", 8, "RPE 4", "75–88 rpm", { resistance: "Light to moderate" }),
        iv("Easy Reset", 4, "RPE 2–3", "68–80 rpm", { resistance: "Light" }),
        iv("Cadence Control Block", 5, "RPE 4", "84–96 rpm", { resistance: "Light" }),
        iv("Controlled Moderate Block", 8, "RPE 5", "78–90 rpm", { resistance: "Moderate" }),
        iv("Cool-Down", 8, "RPE 1–2", "60–75 rpm", { resistance: "Minimal" }),
      ],
      easierOption: "Complete 45 minutes and remove the Cadence Control Block.",
      completionMessage:
        "You established your starting point without turning the ride into a maximal test. A useful baseline for the weeks ahead.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Cadence and Aerobic Control", rideLabel: "Ride 2",
      duration: "50 min", category: "Cadence and Aerobic Skills", environment: "Indoor or outdoor",
      goal: "Improve cadence awareness while maintaining a stable aerobic effort.",
      intervals: [
        iv("Easy Start", 5, "RPE 2", "65–75 rpm", { resistance: "Very light" }),
        iv("Warm-Up Build", 6, "RPE 2–3", "70–82 rpm", { resistance: "Light" }),
        iv("Aerobic Block", 7, "RPE 3", "74–86 rpm", { resistance: "Light" }),
        iv("Cadence Lift 1", 4, "RPE 4", "85–96 rpm", { resistance: "Light" }),
        iv("Recovery 1", 3, "RPE 2", "68–80 rpm", { resistance: "Light" }),
        iv("Steady Endurance Block", 7, "RPE 4", "76–88 rpm", { resistance: "Light to moderate" }),
        iv("Cadence Lift 2", 4, "RPE 4–5", "87–98 rpm", { resistance: "Light" }),
        iv("Recovery 2", 3, "RPE 2", "68–80 rpm"),
        iv("Controlled Aerobic Finish", 5, "RPE 3–4", "74–88 rpm", { resistance: "Light" }),
        iv("Cool-Down", 6, "RPE 1–2", "60–75 rpm", { resistance: "Minimal" }),
      ],
      easierOption: "Keep both cadence lifts 80–90 rpm, or complete only one lift.",
      completionMessage:
        "You changed cadence without losing posture or aerobic control — a skill that helps you respond smoothly to terrain and pace.",
    },
    { day: "Friday", type: "strength", title: "Core, Balance and Cycling Support", duration: "~22 min" },
    {
      day: "Saturday", type: "cycling", title: "Foundation Endurance Ride", rideLabel: "Ride 3",
      duration: "90 min", category: "Long Endurance", environment: "Indoor or outdoor",
      goal: "Complete a controlled 90-minute ride, establishing sustainable pacing, hydration and posture habits.",
      intervals: [
        iv("Settle In", 6, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 9, "RPE 2–3", "70–82 rpm"),
        iv("Endurance Block 1", 12, "RPE 3", "72–86 rpm"),
        iv("Endurance Block 2", 12, "RPE 3", "74–88 rpm"),
        iv("Endurance Block 3", 12, "RPE 3–4", "74–88 rpm"),
        iv("Easy Reset", 5, "RPE 2–3", "68–80 rpm"),
        iv("Endurance Block 4", 12, "RPE 3–4", "74–88 rpm"),
        iv("Steady Finish", 12, "RPE 4", "76–90 rpm"),
        iv("Cool-Down", 10, "RPE 1–2", "60–75 rpm"),
      ],
      easierOption: "Complete 75 minutes by using three endurance blocks and a 14-minute steady finish.",
      completionMessage:
        "You established your endurance baseline by managing the full ride rather than attacking the opening kilometres.",
    },
    rest(),
  ],
  reflection: [
    "Which ride felt most comfortable?",
    "Which ride felt most demanding?",
    "Did any pain or unusual discomfort occur?",
    "Did three rides feel manageable within the week?",
  ],
};

// ---------------------------------------------------------------- WEEK 2
const week2: Week = {
  number: 2,
  title: "Build Aerobic Rhythm",
  objective:
    "Develop greater aerobic consistency and introduce repeatable tempo efforts without creating excessive fatigue.",
  days: [
    { day: "Monday", type: "strength", title: "Strength for Pedalling Control", duration: "~30 min" },
    {
      day: "Tuesday", type: "cycling", title: "Tempo Introduction", rideLabel: "Ride 4",
      duration: "60 min", category: "Controlled Tempo", environment: "Indoor or outdoor",
      goal: "Complete three repeatable tempo efforts without drifting into threshold intensity.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 6, "RPE 3", "74–86 rpm"),
        iv("Tempo Interval 1", 8, "RPE 5", "78–90 rpm", { resistance: "Moderate" }),
        iv("Recovery 1", 4, "RPE 2–3", "68–80 rpm"),
        iv("Tempo Interval 2", 8, "RPE 5–6", "78–92 rpm", { resistance: "Moderate" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Tempo Interval 3", 8, "RPE 5–6", "78–92 rpm", { resistance: "Moderate" }),
        iv("Easy Aerobic Finish", 3, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete two tempo intervals; replace the third with 8 minutes of easy aerobic riding.",
      completionMessage:
        "You completed repeatable tempo work without letting the session become a test. That control sustains stronger riding later.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "10–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Endurance and Cadence Changes", rideLabel: "Ride 5",
      duration: "60 min", category: "Aerobic Endurance and Cadence", environment: "Indoor or outdoor",
      goal: "Maintain endurance effort while moving smoothly between different cadence ranges.",
      intervals: [
        iv("Easy Start", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 7, "RPE 2–3", "70–82 rpm"),
        iv("Endurance Block 1", 8, "RPE 3", "74–86 rpm"),
        iv("Cadence Lift 1", 4, "RPE 4", "86–98 rpm"),
        iv("Recovery 1", 3, "RPE 2–3"),
        iv("Endurance Block 2", 8, "RPE 3–4", "76–88 rpm"),
        iv("Cadence Lift 2", 4, "RPE 4–5", "88–100 rpm"),
        iv("Recovery 2", 3, "RPE 2–3"),
        iv("Steady Endurance Block", 8, "RPE 4", "76–90 rpm"),
        iv("Comfortable Finish", 4, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Keep cadence lifts below 92 rpm, or complete only one cadence lift.",
      completionMessage:
        "You maintained your aerobic rhythm while changing cadence smoothly — this helps you adapt to terrain and pace efficiently.",
    },
    { day: "Friday", type: "strength", title: "Balance, Core and Hip Support", duration: "~22–25 min" },
    {
      day: "Saturday", type: "cycling", title: "Progressive Endurance Ride", rideLabel: "Ride 6",
      duration: "95 min", category: "Long Endurance", environment: "Indoor or outdoor",
      goal: "Complete a progressively paced endurance ride without starting too strongly.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 12, "RPE 3"),
        iv("Endurance Block 2", 12, "RPE 3"),
        iv("Endurance Block 3", 12, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 4", 12, "RPE 4"),
        iv("Endurance Block 5", 12, "RPE 4"),
        iv("Controlled Finish", 5, "RPE 4–5"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 80 minutes by removing Endurance Block 5.",
      completionMessage:
        "You increased effort gradually instead of spending energy too early — a foundation of stronger endurance riding.",
    },
    rest(),
  ],
  reflection: [
    "Overall fatigue and leg soreness?",
    "How was your sleep and motivation?",
    "Any pain?",
    "Did Week 2 feel sustainable?",
  ],
};

// ---------------------------------------------------------------- WEEK 3
const week3: Week = {
  number: 3,
  title: "Sustained Strength",
  objective:
    "Complete the strongest week of Phase 1 with seated muscular endurance, longer tempo work and extended aerobic riding — without exhaustion.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength and Muscular Support", duration: "~30–32 min" },
    {
      day: "Tuesday", type: "cycling", title: "Sustained Tempo", rideLabel: "Ride 7",
      duration: "65 min", category: "Tempo Development", environment: "Indoor or outdoor",
      goal: "Sustain two longer tempo intervals with stable pacing and technique.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 7, "RPE 3–4", "74–88 rpm"),
        iv("Sustained Tempo 1", 15, "RPE 5–6", "78–92 rpm", { resistance: "Moderate" }),
        iv("Recovery", 5, "RPE 2–3", "68–80 rpm"),
        iv("Sustained Tempo 2", 15, "RPE 5–6", "78–92 rpm", { resistance: "Moderate" }),
        iv("Easy Aerobic Finish", 4, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete two 10-minute tempo intervals; use the removed time as easy aerobic riding.",
      completionMessage:
        "You sustained longer tempo work without letting form or pacing deteriorate — that ability supports the phases ahead.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–18 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Seated Strength and Control", rideLabel: "Ride 8",
      duration: "60 min", category: "Seated Muscular Endurance", environment: "Indoor or outdoor",
      goal: "Develop controlled cycling strength using moderate resistance and a smooth seated cadence.",
      intervals: [
        iv("Easy Start", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 6, "RPE 3", "74–86 rpm"),
        iv("Seated Strength 1", 5, "RPE 5", "62–74 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 1", 4, "RPE 2–3", "68–80 rpm"),
        iv("Seated Strength 2", 5, "RPE 5–6", "62–74 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Seated Strength 3", 5, "RPE 5–6", "60–74 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 3", 4, "RPE 2–3"),
        iv("Steady Aerobic Block", 7, "RPE 4", "74–88 rpm"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete two seated-strength intervals; replace the third with 5 minutes of easy aerobic riding.",
      completionMessage:
        "You developed seated cycling strength while protecting cadence, posture and joint comfort. Controlled pressure beats forcing a heavy gear.",
    },
    { day: "Friday", type: "strength", title: "Light Cycling Support", duration: "~18–20 min" },
    {
      day: "Saturday", type: "cycling", title: "Long Aerobic Durability Ride", rideLabel: "Ride 9",
      duration: "105 min", category: "Long Endurance", environment: "Indoor or outdoor",
      goal: "Complete the longest ride of Phase 1 while maintaining sustainable energy, posture and cadence.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 4", 15, "RPE 3–4"),
        iv("Endurance Block 5", 10, "RPE 4"),
        iv("Controlled Finish", 5, "RPE 4–5"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 90 minutes using four 15-minute endurance blocks and a 5-minute controlled finish.",
      completionMessage:
        "You completed the longest ride of the phase by managing effort, hydration and technique. The value came from how consistently you controlled it.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 4
const week4: Week = {
  number: 4,
  title: "Recover and Reassess",
  weekType: "Reduced-volume recovery and reassessment",
  objective:
    "Reduce accumulated fatigue, reinforce technique and reassess your aerobic control before Phase 2. Volume drops ~25–35%.",
  days: [
    { day: "Monday", type: "strength", title: "Mobility and Light Activation", duration: "18–20 min" },
    {
      day: "Tuesday", type: "cycling", title: "Controlled Aerobic Reassessment", rideLabel: "Ride 10",
      duration: "50 min", category: "Aerobic Reassessment", environment: "Indoor or outdoor",
      goal: "Compare aerobic comfort, cadence and moderate effort with the Week 1 baseline ride.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 7, "RPE 2–3", "70–82 rpm"),
        iv("Comfortable Aerobic Block", 10, "RPE 3", "72–86 rpm"),
        iv("Steady Reassessment Block", 8, "RPE 4", "75–88 rpm"),
        iv("Easy Reset", 4, "RPE 2–3"),
        iv("Moderate Reassessment Block", 8, "RPE 5", "78–90 rpm"),
        iv("Cool-Down", 8, "RPE 1–2"),
      ],
      easierOption: "Complete the moderate reassessment block at RPE 4; begin the cool-down early if fatigue is elevated.",
      completionMessage:
        "You completed the reassessment with control. Progress may show in breathing, cadence, confidence, recovery or comfort — not only speed.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "10–12 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Skills Consolidation Ride", rideLabel: "Ride 11",
      duration: "45 min", category: "Cadence, Pacing and Seated Strength", environment: "Indoor or outdoor",
      goal: "Rehearse the main Phase 1 skills without creating fatigue.",
      intervals: [
        iv("Easy Start", 5, "RPE 2"),
        iv("Warm-Up Build", 6, "RPE 2–3"),
        iv("Comfortable Endurance", 7, "RPE 3", "72–86 rpm"),
        iv("Cadence Lift", 4, "RPE 4", "84–96 rpm"),
        iv("Recovery", 3, "RPE 2"),
        iv("Seated Strength", 5, "RPE 5", "62–74 rpm", { position: "Seated" }),
        iv("Recovery", 3, "RPE 2"),
        iv("Steady Pacing Block", 6, "RPE 4", "75–88 rpm"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Replace the Seated Strength interval with 5 minutes of easy endurance riding.",
      completionMessage:
        "You brought together cadence, pacing and seated strength without unnecessary fatigue. These skills now form the foundation for Phase 2.",
    },
    { day: "Friday", type: "strength", title: "Gentle Mobility and Balance", duration: "~15 min" },
    {
      day: "Saturday", type: "cycling", title: "Phase 1 Confidence Ride", rideLabel: "Ride 12",
      duration: "80 min", category: "Comfortable Endurance", environment: "Indoor or outdoor",
      goal: "Complete Phase 1 with a controlled endurance ride that reinforces confidence and recovery.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 12, "RPE 3"),
        iv("Endurance Block 2", 12, "RPE 3"),
        iv("Endurance Block 3", 12, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 4", 12, "RPE 3–4"),
        iv("Comfortable Finish", 4, "RPE 4"),
        iv("Cool-Down", 8, "RPE 1–2"),
      ],
      easierOption: "Complete 65 minutes using three endurance blocks and a 6-minute comfortable finish.",
      completionMessage:
        "You completed Phase 1 with a calm, controlled endurance ride. You have the consistency, pacing and awareness to begin Phase 2.",
    },
    rest(),
  ],
  reflection: [
    "How many of the twelve cycling workouts did you complete?",
    "Has comfortable endurance riding become easier?",
    "Which cadence range feels most natural?",
    "How well did you recover between sessions?",
    "Is your current goal still appropriate?",
    "What would you most like to improve during Phase 2?",
  ],
};

const phase1: Phase = {
  number: 1,
  name: "Foundation and Control",
  weeksLabel: "Weeks 1–4",
  objective:
    "Establish the rider's current intermediate baseline and build a controlled aerobic foundation for the twelve-week plan.",
  focus: [
    "A safe, repeatable weekly training rhythm.",
    "Three purposeful cycling workouts each week.",
    "Controlled aerobic riding at RPE 3–4 and moderate tempo at RPE 5–6.",
    "Cadence awareness, relaxed posture and early gearing.",
    "Seated muscular endurance and practical hydration/fuelling habits.",
    "A reduced-volume Week 4 and an end-of-phase reassessment.",
  ],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  weeks: [week1, week2, week3, week4],
  complete: {
    heading: "PHASE 1 COMPLETE — FOUNDATION AND CONTROL",
    summary: [
      "Four weeks completed.",
      "Twelve cycling workouts, three per week.",
      "Aerobic endurance established; controlled tempo introduced.",
      "Cadence changes and seated muscular endurance practised.",
      "Longest planned ride: 105 minutes.",
      "Reduced-volume recovery week and end-of-phase reassessment completed.",
    ],
    coachMessage:
      "You have completed the first four weeks of your intermediate training plan. Your training now has structure, your effort has greater control and your goal has a clearer path. Your strongest ride is your own.",
  },
};

export const RIDE_STRONGER: Program = {
  id: "ride-stronger",
  name: "Ride Stronger",
  level: "Intermediate",
  durationWeeks: 4,
  phaseCount: 1,
  frequency: "3 rides/week",
  outcome:
    "Build a controlled aerobic foundation — endurance, cadence, tempo and seated strength — toward your chosen goal.",
  startDate: "2025-05-12",
  weeklyRhythm: [
    { day: "Mon", session: "Strength" },
    { day: "Tue", session: "Ride" },
    { day: "Wed", session: "Recovery" },
    { day: "Thu", session: "Ride" },
    { day: "Fri", session: "Strength / Balance" },
    { day: "Sat", session: "Long Ride" },
    { day: "Sun", session: "Rest" },
  ],
  phaseTitles: [{ number: 1, name: "Foundation and Control", weeks: "Weeks 1–4" }],
  phases: [phase1],
};

// Deterministic id for a Ride Stronger cycling session (namespaced `rs-ride-N`).
export function rsRideId(s: Session): string {
  const m = s.rideLabel?.match(/Ride\s+(\d+)/i);
  if (m) return `rs-ride-${m[1]}`;
  return `rs-${s.day.toLowerCase()}-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export function rsWeekStart(weekNumber: number): string {
  const [y, m, d] = RIDE_STRONGER.startDate.split("-").map((n) => parseInt(n, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + (weekNumber - 1) * 7);
  return base.toISOString().slice(0, 10);
}
