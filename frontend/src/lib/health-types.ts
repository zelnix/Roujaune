// Shared types for bidirectional health sync (Apple Health / Health Connect).
export type HealthPlatform = "apple_health" | "health_connect" | "none";

// undetermined = never asked; blocked = denied and the OS won't prompt again
// (must be changed in Settings); unsupported = web / Expo Go / no module.
export type PermissionState =
  | "granted" | "denied" | "blocked" | "undetermined" | "unsupported";

export type CyclingWorkout = {
  id?: string;
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
};

export type PermissionResult = { state: PermissionState; canAskAgain: boolean };
