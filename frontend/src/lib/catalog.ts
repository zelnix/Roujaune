// Loads the rider's effective workout catalog from the backend into the
// in-memory cache. The global `fetch` patch (src/lib/session.ts) attaches the
// bearer token to /api/* calls, so no auth wiring is needed here.
import { setCatalogCache } from "./catalog-cache";
import type { Workout } from "./workout-catalog";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export async function loadCatalog(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/catalog`);
    if (!res.ok) return false;
    const data = await res.json();
    if (Array.isArray(data?.items)) {
      setCatalogCache(data.items as Workout[]);
      return true;
    }
  } catch {
    // Offline / unauthenticated — bundled catalog remains the fallback.
  }
  return false;
}

// Assign a workout to the current rider (creates their own editable copy).
export async function assignWorkout(workoutId: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(workoutId)}/assign`, { method: "POST" });
    if (res.ok) { await loadCatalog(); return true; }
  } catch {}
  return false;
}
