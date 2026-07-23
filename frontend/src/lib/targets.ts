// Adaptive per-zone target bias, set by the backend adaptation engine based on
// how the rider executes their intervals (overshoot → harder, fade → easier).

export type ZoneBias = Record<string, number>;

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/** Fetch the current adaptive zone-target bias. Returns {} on any error so the
 * live HUD simply falls back to the plain FTP × zone% targets. */
export async function fetchZoneBias(planId = "build-and-climb"): Promise<ZoneBias> {
  try {
    const res = await fetch(`${apiBase()}/api/plan/targets?plan_id=${planId}`);
    if (!res.ok) return {};
    const data = await res.json();
    return (data?.zone_bias as ZoneBias) ?? {};
  } catch {
    return {};
  }
}
