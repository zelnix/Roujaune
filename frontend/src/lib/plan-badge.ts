import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SEEN_KEY = "roujaune:planAdaptationSeenAt";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

let updated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Check whether the coach's plan adaptation was refreshed since the rider
 * last viewed the Training Plan (e.g. after a completed ride). */
export async function refreshPlanBadge(): Promise<void> {
  try {
    const res = await fetch(`${apiBase()}/api/plan`);
    if (!res.ok) return;
    const data = await res.json();
    const at: string | undefined = [data?.adaptation_ai_alberto_at, data?.adaptation_ai_adriana_at]
      .filter(Boolean)
      .sort()
      .pop();
    if (!at) return;
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    const next = !seen || new Date(at).getTime() > new Date(seen).getTime();
    if (next !== updated) { updated = next; emit(); }
  } catch {
    /* noop */
  }
}

/** Clear the badge — call when the rider opens the Training Plan screen. */
export async function markPlanSeen(): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* noop */ }
  if (updated) { updated = false; emit(); }
}

export function usePlanBadge(): boolean {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const l = () => force();
    listeners.add(l);
    refreshPlanBadge();
    return () => { listeners.delete(l); };
  }, []);
  return updated;
}
