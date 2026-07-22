import type { CastApi } from "./useCast";

// Web has no native Google Cast module — the workout screen falls back to the
// simulated cast sheet. (Browser-native casting is available via Chrome.)
export function useCast(): CastApi {
  return { castSupported: false, castDeviceName: null, showCastDialog: () => {}, stopCast: () => {} };
}
