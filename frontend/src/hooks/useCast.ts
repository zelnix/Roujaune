import { useCallback, useEffect, useState } from "react";

// Native (iOS/Android) Google Cast integration. Loaded only on native — the
// web build uses useCast.web.ts. Requires a development/production build;
// this will not function inside Expo Go (no native Cast module linked).
let RNGC: {
  default?: unknown;
  CastContext?: { getInstance?: () => { showCastDialog?: () => void }; showCastDialog?: () => void };
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNGC = require("react-native-google-cast");
} catch {
  RNGC = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GoogleCast: any = (RNGC as any)?.default ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CastContext: any = (RNGC as any)?.CastContext ?? null;

export type CastApi = {
  castSupported: boolean;
  castDeviceName: string | null;
  showCastDialog: () => void;
  stopCast: () => void;
};

export function useCast(): CastApi {
  const [castDeviceName, setName] = useState<string | null>(null);
  const supported = !!GoogleCast;

  useEffect(() => {
    if (!GoogleCast) return;
    const sm = GoogleCast.getSessionManager?.() ?? GoogleCast.sessionManager;
    if (!sm) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs: any[] = [];
    const refresh = async () => {
      try {
        const s = await sm.getCurrentCastSession?.();
        if (!s) { setName(null); return; }
        const dev = (await s.getCastDevice?.()) ?? null;
        setName(dev?.friendlyName ?? "Connected TV");
      } catch {
        /* noop */
      }
    };
    try {
      subs.push(sm.onSessionStarted?.(() => refresh()));
      subs.push(sm.onSessionResumed?.(() => refresh()));
      subs.push(sm.onSessionEnded?.(() => setName(null)));
    } catch {
      /* listeners unavailable */
    }
    refresh();
    return () => subs.forEach((x) => x?.remove?.());
  }, []);

  const showCastDialog = useCallback(() => {
    try {
      CastContext?.getInstance?.().showCastDialog?.();
    } catch {
      try { CastContext?.showCastDialog?.(); } catch { /* noop */ }
    }
  }, []);

  const stopCast = useCallback(() => {
    try {
      (GoogleCast?.getSessionManager?.() ?? GoogleCast?.sessionManager)?.endCurrentSession?.(true);
    } catch {
      /* noop */
    }
    setName(null);
  }, []);

  return { castSupported: supported, castDeviceName, showCastDialog, stopCast };
}
