import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "roujaune.workout.resume.v1";

export type WorkoutResume = {
  workoutId?: string;
  title: string;
  elapsedSec: number;   // ride time so far (seconds) — resumes the server sim from here
  distanceKm: number;   // distance so far (km)
  vRouteId?: string | null;
  routeSource?: "auto" | "favorite" | "manual";
  ergMode: boolean;
  updatedAt: number;
};

let resume: WorkoutResume | null = null;
let hydrated = false;

async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    resume = raw ? (JSON.parse(raw) as WorkoutResume) : null;
  } catch {
    resume = null;
  }
}

/** Load the rider's in-progress structured workout (call on login / session restore). */
export function refreshWorkoutResume() {
  hydrated = true;
  hydrate();
}

/** Clear the in-memory resume (call on logout so it never leaks between riders). */
export function resetWorkoutResume() {
  hydrated = false;
  resume = null;
  AsyncStorage.removeItem(KEY).catch(() => {});
}

/** Persist / update the current in-progress structured workout. */
export async function saveWorkoutResume(r: Omit<WorkoutResume, "updatedAt">) {
  resume = { ...r, updatedAt: Date.now() };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(resume)); } catch { /* best effort */ }
}

/** Remove the resume once a workout is completed, saved or discarded. */
export async function clearWorkoutResume() {
  resume = null;
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}

export async function loadWorkoutResumeAsync(): Promise<WorkoutResume | null> {
  // Bypasses the module-level cache so the very first ride-init on a cold
  // launch is never racing an in-flight hydration — always reads fresh.
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WorkoutResume) : null;
  } catch {
    return null;
  }
}

/** Synchronous read — safe once `refreshWorkoutResume` has hydrated at login. */
export function getWorkoutResume(): WorkoutResume | null {
  if (!hydrated) refreshWorkoutResume();
  return resume;
}
