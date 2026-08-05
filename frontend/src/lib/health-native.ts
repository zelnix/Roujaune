/**
 * health-native — WEB / Expo Go fallback.
 *
 * Apple Health (HealthKit) and Android Health Connect are on-device native
 * modules that are NOT linked in Expo Go or the web preview. Metro automatically
 * picks `health-native.native.ts` on real iOS/Android builds; here every call is
 * a safe no-op so the preview never crashes.
 */
import type { CyclingWorkout, HealthPlatform, PermissionResult, PermissionState } from "./health-types";

export const HEALTH_PLATFORM: HealthPlatform = "none";
export const healthNativeAvailable = false;

export async function checkHealthPermissions(): Promise<PermissionState> {
  return "unsupported";
}

export async function requestHealthPermissions(): Promise<PermissionResult> {
  return { state: "unsupported", canAskAgain: false };
}

export async function pushWorkoutToHealth(_w: CyclingWorkout): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "Health sync requires the iOS or Android app." };
}

export async function importCyclingFromHealth(_days: number): Promise<CyclingWorkout[]> {
  return [];
}
