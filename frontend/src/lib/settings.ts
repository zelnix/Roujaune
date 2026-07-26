import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  hasTrainer: boolean;   // rider has a smart trainer (power / cadence / speed)
  hasWearable: boolean;  // rider has a wearable (heart rate / wellness)
  demoMode: boolean;     // preview the connected experience with simulated data
  hudEnabled: boolean;   // show the on-screen HUD overlay in immersive mode
  ftp: number;           // rider FTP (watts) — drives live ERG target power
  ftpAuto: boolean;      // keep FTP in sync with training-progress FTP
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

const DEFAULTS: Settings = { hasTrainer: false, hasWearable: false, demoMode: false, hudEnabled: true, ftp: 287, ftpAuto: true, wheelCircumference: 2105, seatedMode: false, homeCity: "Nice, France", homeLat: 43.7102, homeLon: 7.262, units: "metric", coachAudio: true, autoSync: true, weeklyReport: true, restReminders: false };
const KEY = "roujaune:settings";

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
