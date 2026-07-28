import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "roujaune.scenic.resume.v1";

export type ScenicResume = {
  routeId: string;
  name?: string;
  place?: string;
  positionSec: number; // where in the video the rider left off
  elapsedSec: number; // active ride time so far
  pct: number; // 0..1 progress
  updatedAt: number;
};

let resume: ScenicResume | null = null;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    resume = raw ? (JSON.parse(raw) as ScenicResume) : null;
  } catch {
    resume = null;
  }
  emit();
}

/** Load the rider's in-progress ride (call on login / session restore). */
export function refreshScenicResume() {
  hydrated = true;
  hydrate();
}

/** Clear the in-memory resume (call on logout so it never leaks between riders). */
export function resetScenicResume() {
  hydrated = false;
  resume = null;
  AsyncStorage.removeItem(KEY).catch(() => {});
  emit();
}

/** Persist / update the current in-progress ride. */
export async function saveResume(r: Omit<ScenicResume, "updatedAt">) {
  resume = { ...r, updatedAt: Date.now() };
  emit();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(resume)); } catch { /* best effort */ }
}

/** Remove the resume once a ride is completed or discarded. */
export async function clearResume() {
  resume = null;
  emit();
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}

export function getResume(): ScenicResume | null {
  return resume;
}

/** Reactive hook — the current resumable ride, or null. */
export function useScenicResume(): ScenicResume | null {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    if (!hydrated) refreshScenicResume();
    const l = () => force();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return resume;
}
