import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  hasTrainer: boolean;   // rider has a smart trainer (power / cadence / speed)
  hasWearable: boolean;  // rider has a wearable (heart rate / wellness)
  hudEnabled: boolean;   // show the on-screen HUD overlay in immersive mode
};

const DEFAULTS: Settings = { hasTrainer: true, hasWearable: true, hudEnabled: true };
const KEY = "roujaune:settings";

/** Persistent live-workout settings (AsyncStorage-backed). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {
        /* keep defaults */
      }
      setLoaded(true);
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
