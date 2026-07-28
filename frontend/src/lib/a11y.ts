import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setA11yRuntime, LARGE_TEXT_SCALE } from "./text-scale";

export { LARGE_TEXT_SCALE };

/**
 * App-wide accessibility preferences for ROUJAUNE's 50+ riders:
 *   - largeText:    globally scales every <Text>/<TextInput> font size
 *   - highContrast: promotes dimmed body text to full white + slightly bolder
 *
 * Persisted per rider in the backend rider-settings document (cross-device) and
 * mirrored to AsyncStorage for instant, offline load. Follows the same reactive
 * module-store pattern as coach-persona / notifications so every screen (and the
 * root Text patch) stays in sync live.
 */
export type A11yState = { largeText: boolean; highContrast: boolean };

const KEY = "roujaune:a11y";
const DEFAULT: A11yState = { largeText: false, highContrast: false };

let state: A11yState = { ...DEFAULT };
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

function setState(next: Partial<A11yState>) {
  const merged = { ...state, ...next };
  if (merged.largeText === state.largeText && merged.highContrast === state.highContrast) return;
  state = merged;
  setA11yRuntime(state.largeText, state.highContrast);
  emit();
}

/** Hydrate from local cache, then reconcile with the server (source of truth). */
export function initA11y() {
  if (hydrated) return;
  hydrated = true;
  (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      /* keep defaults */
    }
    refreshA11yFromServer();
  })();
}

/** Re-pull from the server (call right after a successful login). */
export async function refreshA11yFromServer() {
  try {
    const res = await fetch(`${apiBase()}/api/rider/settings`);
    if (!res.ok) return;
    const d = await res.json();
    const next: Partial<A11yState> = {};
    if (typeof d.largeText === "boolean") next.largeText = d.largeText;
    if (typeof d.highContrast === "boolean") next.highContrast = d.highContrast;
    if (Object.keys(next).length) {
      setState(next);
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }
  } catch {
    /* keep local */
  }
}

async function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  try {
    await fetch(`${apiBase()}/api/rider/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ largeText: state.largeText, highContrast: state.highContrast }),
    });
  } catch {
    /* keep local; re-syncs on next change */
  }
}

export function getA11y(): A11yState {
  return state;
}

export function setLargeText(on: boolean) {
  setState({ largeText: on });
  persist();
}

export function setHighContrast(on: boolean) {
  setState({ highContrast: on });
  persist();
}

/** Reset to defaults on logout so preferences never leak between accounts. */
export function resetA11y() {
  hydrated = false;
  state = { ...DEFAULT };
  setA11yRuntime(false, false);
  AsyncStorage.removeItem(KEY).catch(() => {});
  emit();
}

/** Reactive hook — re-renders subscribers whenever a toggle changes. */
export function useA11y(): A11yState {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    initA11y();
    const l = () => force();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}
