// Central mock data for the ROUJAUNE dashboard — data-driven, matches the reference.
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./theme";

type Ion = ComponentProps<typeof Ionicons>["name"];

export type NavItem = { key: string; label: string; icon: Ion };

export const navItems: NavItem[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "training", label: "Training Plan", icon: "clipboard-outline" },
  { key: "routes", label: "Virtual Routes", icon: "git-network-outline" },
  { key: "workouts", label: "Workouts", icon: "fitness-outline" },
  { key: "calendar", label: "Calendar", icon: "calendar-outline" },
  { key: "progress", label: "Progress", icon: "stats-chart-outline" },
  { key: "community", label: "Community", icon: "people-outline" },
  { key: "wellness", label: "Wellness", icon: "heart-outline" },
];

export const navFooter: NavItem[] = [
  { key: "settings", label: "Settings", icon: "settings-outline" },
  { key: "help", label: "Help", icon: "help-circle-outline" },
];

export const brand = {
  tagline: "Your strongest ride is your own.",
  descriptor: "Personalised cycling training with Alberto.",
  flame: 12,
  notifications: 3,
};

export const heroRoute = {
  temp: "18°C",
  place: "Alpe d'Huez",
  distance: "16.0 km",
  elevation: "1,090 m",
};

export const coach = {
  name: "Alberto",
  role: "Your Coach",
  quote: "Ready for\ntoday's climb?",
  support: "You've trained well.\nLet's keep building.",
  cta: "Start Today's Ride",
};

export type Metric = {
  key: string;
  label: string;
  icon: Ion;
  iconColor: string;
  value: string;
  status: string;
  scale?: boolean;
};

export const metrics: Metric[] = [
  { key: "rides", label: "WEEKLY RIDES", icon: "bicycle", iconColor: colors.red, value: "4 / 6", status: "On Track" },
  { key: "time", label: "TRAINING TIME", icon: "time-outline", iconColor: colors.green, value: "6h 24m", status: "+12% vs last week" },
  { key: "ftp", label: "FTP", icon: "flash", iconColor: colors.yellow, value: "287 W", status: "+6W vs last week" },
  { key: "readiness", label: "READINESS", icon: "heart-outline", iconColor: colors.red, value: "82%", status: "Good to go", scale: true },
];

export const trainingPlan = {
  title: "Build & Climb",
  week: "Week 3 of 8",
  progress: 62,
  nextWorkout: "Threshold Climb",
  duration: "1h 15m",
  tss: "92 TSS",
  bars: [0.35, 0.5, 0.42, 0.62, 0.55, 0.7, 0.6, 0.85, 0.72, 0.95, 0.8, 0.6],
};

export const featuredRoute = {
  title: "Col du Galibier",
  country: "France",
  distance: "23.7 km",
  elevation: "1,567 m",
  gradient: "6.6% Avg",
};

export const todayPlan = [
  { key: "warmup", label: "Warm Up", time: "15m", state: "done" as const },
  { key: "climb", label: "Threshold Climb", time: "1h 00m", state: "active" as const },
  { key: "cool", label: "Cool Down", time: "15m", state: "todo" as const },
];

// activity dots per day-of-month for May 2025
export const calendarDots: Record<number, string[]> = {
  12: ["red"],
  16: ["yellow"],
  22: ["red", "green"],
  29: ["green"],
  30: ["yellow"],
};

export const progressCard = {
  delta: "+8.4",
  unit: "CTL",
  title: "Fitness Trend",
  subtitle: "Last 6 Weeks",
  points: [0.25, 0.32, 0.28, 0.45, 0.5, 0.44, 0.62, 0.58, 0.7, 0.82, 0.78, 0.92],
};

export const community = {
  title: "Ride Together",
  online: "1,245 Riders Online",
  extra: "+8",
  cta: "Join a Group Ride",
};

export const wellness = {
  title: "Recovery Score",
  score: "78%",
  status: "Good",
  note: "Focus on hydration and quality sleep.",
};

export const achievement = {
  title: "Climber",
  detail: "Completed 5 climbs",
  progress: 4,
  total: 5,
};

// Configurable first-person route videos (admin-replaceable) for the Live Workout screen.
export type RouteOption = {
  id: string;
  url: string;
  title: string;
  place: string;
  distance: string;
  elevation: string;
  tag: string;
  tagColor: string;
};

export const routeVideos: RouteOption[] = [
  { id: "XlwjMjyU410", url: "https://youtu.be/XlwjMjyU410", title: "Alpe d'Huez", place: "France", distance: "16.0 km", elevation: "1,090 m", tag: "Mountain", tagColor: colors.red },
  { id: "Pyfy8trRybA", url: "https://youtu.be/Pyfy8trRybA", title: "Lake Garda", place: "Italy", distance: "24.0 km", elevation: "420 m", tag: "Rolling", tagColor: colors.yellow },
  { id: "U94MF1ZF81o", url: "https://youtu.be/U94MF1ZF81o", title: "Alpine Descent", place: "The Alps", distance: "18.0 km", elevation: "−980 m", tag: "Descent", tagColor: colors.green },
  { id: "AX8sC_kR46M", url: "https://youtu.be/AX8sC_kR46M", title: "Bavaria Autumn", place: "Germany", distance: "30.0 km", elevation: "260 m", tag: "Forest", tagColor: "#E8631C" },
  { id: "_vdX8QZyWeI", url: "https://youtu.be/_vdX8QZyWeI", title: "Countryside Roads", place: "Open Country", distance: "28.0 km", elevation: "180 m", tag: "Flat", tagColor: colors.green },
];

// Preview of the interval coming up next (includes RPE + power target).
export const nextInterval = {
  label: "Recovery Spin",
  time: "3:00",
  target: "150 W",
  rpe: "RPE 4",
};
