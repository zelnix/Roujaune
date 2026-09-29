/**
 * health-native — NATIVE (iOS Apple Health / Android Health Connect).
 *
 * iOS  → `react-native-health` (HealthKit): read/write Cycling workouts.
 * Android → `react-native-health-connect`: read/write ExerciseSession (Cycling),
 *           Distance, TotalCaloriesBurned, HeartRate. Health Connect is the OS
 *           hub that Samsung Health and Google Fit sync through, so one link
 *           covers both.
 *
 * Native modules are lazy-required inside try/catch so a missing link (Expo Go)
 * degrades gracefully instead of crashing. REQUIRES a development/production
 * build to actually exercise — not testable in Expo Go / web preview.
 */
import { Platform } from "react-native";
import type { CyclingWorkout, HealthPlatform, PermissionResult, PermissionState } from "./health-types";

export const HEALTH_PLATFORM: HealthPlatform =
  Platform.OS === "ios" ? "apple_health" : Platform.OS === "android" ? "health_connect" : "none";
export const healthNativeAvailable = Platform.OS === "ios" || Platform.OS === "android";

const HC_PERMS = (["ExerciseSession", "Distance", "TotalCaloriesBurned", "HeartRate", "Power"] as const).flatMap(
  (recordType) => [
    { accessType: "read" as const, recordType },
    { accessType: "write" as const, recordType },
  ]
);

function loadHK(): any | null {
  try { return require("react-native-health").default; } catch { return null; }
}
function loadHC(): any | null {
  try { return require("react-native-health-connect"); } catch { return null; }
}

function hkPermissions(HK: any) {
  const P = HK.Constants.Permissions;
  return {
    permissions: {
      read: [P.Workout, P.DistanceCycling, P.ActiveEnergyBurned, P.HeartRate],
      write: [P.Workout, P.DistanceCycling, P.ActiveEnergyBurned, P.HeartRate],
    },
  };
}

// --- permission state ----------------------------------------------------
export async function checkHealthPermissions(): Promise<PermissionState> {
  if (Platform.OS === "ios") {
    // HealthKit intentionally hides read authorization; treat as undetermined
    // and let a successful init/request reveal the outcome.
    return "undetermined";
  }
  if (Platform.OS === "android") {
    const HC = loadHC();
    if (!HC) return "unsupported";
    try {
      const status = await HC.getSdkStatus?.();
      // 3 === SDK_AVAILABLE; anything else means HC isn't ready on this device.
      if (status != null && status !== 3) return "unsupported";
      await HC.initialize();
      const granted = await HC.getGrantedPermissions();
      return Array.isArray(granted) && granted.length > 0 ? "granted" : "undetermined";
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}

export async function requestHealthPermissions(): Promise<PermissionResult> {
  if (Platform.OS === "ios") {
    const HK = loadHK();
    if (!HK) return { state: "unsupported", canAskAgain: false };
    return new Promise((resolve) => {
      HK.initHealthKit(hkPermissions(HK), (err: unknown) =>
        // HealthKit never tells us if the user denied a read scope — a clean
        // callback means the sheet was completed; empty reads are handled later.
        resolve({ state: err ? "denied" : "granted", canAskAgain: !!err })
      );
    });
  }
  if (Platform.OS === "android") {
    const HC = loadHC();
    if (!HC) return { state: "unsupported", canAskAgain: false };
    try {
      const status = await HC.getSdkStatus?.();
      if (status != null && status !== 3) return { state: "unsupported", canAskAgain: false };
      await HC.initialize();
      const granted = await HC.requestPermission(HC_PERMS);
      const ok = Array.isArray(granted) && granted.length > 0;
      return { state: ok ? "granted" : "denied", canAskAgain: !ok };
    } catch {
      return { state: "unsupported", canAskAgain: false };
    }
  }
  return { state: "unsupported", canAskAgain: false };
}

// --- push a completed ride into the platform ----------------------------
export async function pushWorkoutToHealth(w: CyclingWorkout): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS === "ios") {
    const HK = loadHK();
    if (!HK) return { ok: false, error: "unsupported" };
    try {
      // Build metadata with external UUID for deduplication.
      // HealthKit uses HKMetadataKeyExternalUUID to merge overlapping sessions.
      const metadata: Record<string, unknown> = {};
      if (w.externalUUID) metadata.HKExternalUUID = w.externalUUID;

      await new Promise<void>((resolve, reject) =>
        HK.saveWorkout(
          {
            type: "Cycling",
            startDate: w.startDate,
            endDate: w.endDate,
            energyBurned: w.calories ?? 0,
            energyBurnedUnit: "calorie",
            distance: w.distanceMeters ?? 0,
            distanceUnit: "meter",
            metadata,
          },
          (err: unknown) => (err ? reject(err) : resolve())
        )
      );

      // Write per-second power + cadence + HR as HKQuantitySamples.
      // These attach to the workout as time-series data so Apple Health
      // can display the full power curve (not just averages).
      const startMs = new Date(w.startDate).getTime();
      if (w.powerSamples?.length) {
        try {
          const pwSamples = w.powerSamples.map((v, i) => ({
            value: v,
            startDate: new Date(startMs + i * 1000).toISOString(),
            endDate: new Date(startMs + (i + 1) * 1000).toISOString(),
          }));
          await new Promise<void>((resolve) =>
            HK.saveSamples?.(
              "CyclingPower",
              pwSamples,
              () => resolve()
            ) ?? resolve()
          );
        } catch { /* best-effort — bridge may not support CyclingPower */ }
      }
      if (w.hrSamples?.length) {
        try {
          const hrS = w.hrSamples.filter(v => v > 0).map((v, i) => ({
            value: v,
            startDate: new Date(startMs + i * 1000).toISOString(),
            endDate: new Date(startMs + (i + 1) * 1000).toISOString(),
          }));
          await new Promise<void>((resolve) =>
            HK.saveSamples?.(
              "HeartRate",
              hrS,
              () => resolve()
            ) ?? resolve()
          );
        } catch { /* best-effort */ }
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Could not save to Apple Health" };
    }
  }
  if (Platform.OS === "android") {
    const HC = loadHC();
    if (!HC) return { ok: false, error: "unsupported" };
    try {
      await HC.initialize();
      // Build metadata with clientRecordId for deduplication.
      const meta = w.externalUUID
        ? { clientRecordId: w.externalUUID, clientRecordVersion: 1 }
        : undefined;

      const records: any[] = [
        {
          recordType: "ExerciseSession",
          exerciseType: 8 /* BIKING */,
          startTime: w.startDate,
          endTime: w.endDate,
          title: w.title || "Cycling",
          ...(meta ? { metadata: meta } : {}),
        },
        { recordType: "Distance", distance: { unit: "meters", value: w.distanceMeters ?? 0 }, startTime: w.startDate, endTime: w.endDate },
        { recordType: "TotalCaloriesBurned", energy: { unit: "kilocalories", value: w.calories ?? 0 }, startTime: w.startDate, endTime: w.endDate },
      ];

      // Add per-second power samples as PowerRecord entries.
      const startMs = new Date(w.startDate).getTime();
      if (w.powerSamples?.length) {
        for (let i = 0; i < w.powerSamples.length; i++) {
          if (w.powerSamples[i] > 0) {
            records.push({
              recordType: "Power",
              power: { unit: "watts", value: w.powerSamples[i] },
              startTime: new Date(startMs + i * 1000).toISOString(),
              endTime: new Date(startMs + (i + 1) * 1000).toISOString(),
            });
          }
        }
      }
      // Heart rate samples.
      if (w.hrSamples?.length) {
        for (let i = 0; i < w.hrSamples.length; i++) {
          if (w.hrSamples[i] > 0) {
            records.push({
              recordType: "HeartRate",
              samples: [{ beatsPerMinute: w.hrSamples[i], time: new Date(startMs + i * 1000).toISOString() }],
              startTime: new Date(startMs + i * 1000).toISOString(),
              endTime: new Date(startMs + (i + 1) * 1000).toISOString(),
            });
          }
        }
      }

      await HC.insertRecords(records);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Could not save to Health Connect" };
    }
  }
  return { ok: false, error: "unsupported" };
}

// --- import recent cycling workouts from the platform -------------------
export async function importCyclingFromHealth(days = 30): Promise<CyclingWorkout[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  if (Platform.OS === "ios") {
    const HK = loadHK();
    if (!HK) return [];
    return new Promise((resolve) => {
      HK.getSamples(
        { type: "Cycling", startDate: start.toISOString(), endDate: end.toISOString() },
        (err: unknown, rows: any[]) => {
          if (err) return resolve([]);
          resolve(
            (rows ?? []).map((x) => ({
              id: `${x.sourceId || x.id || ""}:${x.start}`,
              startDate: x.start,
              endDate: x.end,
              distanceMeters: typeof x.distance === "number" ? x.distance : undefined,
              calories: x.calories,
              title: x.activityName || "Cycling",
              indoorOutdoor: "outdoor",
              sourceName: x.sourceName,
            }))
          );
        }
      );
    });
  }

  if (Platform.OS === "android") {
    const HC = loadHC();
    if (!HC) return [];
    try {
      await HC.initialize();
      const res = await HC.readRecords("ExerciseSession", {
        timeRangeFilter: { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() },
      });
      return (res?.records ?? [])
        .filter((x: any) => String(x.exerciseType).toLowerCase().includes("bik") || x.exerciseType === 8)
        .map((x: any) => ({
          id: x.metadata?.id,
          startDate: x.startTime,
          endDate: x.endTime,
          title: x.title || "Cycling",
          indoorOutdoor: "outdoor",
          sourceName: x.metadata?.dataOrigin,
        }));
    } catch {
      return [];
    }
  }
  return [];
}
