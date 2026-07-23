// "From Couch to Road" — a Beginner, 16-week, 4-phase cycling program.
// Assigned to Green Lantern (kept alongside "Build & Climb"). RPE + cadence based.
// Phases 2–4 are appended as they are provided.

export type SessionType = "strength" | "cycling" | "recovery" | "balance" | "rest";

export type Interval = {
  name: string;
  minutes: number;
  phase?: string;      // Warm-up / Main set / Cool-down
  rpe: string;
  cadence?: string;
  resistance?: string;
  position?: string;
  coach?: string;
  technique?: string;
  breathing?: string;
  prep?: string;
  motivation?: string;
  coaching?: string;   // condensed single-line coaching for later-week rides
};

export type Exercise = { name: string; detail: string; technique?: string; easier?: string };

export type Session = {
  day: string;
  type: SessionType;
  title: string;
  duration?: string;
  optional?: boolean;
  rideLabel?: string;        // e.g. "Ride 1 · 1 of 3"
  category?: string;
  environment?: string;
  goal?: string;
  intervals?: Interval[];
  warmup?: string[];
  exercises?: Exercise[];
  cooldown?: string[];
  easierOption?: string;
  indoor?: string;
  outdoor?: string;
  completionMessage?: string;
  notes?: string;
};

export type Week = {
  number: number;
  title: string;
  objective: string;
  weekType?: string;
  days: Session[];
  reflection?: string[];
};

export type PhaseComplete = { heading: string; summary: string[]; coachMessage: string };

export type Phase = {
  number: number;
  name: string;
  weeksLabel: string;
  objective: string;
  focus?: string[];
  intensity?: string[];
  cadence?: string[];
  milestone?: string[];
  cadenceQuote?: string;
  weeks: Week[];
  complete?: PhaseComplete;
};

export type Program = {
  id: string;
  name: string;
  level: string;
  durationWeeks: number;
  phaseCount: number;
  frequency: string;
  outcome: string;
  assignedTo?: string;
  weeklyRhythm: { day: string; session: string }[];
  phaseTitles: { number: number; name: string; weeks: string }[];
  phases: Phase[];
};

const rest = (): Session => ({ day: "Sunday", type: "rest", title: "Complete Rest", notes: "No scheduled training. Optional gentle walking or stretching only." });

// ---------------------------------------------------------------- WEEK 1
const week1: Week = {
  number: 1,
  title: "Start Where You Are",
  objective: "Begin gently, become familiar with the weekly routine and establish comfort on the bike.",
  days: [
    {
      day: "Monday", type: "strength", title: "Beginner Cycling Strength", duration: "~15 min",
      notes: "Intensity: Easy · Equipment: Stable chair and wall",
      warmup: ["Easy marching — 60s", "Shoulder rolls — 30s", "Ankle circles — 30s each side", "Gentle hip movement — 60s"],
      exercises: [
        { name: "Sit-to-Stand", detail: "1 × 8 · rest 45s", technique: "Feet beneath knees, lean forward slightly and stand tall.", easier: "Use the hands lightly on the chair." },
        { name: "Wall Push-Up", detail: "1 × 8 · rest 45s", technique: "Body in a straight line; lower toward the wall with control.", easier: "Stand closer to the wall." },
        { name: "Supported Calf Raise", detail: "1 × 10 · rest 45s", technique: "Rise slowly onto the toes and lower without dropping.", easier: "Hold the chair with both hands." },
        { name: "Standing Hip Abduction", detail: "1 × 8 per side · rest 45s", technique: "Stay upright; move one leg gently to the side.", easier: "Use a smaller movement." },
        { name: "Seated Knee Extension", detail: "1 × 8 per side", technique: "Straighten one knee without locking it, then lower slowly." },
      ],
      cooldown: ["Gentle calf stretch", "Gentle chest opening", "Relaxed breathing"],
    },
    {
      day: "Tuesday", type: "cycling", title: "Welcome Ride", duration: "20 min",
      rideLabel: "Ride 1 · 1 of 3", category: "Beginner Endurance", environment: "Indoor or outdoor",
      goal: "Become comfortable riding at an easy effort.",
      notes: "This is your introduction to structured cycling — not a fitness test. Before you ride: check the bike is secure, have water, wear a helmet outdoors, choose a safe flat route. Do not begin with chest pain, dizziness, illness, unusual breathlessness or sharp pain.",
      intervals: [
        { name: "Settle In", minutes: 3, phase: "Warm-up", rpe: "2", cadence: "60–70 rpm", resistance: "Very light", position: "Seated", coach: "Begin with very light pressure and allow your body to settle into the movement.", technique: "Relax the shoulders and keep the hands soft.", breathing: "Breathe slowly enough to speak in complete sentences.", prep: "Let cadence rise gently during the final 30 seconds.", motivation: "Starting calmly is part of good training." },
        { name: "Build the Rhythm", minutes: 2, phase: "Warm-up", rpe: "2–3", cadence: "65–75 rpm", resistance: "Light", position: "Seated", coach: "Increase cadence slightly while keeping the effort easy.", technique: "Keep the knees moving naturally forward.", breathing: "Maintain relaxed, even breathing.", prep: "Find a gear you can comfortably hold.", motivation: "Smooth movement is the goal today." },
        { name: "Easy Riding", minutes: 5, phase: "Main set", rpe: "3", cadence: "65–78 rpm", resistance: "Light", position: "Seated", coach: "Hold an easy pace that feels sustainable.", technique: "Keep the upper body quiet while the legs do the work.", breathing: "You should be able to speak comfortably.", prep: "Check your shoulders and hands before the next block.", motivation: "Easy riding builds the foundation for everything ahead." },
        { name: "Posture and Flow", minutes: 5, phase: "Main set", rpe: "3", cadence: "68–80 rpm", resistance: "Light", position: "Seated", coach: "Continue at the same effort while paying attention to posture.", technique: "Chest open, elbows relaxed, hips stable.", breathing: "Use a relaxed exhale to release tension.", prep: "Begin easing the effort during the final 30 seconds.", motivation: "You are learning how comfortable cycling should feel." },
        { name: "Easy Finish", minutes: 5, phase: "Cool-down", rpe: "1–2", cadence: "60–70 rpm", resistance: "Very light", position: "Seated", coach: "Reduce resistance and gradually slow the legs.", technique: "Relax the hands, jaw and shoulders.", breathing: "Allow breathing to return to its natural rhythm.", prep: "Continue gentle movement before stopping.", motivation: "The first ride is complete, and you finished with control." },
      ],
      easierOption: "Complete 15 minutes: Interval 1 (3m), 2 (2m), 3 (5m), 5 (5m). Skip Interval 4. Completing the modified workout counts as completing the workout.",
      indoor: "Use light resistance and a fan. Do not add resistance merely to make the ride feel harder.",
      outdoor: "Choose a flat, familiar route with minimal intersections. Do not chase speed or other riders.",
      completionMessage: "You began exactly where you are. Today was about comfort, awareness and completing the first step. Recover well and carry that calm rhythm into your next ride.",
    },
    {
      day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "10 min", optional: true,
      exercises: [
        { name: "Easy walking", detail: "5 minutes" },
        { name: "Ankle circles", detail: "30s each direction" },
        { name: "Calf stretch", detail: "30s each side" },
        { name: "Seated or standing hip stretch", detail: "30s each side" },
        { name: "Shoulder rolls", detail: "60 seconds" },
        { name: "Relaxed breathing", detail: "2 minutes" },
      ],
      notes: "Replace this session with complete rest when tired or sore.",
    },
    {
      day: "Thursday", type: "cycling", title: "Pedal Smoothly", duration: "25 min",
      rideLabel: "Ride 2 · 2 of 3", category: "Cadence Skills",
      goal: "Introduce smooth changes in leg speed without increasing effort significantly.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2", cadence: "60–70 rpm", resistance: "Very light", coaching: "Settle into the bike, relax the shoulders and breathe naturally." },
        { name: "Warm-Up Rhythm", minutes: 3, rpe: "2–3", cadence: "65–75 rpm", resistance: "Light", coaching: "Let the legs gradually turn faster while the upper body remains still." },
        { name: "Natural Cadence", minutes: 4, rpe: "3", cadence: "65–78 rpm", resistance: "Light", coaching: "Find the cadence that feels most natural and controllable." },
        { name: "First Cadence Lift", minutes: 3, rpe: "3–4", cadence: "75–85 rpm", resistance: "Light", coaching: "Shift into a lighter gear before increasing leg speed. Avoid bouncing in the saddle." },
        { name: "Easy Reset", minutes: 2, rpe: "2", cadence: "60–72 rpm", resistance: "Very light", coaching: "Allow the legs and breathing to settle." },
        { name: "Second Cadence Lift", minutes: 3, rpe: "3–4", cadence: "76–86 rpm", resistance: "Light", coaching: "Use smooth, quick leg movement without pushing harder through the pedals." },
        { name: "Relaxed Recovery", minutes: 2, rpe: "2", cadence: "Natural", resistance: "Very light", coaching: "Relax the hands and shoulders and prepare for the cool-down." },
        { name: "Cool-Down", minutes: 5, rpe: "1–2", cadence: "60–70 rpm", resistance: "Minimal", coaching: "Gradually slow the legs and return breathing to normal." },
      ],
      easierOption: "Keep both cadence lifts between 70–78 rpm and reduce each lift to two minutes. Add the removed time to recovery riding.",
      completionMessage: "You practised moving the legs more smoothly without turning the session into a hard workout. That skill will help you ride more efficiently as your endurance grows.",
    },
    {
      day: "Friday", type: "balance", title: "Balance and Cycling Support", duration: "~15 min",
      notes: "Rest 45–60s as needed. Keep the session controlled so the legs remain fresh for Saturday.",
      exercises: [
        { name: "Supported step-up", detail: "1 × 6 each side" },
        { name: "Standing hip abduction", detail: "1 × 8 each side" },
        { name: "Supported single-leg balance", detail: "2 × 15s each side" },
        { name: "Seated ankle raise", detail: "1 × 10" },
        { name: "Wall plank", detail: "2 × 15s" },
      ],
    },
    {
      day: "Saturday", type: "cycling", title: "First Endurance Ride", duration: "30 min",
      rideLabel: "Ride 3 · 3 of 3", category: "Beginner Endurance",
      goal: "Complete a longer continuous ride at a comfortable pace.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2", cadence: "60–70 rpm" },
        { name: "Build the Warm-Up", minutes: 2, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Endurance Block 1", minutes: 10, rpe: "3", cadence: "65–80 rpm", coaching: "Hold a pace you believe you could continue beyond the end of the block." },
        { name: "Endurance Block 2", minutes: 10, rpe: "3", cadence: "65–80 rpm", coaching: "Maintain the same effort. Do not increase speed simply because the finish is approaching." },
        { name: "Cool-Down", minutes: 5, rpe: "1–2", cadence: "60–70 rpm" },
      ],
      easierOption: "Complete one 10-minute endurance block rather than two, producing a 20-minute ride.",
      completionMessage: "You completed your first longer ride by staying patient. Endurance begins with a pace you can control, not a pace you have to survive.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 2
const week2: Week = {
  number: 2,
  title: "Build the Habit",
  objective: "Repeat the weekly rhythm and begin making cycling a consistent part of your routine.",
  days: [
    {
      day: "Monday", type: "strength", title: "Foundation Strength", duration: "15–18 min",
      exercises: [
        { name: "Sit-to-stand", detail: "1 × 10" },
        { name: "Glute bridge", detail: "1 × 10" },
        { name: "Wall push-up", detail: "1 × 10" },
        { name: "Supported calf raise", detail: "1 × 12" },
        { name: "Bird dog", detail: "1 × 6 each side" },
        { name: "Hip and calf mobility", detail: "3 minutes" },
      ],
    },
    {
      day: "Tuesday", type: "cycling", title: "Easy Foundation Ride", duration: "25 min",
      rideLabel: "Ride 4 · 1 of 3", category: "Beginner Endurance",
      goal: "Relaxed posture, quiet upper body and sustainable effort.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2", cadence: "60–70 rpm" },
        { name: "Warm-Up Rhythm", minutes: 2, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Easy Aerobic Block", minutes: 5, rpe: "3", cadence: "65–78 rpm" },
        { name: "Posture Block", minutes: 5, rpe: "3", cadence: "68–80 rpm" },
        { name: "Smooth Endurance Block", minutes: 5, rpe: "3", cadence: "68–80 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2", cadence: "60–70 rpm" },
      ],
      easierOption: "Remove the third five-minute main block.",
      completionMessage: "You repeated the work and strengthened the habit. Consistency is beginning to turn cycling into something familiar.",
    },
    {
      day: "Wednesday", type: "recovery", title: "Recovery or Rest", duration: "~10 min", optional: true,
      exercises: [
        { name: "Easy walk", detail: "5–10 minutes" },
        { name: "Ankle and hip mobility", detail: "5 minutes" },
      ],
      notes: "Complete rest is equally acceptable.",
    },
    {
      day: "Thursday", type: "cycling", title: "Cadence Introduction", duration: "30 min",
      rideLabel: "Ride 5 · 2 of 3", category: "Cadence Skills",
      goal: "Change leg speed while keeping the effort controlled.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2", cadence: "60–70 rpm" },
        { name: "Warm-Up Build", minutes: 3, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Natural Cadence", minutes: 4, rpe: "3", cadence: "65–78 rpm" },
        { name: "Cadence Lift 1", minutes: 3, rpe: "3–4", cadence: "75–85 rpm" },
        { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Cadence Lift 2", minutes: 4, rpe: "3–4", cadence: "76–86 rpm" },
        { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Controlled Cadence", minutes: 3, rpe: "3–4", cadence: "75–86 rpm" },
        { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      notes: "Technique: use a lighter gear to increase leg speed. Do not increase cadence by pushing heavy resistance.",
      easierOption: "Complete two cadence lifts rather than three.",
      completionMessage: "You changed leg speed while keeping the effort controlled. That is the beginning of cadence awareness, not a test of how fast you can pedal.",
    },
    {
      day: "Friday", type: "balance", title: "Balance and Core Support", duration: "~15 min",
      exercises: [
        { name: "Supported step-up", detail: "1 × 8 each side" },
        { name: "Standing hip abduction", detail: "1 × 8 each side" },
        { name: "Wall plank", detail: "2 × 20s" },
        { name: "Supported balance", detail: "2 × 20s each side" },
        { name: "Seated ankle mobility", detail: "8 circles each direction" },
      ],
    },
    {
      day: "Saturday", type: "cycling", title: "Comfortable Endurance Ride", duration: "35 min",
      rideLabel: "Ride 6 · 3 of 3", category: "Beginner Endurance",
      goal: "Extend riding time without rushing the pace. The final block should feel like the first.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2", cadence: "65–80 rpm" },
        { name: "Warm-Up Build", minutes: 4, rpe: "2–3", cadence: "65–80 rpm" },
        { name: "Endurance Block 1", minutes: 8, rpe: "3", cadence: "65–80 rpm" },
        { name: "Endurance Block 2", minutes: 8, rpe: "3", cadence: "65–80 rpm" },
        { name: "Endurance Block 3", minutes: 7, rpe: "3", cadence: "65–80 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Remove Endurance Block 3 for a 28-minute ride.",
      completionMessage: "You extended your riding time without rushing the pace. Finishing at the same controlled effort you began with is a sign of good endurance training.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 3
const week3: Week = {
  number: 3,
  title: "Find Your Rhythm",
  objective: "Learn the difference between easy and steady effort while continuing to build time on the bike.",
  days: [
    {
      day: "Monday", type: "strength", title: "Cycling Strength", duration: "~18 min",
      notes: "Rest 45–60s between sets.",
      exercises: [
        { name: "Sit-to-stand", detail: "2 × 8" },
        { name: "Glute bridge", detail: "2 × 8" },
        { name: "Wall push-up", detail: "2 × 8" },
        { name: "Supported calf raise", detail: "2 × 10" },
        { name: "Bird dog", detail: "1 × 8 each side" },
      ],
    },
    {
      day: "Tuesday", type: "cycling", title: "Steady Foundation Ride", duration: "30 min",
      rideLabel: "Ride 7 · 1 of 3", category: "Beginner Endurance",
      goal: "Recognise a small, sustainable change in effort. Steady riding should feel purposeful but controlled — you can still speak in short sentences.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2" },
        { name: "Warm-Up Rhythm", minutes: 3, rpe: "2–3" },
        { name: "Easy Foundation", minutes: 6, rpe: "3" },
        { name: "Steady Block 1", minutes: 6, rpe: "4", cadence: "68–82 rpm" },
        { name: "Steady Block 2", minutes: 7, rpe: "4", cadence: "68–82 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Complete both steady blocks at RPE 3.",
      completionMessage: "You introduced a steadier effort without losing control. The goal was not to ride hard—it was to recognise a small, sustainable change in effort.",
    },
    {
      day: "Wednesday", type: "recovery", title: "Recovery Mobility", duration: "~10 min", optional: true,
      exercises: [
        { name: "Easy walk", detail: "5 minutes" },
        { name: "Calf stretch", detail: "30s each side" },
        { name: "Hip-flexor stretch", detail: "30s each side" },
        { name: "Thoracic rotation", detail: "5 each side" },
        { name: "Relaxed breathing", detail: "2 minutes" },
      ],
    },
    {
      day: "Thursday", type: "cycling", title: "Rhythm Changes", duration: "30 min",
      rideLabel: "Ride 8 · 2 of 3", category: "Cadence Skills",
      goal: "Change rhythm several times and return to control after each effort.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2" },
        { name: "Warm-Up Build", minutes: 3, rpe: "2–3" },
        { name: "Cadence Lift 1", minutes: 3, rpe: "4", cadence: "76–86 rpm" },
        { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Cadence Lift 2", minutes: 3, rpe: "4", cadence: "77–87 rpm" },
        { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Cadence Lift 3", minutes: 3, rpe: "4", cadence: "78–88 rpm" },
        { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Smooth Steady Finish", minutes: 3, rpe: "3", cadence: "70–82 rpm" },
        { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Complete two cadence lifts and use the third as easy riding.",
      completionMessage: "You changed rhythm several times and returned to control after each effort. That ability will help you respond to terrain and fatigue later in the plan.",
    },
    {
      day: "Friday", type: "balance", title: "Strength and Balance", duration: "~15 min",
      exercises: [
        { name: "Supported step-up", detail: "2 × 6 each side" },
        { name: "Standing hip abduction", detail: "1 × 10 each side" },
        { name: "Supported split-stance hold", detail: "2 × 20s each side" },
        { name: "Wall plank", detail: "2 × 20s" },
        { name: "Calf raise", detail: "1 × 12" },
      ],
    },
    {
      day: "Saturday", type: "cycling", title: "Endurance Builder", duration: "40 min",
      rideLabel: "Ride 9 · 3 of 3", category: "Beginner Endurance",
      goal: "Reach 40 minutes by keeping the ride patient and controlled — manage your energy.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2", cadence: "65–82 rpm" },
        { name: "Warm-Up Build", minutes: 4, rpe: "2–3", cadence: "65–82 rpm" },
        { name: "Endurance Block 1", minutes: 8, rpe: "3", cadence: "65–82 rpm", coaching: "Do not increase effort during the first block." },
        { name: "Endurance Block 2", minutes: 8, rpe: "3", cadence: "65–82 rpm" },
        { name: "Endurance Block 3", minutes: 9, rpe: "3–4", cadence: "65–82 rpm", coaching: "Save enough energy to finish this block with good posture." },
        { name: "Cool-Down", minutes: 7, rpe: "1–2" },
      ],
      easierOption: "Shorten the third endurance block to four minutes, creating a 35-minute ride.",
      completionMessage: "You reached forty minutes by keeping the ride patient and controlled. Your endurance is growing because you are learning how to manage your energy.",
    },
    rest(),
  ],
};

// ---------------------------------------------------------------- WEEK 4
const week4: Week = {
  number: 4,
  title: "Settle and Strengthen",
  weekType: "Consolidation and recovery",
  objective: "Reduce training load slightly, reinforce technique and allow your body to absorb the first three weeks.",
  days: [
    {
      day: "Monday", type: "strength", title: "Light Strength and Mobility", duration: "12–15 min",
      notes: "Use light, controlled movement. Do not progress sets or resistance.",
      exercises: [
        { name: "Sit-to-stand", detail: "1 × 8" },
        { name: "Wall push-up", detail: "1 × 8" },
        { name: "Supported calf raise", detail: "1 × 10" },
        { name: "Standing hip abduction", detail: "1 × 8 each side" },
        { name: "Gentle hip and ankle mobility", detail: "4 minutes" },
      ],
    },
    {
      day: "Tuesday", type: "cycling", title: "Easy Reset Ride", duration: "25 min",
      rideLabel: "Ride 10 · 1 of 3", category: "Beginner Endurance",
      goal: "Relaxed posture, light resistance and smooth breathing.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "1–2" },
        { name: "Warm-Up Rhythm", minutes: 2, rpe: "2" },
        { name: "Easy Block 1", minutes: 5, rpe: "3" },
        { name: "Easy Block 2", minutes: 5, rpe: "3" },
        { name: "Relaxed Technique Block", minutes: 5, rpe: "2–3" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Complete 20 minutes by removing the Relaxed Technique Block.",
      completionMessage: "Today’s easier ride was purposeful. Recovery weeks give your body the opportunity to turn training into progress.",
    },
    {
      day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "~10 min", optional: true,
      notes: "Choose one: 10 min gentle walking · 10 min mobility · complete rest.",
    },
    {
      day: "Thursday", type: "cycling", title: "Smooth Pedalling Skills", duration: "30 min",
      rideLabel: "Ride 11 · 2 of 3", category: "Cadence Skills",
      goal: "Quiet hips, relaxed ankles, light hands and consistent pressure through the pedals.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2" },
        { name: "Warm-Up Build", minutes: 3, rpe: "2–3" },
        { name: "Smooth Cadence 1", minutes: 4, rpe: "3", cadence: "72–82 rpm" },
        { name: "Easy Reset", minutes: 2, rpe: "2" },
        { name: "Smooth Cadence 2", minutes: 4, rpe: "3", cadence: "74–84 rpm" },
        { name: "Easy Reset", minutes: 2, rpe: "2" },
        { name: "Smooth Cadence 3", minutes: 4, rpe: "3", cadence: "75–85 rpm" },
        { name: "Technique Finish", minutes: 2, rpe: "3" },
        { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Keep all cadence blocks at your natural comfortable cadence.",
      completionMessage: "You reinforced smooth movement without adding fatigue. Good technique should make cycling feel more controlled, not more complicated.",
    },
    {
      day: "Friday", type: "balance", title: "Light Balance and Mobility", duration: "~12 min",
      exercises: [
        { name: "Supported balance", detail: "2 × 15s each side" },
        { name: "Seated knee extension", detail: "1 × 8 each side" },
        { name: "Standing hip abduction", detail: "1 × 8 each side" },
        { name: "Ankle circles", detail: "8 each direction" },
        { name: "Relaxed breathing", detail: "2 minutes" },
      ],
    },
    {
      day: "Saturday", type: "cycling", title: "Comfortable Endurance Ride", duration: "35 min",
      rideLabel: "Ride 12 · 3 of 3", category: "Beginner Endurance",
      goal: "Finish the ride feeling that another five minutes would have been possible.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2", cadence: "65–80 rpm" },
        { name: "Warm-Up Build", minutes: 4, rpe: "2–3", cadence: "65–80 rpm" },
        { name: "Comfortable Block 1", minutes: 8, rpe: "3", cadence: "65–80 rpm" },
        { name: "Comfortable Block 2", minutes: 8, rpe: "3", cadence: "65–80 rpm" },
        { name: "Comfortable Block 3", minutes: 7, rpe: "3", cadence: "65–80 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Remove the final seven-minute block for a 28-minute session.",
      completionMessage: "You completed Phase 1 by riding comfortably and consistently. Four weeks ago, the goal was simply to begin. You now have a routine, a stronger foundation and a better understanding of your own riding rhythm.",
    },
    { ...rest(), title: "Complete Rest and Phase Reflection", notes: "Reflect on Phase 1 before starting Phase 2." },
  ],
  reflection: [
    "Which ride felt most comfortable?",
    "Has cycling begun to feel more familiar?",
    "Were you able to complete three rides in a week?",
    "Which cadence range felt most natural?",
    "Did any pain or unusual discomfort occur?",
    "Do you feel ready to begin Phase 2?",
  ],
};

const phase1: Phase = {
  number: 1,
  name: "Get Moving",
  weeksLabel: "Weeks 1–4",
  objective: "Help you become comfortable on the bike, establish a consistent weekly routine and learn the foundations of safe, controlled endurance cycling.",
  focus: [
    "Comfortable riding posture", "Smooth pedalling", "Easy conversational effort",
    "Basic cadence awareness", "Simple gear and resistance control",
    "Confidence completing three rides each week",
    "Gradual progression from 20-minute rides toward a 35–40-minute endurance ride",
    "Strength and mobility that support cycling", "Recovery habits",
  ],
  intensity: ["RPE 2 — Very easy", "RPE 3 — Easy and conversational", "RPE 4 — Steady and comfortable", "Do not use RPE 5 or above during Phase 1."],
  cadence: ["Warm-up: 60–75 rpm", "Comfortable riding: 65–80 rpm", "Cadence practice: 75–88 rpm", "Recovery: natural relaxed cadence", "Cool-down: 60–70 rpm"],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  milestone: [
    "Complete three rides in one week", "Ride continuously for approximately 35–40 minutes",
    "Recognise easy and steady effort", "Maintain a relaxed riding position",
    "Change cadence without significantly increasing effort", "Finish a ride feeling exercised but not exhausted",
  ],
  weeks: [week1, week2, week3, week4],
  complete: {
    heading: "PHASE 1 COMPLETE — GET MOVING",
    summary: [
      "Four weeks completed", "Twelve cycling workouts available", "Longest planned ride: 40 minutes",
      "Three weekly strength sessions completed or attempted", "Three weekly balance sessions completed or attempted",
      "Consistency and confidence reflection",
    ],
    coachMessage: "You have built the most important part of the plan: the habit of beginning. You are more comfortable on the bike, more aware of your effort and better able to control your rhythm. The next phase will build on this foundation gradually. Your strongest ride is your own.",
  },
};

// ================================================================ PHASE 2
const week5: Week = {
  number: 5, title: "Build the Engine",
  objective: "Increase sustainable riding time and introduce short, controlled steady-effort blocks.",
  days: [
    { day: "Monday", type: "strength", title: "Foundation Strength", duration: "~20 min",
      notes: "Intensity: Easy to moderate. Equipment: chair, wall, optional low step. Rest 45–60s between sets.",
      warmup: ["Easy marching — 60s", "Shoulder rolls — 30s", "Ankle circles — 30s each side", "Hip hinges — 8 reps", "Bodyweight squats to a chair — 6 reps"],
      exercises: [
        { name: "Sit-to-Stand", detail: "2 × 8", technique: "Feet beneath knees; press through the whole foot.", easier: "Hands lightly on the chair." },
        { name: "Glute Bridge", detail: "2 × 8", technique: "Press through the heels; lift hips without arching the lower back.", easier: "Use a smaller range." },
        { name: "Wall Push-Up", detail: "2 × 8", technique: "Keep the body long; lower with control." },
        { name: "Supported Calf Raise", detail: "2 × 10", technique: "Rise slowly and lower under control." },
        { name: "Bird Dog", detail: "1 × 8 each side", technique: "Keep hips level; move slowly.", easier: "Move one limb at a time." },
      ],
      cooldown: ["Calf stretch", "Hip-flexor stretch", "Chest opening", "Relaxed breathing"] },
    { day: "Tuesday", type: "cycling", title: "Aerobic Foundation Ride", duration: "35 min",
      rideLabel: "Ride 13 · 1 of 3", category: "Foundation Endurance", environment: "Indoor or outdoor",
      goal: "Build comfortable aerobic endurance — finish exercised but not drained.",
      intervals: [
        { name: "Settle In", minutes: 3, phase: "Warm-up", rpe: "2", cadence: "60–70 rpm", resistance: "Very light", position: "Seated", coach: "Begin gently and allow the legs to find their natural rhythm.", technique: "Keep the shoulders loose and hands soft.", breathing: "Breathe slowly and comfortably.", prep: "Let cadence increase slightly during the final 30 seconds.", motivation: "A calm beginning gives you more control later." },
        { name: "Warm-Up Build", minutes: 4, phase: "Warm-up", rpe: "2–3", cadence: "65–75 rpm", resistance: "Light", coach: "Increase cadence gradually without forcing the effort.", technique: "Keep hips stable and knees tracking forward.", breathing: "Maintain full-sentence breathing.", prep: "Find a comfortable endurance gear.", motivation: "Smooth movement is doing the work." },
        { name: "Aerobic Block 1", minutes: 8, phase: "Main set", rpe: "3", cadence: "68–80 rpm", resistance: "Light", coach: "Hold a pace that feels easy to continue.", technique: "Keep your chest open and elbows relaxed.", breathing: "Breathing should remain conversational.", prep: "Check posture and hydration in the final minute.", motivation: "This is where your aerobic foundation grows." },
        { name: "Aerobic Block 2", minutes: 8, phase: "Main set", rpe: "3", cadence: "70–82 rpm", resistance: "Light", coach: "Maintain the same effort rather than increasing speed.", technique: "Keep pressure smooth through the full pedal stroke.", breathing: "Let the exhale stay relaxed and even.", prep: "Prepare for one final controlled block.", motivation: "Holding steady is a skill." },
        { name: "Steady Finish", minutes: 7, phase: "Main set", rpe: "3–4", cadence: "70–82 rpm", resistance: "Light to moderate", coach: "Lift the effort slightly while keeping it comfortable.", technique: "Avoid tightening the shoulders as effort rises.", breathing: "You should still speak in short sentences.", prep: "Begin reducing resistance during the final 30 seconds.", motivation: "Finish stronger, not strained." },
        { name: "Cool-Down", minutes: 5, phase: "Cool-down", rpe: "1–2", cadence: "60–70 rpm", resistance: "Minimal", coach: "Gradually reduce resistance and slow the legs.", technique: "Relax the jaw, shoulders and hands.", breathing: "Let breathing return to its natural rhythm.", prep: "Pedal gently before stopping.", motivation: "You completed the ride with control." },
      ],
      easierOption: "Complete 28 minutes: warm-up 7m, Aerobic Block 1 (8m), Aerobic Block 2 (8m), cool-down 5m. Remove the Steady Finish.",
      indoor: "Use small resistance changes only. Keep the fan and water within reach.",
      outdoor: "Choose a flat or gently rolling route. Avoid chasing average speed.",
      completionMessage: "You extended your aerobic riding time without losing control. That steady foundation will support every longer ride ahead." },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "10–15 min", optional: true,
      exercises: [ { name: "Easy walking", detail: "5 minutes" }, { name: "Calf stretch", detail: "30s each side" }, { name: "Hip-flexor stretch", detail: "30s each side" }, { name: "Thoracic rotation", detail: "6 each side" }, { name: "Ankle circles", detail: "8 each direction" }, { name: "Relaxed breathing", detail: "2 minutes" } ],
      notes: "Complete rest is equally acceptable." },
    { day: "Thursday", type: "cycling", title: "Steady Steps", duration: "35 min",
      rideLabel: "Ride 14 · 2 of 3", category: "Controlled Steady Effort",
      goal: "Introduce short moderate blocks while maintaining form and breathing.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2", cadence: "60–70 rpm" },
        { name: "Warm-Up Build", minutes: 4, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Steady Block 1", minutes: 4, rpe: "4", cadence: "72–82 rpm", resistance: "Light to moderate", coaching: "Lift the effort one small step. Keep the upper body relaxed." },
        { name: "Recovery 1", minutes: 3, rpe: "2–3", cadence: "62–75 rpm", coaching: "Reduce resistance and allow breathing to settle." },
        { name: "Steady Block 2", minutes: 4, rpe: "4", cadence: "74–84 rpm", coaching: "Repeat the effort with the same control." },
        { name: "Recovery 2", minutes: 3, rpe: "2–3" },
        { name: "Steady Block 3", minutes: 4, rpe: "4", cadence: "74–84 rpm", coaching: "Hold a steady rhythm without pressing harder than needed." },
        { name: "Easy Aerobic Finish", minutes: 5, rpe: "3", cadence: "68–80 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Complete two steady blocks rather than three. Use the removed four minutes as easy riding.",
      completionMessage: "You introduced controlled steady work and recovered between each block. The goal was repeatable effort, not exhaustion." },
    { day: "Friday", type: "balance", title: "Balance, Core and Cycling Support", duration: "~18 min",
      notes: "Keep the session controlled so the legs remain fresh for Saturday.",
      exercises: [ { name: "Supported step-up", detail: "2 × 6 each side" }, { name: "Standing hip abduction", detail: "2 × 8 each side" }, { name: "Wall plank", detail: "2 × 20s" }, { name: "Supported split-stance hold", detail: "2 × 20s each side" }, { name: "Seated ankle raise", detail: "2 × 10" }, { name: "Gentle hip mobility", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Endurance Ride", duration: "45 min",
      rideLabel: "Ride 15 · 3 of 3", category: "Beginner Endurance",
      goal: "Extend continuous riding time at a controlled pace. The first block should feel easier than the last.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2", cadence: "60–70 rpm" },
        { name: "Warm-Up Build", minutes: 4, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Endurance Block 1", minutes: 9, rpe: "3", cadence: "68–80 rpm" },
        { name: "Endurance Block 2", minutes: 9, rpe: "3", cadence: "68–82 rpm" },
        { name: "Endurance Block 3", minutes: 10, rpe: "3", cadence: "68–82 rpm" },
        { name: "Steady Finish", minutes: 4, rpe: "4", cadence: "72–84 rpm" },
        { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Remove the Steady Finish and shorten Endurance Block 3 to five minutes for a 36-minute ride.",
      completionMessage: "You extended your endurance and still finished with control. The strongest part of this ride was your patience." },
    rest(),
  ],
};

const week6: Week = {
  number: 6, title: "Stronger and Steadier",
  objective: "Hold steady aerobic effort for longer while improving cadence control.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength", duration: "~22 min", notes: "Rest 45–60s between exercises.",
      exercises: [ { name: "Sit-to-stand", detail: "2 × 10" }, { name: "Glute bridge", detail: "2 × 10" }, { name: "Wall push-up", detail: "2 × 10" }, { name: "Supported calf raise", detail: "2 × 12" }, { name: "Bird dog", detail: "2 × 6 each side" }, { name: "Standing hip abduction", detail: "1 × 10 each side" } ] },
    { day: "Tuesday", type: "cycling", title: "Steady Endurance Ride", duration: "40 min",
      rideLabel: "Ride 16 · 1 of 3", category: "Foundation Endurance",
      goal: "Sustain a steady aerobic rhythm for longer. The second steady block should match the first.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" },
        { name: "Easy Aerobic Block", minutes: 7, rpe: "3" }, { name: "Steady Block 1", minutes: 8, rpe: "4" },
        { name: "Easy Reset", minutes: 3, rpe: "2–3" }, { name: "Steady Block 2", minutes: 8, rpe: "4" },
        { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Complete both steady blocks at RPE 3 or shorten each to five minutes.",
      completionMessage: "You held a steady effort more than once and kept the quality consistent. That repeatability is a sign your foundation is becoming stronger." },
    { day: "Wednesday", type: "recovery", title: "Recovery or Rest", duration: "~10 min", optional: true, notes: "Choose one: easy walk 10m · gentle mobility 10m · complete rest." },
    { day: "Thursday", type: "cycling", title: "Cadence and Control", duration: "35 min",
      rideLabel: "Ride 17 · 2 of 3", category: "Cadence Skills",
      goal: "Increase cadence while maintaining posture and controlled breathing.",
      notes: "Technique: shift lighter before raising cadence · keep the hips quiet · avoid bouncing · let the legs move quickly without forcing the pedals.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 4, rpe: "2–3" },
        { name: "Natural Cadence", minutes: 4, rpe: "3", cadence: "68–80 rpm" },
        { name: "Cadence Lift 1", minutes: 4, rpe: "4", cadence: "76–86 rpm" }, { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Cadence Lift 2", minutes: 4, rpe: "4", cadence: "78–88 rpm" }, { name: "Recovery", minutes: 2, rpe: "2" },
        { name: "Cadence Lift 3", minutes: 4, rpe: "4", cadence: "78–88 rpm" },
        { name: "Controlled Endurance", minutes: 3, rpe: "3", cadence: "70–82 rpm" }, { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Complete two cadence lifts and use the third as easy riding.",
      completionMessage: "You increased leg speed while keeping control through the hips and upper body. Smooth cadence will help you manage longer rides more efficiently." },
    { day: "Friday", type: "balance", title: "Lower-Body Support and Balance", duration: "~20 min",
      exercises: [ { name: "Supported step-up", detail: "2 × 8 each side" }, { name: "Standing hip abduction", detail: "2 × 10 each side" }, { name: "Supported single-leg balance", detail: "2 × 20s each side" }, { name: "Wall plank", detail: "2 × 25s" }, { name: "Calf raise", detail: "2 × 12" }, { name: "Ankle mobility", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Longer Endurance Ride", duration: "50 min",
      rideLabel: "Ride 18 · 3 of 3", category: "Endurance",
      goal: "Ride for 50 minutes with comfortable pacing — feel capable of another five minutes at the end.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2", cadence: "65–82 rpm" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3", cadence: "65–82 rpm" },
        { name: "Endurance Block 1", minutes: 10, rpe: "3", cadence: "65–82 rpm" }, { name: "Endurance Block 2", minutes: 10, rpe: "3", cadence: "65–82 rpm" },
        { name: "Endurance Block 3", minutes: 10, rpe: "3", cadence: "65–82 rpm" }, { name: "Controlled Finish", minutes: 5, rpe: "3–4", cadence: "65–82 rpm" },
        { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Complete two 10-minute endurance blocks rather than three, producing a 40-minute session.",
      completionMessage: "You reached fifty minutes by managing the ride rather than chasing it. Finishing with energy still available is exactly the result we wanted." },
    rest(),
  ],
};

const week7: Week = {
  number: 7, title: "Control Your Pace",
  objective: "Learn to begin conservatively, conserve energy and finish with a controlled increase in effort.",
  days: [
    { day: "Monday", type: "strength", title: "Strength for Riding Stability", duration: "~22 min",
      exercises: [ { name: "Sit-to-stand", detail: "2 × 10" }, { name: "Glute bridge", detail: "2 × 12" }, { name: "Wall push-up", detail: "2 × 10" }, { name: "Supported step-up", detail: "2 × 8 each side" }, { name: "Bird dog", detail: "2 × 8 each side" }, { name: "Supported calf raise", detail: "2 × 12" } ] },
    { day: "Tuesday", type: "cycling", title: "Easy Start, Strong Finish", duration: "40 min",
      rideLabel: "Ride 19 · 1 of 3", category: "Progressive Endurance",
      goal: "Practise pacing — begin easily and finish at a controlled steady effort. Do not jump from easy to moderate.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" },
        { name: "Easy Start", minutes: 9, rpe: "3", cadence: "68–80 rpm" }, { name: "Steady Middle", minutes: 9, rpe: "4", cadence: "70–84 rpm" },
        { name: "Controlled Finish", minutes: 8, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Keep the Controlled Finish at RPE 4 or shorten it to five minutes.",
      completionMessage: "You began patiently and finished with controlled strength. Good pacing is not holding back—it is using your energy wisely." },
    { day: "Wednesday", type: "recovery", title: "Recovery Mobility", duration: "10–15 min", optional: true,
      exercises: [ { name: "Easy walking", detail: "" }, { name: "Calf mobility", detail: "" }, { name: "Hip-flexor stretch", detail: "" }, { name: "Thoracic rotation", detail: "" }, { name: "Relaxed breathing", detail: "" } ] },
    { day: "Thursday", type: "cycling", title: "Controlled Effort Blocks", duration: "40 min",
      rideLabel: "Ride 20 · 2 of 3", category: "Controlled Endurance Intervals",
      goal: "Repeat moderate efforts without losing technique. Steady blocks 72–85 rpm, recovery 60–75 rpm.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" },
        { name: "Steady Block 1", minutes: 5, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Recovery 1", minutes: 3, rpe: "2", cadence: "60–75 rpm" },
        { name: "Steady Block 2", minutes: 5, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Recovery 2", minutes: 3, rpe: "2", cadence: "60–75 rpm" },
        { name: "Steady Block 3", minutes: 5, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Easy Aerobic Finish", minutes: 5, rpe: "3" }, { name: "Cool-Down", minutes: 6, rpe: "1–2" },
      ],
      easierOption: "Complete two steady blocks rather than three.",
      completionMessage: "You repeated controlled efforts and gave each recovery a purpose. The quality came from staying composed, not from pushing harder." },
    { day: "Friday", type: "balance", title: "Balance, Core and Posture", duration: "~20 min",
      exercises: [ { name: "Supported split squat (shallow)", detail: "2 × 6 each side" }, { name: "Standing hip abduction", detail: "2 × 10 each side" }, { name: "Wall plank", detail: "2 × 30s" }, { name: "Supported balance", detail: "2 × 25s each side" }, { name: "Seated knee extension", detail: "2 × 10 each side" }, { name: "Shoulder and chest mobility", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Paced Endurance Ride", duration: "55 min",
      rideLabel: "Ride 21 · 3 of 3", category: "Endurance and Pacing",
      goal: "Longest ride of Phase 2. Do not exceed RPE 3 during the first 20 minutes of endurance work.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 6, rpe: "2–3" },
        { name: "Endurance Block 1", minutes: 10, rpe: "3" }, { name: "Endurance Block 2", minutes: 10, rpe: "3" },
        { name: "Endurance Block 3", minutes: 10, rpe: "3–4" }, { name: "Steady Finish", minutes: 8, rpe: "4" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" },
      ],
      easierOption: "Remove the eight-minute Steady Finish and complete a 47-minute ride.",
      completionMessage: "You completed your longest ride so far by saving energy early and using it wisely later. That is endurance with purpose." },
    rest(),
  ],
};

const week8: Week = {
  number: 8, title: "Foundation Recovery", weekType: "Consolidation and recovery",
  objective: "Reduce training load, reinforce good movement and absorb the work completed during Weeks 5–7.",
  days: [
    { day: "Monday", type: "strength", title: "Light Strength and Mobility", duration: "15 min", notes: "Do not add resistance or additional sets.",
      exercises: [ { name: "Sit-to-stand", detail: "1 × 10" }, { name: "Glute bridge", detail: "1 × 10" }, { name: "Wall push-up", detail: "1 × 10" }, { name: "Supported calf raise", detail: "1 × 12" }, { name: "Standing hip abduction", detail: "1 × 8 each side" }, { name: "Hip and ankle mobility", detail: "4 minutes" } ] },
    { day: "Tuesday", type: "cycling", title: "Recovery Spin", duration: "30 min",
      rideLabel: "Ride 22 · 1 of 3", category: "Recovery",
      goal: "Promote circulation and reinforce relaxed technique. Use the lightest resistance that still allows smooth pedalling.",
      intervals: [
        { name: "Easy Start", minutes: 4, rpe: "1–2" }, { name: "Warm-Up Rhythm", minutes: 4, rpe: "2" },
        { name: "Easy Aerobic Block 1", minutes: 6, rpe: "2–3" }, { name: "Easy Aerobic Block 2", minutes: 6, rpe: "2–3" },
        { name: "Relaxed Technique Block", minutes: 5, rpe: "2" }, { name: "Cool-Down", minutes: 5, rpe: "1–2" },
      ],
      easierOption: "Complete 20–25 minutes entirely at RPE 2.",
      completionMessage: "You gave your body movement without adding unnecessary fatigue. Recovery riding is part of progression, not time away from it." },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "~10 min", optional: true, notes: "Choose one: gentle mobility 10m · easy walking 10m · complete rest." },
    { day: "Thursday", type: "cycling", title: "Smooth and Efficient", duration: "35 min",
      rideLabel: "Ride 23 · 2 of 3", category: "Technique and Cadence",
      goal: "Reinforce smooth cadence and relaxed posture. Keep hips quiet, ankles relaxed, hands light; avoid a heavy gear.",
      intervals: [
        { name: "Settle In", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 4, rpe: "2–3" },
        { name: "Smooth Cadence 1", minutes: 5, rpe: "3", cadence: "72–82 rpm" }, { name: "Easy Reset", minutes: 3, rpe: "2" },
        { name: "Smooth Cadence 2", minutes: 5, rpe: "3", cadence: "74–84 rpm" }, { name: "Easy Reset", minutes: 3, rpe: "2" },
        { name: "Smooth Cadence 3", minutes: 5, rpe: "3", cadence: "75–85 rpm" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" },
      ],
      easierOption: "Use your natural cadence for all three blocks.",
      completionMessage: "You reinforced efficient movement without turning technique work into a hard session. Smooth riding will make longer rides feel more manageable." },
    { day: "Friday", type: "balance", title: "Light Balance and Mobility", duration: "12–15 min",
      exercises: [ { name: "Supported balance", detail: "2 × 15s each side" }, { name: "Standing hip abduction", detail: "1 × 8 each side" }, { name: "Seated knee extension", detail: "1 × 8 each side" }, { name: "Calf raise", detail: "1 × 10" }, { name: "Ankle and hip mobility", detail: "4 minutes" }, { name: "Relaxed breathing", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Comfortable Endurance Ride", duration: "45 min",
      rideLabel: "Ride 24 · 3 of 3", category: "Recovery Endurance",
      goal: "Finish feeling that another five to ten minutes would have been possible.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" },
        { name: "Comfortable Block 1", minutes: 9, rpe: "3" }, { name: "Comfortable Block 2", minutes: 9, rpe: "3" },
        { name: "Comfortable Block 3", minutes: 9, rpe: "3" }, { name: "Cool-Down", minutes: 9, rpe: "1–2" },
      ],
      easierOption: "Complete two nine-minute endurance blocks rather than three for a 36-minute ride.",
      completionMessage: "You completed Phase 2 with calm, sustainable endurance. You are riding longer, controlling your pace and recovering more effectively between sessions." },
    { ...rest(), title: "Complete Rest and Phase Reflection", notes: "Reflect on Phase 2 before starting Phase 3." },
  ],
  reflection: [
    "Can you recognise the difference between easy and steady effort?",
    "Did you begin the longer rides conservatively?",
    "Which cadence range felt most natural?",
    "Were you able to finish rides with energy in reserve?",
    "Did strength sessions support your riding?",
    "Did any pain or unusual discomfort occur?",
    "Do you feel ready to begin longer rides and gentle hill work?",
  ],
};

const phase2: Phase = {
  number: 2, name: "Build the Foundation", weeksLabel: "Weeks 5–8",
  objective: "Develop a stronger aerobic base while improving pacing, cadence control, pedalling efficiency and recovery between sessions.",
  focus: [
    "Increasing sustainable riding time", "Holding a steady effort for longer",
    "Learning the difference between easy, steady and moderate effort",
    "Improving cadence without unnecessary tension", "Beginning rides conservatively",
    "Finishing rides with energy in reserve", "Extending the weekly endurance ride from ~45 to 55 minutes",
    "Strengthening the glutes, hips, calves, core and postural muscles", "Reinforcing recovery habits",
  ],
  intensity: ["RPE 2 — Very easy", "RPE 3 — Easy and conversational", "RPE 4 — Steady and comfortable", "RPE 5 — Moderate and controlled (short blocks only)", "Do not use RPE 6 or above during Phase 2."],
  cadence: ["Warm-up: 60–75 rpm", "Comfortable endurance: 65–82 rpm", "Steady riding: 70–85 rpm", "Cadence practice: 76–88 rpm", "Recovery: 60–75 rpm or natural", "Cool-down: 60–70 rpm"],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  milestone: [
    "Complete three cycling sessions in one week", "Ride continuously for approximately 50–55 minutes",
    "Maintain a controlled pace without beginning too quickly", "Recognise easy, steady and moderate effort",
    "Change cadence while keeping the upper body relaxed", "Finish longer rides without excessive fatigue",
    "Recover more effectively between workouts",
  ],
  weeks: [week5, week6, week7, week8],
  complete: {
    heading: "PHASE 2 COMPLETE — BUILD THE FOUNDATION",
    summary: [
      "Eight total weeks completed", "Twenty-four cycling workouts available", "Longest planned ride: 55 minutes",
      "Steady and moderate effort introduced", "Cadence control improved", "Pacing skills reinforced",
      "Strength, balance and mobility sessions completed or attempted", "Recovery-week completion recognised",
    ],
    coachMessage: "Your foundation is becoming stronger. You are riding for longer, controlling your pace and learning how to finish with enough energy to recover well. The next phase will extend your endurance and introduce gentle changes in terrain and resistance.",
  },
};

// ================================================================ PHASE 3
const week9: Week = {
  number: 9, title: "Rolling Confidence",
  objective: "Introduce gentle changes in terrain and resistance while maintaining controlled breathing and seated riding form.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength and Stability", duration: "~24 min",
      notes: "Intensity: Easy to moderate. Equipment: chair, wall, low step. Rest 45–60s between sets.",
      warmup: ["Easy marching — 60s", "Shoulder rolls — 30s", "Ankle circles — 30s each side", "Hip hinges — 8 reps", "Supported shallow squats — 8 reps"],
      exercises: [ { name: "Sit-to-Stand", detail: "2 × 10", technique: "Press through the whole foot; stand tall without locking the knees.", easier: "Hands lightly on the chair." }, { name: "Supported Step-Up", detail: "2 × 8 each side", technique: "Use a low step; drive through the whole foot.", easier: "March in place holding the chair." }, { name: "Glute Bridge", detail: "2 × 10", technique: "Lift through the hips without arching the lower back." }, { name: "Supported Calf Raise", detail: "2 × 12" }, { name: "Bird Dog", detail: "2 × 8 each side", easier: "Move one limb at a time." }, { name: "Wall Push-Up", detail: "2 × 10" } ],
      cooldown: ["Calf stretch", "Hip-flexor stretch", "Chest opening", "Relaxed breathing"] },
    { day: "Tuesday", type: "cycling", title: "Aerobic Foundation Ride", duration: "40 min",
      rideLabel: "Ride 25 · 1 of 3", category: "Foundation Endurance", environment: "Indoor or outdoor",
      goal: "Reinforce aerobic endurance before introducing hill work — a calm rhythm that prepares you for Thursday.",
      intervals: [
        { name: "Settle In", minutes: 3, phase: "Warm-up", rpe: "2", cadence: "60–70 rpm", resistance: "Very light", position: "Seated", coach: "Begin gently and let your legs settle into the movement.", technique: "Keep the shoulders loose and the hands soft.", breathing: "Breathe slowly enough to speak in full sentences.", prep: "Let cadence increase gradually near the end.", motivation: "A calm start gives you more control later." },
        { name: "Warm-Up Build", minutes: 5, phase: "Warm-up", rpe: "2–3", cadence: "65–75 rpm", resistance: "Light", coaching: "Increase cadence one small step while keeping the effort easy." },
        { name: "Aerobic Block 1", minutes: 8, phase: "Main set", rpe: "3", cadence: "68–80 rpm", resistance: "Light", coaching: "Hold a pace you could comfortably continue beyond this block." },
        { name: "Aerobic Block 2", minutes: 8, phase: "Main set", rpe: "3", cadence: "70–82 rpm", resistance: "Light", coaching: "Maintain the same calm effort; smooth pressure through the stroke." },
        { name: "Steady Aerobic Block", minutes: 9, phase: "Main set", rpe: "4", cadence: "70–84 rpm", resistance: "Light to moderate", coaching: "Lift the effort slightly while staying controlled; avoid tightening the upper body." },
        { name: "Cool-Down", minutes: 7, phase: "Cool-down", rpe: "1–2", cadence: "60–70 rpm", resistance: "Minimal", coaching: "Reduce resistance and gradually slow the legs." },
      ],
      easierOption: "Complete 32 minutes: warm-up 8m, Aerobic Block 1 (8m), Aerobic Block 2 (8m), cool-down 8m. Remove the Steady Aerobic Block.",
      completionMessage: "You reinforced the aerobic foundation you will use during the hill work ahead. Calm pacing remains one of your strongest skills." },
    { day: "Wednesday", type: "recovery", title: "Recovery and Mobility", duration: "10–15 min", optional: true,
      exercises: [ { name: "Easy walking", detail: "5 minutes" }, { name: "Calf stretch", detail: "30s each side" }, { name: "Hip-flexor stretch", detail: "30s each side" }, { name: "Thoracic rotation", detail: "6 each side" }, { name: "Ankle circles", detail: "8 each direction" }, { name: "Relaxed breathing", detail: "2 minutes" } ],
      notes: "Complete rest is equally acceptable." },
    { day: "Thursday", type: "cycling", title: "Gentle Rolling Hills", duration: "40 min",
      rideLabel: "Ride 26 · 2 of 3", category: "Seated Climbing",
      goal: "Respond to gentle terrain by shifting early, adding manageable resistance and keeping a smooth seated cadence.",
      intervals: [
        { name: "Easy Start", minutes: 3, rpe: "2", cadence: "60–70 rpm" },
        { name: "Warm-Up Build", minutes: 5, rpe: "2–3", cadence: "65–75 rpm" },
        { name: "Flat Preparation", minutes: 4, rpe: "3", cadence: "70–82 rpm", coaching: "Find a smooth rhythm and prepare to shift before the first hill." },
        { name: "Gentle Hill 1", minutes: 3, rpe: "4", cadence: "60–72 rpm", resistance: "Moderate", position: "Seated", coach: "Add enough resistance to feel the rise without grinding.", technique: "Stay seated and keep the hips stable.", breathing: "Let breathing deepen while remaining controlled.", prep: "Prepare to reduce resistance before recovery.", motivation: "The goal is control over the hill, not speed over it." },
        { name: "Recovery 1", minutes: 3, rpe: "2–3", cadence: "62–75 rpm" },
        { name: "Gentle Hill 2", minutes: 3, rpe: "4", cadence: "60–72 rpm", resistance: "Moderate" },
        { name: "Recovery 2", minutes: 3, rpe: "2–3" },
        { name: "Gentle Hill 3", minutes: 3, rpe: "4–5", cadence: "58–70 rpm", coaching: "Shift before cadence becomes heavy. Keep the effort controlled." },
        { name: "Recovery 3", minutes: 3, rpe: "2–3" },
        { name: "Gentle Hill 4", minutes: 3, rpe: "4", cadence: "60–72 rpm" },
        { name: "Easy Aerobic Finish", minutes: 3, rpe: "3", cadence: "68–80 rpm" },
        { name: "Cool-Down", minutes: 7, rpe: "1–2" },
      ],
      easierOption: "Complete three hills rather than four. Replace Gentle Hill 4 with three minutes of easy flat riding.",
      indoor: "Simulate each hill with a small resistance increase. Remain seated; don't slow cadence below a controllable range.",
      outdoor: "Choose a route with short, gentle rises. Shift into an easier gear before the slope steepens.",
      completionMessage: "You practised meeting gentle hills with preparation rather than force. Shifting early and staying composed will make rolling terrain far more manageable." },
    { day: "Friday", type: "balance", title: "Balance, Core and Hill Support", duration: "~20 min",
      notes: "Keep the effort controlled so the legs remain fresh for Saturday.",
      exercises: [ { name: "Supported step-up", detail: "2 × 8 each side" }, { name: "Standing hip abduction", detail: "2 × 10 each side" }, { name: "Supported split-stance hold", detail: "2 × 25s each side" }, { name: "Wall plank", detail: "2 × 30s" }, { name: "Calf raise", detail: "2 × 12" }, { name: "Seated ankle mobility", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Endurance Builder", duration: "55 min",
      rideLabel: "Ride 27 · 3 of 3", category: "Endurance",
      goal: "Extend continuous riding with good posture and pacing. First 20 minutes easy enough to speak comfortably.",
      intervals: [
        { name: "Settle In", minutes: 4, rpe: "2", cadence: "65–82 rpm" }, { name: "Warm-Up Build", minutes: 6, rpe: "2–3", cadence: "65–82 rpm" },
        { name: "Endurance Block 1", minutes: 10, rpe: "3", cadence: "65–82 rpm" }, { name: "Endurance Block 2", minutes: 10, rpe: "3", cadence: "65–82 rpm" },
        { name: "Endurance Block 3", minutes: 10, rpe: "3", cadence: "65–82 rpm" }, { name: "Steady Finish", minutes: 8, rpe: "4", cadence: "70–84 rpm" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" },
      ],
      easierOption: "Remove the eight-minute Steady Finish for a 47-minute ride.",
      completionMessage: "You extended your endurance after introducing hill work earlier in the week. That balance between challenge and control is exactly what this phase requires." },
    rest(),
  ],
};

const week10: Week = {
  number: 10, title: "Extend the Ride",
  objective: "Become comfortable riding for one hour while continuing to improve cadence and aerobic control.",
  days: [
    { day: "Monday", type: "strength", title: "Cycling Strength", duration: "~24 min", notes: "Rest 45–60s between sets.",
      exercises: [ { name: "Sit-to-stand", detail: "2 × 12" }, { name: "Glute bridge", detail: "2 × 12" }, { name: "Wall push-up", detail: "2 × 10" }, { name: "Supported step-up", detail: "2 × 8 each side" }, { name: "Bird dog", detail: "2 × 8 each side" }, { name: "Supported calf raise", detail: "2 × 15" } ] },
    { day: "Tuesday", type: "cycling", title: "Steady Foundation Ride", duration: "45 min",
      rideLabel: "Ride 28 · 1 of 3", category: "Foundation Endurance",
      goal: "Hold steady aerobic riding for longer without drifting into excessive effort. Second steady block matches the first.",
      intervals: [ { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" }, { name: "Easy Aerobic Block", minutes: 8, rpe: "3" }, { name: "Steady Block 1", minutes: 8, rpe: "4" }, { name: "Easy Reset", minutes: 4, rpe: "2–3" }, { name: "Steady Block 2", minutes: 8, rpe: "4" }, { name: "Cool-Down", minutes: 8, rpe: "1–2" } ],
      easierOption: "Shorten both steady blocks to five minutes and extend the Easy Reset by two minutes.",
      completionMessage: "You held steady work twice without letting the second block become ragged. Repeatable effort is a sign of growing endurance." },
    { day: "Wednesday", type: "recovery", title: "Recovery or Rest", duration: "~10 min", optional: true, notes: "Choose one: easy walk 10m · gentle mobility 10m · complete rest." },
    { day: "Thursday", type: "cycling", title: "Cadence and Endurance", duration: "40 min",
      rideLabel: "Ride 29 · 2 of 3", category: "Cadence Skills",
      goal: "Combine cadence changes with comfortable endurance. Shift lighter before increasing cadence; keep hips quiet; avoid bouncing.",
      intervals: [ { name: "Easy Start", minutes: 3, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" }, { name: "Endurance Block 1", minutes: 5, rpe: "3", cadence: "68–80 rpm" }, { name: "Cadence Lift 1", minutes: 4, rpe: "4", cadence: "78–88 rpm" }, { name: "Recovery", minutes: 2, rpe: "2" }, { name: "Endurance Block 2", minutes: 5, rpe: "3", cadence: "68–82 rpm" }, { name: "Cadence Lift 2", minutes: 4, rpe: "4", cadence: "80–90 rpm" }, { name: "Recovery", minutes: 2, rpe: "2" }, { name: "Controlled Endurance Finish", minutes: 4, rpe: "3–4" }, { name: "Cool-Down", minutes: 6, rpe: "1–2" } ],
      easierOption: "Complete one cadence lift and convert the second into easy endurance riding.",
      completionMessage: "You combined smoother leg speed with endurance riding and returned to control after each change. That skill will help you respond to real-world terrain." },
    { day: "Friday", type: "balance", title: "Lower-Body Support and Balance", duration: "~22 min",
      exercises: [ { name: "Supported step-up", detail: "2 × 10 each side" }, { name: "Standing hip abduction", detail: "2 × 10 each side" }, { name: "Supported single-leg balance", detail: "2 × 25s each side" }, { name: "Wall plank", detail: "2 × 30s" }, { name: "Calf raise", detail: "2 × 15" }, { name: "Hip mobility", detail: "3 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Long Endurance Ride", duration: "60 min",
      rideLabel: "Ride 30 · 3 of 3", category: "Endurance",
      goal: "Complete the first controlled 60-minute ride. Keep the first 30 minutes easier than the final 20. Take small drinks regularly.",
      intervals: [ { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 6, rpe: "2–3" }, { name: "Endurance Block 1", minutes: 10, rpe: "3" }, { name: "Endurance Block 2", minutes: 10, rpe: "3" }, { name: "Endurance Block 3", minutes: 10, rpe: "3" }, { name: "Endurance Block 4", minutes: 10, rpe: "3–4" }, { name: "Cool-Down", minutes: 10, rpe: "1–2" } ],
      easierOption: "Complete three 10-minute endurance blocks rather than four for a 50-minute ride.",
      completionMessage: "You completed one hour by riding patiently and protecting your energy. Sixty minutes is now part of what you can do." },
    rest(),
  ],
};

const week11: Week = {
  number: 11, title: "Ride with Purpose",
  objective: "Improve pacing and fatigue management while building toward the longest ride of Phase 3.",
  days: [
    { day: "Monday", type: "strength", title: "Strength for Endurance", duration: "~25 min",
      exercises: [ { name: "Sit-to-stand", detail: "2 × 12" }, { name: "Glute bridge", detail: "2 × 12" }, { name: "Supported split squat (shallow)", detail: "2 × 8 each side" }, { name: "Wall push-up", detail: "2 × 12" }, { name: "Bird dog", detail: "2 × 8 each side" }, { name: "Calf raise", detail: "2 × 15" } ] },
    { day: "Tuesday", type: "cycling", title: "Aerobic Endurance Ride", duration: "45 min",
      rideLabel: "Ride 31 · 1 of 3", category: "Aerobic Endurance",
      goal: "Maintain a continuous aerobic rhythm with a controlled finish — reach it with energy for good posture and cadence.",
      intervals: [ { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" }, { name: "Aerobic Block 1", minutes: 9, rpe: "3" }, { name: "Aerobic Block 2", minutes: 9, rpe: "3" }, { name: "Steady Aerobic Block", minutes: 9, rpe: "4" }, { name: "Controlled Finish", minutes: 3, rpe: "4" }, { name: "Cool-Down", minutes: 6, rpe: "1–2" } ],
      easierOption: "Complete the Controlled Finish at RPE 3 or remove it and begin the cool-down early.",
      completionMessage: "You built the ride gradually and finished with control. That is purposeful endurance rather than simply spending time on the bike." },
    { day: "Wednesday", type: "recovery", title: "Recovery Mobility", duration: "10–15 min", optional: true,
      exercises: [ { name: "Easy walking", detail: "" }, { name: "Calf stretch", detail: "" }, { name: "Hip-flexor stretch", detail: "" }, { name: "Thoracic rotation", detail: "" }, { name: "Ankle mobility", detail: "" }, { name: "Relaxed breathing", detail: "" } ] },
    { day: "Thursday", type: "cycling", title: "Controlled Steady Blocks", duration: "45 min",
      rideLabel: "Ride 32 · 2 of 3", category: "Controlled Endurance Intervals",
      goal: "Repeat longer steady efforts while maintaining technique. Steady blocks 72–85 rpm, recovery 60–75 rpm.",
      intervals: [ { name: "Easy Start", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" }, { name: "Steady Block 1", minutes: 6, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Recovery 1", minutes: 3, rpe: "2", cadence: "60–75 rpm" }, { name: "Steady Block 2", minutes: 6, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Recovery 2", minutes: 3, rpe: "2", cadence: "60–75 rpm" }, { name: "Steady Block 3", minutes: 6, rpe: "4–5", cadence: "72–85 rpm" }, { name: "Easy Aerobic Finish", minutes: 5, rpe: "3" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" } ],
      easierOption: "Complete two steady blocks rather than three. Use the removed six minutes as easy aerobic riding.",
      completionMessage: "You repeated longer steady efforts and kept each one controlled. Your ability to recover and return to good form is improving." },
    { day: "Friday", type: "balance", title: "Balance, Core and Posture", duration: "~20 min",
      exercises: [ { name: "Supported step-up", detail: "2 × 8 each side" }, { name: "Standing hip abduction", detail: "2 × 12 each side" }, { name: "Supported split-stance hold", detail: "2 × 30s each side" }, { name: "Wall plank", detail: "2 × 35s" }, { name: "Seated knee extension", detail: "2 × 10 each side" }, { name: "Gentle mobility", detail: "3 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Long Endurance Ride", duration: "70 min",
      rideLabel: "Ride 33 · 3 of 3", category: "Endurance and Pacing",
      goal: "Longest ride of Phase 3. Do not exceed RPE 3 during the first 32 minutes. Take a small familiar carb snack if needed — nothing new.",
      intervals: [ { name: "Settle In", minutes: 5, rpe: "2" }, { name: "Warm-Up Build", minutes: 7, rpe: "2–3" }, { name: "Endurance Block 1", minutes: 10, rpe: "3" }, { name: "Endurance Block 2", minutes: 10, rpe: "3" }, { name: "Endurance Block 3", minutes: 10, rpe: "3" }, { name: "Endurance Block 4", minutes: 10, rpe: "3–4" }, { name: "Steady Finish", minutes: 8, rpe: "4" }, { name: "Cool-Down", minutes: 10, rpe: "1–2" } ],
      easierOption: "Remove the Steady Finish and shorten Endurance Block 4 to five minutes for a 57-minute ride.",
      completionMessage: "You completed seventy minutes by protecting your effort early and using your energy wisely later. That is a major endurance milestone." },
    rest(),
  ],
};

const week12: Week = {
  number: 12, title: "Endurance Reset", weekType: "Consolidation and recovery",
  objective: "Reduce training load, reinforce technique and absorb the endurance gains made during Weeks 9–11.",
  days: [
    { day: "Monday", type: "strength", title: "Light Strength and Mobility", duration: "~15 min", notes: "Do not add resistance or additional sets.",
      exercises: [ { name: "Sit-to-stand", detail: "1 × 10" }, { name: "Glute bridge", detail: "1 × 10" }, { name: "Wall push-up", detail: "1 × 10" }, { name: "Supported calf raise", detail: "1 × 12" }, { name: "Standing hip abduction", detail: "1 × 8 each side" }, { name: "Hip and ankle mobility", detail: "4 minutes" } ] },
    { day: "Tuesday", type: "cycling", title: "Easy Reset Ride", duration: "35 min",
      rideLabel: "Ride 34 · 1 of 3", category: "Recovery Endurance",
      goal: "Promote recovery while maintaining comfortable movement. Light resistance; finish feeling more mobile than at the start.",
      intervals: [ { name: "Easy Start", minutes: 4, rpe: "1–2" }, { name: "Warm-Up Rhythm", minutes: 4, rpe: "2" }, { name: "Easy Aerobic Block 1", minutes: 7, rpe: "2–3" }, { name: "Easy Aerobic Block 2", minutes: 7, rpe: "2–3" }, { name: "Relaxed Technique Block", minutes: 6, rpe: "2–3" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" } ],
      easierOption: "Complete 25 minutes entirely at RPE 2.",
      completionMessage: "You gave your body useful movement without adding unnecessary fatigue. This lighter week helps your endurance settle and strengthen." },
    { day: "Wednesday", type: "recovery", title: "Recovery or Complete Rest", duration: "~10 min", optional: true, notes: "Choose one: gentle walking 10m · mobility 10m · complete rest." },
    { day: "Thursday", type: "cycling", title: "Technique and Control", duration: "40 min",
      rideLabel: "Ride 35 · 2 of 3", category: "Technique, Cadence and Resistance Control",
      goal: "Reinforce smooth cadence, early shifting and relaxed posture. Shift before cadence becomes heavy; stay seated; hips quiet.",
      intervals: [ { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 5, rpe: "2–3" }, { name: "Smooth Cadence 1", minutes: 5, rpe: "3", cadence: "74–84 rpm" }, { name: "Easy Reset", minutes: 3, rpe: "2" }, { name: "Gentle Resistance Block", minutes: 4, rpe: "4", cadence: "62–74 rpm", resistance: "Moderate" }, { name: "Recovery", minutes: 3, rpe: "2" }, { name: "Smooth Cadence 2", minutes: 5, rpe: "3", cadence: "76–86 rpm" }, { name: "Technique Finish", minutes: 4, rpe: "3" }, { name: "Cool-Down", minutes: 7, rpe: "1–2" } ],
      easierOption: "Complete the Gentle Resistance Block at RPE 3 using lighter resistance.",
      completionMessage: "You reinforced the skills that make longer riding more manageable: smooth cadence, early shifting and relaxed posture." },
    { day: "Friday", type: "balance", title: "Light Balance and Mobility", duration: "12–15 min",
      exercises: [ { name: "Supported balance", detail: "2 × 20s each side" }, { name: "Standing hip abduction", detail: "1 × 10 each side" }, { name: "Seated knee extension", detail: "1 × 10 each side" }, { name: "Calf raise", detail: "1 × 12" }, { name: "Ankle and hip mobility", detail: "4 minutes" }, { name: "Relaxed breathing", detail: "2 minutes" } ] },
    { day: "Saturday", type: "cycling", title: "Comfortable Endurance Ride", duration: "55 min",
      rideLabel: "Ride 36 · 3 of 3", category: "Recovery Endurance",
      goal: "Finish with energy in reserve. The final block should feel as controlled as the first.",
      intervals: [ { name: "Settle In", minutes: 4, rpe: "2" }, { name: "Warm-Up Build", minutes: 6, rpe: "2–3" }, { name: "Comfortable Block 1", minutes: 10, rpe: "3" }, { name: "Comfortable Block 2", minutes: 10, rpe: "3" }, { name: "Comfortable Block 3", minutes: 10, rpe: "3" }, { name: "Comfortable Finish", minutes: 7, rpe: "3" }, { name: "Cool-Down", minutes: 8, rpe: "1–2" } ],
      easierOption: "Complete two 10-minute endurance blocks rather than three for a 45-minute ride.",
      completionMessage: "You completed Phase 3 with calm, sustainable endurance. You can now manage longer rides, gentle hills and changes in cadence with greater confidence." },
    { ...rest(), title: "Complete Rest and Phase Reflection", notes: "Reflect on Phase 3 before starting Phase 4." },
  ],
  reflection: [
    "Can you complete approximately 60–70 minutes at a controlled effort?",
    "Did you shift before cadence became too slow on hills?",
    "Were you able to remain seated during gentle climbs?",
    "Could you recover after resistance or terrain changes?",
    "Did posture remain comfortable during longer rides?",
    "Which pacing strategy worked best?",
    "Did any pain or unusual discomfort occur?",
    "Do you feel ready to begin the Road Ready phase?",
  ],
};

const phase3: Phase = {
  number: 3, name: "Extend Your Endurance", weeksLabel: "Weeks 9–12",
  objective: "Extend continuous riding time while introducing gentle seated hills, resistance changes, improved gear selection and better fatigue management.",
  focus: [
    "Extending aerobic endurance beyond 55 minutes", "Introducing gentle seated climbing",
    "Managing gears and resistance before cadence falls", "Maintaining posture as fatigue increases",
    "Completing longer steady blocks", "Improving confidence on gently rolling terrain",
    "Learning how to recover after short hill efforts", "Building toward a controlled 70-minute endurance ride",
    "Continuing cycling-specific strength, balance and mobility", "Consolidating progress during Week 12",
  ],
  intensity: ["RPE 2 — Very easy", "RPE 3 — Easy and conversational", "RPE 4 — Steady and comfortable", "RPE 5 — Moderate and controlled (short steady/hill efforts)", "Do not use RPE 6 or above during Phase 3."],
  cadence: ["Warm-up: 60–75 rpm", "Comfortable endurance: 65–84 rpm", "Steady riding: 70–85 rpm", "Cadence practice: 76–90 rpm", "Gentle seated hills: 58–72 rpm", "Recovery: 60–75 rpm or natural", "Cool-down: 60–70 rpm"],
  cadenceQuote: "Your smoothest controllable cadence is more important than matching an exact number.",
  milestone: [
    "Complete three cycling workouts in one week", "Ride continuously for approximately 60–70 minutes",
    "Complete short seated hill efforts with control", "Shift gears before cadence becomes too slow",
    "Recover after changes in resistance or terrain", "Maintain posture and smooth pedalling as fatigue develops",
    "Pace a longer ride without starting too quickly", "Finish longer rides without excessive fatigue",
  ],
  weeks: [week9, week10, week11, week12],
  complete: {
    heading: "PHASE 3 COMPLETE — EXTEND YOUR ENDURANCE",
    summary: [
      "Twelve total weeks completed", "Thirty-six cycling workouts available", "Longest planned ride: 70 minutes",
      "First 60-minute ride completed or attempted", "Gentle seated hill work introduced",
      "Gear and resistance management practised", "Longer steady blocks completed",
      "Pacing and fatigue management improved", "Recovery-week completion recognised",
      "Strength, balance and mobility sessions completed or attempted",
    ],
    coachMessage: "You have extended your endurance and learned how to stay composed as rides become longer. You can manage gentle hills, cadence changes and steady effort with more confidence. The final phase will prepare you to ride beyond an hour consistently and complete your From Couch to Road Achievement Ride.",
  },
};

export const COUCH_TO_ROAD: Program = {
  id: "couch-to-road",
  name: "From Couch to Road",
  level: "Beginner",
  durationWeeks: 16,
  phaseCount: 4,
  frequency: "3 rides per week",
  outcome: "Build a beginner rider’s endurance, confidence, cycling skills and consistency to an intermediate endurance foundation.",
  assignedTo: "Green Lantern",
  weeklyRhythm: [
    { day: "Monday", session: "Strength and mobility" },
    { day: "Tuesday", session: "Cycling Workout 1" },
    { day: "Wednesday", session: "Recovery, mobility or rest" },
    { day: "Thursday", session: "Cycling Workout 2" },
    { day: "Friday", session: "Strength, balance and cycling support" },
    { day: "Saturday", session: "Cycling Workout 3 — weekly endurance ride" },
    { day: "Sunday", session: "Complete rest" },
  ],
  phaseTitles: [
    { number: 1, name: "Get Moving", weeks: "Weeks 1–4" },
    { number: 2, name: "Build the Foundation", weeks: "Weeks 5–8" },
    { number: 3, name: "Extend Your Endurance", weeks: "Weeks 9–12" },
    { number: 4, name: "Road Ready", weeks: "Weeks 13–16" },
  ],
  phases: [phase1],
};

export const SESSION_META: Record<SessionType, { icon: string; color: string; label: string }> = {
  strength: { icon: "barbell-outline", color: "#F0A500", label: "Strength" },
  cycling: { icon: "bicycle", color: "#55C850", label: "Cycling" },
  recovery: { icon: "leaf-outline", color: "#40A9C6", label: "Recovery" },
  balance: { icon: "body-outline", color: "#A65AE2", label: "Balance" },
  rest: { icon: "moon-outline", color: "#8A8F8A", label: "Rest" },
};
