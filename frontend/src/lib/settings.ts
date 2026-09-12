import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  hasTrainer: boolean;   // rider has a smart trainer (power / cadence / speed)
  hasWearable: boolean;  // rider has a wearable (heart rate / wellness)
  hudEnabled: boolean;   // show the on-screen HUD overlay in immersive mode
  ftp: number;           // rider FTP (watts) — drives live ERG target power
  ftpAuto: boolean;      // keep FTP in sync with training-progress FTP
  maxHr: number;         // rider max heart rate (bpm, 0 = estimate from age)
  age: number;           // rider age (years, 0 = unknown) — used for 220−age fallback
  wheelCircumference: number; // wheel roll-out in mm — converts wheel revs to speed
  seatedMode: boolean;   // ride seated throughout — coach cues avoid standing efforts
  homeCity: string;      // fallback location label for the home weather when GPS is unavailable
  homeLat: number;       // fallback latitude
  homeLon: number;       // fallback longitude
  units: "metric" | "imperial"; // distance/elevation units
  coachAudio: boolean;   // spoken coach guidance during rides
  autoSync: boolean;     // auto-sync completed rides to connected services
  weeklyReport: boolean; // weekly training summary email
  restReminders: boolean; // reminders to take scheduled rest days
};

const DEFAULTS: Settings = { hasTrainer: false, hasWearable: false, hudEnabled: true, ftp: 287, ftpAuto: true, maxHr: 0, age: 0, wheelCircumference: 2105, seatedMode: false, homeCity: "", homeLat: 0, homeLon: 0, units: "metric", coachAudio: true, autoSync: true, weeklyReport: true, restReminders: false };
const KEY = "roujaune:settings";

// Common tyre roll-outs (mm) — matches standard cycling speed-sensor tables.
export const WHEEL_PRESETS: { label: string; mm: number }[] = [
  { label: "700×23c", mm: 2097 },
  { label: "700×25c", mm: 2105 },
  { label: "700×28c", mm: 2136 },
  { label: "700×32c", mm: 2155 },
  { label: '650b · 27.5"', mm: 2086 },
  { label: '26" MTB', mm: 2070 },
  { label: '29" MTB', mm: 2299 },
];

// Nearest tyre preset to a measured roll-out, with a signed delta (mm) so
// riders get a quick sanity-check on their calibration.
export function nearestWheelPreset(mm: number): { label: string; mm: number; delta: number } {
  let best = WHEEL_PRESETS[0];
  for (const p of WHEEL_PRESETS) {
    if (Math.abs(mm - p.mm) < Math.abs(mm - best.mm)) best = p;
  }
  return { label: best.label, mm: best.mm, delta: mm - best.mm };
}

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

// Load / persist the rider's settings server-side so every preference stays
// consistent across sessions and devices (local cache keeps it instant/offline).
async function fetchRemoteSettings(): Promise<Partial<Settings> | null> {
  try {
    const res = await fetch(`${apiBase()}/api/rider/settings`);
    if (!res.ok) return null;
    const d = await res.json();
    delete (d as any).id;
    return d && Object.keys(d).length ? d : null;
  } catch {
    return null;
  }
}

async function pushRemoteSettings(patch: Partial<Settings>): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/rider/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    /* keep local; will re-sync on next change */
  }
}

// Pull the current FTP from the backend training-progress metrics (e.g. "287 W").
async function fetchProgressFtp(): Promise<number | null> {
  try {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
    const res = await fetch(`${base}/api/progress`);
    if (!res.ok) return null;
    const data = await res.json();
    const metric = (data?.metrics ?? []).find((m: any) => String(m.label).toUpperCase() === "FTP");
    const watts = parseInt(String(metric?.value ?? "").replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(watts) && watts > 0 ? watts : null;
  } catch {
    return null;
  }
}

/** Persistent rider settings — server-backed (cross-device) with an
 * AsyncStorage cache for instant load and offline resilience. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let current = DEFAULTS;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
      } catch {
        /* keep defaults */
      }
      setSettings(current);
      setLoaded(true);

      // Server is the source of truth — merge remote over the local cache.
      const remote = await fetchRemoteSettings();
      if (remote) {
        current = { ...current, ...remote };
        setSettings(current);
        AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
      }

      // When auto-sync is on, refresh FTP from the rider's training progress so
      // the ERG target power tracks their improving fitness.
      if (current.ftpAuto) {
        const ftp = await fetchProgressFtp();
        if (ftp && ftp !== current.ftp) {
          const next = { ...current, ftp };
          setSettings(next);
          AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
          pushRemoteSettings({ ftp });
        }
      }
    })();
  }, []);

  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [k]: v };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      pushRemoteSettings({ [k]: v } as Partial<Settings>);
      return next;
    });
  }, []);

  return { settings, setSetting, loaded };
}
