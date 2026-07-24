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

// ---------------------------------------------------------------- WEEK 9
const week9: Week = {
  number: 9,
  title: "Train for Your Goal",
  objective:
    "Introduce structured goal-specific work while preserving the aerobic foundation and sustainable pacing from Phases 1 & 2.",
  days: [
    { day: "Monday", type: "strength", title: "Goal-Specific Cycling Strength", duration: "~28–32 min" },
    {
      day: "Tuesday", type: "cycling", title: "Goal-Specific Intervals", rideLabel: "Ride 25",
      duration: "70 min", category: "Goal-Specific Development", environment: "Indoor or outdoor",
      goal: "Complete controlled intervals that directly support your selected current goal.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm", { resistance: "Very light" }),
        iv("Warm-Up Build", 9, "RPE 2–3", "70–84 rpm", { resistance: "Light" }),
        iv("Aerobic Preparation", 8, "RPE 3–4", "74–90 rpm"),
        iv("Goal Interval 1", 8, "RPE 5–7", "goal-dependent"),
        iv("Recovery 1", 4, "RPE 2–3", "68–82 rpm"),
        iv("Goal Interval 2", 8, "RPE 5–7", "goal-dependent"),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Goal Interval 3", 8, "RPE 5–7", "goal-dependent"),
        iv("Controlled Aerobic Finish", 8, "RPE 3–4", "74–90 rpm"),
        iv("Cool-Down", 8, "RPE 1–2", "60–75 rpm"),
      ],
      easierOption: "Complete two goal intervals (or reduce each by one RPE); replace the third with 5 min endurance + 3 min cool-down.",
      completionMessage:
        "You completed work that directly supported your goal without letting the session become uncontrolled. Goal-specific training is purposeful, not reckless.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Aerobic Endurance and Leg Speed", rideLabel: "Ride 26",
      duration: "65 min", category: "Aerobic Endurance and Cadence", environment: "Indoor or outdoor",
      goal: "Maintain aerobic fitness while keeping cadence responsive after Tuesday's goal-specific work.",
      intervals: [
        iv("Easy Start", 6, "RPE 2", "65–76 rpm"),
        iv("Warm-Up Build", 8, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Block 1", 10, "RPE 3", "74–88 rpm"),
        iv("Cadence Lift 1", 3, "RPE 4", "90–102 rpm", { resistance: "Light" }),
        iv("Recovery 1", 3, "RPE 2–3"),
        iv("Aerobic Block 2", 10, "RPE 3–4", "76–90 rpm"),
        iv("Cadence Lift 2", 3, "RPE 4–5", "92–104 rpm"),
        iv("Recovery 2", 3, "RPE 2–3"),
        iv("Aerobic Block 3", 10, "RPE 3–4", "76–92 rpm"),
        iv("Comfortable Finish", 3, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete one cadence lift; keep cadence below 96 rpm where needed.",
      completionMessage:
        "You maintained your aerobic base and kept the legs responsive without adding fatigue — that balance supports stronger goal-specific work.",
    },
    { day: "Friday", type: "strength", title: "Core, Balance and Posture", duration: "~22–25 min" },
    {
      day: "Saturday", type: "cycling", title: "Goal Simulation Ride", rideLabel: "Ride 27",
      duration: "125 min", category: "Long Endurance and Goal Simulation", environment: "Indoor or outdoor",
      goal: "Practise the pacing, terrain, hydration and fuelling requirements of your goal.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Goal Simulation Block 1", 15, "RPE 4–6", "goal-dependent"),
        iv("Recovery Endurance", 5, "RPE 3"),
        iv("Goal Simulation Block 2", 15, "RPE 4–6", "goal-dependent"),
        iv("Controlled Endurance Finish", 15, "RPE 4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 105 minutes using three endurance blocks and one 15-minute goal simulation block.",
      completionMessage:
        "You rehearsed the demands of your goal while protecting your energy early. Preparation and pacing make stronger riding possible.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 10
const week10: Week = {
  number: 10,
  title: "Peak Goal Development",
  objective:
    "Complete the highest goal-specific training load of the plan while maintaining controlled intensity and reliable recovery. Not a maximal week.",
  days: [
    { day: "Monday", type: "strength", title: "Controlled Cycling Strength", duration: "~28–30 min" },
    {
      day: "Tuesday", type: "cycling", title: "Sustained Goal Effort", rideLabel: "Ride 28",
      duration: "75 min", category: "Goal-Specific Sustained Effort", environment: "Indoor or outdoor",
      goal: "Complete two longer goal-specific intervals with stable pacing and technique.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3", "70–84 rpm"),
        iv("Aerobic Preparation", 8, "RPE 3–4", "74–90 rpm"),
        iv("Preparation Lift", 4, "RPE 5", "78–94 rpm"),
        iv("Easy Reset", 3, "RPE 2–3"),
        iv("Sustained Goal Effort 1", 15, "RPE 5–7", "goal-dependent"),
        iv("Recovery", 6, "RPE 2–3", "68–82 rpm"),
        iv("Sustained Goal Effort 2", 15, "RPE 5–7", "goal-dependent"),
        iv("Easy Aerobic Finish", 4, "RPE 3"),
        iv("Cool-Down", 6, "RPE 1–2"),
      ],
      easierOption: "Complete two 10-minute goal efforts (or reduce each by one RPE); use the removed time as endurance.",
      completionMessage:
        "You sustained longer work reflecting your goal without losing control. This is where earlier fitness becomes practical performance.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "12–18 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Endurance with Leg Openers", rideLabel: "Ride 29",
      duration: "65 min", category: "Aerobic Endurance and Preparation", environment: "Indoor or outdoor",
      goal: "Maintain endurance while completing brief controlled efforts that keep the legs responsive.",
      intervals: [
        iv("Easy Start", 6, "RPE 2"),
        iv("Warm-Up Build", 8, "RPE 2–3"),
        iv("Aerobic Block 1", 10, "RPE 3", "74–88 rpm"),
        iv("Leg Opener 1", 2, "RPE 6", "88–102 rpm", { resistance: "Light to moderate" }),
        iv("Recovery 1", 4, "RPE 2"),
        iv("Aerobic Block 2", 10, "RPE 3–4"),
        iv("Leg Opener 2", 2, "RPE 6–7", "88–102 rpm"),
        iv("Recovery 2", 4, "RPE 2"),
        iv("Aerobic Block 3", 10, "RPE 3–4"),
        iv("Leg Opener 3", 2, "RPE 6–7", "88–102 rpm"),
        iv("Comfortable Finish", 6, "RPE 3"),
        iv("Cool-Down", 4, "RPE 1–2"),
      ],
      easierOption: "Complete two leg openers; replace the third with 90 seconds of comfortable endurance.",
      completionMessage:
        "You kept the legs responsive without another demanding interval session. The strongest preparation is often brief and controlled.",
    },
    { day: "Friday", type: "strength", title: "Light Activation and Mobility", duration: "~15–18 min" },
    {
      day: "Saturday", type: "cycling", title: "Peak Goal-Specific Training Ride", rideLabel: "Ride 30",
      duration: "140 min", category: "Peak Endurance and Goal Simulation", environment: "Indoor or outdoor",
      goal: "Complete the most demanding goal-specific training ride before achievement preparation begins.",
      intervals: [
        iv("Settle In", 7, "RPE 2"),
        iv("Warm-Up Build", 10, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Goal Block 1", 15, "RPE 4–6", "goal-dependent"),
        iv("Recovery Endurance", 5, "RPE 3"),
        iv("Goal Block 2", 15, "RPE 4–7", "goal-dependent"),
        iv("Recovery Endurance", 5, "RPE 3"),
        iv("Goal Block 3", 15, "RPE 4–7", "goal-dependent"),
        iv("Controlled Endurance Finish", 8, "RPE 4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 120 minutes using three endurance blocks and two 15-minute goal blocks.",
      completionMessage:
        "You completed the peak training ride by managing the whole session. Your pacing, fuelling and goal-specific control are ready to be refined for achievement week.",
    },
    rest(),
  ],
  reflection: [
    "What worked well and what needs adjustment?",
    "Was the opening pace conservative enough?",
    "Was the fuelling strategy practical?",
    "Is the achievement goal still realistic and appropriate?",
  ],
};

// ---------------------------------------------------------------- WEEK 11
const week11: Week = {
  number: 11,
  title: "Sharpen and Build Confidence",
  objective:
    "Maintain goal-specific fitness while reducing overall workload and rehearsing your achievement strategy. Finish confident, not exhausted.",
  days: [
    { day: "Monday", type: "strength", title: "Controlled Strength Maintenance", duration: "~22–25 min" },
    {
      day: "Tuesday", type: "cycling", title: "Controlled Sharpening", rideLabel: "Ride 31",
      duration: "65 min", category: "Goal-Specific Sharpening", environment: "Indoor or outdoor",
      goal: "Maintain high-quality goal-specific effort with reduced interval duration.",
      intervals: [
        iv("Settle In", 5, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Aerobic Preparation", 8, "RPE 3–4"),
        iv("Sharpening Interval 1", 6, "RPE 6–7", "goal-dependent"),
        iv("Recovery 1", 4, "RPE 2–3"),
        iv("Sharpening Interval 2", 6, "RPE 6–7", "goal-dependent"),
        iv("Recovery 2", 4, "RPE 2–3"),
        iv("Sharpening Interval 3", 6, "RPE 6–7", "goal-dependent"),
        iv("Easy Aerobic Finish", 10, "RPE 3"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete two sharpening intervals; replace the third with 6 min comfortable endurance riding.",
      completionMessage:
        "You maintained the quality of your goal-specific work while reducing total load. The purpose now is confidence and readiness, not fatigue.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "10–15 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Steady Endurance and Technique", rideLabel: "Ride 32",
      duration: "60 min", category: "Aerobic Endurance", environment: "Indoor or outdoor",
      goal: "Maintain endurance while reinforcing relaxed technique and efficient pacing.",
      intervals: [
        iv("Easy Start", 6, "RPE 2"),
        iv("Warm-Up Build", 8, "RPE 2–3"),
        iv("Endurance Block 1", 12, "RPE 3", "74–88 rpm"),
        iv("Endurance Block 2", 12, "RPE 3–4", "76–90 rpm"),
        iv("Easy Reset", 5, "RPE 2"),
        iv("Steady Technique Block", 10, "RPE 4", "76–92 rpm"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete the Steady Technique Block at RPE 3.",
      completionMessage:
        "You maintained endurance while reinforcing the technique that supports your achievement ride. Efficient riding is one of your strongest tools.",
    },
    { day: "Friday", type: "strength", title: "Light Activation and Mobility", duration: "~15 min" },
    {
      day: "Saturday", type: "cycling", title: "Achievement Confidence Simulation", rideLabel: "Ride 33",
      duration: "110 min", category: "Goal Simulation and Confidence", environment: "Indoor or outdoor",
      goal: "Rehearse the achievement ride strategy at a reduced duration and controlled intensity.",
      intervals: [
        iv("Settle In", 6, "RPE 2"),
        iv("Warm-Up Build", 9, "RPE 2–3"),
        iv("Endurance Block 1", 15, "RPE 3"),
        iv("Endurance Block 2", 15, "RPE 3"),
        iv("Endurance Block 3", 15, "RPE 3–4"),
        iv("Easy Reset", 5, "RPE 2–3"),
        iv("Achievement Practice Block", 20, "RPE 4–6", "goal-dependent"),
        iv("Controlled Endurance Finish", 15, "RPE 4"),
        iv("Cool-Down", 10, "RPE 1–2"),
      ],
      easierOption: "Complete 90 minutes using three endurance blocks and a 10-minute achievement practice block.",
      completionMessage:
        "You rehearsed your achievement strategy without trying to prove your fitness. The goal was to confirm what works and arrive at Week 12 with confidence.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 12
const week12: Week = {
  number: 12,
  title: "Ride Stronger Achievement Week",
  weekType: "Achievement and reduced-volume preparation",
  objective:
    "Reduce fatigue, reinforce confidence and complete your personalised Ride Stronger Achievement Ride. You may choose a shorter or supported option at any time — that is never failure.",
  days: [
    { day: "Monday", type: "strength", title: "Light Mobility and Activation", duration: "12–15 min" },
    {
      day: "Tuesday", type: "cycling", title: "Achievement Confidence Ride", rideLabel: "Ride 34",
      duration: "45 min", category: "Easy Endurance", environment: "Indoor or outdoor",
      goal: "Reinforce comfortable movement and confidence without creating fatigue.",
      intervals: [
        iv("Settle In", 5, "RPE 2", "65–75 rpm"),
        iv("Warm-Up Build", 7, "RPE 2–3", "70–84 rpm"),
        iv("Comfortable Endurance 1", 10, "RPE 3", "74–88 rpm"),
        iv("Comfortable Endurance 2", 10, "RPE 3", "76–90 rpm"),
        iv("Confidence Block", 6, "RPE 3–4", "76–92 rpm"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete 35 minutes by removing the Confidence Block and shortening Comfortable Endurance 2 to 6 min.",
      completionMessage:
        "You did not need to prove anything today. You reinforced the control, rhythm and confidence you have built over twelve weeks.",
    },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "10 min", optional: true },
    {
      day: "Thursday", type: "cycling", title: "Leg Opener and Goal Skills Ride", rideLabel: "Ride 35",
      duration: "40 min", category: "Preparation and Skills", environment: "Indoor or outdoor",
      goal: "Keep the legs responsive and rehearse one final goal-specific skill without creating fatigue.",
      intervals: [
        iv("Easy Start", 5, "RPE 2"),
        iv("Warm-Up Build", 7, "RPE 2–3"),
        iv("Smooth Cadence 1", 3, "RPE 4", "88–100 rpm", { resistance: "Light" }),
        iv("Easy Recovery", 3, "RPE 2"),
        iv("Goal Skill Block", 5, "RPE 4–5", "goal-dependent"),
        iv("Easy Recovery", 3, "RPE 2"),
        iv("Smooth Cadence 2", 3, "RPE 4", "90–102 rpm"),
        iv("Comfortable Aerobic Riding", 4, "RPE 3"),
        iv("Cool-Down", 7, "RPE 1–2"),
      ],
      easierOption: "Complete one Smooth Cadence interval; replace the second with easy riding.",
      completionMessage:
        "You opened the legs, rehearsed your goal skill and finished without fatigue. The training is complete — the next ride is about using what you have built.",
    },
    { day: "Friday", type: "recovery", title: "Rest or Gentle Mobility", duration: "5–10 min", optional: true },
    {
      day: "Saturday", type: "cycling", title: "Ride Stronger Achievement Ride", rideLabel: "Ride 36",
      duration: "150 min", category: "Personalised Intermediate Achievement Ride", environment: "Indoor or outdoor",
      goal: "Demonstrate the endurance, strength, pacing and confidence built across twelve weeks. Choose Full (150 min), Supported (120 min) or Foundation (90 min) — any approved option completes Ride Stronger. Not a pass/fail test.",
      intervals: [
        iv("Begin Your Strongest Ride", 7, "RPE 2", "65–75 rpm", { resistance: "Very light", position: "Seated" }),
        iv("Warm-Up Build", 10, "RPE 2–3", "70–84 rpm", { resistance: "Light" }),
        iv("Endurance Block 1 · Settle", 15, "RPE 3", "74–88 rpm"),
        iv("Endurance Block 2 · Find Your Rhythm", 15, "RPE 3", "74–90 rpm"),
        iv("Endurance Block 3 · Stay Composed", 15, "RPE 3–4", "76–90 rpm"),
        iv("Endurance Block 4 · Ride with Purpose", 15, "RPE 3–4", "76–92 rpm"),
        iv("Easy Reset", 5, "RPE 2–3", "68–82 rpm"),
        iv("Goal Block 1", 15, "RPE 4–6", "goal-dependent"),
        iv("Recovery Endurance", 5, "RPE 3", "72–86 rpm"),
        iv("Goal Block 2", 15, "RPE 4–7", "goal-dependent"),
        iv("Confidence Endurance", 13, "RPE 4", "76–92 rpm"),
        iv("Controlled Achievement Finish", 10, "RPE 4–5", "78–94 rpm"),
        iv("Achievement Cool-Down", 10, "RPE 1–2", "60–75 rpm", { resistance: "Minimal" }),
      ],
      easierOption: "Supported (120 min) or Foundation (90 min) achievement options are full completions. Ride Faster riders may use the Speed Achievement format (Full 105 / Supported 85 / Foundation 65 min).",
      completionMessage:
        "You began Ride Stronger with a goal that mattered to you. Today's achievement was about using what you built — your goal, your circumstances, your strongest sustainable effort. Your strongest ride is your own, and this one belongs to you.",
    },
    rest(),
  ],
  reflection: [
    "Which achievement path and option did you complete?",
    "How did the first and second halves feel?",
    "Did you achieve your original goal, and has it changed?",
    "What are you most proud of from the twelve weeks?",
    "Do you want to maintain, repeat or progress?",
  ],
};

const phase3: Phase = {
  number: 3,
  name: "Goal Ready",
  weeksLabel: "Weeks 9–12",
  objective:
    "Convert improved endurance, strength and sustainable power into practical performance for your selected goal, and complete a personalised Ride Stronger Achievement Ride.",
  focus: [
    "Goal-specific tempo, climbing or endurance work adapted to your goal.",
    "Maintaining quality effort later in longer rides; pacing for a target distance, climb or event.",
    "Rehearsing hydration, fuelling, equipment and route preparation.",
    "Peak goal-specific load in Week 10, sharpening in Week 11, taper in Week 12.",
    "A personalised achievement ride (Full / Supported / Foundation options) across five goal paths.",
  ],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  weeks: [week9, week10, week11, week12],
  complete: {
    heading: "PHASE 3 COMPLETE — GOAL READY",
    summary: [
      "Twelve total plan weeks completed; thirty-six cycling workouts available; three phases.",
      "Goal-specific intervals, simulations and a peak goal-specific ride completed or modified.",
      "Achievement strategy rehearsed; longest planned ride 140 min; longest achievement option 150 min.",
      "Hydration, fuelling, equipment and route preparation practised.",
      "Ride Stronger Achievement Ride completed using an approved option.",
    ],
    coachMessage:
      "You completed Ride Stronger by building from the rider you were at the beginning. You can now ride with greater endurance, stronger pacing, improved cadence and more confidence. This is not the end of your development — it is the beginning of your next strongest ride. Your strongest ride is your own.",
  },
};

export const RIDE_STRONGER: Program = {
  id: "ride-stronger",
  name: "Ride Stronger",
  level: "Intermediate",
  durationWeeks: 12,
  phaseCount: 3,
  frequency: "3 rides/week",
  outcome:
    "A 12-week intermediate plan: build a controlled aerobic foundation, develop sustainable strength, then convert it into goal-ready performance and a personalised achievement ride.",
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
    { number: 3, name: "Goal Ready", weeks: "Weeks 9–12" },
  ],
  phases: [phase1, phase2, phase3],
  endMessage:
    "RIDE STRONGER — COMPLETE. You began this plan with a goal that mattered to you. Over twelve weeks you built a stronger aerobic foundation, developed sustainable cycling power and learned to use your fitness with greater control. You practised pacing, cadence, climbing, endurance, hydration, fuelling and recovery — learning when to push, when to hold steady and when to protect your energy. You did not need to ride like anyone else; you trained around your own ability, circumstances and goal. Your progress may show as greater distance, stronger climbing, improved speed, better endurance, more confidence, or simply feeling more capable on the bike. Every completed ride, every modified workout and every moment you chose control over exhaustion contributed to this achievement. Ride Stronger was never about proving you are the strongest rider — it was about becoming a stronger version of the rider you already were. Take time to recognise what you have achieved and decide what your next strongest ride will be. You built strength with purpose. You rode toward a goal that belonged to you. Your strongest ride is your own.",
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
