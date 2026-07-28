import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type Ion = ComponentProps<typeof Ionicons>["name"];

/**
 * "Today Mode" — the rider experience the app is currently framed around.
 * The Roujaune shell (wordmark, mode selector, Connections/Profile/Settings)
 * stays constant; the Today content and the experience-specific nav links adapt.
 * Session-scoped (persisted to AsyncStorage so it survives a reload, reset on
 * logout). Switching mode NEVER touches the training plan or scheduled workouts.
 */
export type RiderExperience =
  | "training"
  | "scenic-cycling"
  | "gravel"
  | "mountain-bike"
  | "walking"
  | "running"
  | "rowing"
  | "climbing";

export type Availability = "available" | "coming-soon" | "hidden";

export interface NavItem {
  key: string;
  label: string;
  icon: Ion;
  route: string;
  availability: Availability;
  badge?: string;
}

export interface TodayModeMeta {
  id: RiderExperience;
  label: string;        // "Train today"
  shortLabel: string;   // "Train today" (rail)
  description: string;  // supporting text
  icon: Ion;
  availability: Availability;
  route: string;        // default route
  primaryActionLabel: string;
}

/** The eight activity modes shown in the selector. */
export const TODAY_MODES: TodayModeMeta[] = [
  { id: "training", label: "Train today", shortLabel: "Train today", description: "Follow my training plan", icon: "fitness", availability: "available", route: "/", primaryActionLabel: "START TODAY'S TRAINING" },
  { id: "scenic-cycling", label: "Take a scenic ride", shortLabel: "Scenic ride", description: "Explore a destination", icon: "bicycle", availability: "available", route: "/", primaryActionLabel: "BEGIN SCENIC JOURNEY" },
  { id: "gravel", label: "Ride gravel", shortLabel: "Gravel", description: "Mixed-surface adventure", icon: "trail-sign", availability: "coming-soon", route: "/", primaryActionLabel: "START GRAVEL ADVENTURE" },
  { id: "mountain-bike", label: "Go mountain biking", shortLabel: "Mountain bike", description: "Trails and technical riding", icon: "triangle", availability: "coming-soon", route: "/", primaryActionLabel: "START TRAIL RIDE" },
  { id: "walking", label: "Walk", shortLabel: "Walk", description: "Scenic walking tours", icon: "walk", availability: "coming-soon", route: "/", primaryActionLabel: "BEGIN WALKING TOUR" },
  { id: "running", label: "Run", shortLabel: "Run", description: "Treadmill destinations", icon: "footsteps", availability: "coming-soon", route: "/", primaryActionLabel: "BEGIN SCENIC RUN" },
  { id: "rowing", label: "Row", shortLabel: "Row", description: "Scenic waterways", icon: "boat", availability: "coming-soon", route: "/", primaryActionLabel: "BEGIN SCENIC ROW" },
  { id: "climbing", label: "Climb", shortLabel: "Climb", description: "Famous stairs and ascents", icon: "trending-up", availability: "coming-soon", route: "/", primaryActionLabel: "BEGIN SCENIC CLIMB" },
];

export function modeMeta(id: RiderExperience): TodayModeMeta {
  return TODAY_MODES.find((m) => m.id === id) ?? TODAY_MODES[0];
}

// Shared utility section — identical across every experience.
const UTILITY: NavItem[] = [
  { key: "connections", label: "Connections", icon: "link-outline", route: "/connections", availability: "available" },
  { key: "profile", label: "Profile", icon: "person-circle-outline", route: "/profile", availability: "available" },
  { key: "settings", label: "Settings", icon: "settings-outline", route: "/settings", availability: "available" },
];

export interface ExperienceNavigation {
  experience: RiderExperience;
  defaultRoute: string;
  items: NavItem[];
  footer: NavItem[];
}

/** Data-driven navigation per experience. Items map to REAL app routes where a
 *  screen exists; everything else is `coming-soon` (never a broken link). */
export const experienceNavigation: Record<RiderExperience, ExperienceNavigation> = {
  training: {
    experience: "training", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "training", label: "My Training Plan", icon: "clipboard-outline", route: "/plan", availability: "available" },
      { key: "calendar", label: "Calendar", icon: "calendar-outline", route: "/calendar", availability: "available" },
      { key: "workouts", label: "Workouts", icon: "fitness-outline", route: "/workouts", availability: "available" },
      { key: "benchmark", label: "Benchmark Tests", icon: "speedometer-outline", route: "/benchmark", availability: "available" },
      { key: "progress", label: "Progress", icon: "stats-chart-outline", route: "/progress", availability: "available" },
      { key: "history", label: "Ride History", icon: "time-outline", route: "/progress", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  "scenic-cycling": {
    experience: "scenic-cycling", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "explore", label: "Explore Destinations", icon: "compass-outline", route: "/routes", availability: "available" },
      { key: "continue", label: "Continue Journey", icon: "play-circle-outline", route: "/routes", availability: "coming-soon" },
      { key: "journeys", label: "My Scenic Journeys", icon: "map-outline", route: "/routes", availability: "coming-soon" },
      { key: "saved", label: "Saved Destinations", icon: "bookmark-outline", route: "/routes", availability: "coming-soon" },
      { key: "discoveries", label: "Discoveries", icon: "sparkles-outline", route: "/routes", availability: "coming-soon" },
      { key: "companions", label: "Companions", icon: "people-outline", route: "/settings", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  gravel: {
    experience: "gravel", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "find", label: "Find Gravel Routes", icon: "trail-sign-outline", route: "/", availability: "coming-soon" },
      { key: "planner", label: "Route Planner", icon: "git-branch-outline", route: "/", availability: "coming-soon" },
      { key: "adventures", label: "My Adventures", icon: "flag-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Routes", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
      { key: "nav", label: "Navigation", icon: "navigate-outline", route: "/", availability: "coming-soon" },
      { key: "history", label: "Ride History", icon: "time-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  "mountain-bike": {
    experience: "mountain-bike", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "trails", label: "Find Trails", icon: "triangle-outline", route: "/", availability: "coming-soon" },
      { key: "map", label: "Trail Map", icon: "map-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Trails", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
      { key: "skills", label: "Skills & Sessions", icon: "barbell-outline", route: "/", availability: "coming-soon" },
      { key: "history", label: "Trail History", icon: "time-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  walking: {
    experience: "walking", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "explore", label: "Explore Walking Tours", icon: "compass-outline", route: "/", availability: "coming-soon" },
      { key: "continue", label: "Continue Tour", icon: "play-circle-outline", route: "/", availability: "coming-soon" },
      { key: "journeys", label: "My Walking Journeys", icon: "map-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Destinations", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
      { key: "discoveries", label: "Discoveries", icon: "sparkles-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  running: {
    experience: "running", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "runs", label: "Scenic Runs", icon: "compass-outline", route: "/", availability: "coming-soon" },
      { key: "continue", label: "Continue Run", icon: "play-circle-outline", route: "/", availability: "coming-soon" },
      { key: "journeys", label: "My Running Journeys", icon: "map-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Routes", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
      { key: "history", label: "Activity History", icon: "time-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  rowing: {
    experience: "rowing", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "waterways", label: "Scenic Waterways", icon: "compass-outline", route: "/", availability: "coming-soon" },
      { key: "continue", label: "Continue Row", icon: "play-circle-outline", route: "/", availability: "coming-soon" },
      { key: "journeys", label: "My Rowing Journeys", icon: "map-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Routes", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
      { key: "history", label: "Activity History", icon: "time-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
  climbing: {
    experience: "climbing", defaultRoute: "/",
    items: [
      { key: "home", label: "Today", icon: "home", route: "/", availability: "available" },
      { key: "climbs", label: "Scenic Climbs", icon: "compass-outline", route: "/", availability: "coming-soon" },
      { key: "famous", label: "Famous Ascents", icon: "trophy-outline", route: "/", availability: "coming-soon" },
      { key: "continue", label: "Continue Climb", icon: "play-circle-outline", route: "/", availability: "coming-soon" },
      { key: "journeys", label: "My Climbing Journeys", icon: "map-outline", route: "/", availability: "coming-soon" },
      { key: "saved", label: "Saved Climbs", icon: "bookmark-outline", route: "/", availability: "coming-soon" },
    ],
    footer: UTILITY,
  },
};

// ── reactive store (per-rider, persistent across sessions) ───────────────────
// The rider's chosen experience is remembered PER user id and survives logout /
// app restart — it only changes when the rider explicitly picks another mode.
const KEY_BASE = "roujaune:today-mode";
let activeKey = KEY_BASE;            // anonymous until a rider is known
let experience: RiderExperience = "training";
const lastRoute: Partial<Record<RiderExperience, string>> = {};
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
// Set when a NON-training experience is restored from storage (login / restart)
// so the home screen can show a one-time "Welcome back, resuming …" ribbon.
let pendingRestore: RiderExperience | null = null;

function keyFor(userId: string | null | undefined): string {
  return userId ? `${KEY_BASE}:${userId}` : KEY_BASE;
}

async function loadFrom(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const d = JSON.parse(raw);
      let found = false;
      if (d.experience && experienceNavigation[d.experience as RiderExperience]) { experience = d.experience; found = true; }
      if (d.lastRoute) Object.assign(lastRoute, d.lastRoute);
      return found;
    }
  } catch { /* keep current */ }
  return false;
}

/** Pre-login safety hydration (anonymous key). No-op once a rider has hydrated. */
export function initTodayMode() {
  if (hydrated) return;
  hydrated = true;
  loadFrom(activeKey).then(emit);
}

/** Bind the store to a specific rider and restore THEIR remembered experience.
 *  Called on login / session restore whenever the auth user changes. */
export async function hydrateTodayModeForUser(userId: string | null | undefined) {
  activeKey = keyFor(userId);
  hydrated = true;
  // Reset to defaults first so one rider's choice never leaks to another, then
  // overlay this rider's persisted selection (if any).
  experience = "training";
  for (const k of Object.keys(lastRoute)) delete (lastRoute as any)[k];
  const found = await loadFrom(activeKey);
  pendingRestore = found && experience !== "training" ? experience : null;
  emit();
}

function persist() {
  AsyncStorage.setItem(activeKey, JSON.stringify({ experience, lastRoute })).catch(() => {});
}

export function getExperience(): RiderExperience {
  return experience;
}

export function setExperience(next: RiderExperience) {
  if (next === experience || !experienceNavigation[next]) return;
  experience = next;
  persist();
  emit();
}

/** Remember the last valid route the rider visited within an experience. */
export function rememberRoute(exp: RiderExperience, route: string) {
  lastRoute[exp] = route;
  persist();
}

export function lastRouteFor(exp: RiderExperience): string {
  return lastRoute[exp] || experienceNavigation[exp].defaultRoute;
}

/** Logout: reset the IN-MEMORY store to defaults but KEEP each rider's persisted
 *  choice on disk, so it's restored the next time they sign in. */
export function resetTodayMode() {
  hydrated = false;
  activeKey = KEY_BASE;
  experience = "training";
  for (const k of Object.keys(lastRoute)) delete (lastRoute as any)[k];
  emit();
}

/** Account deletion: forget this rider's remembered experience entirely. */
export function clearTodayModeForUser(userId: string | null | undefined) {
  AsyncStorage.removeItem(keyFor(userId)).catch(() => {});
  resetTodayMode();
}

/** Resolve a nav item by key within the CURRENT experience (for nav handlers). */
export function resolveNav(key: string): NavItem | undefined {
  const cfg = experienceNavigation[experience];
  return [...cfg.items, ...cfg.footer].find((n) => n.key === key);
}

/** One-time restore note: returns the restored non-training experience once
 *  (then clears it) so the home screen can show a "Welcome back" ribbon. */
export function consumeRestoreNote(): RiderExperience | null {
  const p = pendingRestore;
  pendingRestore = null;
  return p;
}

/** Subscribe to store changes (used by the ribbon to catch async hydration). */
export function subscribeTodayMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useTodayMode() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    initTodayMode();
    const l = () => force();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    experience,
    meta: modeMeta(experience),
    nav: experienceNavigation[experience],
    setExperience,
  };
}
