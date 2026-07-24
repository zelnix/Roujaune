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

// ---------------------------------------------------------------- WEEK 5
const week5: Week = {
  number: 5,
  title: "Build Sustainable Strength",
  objective:
    "Introduce longer moderate efforts and develop controlled cycling strength without sacrificing cadence or technique.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength and Stability", duration: "~30–32 min" },
    {
      day: "Tuesday", type: "cycling", title: "Tempo Strength Builder", rideLabel: "Ride 13",
      duration: "65 min", category: "Sustained Tempo", environment: "Indoor or outdoor",
      goal: "Complete three controlled tempo intervals while maintaining stable cadence and posture.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm", { position: "Seated", resistance: "Very light" }),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm", { resistance: "Light" }),
        iv("Aerobic Preparation", 6, "RPE 3–4", "74–88 rpm", { resistance: "Light" }),
        iv("Tempo Interval 1", 10, "RPE 5–6", "78–92 rpm", { resistance: "Moderate" }),
        iv("Recovery 1", 4, "RPE 2–3", "68–80 rpm", { resistance: "Light" }),
        iv("Tempo Interval 2", 10, "RPE 5–6", "78–94 rpm", { resistance: "Moderate" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Tempo Interval 3", 10, "RPE 5–6", "78–94 rpm", { resistance: "Moderate" }),
        iv("Easy Aerobic Finish", 2, "RPE 3", "72–84 rpm"),
        iv("Cool-Down", 6, "RPE 1–2", "60–75 rpm", { resistance: "Minimal" }),
      ],
      easierOption: "Complete two 10-minute tempo intervals; replace the third with 6 min easy riding + 4 min extra cool-down.",
      completionMessage:
        "You completed repeated tempo work without letting the final interval become uncontrolled. Sustainable strength is built through repeatable effort.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Cadence Under Load", rideLabel: "Ride 14",
      duration: "60 min", category: "Cadence and Muscular Endurance", environment: "Indoor or outdoor",
      goal: "Maintain smooth cadence as resistance changes.",
      intervals: [
        iv("Easy Start", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 7, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Block", 7, "RPE 3", "74–88 rpm"),
        iv("Cadence Lift", 4, "RPE 4", "88–100 rpm", { resistance: "Light" }),
        iv("Recovery", 3, "RPE 2", "68–80 rpm"),
        iv("Seated Strength 1", 6, "RPE 5", "62–76 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Seated Strength 2", 6, "RPE 5–6", "62–76 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 3", 4, "RPE 2–3"),
        iv("Cadence Under Control", 5, "RPE 4–5", "84–98 rpm", { resistance: "Light" }),
        iv("Comfortable Aerobic Finish", 3, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete one seated-strength interval; replace the second with 6 min easy riding. Keep cadence lifts below 94 rpm.",
      completionMessage:
        "You adjusted cadence and resistance without losing control — that ability helps you respond to changing terrain.",
    },
    { day: "Friday", type: "strength", title: "Core, Balance and Cycling Support", duration: "~22–25 min" },
    {
      day: "Saturday", type: "cycling", title: "Long Steady Endurance Ride", rideLabel: "Ride 15",
      duration: "110 min", category: "Long Endurance", environment: "Indoor or outdoor",
      goal: "Extend aerobic endurance while practising steady fuelling and posture management.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 4", 15, "RPE 3–4"),
        iv("Endurance Block 5", 15, "RPE 4"),
        iv("Controlled Finish", 5, "RPE 4–5"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 95 minutes by removing Endurance Block 5.",
      completionMessage:
        "You extended your endurance without abandoning pacing or technique. Duration increased, but control remained the priority.",
    },
    rest(),
  ],
  reflection: ["How did Week 5 fatigue feel?", "Did the longer ride stay controlled?"],
};

// ---------------------------------------------------------------- WEEK 6
const week6: Week = {
  number: 6,
  title: "Develop Climbing Control",
  objective:
    "Develop seated climbing strength and manage resistance, cadence and breathing on moderate gradients — approach hills with preparation, not force.",
  days: [
    { day: "Monday", type: "strength", title: "Climbing Strength Support", duration: "~30 min" },
    {
      day: "Tuesday", type: "cycling", title: "Seated Climbing Strength", rideLabel: "Ride 16",
      duration: "65 min", category: "Seated Climbing", environment: "Indoor or outdoor",
      goal: "Complete repeated controlled seated climbing intervals without grinding.",
      intervals: [
        iv("Easy Start", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 7, "RPE 3", "74–88 rpm"),
        iv("Seated Climb 1", 5, "RPE 5–6", "62–76 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 1", 4, "RPE 2–3", "68–82 rpm"),
        iv("Seated Climb 2", 5, "RPE 5–6", "62–76 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Seated Climb 3", 5, "RPE 6", "62–76 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Recovery 3", 4, "RPE 2–3"),
        iv("Seated Climb 4", 5, "RPE 6", "60–74 rpm", { resistance: "Moderate", position: "Seated" }),
        iv("Easy Aerobic Finish", 7, "RPE 3", "72–86 rpm"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete three seated climbing intervals; replace the fourth with 5 min easy aerobic riding.",
      completionMessage:
        "You repeated controlled climbing efforts without letting cadence or technique deteriorate. Strong climbing begins with preparation and gearing.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "10–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Endurance with Hill Skills", rideLabel: "Ride 17",
      duration: "65 min", category: "Aerobic Endurance and Terrain Management", environment: "Indoor or outdoor",
      goal: "Maintain aerobic control while responding smoothly to gentle changes in terrain or resistance.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 8, "RPE 2–3"),
        iv("Endurance Block 1", 10, "RPE 3", "74–88 rpm"),
        iv("Gentle Rise 1", 3, "RPE 5", "64–78 rpm", { position: "Seated" }),
        iv("Recovery 1", 4, "RPE 2–3"),
        iv("Endurance Block 2", 10, "RPE 3–4"),
        iv("Gentle Rise 2", 3, "RPE 5–6", "62–76 rpm", { position: "Seated" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Endurance Block 3", 10, "RPE 4"),
        iv("Gentle Rise 3", 3, "RPE 5–6", "62–76 rpm", { position: "Seated" }),
        iv("Comfortable Finish", 5, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete two Gentle Rise intervals; replace the third with 3 min easy endurance riding.",
      completionMessage:
        "You managed changing resistance without letting the hills control the ride. Early gearing and calm pacing protected your energy.",
    },
    { day: "Friday", type: "strength", title: "Balance, Core and Posture", duration: "~22–25 min" },
    {
      day: "Saturday", type: "cycling", title: "Hills and Endurance", rideLabel: "Ride 18",
      duration: "115 min", category: "Long Endurance and Terrain Control", environment: "Indoor or outdoor",
      goal: "Complete a longer endurance ride that includes controlled rolling terrain or simulated hills.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Rolling Terrain Block 1", 10, "RPE 3–5", "64–80 rpm"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Rolling Terrain Block 2", 10, "RPE 3–5", "64–80 rpm"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Rolling Terrain Block 3", 10, "RPE 4–6", "62–78 rpm"),
        iv("Controlled Endurance Finish", 10, "RPE 4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 95 minutes using two rolling-terrain blocks and a 15-minute controlled endurance finish.",
      completionMessage:
        "You completed a longer ride across changing terrain by preparing for each rise and protecting your energy. The hills became part of the ride.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 7
const week7: Week = {
  number: 7,
  title: "Hold Stronger Efforts",
  objective:
    "The strongest development week of Phase 2: sustain controlled threshold-development work and hold useful effort late in a longer ride. Not maximal intensity.",
  days: [
    { day: "Monday", type: "strength", title: "Controlled Strength for Cyclists", duration: "~30 min" },
    {
      day: "Tuesday", type: "cycling", title: "Controlled Threshold Development", rideLabel: "Ride 19",
      duration: "70 min", category: "Threshold Development", environment: "Indoor or outdoor",
      goal: "Complete three controlled harder efforts without entering maximal intensity.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 8, "RPE 3–4", "74–88 rpm"),
        iv("Preparation Lift", 3, "RPE 5", "78–92 rpm"),
        iv("Easy Reset", 3, "RPE 2–3"),
        iv("Threshold Development 1", 8, "RPE 6–7", "80–94 rpm", { resistance: "Moderate to moderately strong" }),
        iv("Recovery 1", 4, "RPE 2–3"),
        iv("Threshold Development 2", 8, "RPE 6–7", "80–96 rpm", { resistance: "Moderate to moderately strong" }),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Threshold Development 3", 8, "RPE 6–7", "80–96 rpm", { resistance: "Moderate to moderately strong" }),
        iv("Easy Aerobic Finish", 4, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete two threshold intervals (or all three at RPE 6); replace the third with 8 min easy endurance riding.",
      completionMessage:
        "You completed hard, focused work without letting it become maximal. That discipline turns intensity into useful training.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–18 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Maintenance", rideLabel: "Ride 20",
      duration: "65 min", category: "Aerobic Endurance", environment: "Indoor or outdoor",
      goal: "Maintain aerobic conditioning without adding excessive fatigue after Tuesday's harder session.",
      intervals: [
        iv("Easy Start", 6, "RPE 2"),
        iv("Warm-Up Build", 8, "RPE 2–3"),
        iv("Aerobic Block 1", 12, "RPE 3", "72–86 rpm"),
        iv("Aerobic Block 2", 12, "RPE 3", "74–88 rpm"),
        iv("Easy Reset", 5, "RPE 2"),
        iv("Aerobic Block 3", 12, "RPE 3–4", "74–90 rpm"),
        iv("Comfortable Finish", 4, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete 50 minutes by removing Aerobic Block 3 and using a 5-minute comfortable finish.",
      completionMessage:
        "You maintained your aerobic foundation without adding strain. Strong training includes knowing when not to push harder.",
    },
    { day: "Friday", type: "strength", title: "Light Activation and Mobility", duration: "~15–18 min" },
    {
      day: "Saturday", type: "cycling", title: "Goal-Specific Durability Ride", rideLabel: "Ride 21",
      duration: "120 min", category: "Long Endurance and Goal Development", environment: "Indoor or outdoor",
      goal: "Maintain useful goal-related effort during the second half of a two-hour ride. Endurance first, goal-specific work second.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Endurance Block 4", 15, "RPE 3–4"),
        iv("Goal-Specific Block 1", 10, "RPE 4–6"),
        iv("Recovery", 5, "RPE 2–3"),
        iv("Goal-Specific Block 2", 10, "RPE 4–6"),
        iv("Controlled Endurance Finish", 5, "RPE 4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 100 minutes using three endurance blocks, one 10-minute goal-specific block and a 15-minute finish.",
      completionMessage:
        "You completed the longest ride of the phase by protecting your energy first and using your strength later. That is how fitness becomes useful for your goal.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 8
const week8: Week = {
  number: 8,
  title: "Recover and Consolidate",
  weekType: "Reduced-volume recovery and reassessment",
  objective:
    "Reduce accumulated fatigue, reinforce the major Phase 2 skills and review readiness for goal-specific Phase 3. Volume drops ~30–40%.",
  days: [
    { day: "Monday", type: "strength", title: "Mobility and Light Activation", duration: "18–20 min" },
    {
      day: "Tuesday", type: "cycling", title: "Short Tempo Consolidation", rideLabel: "Ride 22",
      duration: "50 min", category: "Tempo Consolidation", environment: "Indoor or outdoor",
      goal: "Reinforce controlled tempo without adding significant fatigue.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 7, "RPE 2–3"),
        iv("Aerobic Preparation", 6, "RPE 3"),
        iv("Tempo Interval 1", 8, "RPE 5", "78–92 rpm", { resistance: "Moderate" }),
        iv("Recovery", 4, "RPE 2–3"),
        iv("Tempo Interval 2", 8, "RPE 5–6", "78–94 rpm", { resistance: "Moderate" }),
        iv("Easy Aerobic Finish", 5, "RPE 3"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete one 8-minute tempo interval; replace the second with 8 min comfortable endurance riding.",
      completionMessage:
        "You reinforced your tempo rhythm without unnecessary fatigue. The work felt familiar because your capacity has grown.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "10–12 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Strength and Cadence Consolidation", rideLabel: "Ride 23",
      duration: "45 min", category: "Skills Consolidation", environment: "Indoor or outdoor",
      goal: "Rehearse seated strength, cadence and recovery without creating fatigue.",
      intervals: [
        iv("Easy Start", 5, "RPE 2"),
        iv("Warm-Up Build", 6, "RPE 2–3"),
        iv("Comfortable Endurance", 7, "RPE 3", "72–86 rpm"),
        iv("Cadence Lift", 4, "RPE 4", "86–98 rpm"),
        iv("Recovery", 3, "RPE 2"),
        iv("Seated Strength", 5, "RPE 5", "62–76 rpm", { position: "Seated" }),
        iv("Recovery", 3, "RPE 2"),
        iv("Steady Endurance", 6, "RPE 4", "76–90 rpm"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Replace the Seated Strength interval with 5 min comfortable endurance riding.",
      completionMessage:
        "You combined cadence and seated strength without fatigue. These skills are ready to support your goal-specific training.",
    },
    { day: "Friday", type: "strength", title: "Gentle Mobility and Balance", duration: "~15 min" },
    {
      day: "Saturday", type: "cycling", title: "Phase 2 Confidence Endurance Ride", rideLabel: "Ride 24",
      duration: "90 min", category: "Comfortable Endurance", environment: "Indoor or outdoor",
      goal: "Complete Phase 2 with a controlled ride that confirms improved strength, pacing and endurance.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 12, "RPE 3"),
        iv("Endurance Block 2", 12, "RPE 3"),
        iv("Endurance Block 3", 12, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Steady Strength Block", 10, "RPE 4–5"),
        iv("Comfortable Endurance Finish", 14, "RPE 3–4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 75 minutes using three endurance blocks, an 8-minute steady strength block and a 6-minute finish.",
      completionMessage:
        "You completed Phase 2 with stronger endurance, better climbing control and greater confidence under resistance. You are ready for Phase 3.",
    },
    rest(),
  ],
  reflection: [
    "How many of the twelve Phase 2 cycling workouts did you complete?",
    "Can you sustain tempo more comfortably?",
    "How did you respond to controlled threshold-development work?",
    "Did seated climbing feel smoother, and did you shift earlier on hills?",
    "How was your energy during the two-hour ride?",
    "Is your current cycling goal still appropriate, and which ability should Phase 3 prioritise?",
  ],
};

const phase2: Phase = {
  number: 2,
  name: "Strength and Sustainable Power",
  weeksLabel: "Weeks 5–8",
  objective:
    "Develop the ability to sustain stronger cycling efforts, manage moderate climbing resistance and maintain efficient technique as muscular fatigue increases.",
  focus: [
    "Sustainable tempo at RPE 5–6 and controlled threshold development at RPE 6–7.",
    "Seated muscular endurance and moderate seated climbing.",
    "Maintaining cadence as resistance increases; recovering between efforts.",
    "Extending endurance rides toward two hours with stronger second halves.",
    "Goal-specific pacing and practical hydration/fuelling habits.",
    "A reduced-volume Week 8 and a Phase 3 readiness review.",
  ],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  weeks: [week5, week6, week7, week8],
  complete: {
    heading: "PHASE 2 COMPLETE — STRENGTH AND SUSTAINABLE POWER",
    summary: [
      "Eight total plan weeks completed; twenty-four cycling workouts available.",
      "Sustained tempo developed; controlled threshold-development introduced.",
      "Seated climbing strength and cadence-under-resistance developed.",
      "Rolling terrain management practised.",
      "Longest planned ride: 120 minutes; goal-specific late-ride work introduced.",
      "Reduced-volume recovery week completed and Phase 3 readiness reviewed.",
    ],
    coachMessage:
      "You have completed the second phase of Ride Stronger. You now have a stronger engine and a better understanding of how to use it. Phase 3 will direct that fitness toward the goal that matters most to you. Your strongest ride is your own.",
  },
};

export const RIDE_STRONGER: Program = {
  id: "ride-stronger",
  name: "Ride Stronger",
  level: "Intermediate",
  durationWeeks: 8,
  phaseCount: 2,
  frequency: "3 rides/week",
  outcome:
    "Build a controlled aerobic foundation and sustainable strength — endurance, cadence, tempo, threshold and seated climbing — toward your chosen goal.",
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
  phaseTitles: [
    { number: 1, name: "Foundation and Control", weeks: "Weeks 1–4" },
    { number: 2, name: "Strength and Sustainable Power", weeks: "Weeks 5–8" },
  ],
  phases: [phase1, phase2],
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
