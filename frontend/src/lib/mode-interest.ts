import React from "react";

const base = () => (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

// Reactive per-rider store of the roadmap modes the rider asked to be notified
// about (powers the teaser "Notify me" button state + a demand signal for us).
let modes = new Set<string>();
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function hydrate() {
  try {
    const r = await fetch(`${base()}/api/rider/interest`);
    if (!r.ok) return;
    const d = await r.json();
    modes = new Set<string>(Array.isArray(d?.modes) ? d.modes : []);
    emit();
  } catch { /* keep current */ }
}

export function resetModeInterest() {
  hydrated = false;
  modes = new Set<string>();
  emit();
}

export async function registerInterest(mode: string): Promise<void> {
  const next = new Set(modes); next.add(mode); modes = next; emit();
  try {
    await fetch(`${base()}/api/rider/interest/${encodeURIComponent(mode)}`, { method: "POST" });
  } catch {
    const revert = new Set(modes); revert.delete(mode); modes = revert; emit();
  }
}

export async function unregisterInterest(mode: string): Promise<void> {
  const next = new Set(modes); next.delete(mode); modes = next; emit();
  try {
    await fetch(`${base()}/api/rider/interest/${encodeURIComponent(mode)}`, { method: "DELETE" });
  } catch {
    const revert = new Set(modes); revert.add(mode); modes = revert; emit();
  }
}

export function useModeInterest() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    if (!hydrated) { hydrated = true; hydrate(); }
    const l = () => force();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    has: (m: string) => modes.has(m),
    register: registerInterest,
    unregister: unregisterInterest,
  };
}
