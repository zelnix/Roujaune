// Personal-record tracker for scenic routes. Records per-checkpoint split times
// as the rider progresses along a route, then submits the finished ride to the
// backend which compares it against the rider's stored records:
//   • fastest completion time   → primary PR ("Best Time")
//   • highest average power      → secondary badge
//   • fastest split per checkpoint → segment/stage PRs
// The backend returns which records were beaten so the UI can celebrate them.
import { VRoute } from "./vroutes";

export type PRSplit = { label: string; km: number; time_sec: number };
export type PRRecords = {
  route_time: boolean;
  route_power: boolean;
  segments: string[];
  first_time: boolean;
};
export type PRSummary = { best_time_sec: number | null; best_avg_power: number | null; segments?: Record<string, { best_time_sec: number; km: number }> };

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

let route: VRoute | null = null;
let splits: Record<string, PRSplit> = {};

export const prTracker = {
  reset(r: VRoute | null) {
    route = r;
    splits = {};
  },
  /** Record a split the first time the rider crosses each checkpoint.
   *  `progress` is 0..1 along the route; `elapsedSec` is ride time so far. */
  mark(progress: number, elapsedSec: number) {
    if (!route || !isFinite(progress) || elapsedSec <= 0) return;
    for (const c of route.checkpoints) {
      const frac = route.distanceKm > 0 ? c.km / route.distanceKm : 1;
      if (progress + 1e-4 >= frac && !splits[c.label]) {
        splits[c.label] = { label: c.label, km: c.km, time_sec: Math.round(elapsedSec) };
      }
    }
  },
  /** Submit the finished ride and return which records were set (or null). */
  async submit(opts: { avgPower: number; timeSec: number; completed: boolean }): Promise<PRRecords | null> {
    if (!route) return null;
    // Ensure the final checkpoint is captured on a completed ride.
    if (opts.completed) this.mark(1, opts.timeSec);
    try {
      const res = await fetch(`${BASE}/api/rider/prs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: route.id,
          route_name: route.name,
          time_sec: Math.round(opts.timeSec),
          avg_power: Math.round(opts.avgPower),
          completed: opts.completed,
          splits: Object.values(splits),
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data?.records ?? null) as PRRecords | null;
    } catch {
      return null;
    }
  },
};

/** Fetch the stored PR summary for a route (best time + best power + segments). */
export async function fetchRoutePR(routeId: string): Promise<PRSummary | null> {
  try {
    const res = await fetch(`${BASE}/api/rider/prs/${routeId}`);
    if (!res.ok) return null;
    return (await res.json()) as PRSummary;
  } catch {
    return null;
  }
}

/** Fetch every stored route PR keyed by route id (for the route picker chips). */
export async function fetchAllRoutePRs(): Promise<Record<string, PRSummary>> {
  try {
    const res = await fetch(`${BASE}/api/rider/prs`);
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, PRSummary> = {};
    for (const p of (data?.prs ?? [])) if (p?.id) map[p.id] = p;
    return map;
  } catch {
    return {};
  }
}

/** Human toast lines celebrating whatever records were beaten this ride. */
export function prToastMessages(records: PRRecords | null, routeName: string): string[] {
  if (!records) return [];
  const msgs: string[] = [];
  if (records.route_time) msgs.push(`New record! Fastest time on ${routeName}.`);
  else if (records.first_time) msgs.push(`${routeName} logged — your first record to chase!`);
  if (records.route_power) msgs.push(`New power PR — strongest ride yet on ${routeName}.`);
  if (records.segments && records.segments.length) {
    const seg = records.segments.slice(0, 2).join(" · ");
    msgs.push(`Segment record: ${seg}${records.segments.length > 2 ? " +more" : ""}.`);
  }
  return msgs;
}

export function fmtPRTime(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
