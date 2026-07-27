import { useCallback, useEffect, useMemo, useState } from "react";
import { rideRecorder, RideRoute } from "./ride";
import { getCoach, COACHES } from "./coach-persona";
import { getWorkout, buildSegments, targetWatts } from "./workout-catalog";

export type Zone = { z: string; time: string; pct: number; w: number };

export type SummaryStats = {
  computed: boolean;
  manual?: boolean;
  id?: string | null;
  duration_sec: number;
  distance_km: number;
  elevation_m: number;
  avg_power: number;
  norm_power: number;
  avg_cadence: number;
  avg_hr: number;
  max_hr: number;
  calories: number;
  tss: number;
  intensity: number;
  power_curve: number[];
  power_target: number;
  power_max_axis: number;
  hr_curve: number[];
  hr_max_axis: number;
  zones: Zone[];
  compliance: { overall: number; power: number; cadence: number; zone4_min: number; completed: number };
};

// Fallback (mirrors backend REFERENCE_SUMMARY) so the screen always renders.
export const FALLBACK_STATS: SummaryStats = {
  computed: false,
  duration_sec: 3600,
  distance_km: 23.7,
  elevation_m: 1050,
  avg_power: 248,
  norm_power: 251,
  avg_cadence: 89,
  avg_hr: 148,
  max_hr: 172,
  calories: 622,
  tss: 92,
  intensity: 0.87,
  power_curve: [210, 358, 372, 376, 360, 352, 366, 372, 360, 300, 214],
  power_target: 250,
  power_max_axis: 400,
  hr_curve: [96, 108, 122, 134, 141, 145, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162],
  hr_max_axis: 180,
  zones: [
    { z: "Z1", time: "0:02:15", pct: 6, w: 0.16 },
    { z: "Z2", time: "0:05:30", pct: 15, w: 0.42 },
    { z: "Z3", time: "0:08:45", pct: 24, w: 0.68 },
    { z: "Z4", time: "0:22:00", pct: 36, w: 1.0 },
    { z: "Z5", time: "0:05:30", pct: 9, w: 0.25 },
  ],
  compliance: { overall: 96, power: 96, cadence: 91, zone4_min: 36, completed: 100 },
};

// Static presentation content (design mock).
export const summaryContent = {
  title: "Threshold Climb",
  date: "Wednesday, 12 May 2025",
  headline: "Strong ride.",
  subhead: "You held your threshold well.",
  recapTitle: "Alberto's recap",
  recap: "You completed all 6 steps and stayed close to target power. Your climbing control is improving.",
  callout: "ALLEZ\nOOP!!",
  route: {
    name: "Alpe d'Huez",
    stat: "16.0 km  •  1,090 m climb",
    status: "Route Completed",
    low: "720 m",
    high: "1,810 m",
    saved: "Saved to History",
  },
  achievements: [
    { icon: "medal", color: "#E8631C", title: "Climber", detail: "Badge Earned", badge: true },
    { icon: "trending-up", color: "#F5B301", title: "Best 20-min power", detail: "+6W vs last threshold workout" },
    { icon: "flame", color: "#E01E2B", title: "Consistency streak", detail: "4 rides this week" },
  ],
  recovery: {
    score: 78,
    recTitle: "Recommendation",
    rec: "Recovery ride or mobility tomorrow",
    items: [
      { icon: "body", label: "FB50 Recommendation", value: "Post-Ride Mobility  •  10 min", chevron: true },
      { icon: "bicycle", label: "Recovery ride", value: "Easy spin tomorrow  •  30 min", chevron: true },
    ],
  },
  sync: [
    { key: "strava", label: "Strava", status: "Synced", icon: "logo-strava" },
    { key: "garmin", label: "Garmin Connect", status: "Synced", icon: "sync-circle" },
    { key: "apple", label: "Apple Health", status: "Synced", icon: "heart" },
  ],
};

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/* ============================ INTERVAL TARGET COMPLIANCE ============================ */
// Scores the rider's actual power against each segment's target (built from the
// same catalog segments + FTP that drove the live HUD).
export type IntervalScore = {
  label: string;
  zoneLabel: string;
  color: string;
  targetW: number;
  avgW: number | null;      // null when no telemetry was recorded for this segment
  avgHr: number | null;     // avg heart rate over the segment (null when none)
  compliance: number | null; // % of segment time within ±8% of target
  durationSec: number;
};

export type IntervalResult = { intervals: IntervalScore[]; overall: number | null; hasData: boolean; ftp: number };

export function computeIntervals(): IntervalResult {
  const rec = rideRecorder.snapshot();
  const w = getWorkout(rec.workoutId) ?? getWorkout("threshold-climb");
  if (!w) return { intervals: [], overall: null, hasData: false, ftp: rec.ftp || 287 };
  const segs = buildSegments(w);
  const ftp = rec.ftp || 287;
  const bias = rec.zoneBias || {};
  const samples = rec.samples;
  const total = segs.reduce((a, s) => a + s.durationSec, 0);
  const n = samples.length;
  // Samples are recorded across the ACTUAL ride time (elapsed), not the planned
  // total — so a ride that ended early only scores the segments it reached; the
  // rest are shown as "not ridden".
  const ridden = rec.elapsed > 0 ? rec.elapsed : total;
  const hasData = n > 5 && ridden > 0;

  const intervals: IntervalScore[] = [];
  let compAcc = 0;
  let compN = 0;
  let acc = 0;
  for (const s of segs) {
    const tW = targetWatts(s, ftp, bias);
    let avgW: number | null = null;
    let avgHr: number | null = null;
    let compliance: number | null = null;
    const segStart = acc;
    const segEnd = acc + s.durationSec;
    if (hasData && s.durationSec > 0 && tW > 0 && segStart < ridden) {
      const covEnd = Math.min(segEnd, ridden);
      const i0 = Math.floor((segStart / ridden) * n);
      const i1 = Math.max(i0 + 1, Math.ceil((covEnd / ridden) * n));
      const slice = samples.slice(i0, i1);
      if (slice.length) {
        avgW = Math.round(slice.reduce((a, x) => a + x.power, 0) / slice.length);
        const hrs = slice.filter((x) => x.hr > 0);
        avgHr = hrs.length ? Math.round(hrs.reduce((a, x) => a + x.hr, 0) / hrs.length) : null;
        const inBand = slice.filter((x) => Math.abs(x.power - tW) <= tW * 0.08).length;
        compliance = Math.round((inBand / slice.length) * 100);
        compAcc += compliance;
        compN += 1;
      }
    }
    intervals.push({ label: s.label, zoneLabel: s.zoneLabel, color: s.color, targetW: tW, avgW, avgHr, compliance, durationSec: s.durationSec });
    acc += s.durationSec;
  }
  return { intervals, overall: compN ? Math.round(compAcc / compN) : null, hasData, ftp };
}

/** Memoised interval scores for the summary screen. */
export function useIntervals(): IntervalResult {
  return useMemo(() => computeIntervals(), []);
}

/** Fetch computed ride aggregates from the backend, falling back to the
 * polished reference dataset on any error or when no ride was recorded. */
export function useSummary() {
  const [stats, setStats] = useState<SummaryStats>(FALLBACK_STATS);
  const [loading, setLoading] = useState(true);
  const [route] = useState<RideRoute>(() => rideRecorder.snapshot().route);
  const [adjustments] = useState<{ t: string; label: string }[]>(() => rideRecorder.snapshot().adjustments);
  const [needsManual, setNeedsManual] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordedElapsed] = useState<number>(() => rideRecorder.snapshot().elapsed);

  const post = useCallback(async (manual?: Record<string, any>) => {
    const rec = rideRecorder.snapshot();
    setLoading(true);
    try {
      const res = await fetch(`${apiBase()}/api/workouts/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workout: rec.workout,
          workout_id: rec.workoutId,
          route: rec.route,
          elapsed: rec.elapsed,
          ftp: rec.ftp,
          samples: manual ? [] : rec.samples,
          manual: manual ?? null,
          est_calories: rec.estCalories ?? 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SummaryStats;
      setStats(data);
      setNeedsManual(false);
      setSaved(true);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const rec = rideRecorder.snapshot();
    const powers = rec.samples.filter((s) => s.power && s.power > 0);
    const hasData = rec.samples.length >= 30 && powers.length > 0;
    if (!hasData) {
      // No telemetry captured from the smart trainer / wearables — prompt the
      // rider to enter their ride data manually instead of showing demo values.
      if (alive) {
        setNeedsManual(true);
        setLoading(false);
      }
      return () => { alive = false; };
    }
    post();
    return () => { alive = false; };
  }, [post]);

  return { stats, loading, route, adjustments, needsManual, saved, recordedElapsed, submitManual: (fields: Record<string, any>) => post(fields) };
}

/** Fetch Alberto's AI post-ride debrief once the ride stats are computed.
 * Falls back to the static recap text while loading or on any error. */
export function useCoachDebrief(stats: SummaryStats, route: RideRoute) {
  const [debrief, setDebrief] = useState<string>(summaryContent.recap);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const rec = rideRecorder.snapshot();
    const persona = COACHES[getCoach()];
    const { intervals, overall } = computeIntervals();
    // Only send segments we actually measured, capped to keep the prompt tight.
    const measured = intervals
      .filter((i) => i.avgW != null && i.targetW > 0)
      .slice(0, 12)
      .map((i) => ({ label: i.label, zone: i.zoneLabel, sec: i.durationSec, targetW: i.targetW, avgW: i.avgW, compliance: i.compliance }));
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/coach/debrief`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ride_id: stats.id ?? null,
            workout: rec.workout || summaryContent.title,
            route: route?.name ?? rec.route ?? null,
            duration_sec: stats.duration_sec,
            distance_km: stats.distance_km,
            elevation_m: stats.elevation_m,
            avg_power: stats.avg_power,
            norm_power: stats.norm_power,
            power_target: stats.power_target,
            avg_cadence: stats.avg_cadence,
            avg_hr: stats.avg_hr,
            max_hr: stats.max_hr,
            calories: stats.calories,
            tss: stats.tss,
            intensity: stats.intensity,
            compliance: stats.compliance?.overall ?? 0,
            interval_compliance: overall ?? 0,
            intervals: measured,
            extended_min: rec.extendedMin ?? 0,
            adjustments: (rec.adjustments ?? []).slice(0, 12).map((a) => `${a.t} ${a.label}`),
            zones: stats.zones?.map((z) => ({ z: z.z, pct: z.pct })) ?? [],
            coach_name: persona.name,
            coach_gender: persona.gender,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = (data?.debrief ?? "").toString().trim();
        if (alive && text) setDebrief(text);
      } catch {
        /* keep fallback recap */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.duration_sec, stats.avg_power, stats.tss]);

  return { debrief, loading };
}

// ---- formatting helpers ----
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
