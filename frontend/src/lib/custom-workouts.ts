// Rider-authored custom workouts. Persisted server-side in the rider's catalog
// (rider_workouts) so they behave exactly like bundled workouts: viewable,
// schedulable and playable via getWorkout()/buildSegments().
import { loadCatalog } from "./catalog";
import type { Workout, Zone, SegSpec } from "./workout-catalog";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

// Ordered zone palette (matches workout-catalog Z1–Z6).
export const ZONE_META: { label: string; color: string; defaultPct: number }[] = [
  { label: "Z1 · Recovery", color: "#A7A8A5", defaultPct: 0.5 },
  { label: "Z2 · Endurance", color: "#40A9C6", defaultPct: 0.65 },
  { label: "Z3 · Tempo", color: "#55C850", defaultPct: 0.8 },
  { label: "Z4 · Threshold", color: "#FFC20A", defaultPct: 0.95 },
  { label: "Z5 · VO2 Max", color: "#E8631C", defaultPct: 1.12 },
  { label: "Z6 · Anaerobic", color: "#C91727", defaultPct: 1.35 },
];

const DIFF_COLOR: Record<string, string> = {
  Easy: "#55C850", Moderate: "#40A9C6", Hard: "#F0A500", "Very Hard": "#C91727",
};

export type BuilderSegment = { label: string; zoneIdx: number; minutes: number; targetPct: number };

/** Estimate duration (min), TSS and IF from an ordered segment list. */
export function estimateLoad(segs: BuilderSegment[]) {
  const duration = segs.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const weighted = segs.reduce((a, s) => a + (Number(s.minutes) || 0) * Math.pow(Number(s.targetPct) || 0, 2), 0);
  const iff = duration > 0 ? Math.sqrt(weighted / duration) : 0;
  const tss = Math.round((weighted / 60) * 100);
  const zoneMin = [0, 0, 0, 0, 0, 0];
  segs.forEach((s) => { zoneMin[s.zoneIdx] = (zoneMin[s.zoneIdx] || 0) + (Number(s.minutes) || 0); });
  const zones: Zone[] = ZONE_META.map((z, i) => ({
    label: `Z${i + 1}`, color: z.color,
    pct: duration > 0 ? Math.round((zoneMin[i] / duration) * 100) : 0,
  }));
  return { duration, tss, if: Math.round(iff * 100) / 100, zones };
}

export function difficultyFromIF(iff: number): Workout["difficulty"] {
  if (iff >= 0.95) return "Very Hard";
  if (iff >= 0.85) return "Hard";
  if (iff >= 0.7) return "Moderate";
  return "Easy";
}

export type CreateInput = { name: string; description?: string; focus?: string; segments: BuilderSegment[] };

export async function createCustomWorkout(input: CreateInput): Promise<Workout | null> {
  const { duration, tss, if: iff, zones } = estimateLoad(input.segments);
  const difficulty = difficultyFromIF(iff);
  const segmentSpec: SegSpec[] = input.segments.map((s) => ({
    label: s.label, zoneIdx: s.zoneIdx, minutes: s.minutes, targetPct: s.targetPct,
  }));
  const payload = {
    name: input.name.trim(), typeId: "custom", typeName: "Custom", icon: "construct-outline",
    color: DIFF_COLOR[difficulty], duration, tss, if: iff, difficulty,
    description: input.description?.trim() || "Custom-built session.",
    focus: input.focus?.trim() || "Custom", zones, segmentSpec,
  };
  try {
    const res = await fetch(`${apiBase()}/api/catalog`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const d = await res.json();
    await loadCatalog();
    return d.workout as Workout;
  } catch {
    return null;
  }
}

export async function listCustomWorkouts(): Promise<Workout[]> {
  try {
    const res = await fetch(`${apiBase()}/api/catalog`);
    if (!res.ok) return [];
    const d = await res.json();
    return ((d.items as any[]) || []).filter((w) => w && w.custom);
  } catch {
    return [];
  }
}

export async function deleteCustomWorkout(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(id)}/reset`, { method: "DELETE" });
    if (res.ok) { await loadCatalog(); return true; }
  } catch {}
  return false;
}
