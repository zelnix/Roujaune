/**
 * health — orchestrates bidirectional health sync on top of the platform-split
 * `health-native` module. Handles rider preferences (auto-push / import),
 * permission flow, and relaying imported/pushed rides to the backend so they
 * show up in history, progress and coaching.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HEALTH_PLATFORM, healthNativeAvailable, checkHealthPermissions,
  requestHealthPermissions, pushWorkoutToHealth, importCyclingFromHealth,
} from "./health-native";
import type { CyclingWorkout, HealthPlatform, PermissionState } from "./health-types";

export type { CyclingWorkout, HealthPlatform, PermissionState } from "./health-types";
export { HEALTH_PLATFORM, healthNativeAvailable } from "./health-native";

const PREFS_KEY = "roujaune:health";
type HealthPrefs = { autoPush: boolean; importEnabled: boolean; linked: boolean; lastSync: string | null };
const DEFAULT_PREFS: HealthPrefs = { autoPush: true, importEnabled: true, linked: false, lastSync: null };

function base(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}
async function api(path: string, method = "POST", body?: any) {
  const res = await fetch(`${base()}/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadPrefs(): Promise<HealthPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* keep defaults */ }
  return { ...DEFAULT_PREFS };
}
async function savePrefs(p: HealthPrefs) {
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function platformLabel(p: HealthPlatform): string {
  return p === "apple_health" ? "Apple Health" : p === "health_connect" ? "Health Connect" : "Health";
}

/**
 * Auto-push a just-completed Roujaune ride into the rider's health platform,
 * if they've linked it and left auto-push on. Best-effort & silent — never
 * blocks the summary screen.
 */
export async function autoPushCompletedRide(w: CyclingWorkout): Promise<boolean> {
  if (!healthNativeAvailable) return false;
  try {
    const prefs = await loadPrefs();
    if (!prefs.linked || !prefs.autoPush) return false;
    const perm = await checkHealthPermissions();
    if (perm === "denied" || perm === "blocked" || perm === "unsupported") return false;
    const r = await pushWorkoutToHealth(w);
    if (r.ok) {
      await api(`/connections/native/${HEALTH_PLATFORM}/pushed`, "POST", { count: 1 }).catch(() => {});
      await savePrefs({ ...prefs, lastSync: new Date().toISOString() });
      return true;
    }
  } catch { /* silent */ }
  return false;
}

export function useHealthSync() {
  const [prefs, setPrefs] = useState<HealthPrefs>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<PermissionState>(
    healthNativeAvailable ? "undetermined" : "unsupported"
  );
  const [busy, setBusy] = useState<null | string>(null);
  const [message, setMessage] = useState<string | null>(null);

  const platform = HEALTH_PLATFORM;
  const label = platformLabel(platform);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await loadPrefs();
      if (!alive) return;
      setPrefs(p);
      if (healthNativeAvailable && p.linked) {
        const st = await checkHealthPermissions();
        if (alive) setPermission(st);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback(async (patch: Partial<HealthPrefs>) => {
    setPrefs((prev) => { const next = { ...prev, ...patch }; savePrefs(next); return next; });
  }, []);

  const connect = useCallback(async () => {
    if (!healthNativeAvailable) return;
    setBusy("connect");
    try {
      const res = await requestHealthPermissions();
      setPermission(res.state);
      if (res.state === "granted") {
        await api(`/connections/native/${platform}/link`, "POST", { permissions: ["read", "write"] }).catch(() => {});
        await persist({ linked: true });
        setMessage(`${label} connected`);
      } else if (res.state === "unsupported") {
        setMessage(
          Platform.OS === "android"
            ? "Health Connect isn't available on this device"
            : "Health isn't available on this device"
        );
      } else if (!res.canAskAgain) {
        setPermission("blocked");
        setMessage(`Enable ${label} access in Settings`);
      } else {
        setMessage("Permission needed to sync your rides");
      }
    } finally { setBusy(null); }
  }, [platform, label, persist]);

  const syncNow = useCallback(async () => {
    if (!healthNativeAvailable) return;
    setBusy("sync");
    try {
      let imported = 0;
      if (prefs.importEnabled) {
        const rides = await importCyclingFromHealth(30);
        if (rides.length) {
          const r = await api(`/connections/native/${platform}/import`, "POST", { workouts: rides }).catch(() => null);
          imported = r?.imported ?? 0;
        }
      }
      await persist({ lastSync: new Date().toISOString() });
      setMessage(imported > 0 ? `Imported ${imported} ride${imported === 1 ? "" : "s"}` : "You're up to date");
    } catch {
      setMessage("Sync failed — try again");
    } finally { setBusy(null); }
  }, [platform, prefs.importEnabled, persist]);

  const disconnect = useCallback(async () => {
    setBusy("disconnect");
    try {
      await api(`/connections/${platform}/disconnect`, "POST").catch(() => {});
      await persist({ linked: false });
      setMessage(`${label} disconnected`);
    } finally { setBusy(null); }
  }, [platform, label, persist]);

  const openSettings = useCallback(() => { Linking.openSettings().catch(() => {}); }, []);
  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    available: healthNativeAvailable,
    platform, label,
    linked: prefs.linked,
    permission,
    blocked: permission === "blocked",
    autoPush: prefs.autoPush,
    importEnabled: prefs.importEnabled,
    lastSync: prefs.lastSync,
    busy, message, clearMessage,
    connect, disconnect, syncNow, openSettings,
    setAutoPush: (v: boolean) => persist({ autoPush: v }),
    setImportEnabled: (v: boolean) => persist({ importEnabled: v }),
  };
}
