import { useEffect } from "react";

/**
 * Safe wrapper around expo-keep-awake that can never crash the app.
 * The module is lazily loaded so a missing native module (e.g. in Expo Go
 * or an incompatible runtime) degrades gracefully — the screen may sleep,
 * but the app won't die.
 */
export function useSafeKeepAwake() {
  useEffect(() => {
    let deactivate: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { activateKeepAwakeAsync, deactivateKeepAwake } = require("expo-keep-awake");
      activateKeepAwakeAsync().catch(() => {});
      deactivate = () => {
        try { deactivateKeepAwake(); } catch {}
      };
    } catch {
      /* expo-keep-awake unavailable — screen may sleep during workout */
    }
    return () => { deactivate?.(); };
  }, []);
}
