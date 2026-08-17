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
  elevation_profile?: { km: number; grade: number }[];
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

export type ScenicPoi = {
  order: number;
  at_pct: number;
  title: string;
  description: string;
  narration: string;
  image?: string | null;
};

/** LLM-generated points of interest for a route (cached backend-side). The HUD
 *  surfaces the next uncompleted POI as the ride progresses. */
export function useScenicPois(id?: string | null) {
  const [pois, setPois] = React.useState<ScenicPoi[] | null>(null);
  React.useEffect(() => {
    if (!id) { setPois([]); return; }
    let alive = true;
    setPois(null);
    fetch(`${base()}/api/scenic/routes/${encodeURIComponent(id)}/pois`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => { if (alive) setPois(Array.isArray(d?.pois) ? d.pois : []); })
      .catch(() => { if (alive) setPois([]); });
    return () => { alive = false; };
  }, [id]);
  return { pois: pois ?? [], loading: pois === null };
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
          country: route.country || "",
          youtube_id: route.youtube_id,
          distance: route.distance_km ? `${route.distance_km} km` : "",
          elevation: route.elevation_m ? `${route.elevation_m} m` : "",
          elevation_m: route.elevation_m ?? null,
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

// ── Discoveries (rider-saved points of interest) ────────────────────────────
export type ScenicDiscovery = {
  id: string;
  route_id: string;
  route_name?: string;
  place?: string;
  poi_order?: number | null;
  at_pct?: number | null;
  title: string;
  description?: string;
  narration?: string;
  photo?: string | null;
  at?: string;
};

/** Save a bookmarked POI as a discovery. Idempotent per route+poi_order. */
export async function saveDiscovery(d: {
  route_id: string; route_name?: string; place?: string; poi_order?: number;
  at_pct?: number; title: string; description?: string; narration?: string; photo?: string | null;
}): Promise<ScenicDiscovery | null> {
  try {
    const r = await fetch(`${base()}/api/scenic/discoveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.discovery ?? null;
  } catch { return null; }
}

export async function fetchDiscoveries(routeId?: string): Promise<ScenicDiscovery[]> {
  try {
    const q = routeId ? `?route_id=${encodeURIComponent(routeId)}` : "";
    const r = await fetch(`${base()}/api/scenic/discoveries${q}`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.discoveries) ? j.discoveries : [];
  } catch { return []; }
}

/** All of the rider's saved discoveries (the scrapbook), newest first. */
export function useAllDiscoveries() {
  const [discoveries, setDiscoveries] = React.useState<ScenicDiscovery[] | null>(null);
  const load = React.useCallback(() => {
    fetchDiscoveries().then((d) => setDiscoveries(d));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { discoveries: discoveries ?? [], loading: discoveries === null, reload: load };
}

export async function deleteDiscovery(id: string): Promise<void> {
  try { await fetch(`${base()}/api/scenic/discoveries/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* best effort */ }
}

export async function updateDiscovery(id: string, patch: { title?: string; description?: string; narration?: string }): Promise<ScenicDiscovery | null> {
  try {
    const r = await fetch(`${base()}/api/scenic/discoveries/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.discovery ?? null;
  } catch { return null; }
}

// ── Journeys (completed scenic rides + saved discoveries) ────────────────────
export type ScenicJourney = {
  id: string;
  routeId: string;
  name: string;
  place?: string;
  country?: string;
  tag?: string;
  elevation_m?: number | null;
  distance_km?: number | string | null;
  duration_sec?: number | null;
  at?: string;
  thumbnail?: string | null;
  cover?: string | null;
  discoveries: ScenicDiscovery[];
};

/** Choose a saved discovery photo as a ride's recap cover (null = default). */
export async function setRecapCover(rideId: string, photo: string | null): Promise<void> {
  try {
    await fetch(`${base()}/api/scenic/journeys/${encodeURIComponent(rideId)}/cover`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo }),
    });
  } catch { /* best effort */ }
}

/** The rider's completed scenic rides joined with their saved discoveries,
 *  newest first — powers the shareable ride recap under Journeys. */
export function useScenicJourneys() {
  const [journeys, setJourneys] = React.useState<ScenicJourney[] | null>(null);
  const load = React.useCallback(() => {
    fetch(`${base()}/api/scenic/journeys`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setJourneys(Array.isArray(d?.journeys) ? d.journeys : []))
      .catch(() => setJourneys([]));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { journeys: journeys ?? [], loading: journeys === null, reload: load };
}

// ── Saved Destinations (favourites) — reactive per-rider store ───────────────
let favIds = new Set<string>();
let favHydrated = false;
const favListeners = new Set<() => void>();
const favEmit = () => favListeners.forEach((l) => l());

async function hydrateFavourites() {
  try {
    const r = await fetch(`${base()}/api/scenic/favourites`);
    if (!r.ok) return;
    const d = await r.json();
    favIds = new Set<string>(Array.isArray(d?.ids) ? d.ids : []);
    favEmit();
  } catch { /* keep current */ }
}

/** Called on login/session-restore to load the rider's saved destinations. */
export function refreshScenicFavourites() {
  favHydrated = true;
  hydrateFavourites();
}

/** Called on logout so one rider's saves never leak to the next. */
export function resetScenicFavourites() {
  favHydrated = false;
  favIds = new Set<string>();
  favEmit();
}

/** Toggle a destination in/out of the rider's saved list (optimistic). */
export async function toggleFavourite(routeId: string): Promise<void> {
  const wasFav = favIds.has(routeId);
  const next = new Set(favIds);
  if (wasFav) next.delete(routeId); else next.add(routeId);
  favIds = next;
  favEmit();
  try {
    await fetch(`${base()}/api/scenic/favourites/${encodeURIComponent(routeId)}`, {
      method: wasFav ? "DELETE" : "POST",
    });
  } catch {
    // revert on failure
    const revert = new Set(favIds);
    if (wasFav) revert.add(routeId); else revert.delete(routeId);
    favIds = revert;
    favEmit();
  }
}

/** Reactive favourites hook — { has(id), toggle(id), count, ids }. */
export function useScenicFavourites() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    if (!favHydrated) refreshScenicFavourites();
    const l = () => force();
    favListeners.add(l);
    return () => { favListeners.delete(l); };
  }, []);
  return {
    ids: favIds,
    count: favIds.size,
    has: (id: string) => favIds.has(id),
    toggle: toggleFavourite,
  };
}

/** The rider's full saved destinations (published routes), newest saved first. */
export function useSavedDestinations() {
  const [routes, setRoutes] = React.useState<ScenicRoute[] | null>(null);
  const fav = useScenicFavourites();
  const load = React.useCallback(() => {
    fetch(`${base()}/api/scenic/favourites`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setRoutes(Array.isArray(d?.routes) ? d.routes : []))
      .catch(() => setRoutes([]));
  }, []);
  React.useEffect(() => { load(); }, [load, fav.count]);
  return { routes, loading: routes === null };
}
