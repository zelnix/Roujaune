// Shared types for bidirectional health sync (Apple Health / Health Connect).
export type HealthPlatform = "apple_health" | "health_connect" | "none";

// undetermined = never asked; blocked = denied and the OS won't prompt again
// (must be changed in Settings); unsupported = web / Expo Go / no module.
export type PermissionState =
  | "granted" | "denied" | "blocked" | "undetermined" | "unsupported";

export type CyclingWorkout = {
  id?: string;
  /** Backend-generated UUID — used for deduplication (HKMetadataKeyExternalUUID
   *  on iOS, clientRecordId on Android Health Connect). */
  externalUUID?: string;
  startDate: string;   // ISO 8601
  endDate: string;     // ISO 8601
  durationSec?: number;
  distanceMeters?: number;
  calories?: number;
  avgHr?: number;
  avgPower?: number;
  title?: string;
  indoorOutdoor?: "indoor" | "outdoor";
  sourceName?: string;
  /** Raw 1-second power samples (W) — written as time-series to HealthKit/HC. */
  powerSamples?: number[];
  /** Raw 1-second cadence samples (RPM). */
  cadenceSamples?: number[];
  /** Raw 1-second heart rate samples (BPM). */
  hrSamples?: number[];
};

export type PermissionResult = { state: PermissionState; canAskAgain: boolean };
