import { Ionicons } from "@expo/vector-icons";

type Ion = keyof typeof Ionicons.glyphMap;

export type WorkoutType = {
  id: string;
  name: string;
  icon: Ion;
  color: string;      // accent colour (icon, border tint, profile)
  purpose: string;
  bestFor: string;
  profile: number[];  // 0..1 bar heights for the mini power-profile graphic
  goal: "Power & Intensity" | "Aerobic & Recovery";
  duration: number;   // typical minutes (for By Duration sort)
  intensity: number;  // 1 (easy) – 5 (max) for By Intensity sort
};

export const WORKOUT_TYPES: WorkoutType[] = [
  {
    id: "endurance", name: "Endurance", icon: "bicycle", color: "#55C850",
    purpose: "Build aerobic base and improve stamina for long rides.",
    bestFor: "Base building, endurance events, general fitness",
    profile: [0.35, 0.4, 0.45, 0.42, 0.48, 0.5, 0.47, 0.52, 0.5, 0.55, 0.5, 0.48, 0.52, 0.5],
    goal: "Aerobic & Recovery", duration: 105, intensity: 2,
  },
  {
    id: "climbing", name: "Climbing", icon: "trending-up", color: "#C91727",
    purpose: "Build climbing strength, power and sustained effort.",
    bestFor: "Hill training, mountain events, elevation gain",
    profile: [0.3, 0.35, 0.45, 0.5, 0.58, 0.62, 0.68, 0.72, 0.78, 0.82, 0.88, 0.92, 0.95, 0.9],
    goal: "Power & Intensity", duration: 90, intensity: 4,
  },
  {
    id: "threshold", name: "Threshold", icon: "flash", color: "#FFC20A",
    purpose: "Improve lactate threshold and sustainable power output.",
    bestFor: "FTP improvement, race preparation, hard efforts",
    profile: [0.4, 0.75, 0.78, 0.76, 0.4, 0.78, 0.8, 0.78, 0.4, 0.8, 0.82, 0.8, 0.42, 0.5],
    goal: "Power & Intensity", duration: 75, intensity: 4,
  },
  {
    id: "vo2max", name: "VO2 Max", icon: "speedometer-outline", color: "#40A9C6",
    purpose: "Increase maximal aerobic power and raise your ceiling.",
    bestFor: "High intensity performance, racing",
    profile: [0.3, 0.95, 0.35, 0.92, 0.32, 0.96, 0.34, 0.9, 0.33, 0.94, 0.35, 0.3, 0.32, 0.3],
    goal: "Power & Intensity", duration: 70, intensity: 5,
  },
  {
    id: "sprints", name: "Sprints", icon: "flash-outline", color: "#A65AE2",
    purpose: "Develop explosive power and short burst capability.",
    bestFor: "Sprint races, criteriums, power development",
    profile: [0.25, 1.0, 0.2, 0.22, 1.0, 0.2, 0.24, 0.98, 0.2, 0.22, 1.0, 0.2, 0.24, 0.22],
    goal: "Power & Intensity", duration: 60, intensity: 5,
  },
  {
    id: "tempo", name: "Tempo", icon: "pulse", color: "#E8631C",
    purpose: "Improve muscular endurance and steady effort.",
    bestFor: "Time trials, steady improvements, endurance",
    profile: [0.45, 0.55, 0.6, 0.62, 0.6, 0.63, 0.65, 0.62, 0.64, 0.66, 0.63, 0.62, 0.6, 0.58],
    goal: "Aerobic & Recovery", duration: 80, intensity: 3,
  },
  {
    id: "recovery", name: "Recovery", icon: "heart-outline", color: "#3FBFAE",
    purpose: "Promote recovery, improve circulation and reduce fatigue.",
    bestFor: "Recovery days, stress relief, active recovery",
    profile: [0.22, 0.25, 0.24, 0.26, 0.25, 0.27, 0.26, 0.28, 0.26, 0.27, 0.25, 0.26, 0.24, 0.25],
    goal: "Aerobic & Recovery", duration: 45, intensity: 1,
  },
  {
    id: "restday", name: "Rest Day", icon: "bed-outline", color: "#A7A8A5",
    purpose: "Planned rest to allow adaptation and full recovery.",
    bestFor: "Rest days, adaptation, long-term progress",
    profile: [0.08, 0.09, 0.08, 0.1, 0.08, 0.09, 0.08, 0.1, 0.08, 0.09, 0.08, 0.09, 0.08, 0.09],
    goal: "Aerobic & Recovery", duration: 0, intensity: 0,
  },
];

export const WORKOUT_TABS = [
  "All Workouts", "By Goal", "By Duration", "By Intensity", "FB50 Sessions", "My Workouts", "Favorites",
] as const;
export type WorkoutTab = (typeof WORKOUT_TABS)[number];

export type Category = { id: string; label: string; icon: Ion; color: string; count: number };
export const WORKOUT_CATEGORIES: Category[] = [
  { id: "all", label: "All Workouts", icon: "albums-outline", color: "#FFC20A", count: 128 },
  { id: "endurance", label: "Endurance", icon: "bicycle", color: "#55C850", count: 22 },
  { id: "climbing", label: "Climbing", icon: "trending-up", color: "#C91727", count: 18 },
  { id: "threshold", label: "Threshold", icon: "flash", color: "#FFC20A", count: 24 },
  { id: "vo2max", label: "VO2 Max", icon: "speedometer-outline", color: "#40A9C6", count: 16 },
  { id: "sprints", label: "Sprints", icon: "flash-outline", color: "#A65AE2", count: 12 },
  { id: "tempo", label: "Tempo", icon: "pulse", color: "#E8631C", count: 14 },
  { id: "recovery", label: "Recovery", icon: "heart-outline", color: "#3FBFAE", count: 12 },
  { id: "restday", label: "Rest Day", icon: "bed-outline", color: "#A7A8A5", count: 10 },
  { id: "fb50", label: "FB50 Sessions", icon: "barbell-outline", color: "#9BD84B", count: 34 },
];

export type Popular = { id: string; name: string; icon: Ion; color: string; duration: string; tss: number };
export const POPULAR_THIS_WEEK: Popular[] = [
  { id: "p1", name: "Threshold Climb", icon: "trending-up", color: "#C91727", duration: "1h 00m", tss: 92 },
  { id: "p2", name: "Sweet Spot 2x20", icon: "flash", color: "#FFC20A", duration: "1h 20m", tss: 75 },
  { id: "p3", name: "Endurance Ride", icon: "bicycle", color: "#55C850", duration: "1h 45m", tss: 70 },
  { id: "p4", name: "VO2 Max Intervals", icon: "speedometer-outline", color: "#40A9C6", duration: "1h 10m", tss: 85 },
];

export type QuickAction = { id: string; label: string; icon: Ion };
export const QUICK_ACTIONS: QuickAction[] = [
  { id: "create", label: "Create Custom Workout", icon: "add" },
  { id: "builder", label: "Use Workout Builder", icon: "construct-outline" },
  { id: "import", label: "Import Workout (ZWO/TCX)", icon: "cloud-upload-outline" },
];

/** Order the workout types for a given tab (used by By Goal / Duration / Intensity). */
export function typesForTab(tab: WorkoutTab): WorkoutType[] {
  const all = WORKOUT_TYPES;
  switch (tab) {
    case "By Duration": return [...all].sort((a, b) => b.duration - a.duration);
    case "By Intensity": return [...all].sort((a, b) => b.intensity - a.intensity);
    case "By Goal": return [...all].sort((a, b) => a.goal.localeCompare(b.goal));
    default: return all;
  }
}
