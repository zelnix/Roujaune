import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  hasTrainer: boolean;   // rider has a smart trainer (power / cadence / speed)
  hasWearable: boolean;  // rider has a wearable (heart rate / wellness)
  demoMode: boolean;     // preview the connected experience with simulated data
  hudEnabled: boolean;   // show the on-screen HUD overlay in immersive mode
  ftp: number;           // rider FTP (watts) — drives live ERG target power
  ftpAuto: boolean;      // keep FTP in sync with training-progress FTP
  seatedMode: boolean;   // ride seated throughout — coach cues avoid standing efforts
  homeCity: string;      // fallback location label for the home weather when GPS is unavailable
  homeLat: number;       // fallback latitude
  homeLon: number;       // fallback longitude
};

const DEFAULTS: Settings = { hasTrainer: false, hasWearable: false, demoMode: false, hudEnabled: true, ftp: 287, ftpAuto: true, seatedMode: false, homeCity: "Nice, France", homeLat: 43.7102, homeLon: 7.262 };
const KEY = "roujaune:settings";

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

/** Persistent live-workout settings (AsyncStorage-backed). */
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

      // When auto-sync is on, refresh FTP from the rider's training progress so
      // the ERG target power tracks their improving fitness.
      if (current.ftpAuto) {
        const ftp = await fetchProgressFtp();
        if (ftp && ftp !== current.ftp) {
          const next = { ...current, ftp };
          setSettings(next);
          AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
        }
      }
    })();
  }, []);

  const setSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [k]: v };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, setSetting, loaded };
}
