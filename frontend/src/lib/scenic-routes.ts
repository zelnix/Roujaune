// Scenic Cycling catalog — a DISTINCT experience from the training Virtual
// Routes (`vroutes.ts`). Scenic routes are POV YouTube rides, fully managed by
// admins through the HWG console and served from the backend `scenic_routes`
// collection. This module never hardcodes a catalog — it always reflects what
// admins have published.
import React from "react";

const base = () => (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export type ScenicRoute = {
  id: string;
  name: string;
  place: string;
  country?: string;
  region?: string;
  youtube_id: string;
  duration_min?: number | null;
  distance_km?: number | null;
  elevation_m?: number | null;
  tag: string;
  terrain?: string;
  difficulty?: string;
  surface?: string;
  highlights?: string[];
  thumbnail?: string | null;
  description?: string;
};

export type ScenicLast = {
  available: boolean;
  routeId?: string;
  name?: string;
  place?: string;
  distance_km?: number;
  at?: string;
};

export function ytThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** Live published scenic-route feed. `loading` until the first response;
 *  `routes` is `[]` (never fabricated) when no admin routes exist yet. */
export function useScenicRoutes() {
  const [routes, setRoutes] = React.useState<ScenicRoute[] | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch(`${base()}/api/scenic/routes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => { if (alive) setRoutes(Array.isArray(d?.routes) ? d.routes : []); })
      .catch(() => { if (alive) { setRoutes([]); setError(true); } });
    return () => { alive = false; };
  }, []);

  return { routes, loading: routes === null, error };
}

/** Fetch a single published scenic route by id (for the player screen). */
export function useScenicRoute(id?: string | null) {
  const [route, setRoute] = React.useState<ScenicRoute | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!id) { setLoading(false); setError(true); return; }
    let alive = true;
    setLoading(true);
    fetch(`${base()}/api/scenic/routes/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => { if (alive) { setRoute(d); setLoading(false); } })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  return { route, loading, error };
}

/** The rider's most recent scenic ride, for the "Continue your journey" rail. */
export function useScenicLast() {
  const [last, setLast] = React.useState<ScenicLast | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch(`${base()}/api/scenic/last`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setLast(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return last;
}

/** Log a completed scenic ride to history (workout_id: scenic-<id>) so it stays
 *  separate from training virtual rides and powers "Continue your journey". */
export async function logScenicRide(route: ScenicRoute, elapsedSec: number): Promise<void> {
  try {
    await fetch(`${base()}/api/workouts/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workout: `Scenic Ride · ${route.name}`,
        workout_id: `scenic-${route.id}`,
        route: {
          id: route.id,
          name: route.name,
          place: route.place,
          distance: route.distance_km ? `${route.distance_km} km` : "",
          elevation: route.elevation_m ? `${route.elevation_m} m` : "",
          tag: route.tag,
        },
        elapsed: Math.max(0, Math.round(elapsedSec)),
        manual: {
          duration_sec: Math.max(0, Math.round(elapsedSec)),
          distance_km: route.distance_km ?? 0,
          elevation_m: route.elevation_m ?? 0,
          rpe: 3,
        },
      }),
    });
  } catch {
    /* history save is best-effort — never blocks the rider */
  }
}
