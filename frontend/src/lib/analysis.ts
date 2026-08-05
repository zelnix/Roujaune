/** Aggregate analysis API: PMC (Fitness/Fatigue/Form) + Form Forecast, weekly
 * digest, all-time power records, and GPS segment (climb) comparison. */
import Constants from "expo-constants";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL
  || (Constants.expoConfig?.extra as any)?.backendUrl || "") + "/api";

export type PmcPoint = { date: string; ctl: number; atl: number; tsb: number; tss: number; projected?: boolean };
export type Pmc = {
  series: PmcPoint[];
  fitness: number; fatigue: number; form: number;
  ramp_rate: number; form_state: string; weekly_tss: number;
  forecast: PmcPoint[];
  forecast_fitness: number; forecast_form: number; forecast_state: string;
  projected_daily_tss: number;
};
export type PowerRecord = { secs: number; label: string; watts: number | null; activity_id?: string; name?: string; date?: string };

export type WeeklyDigest = {
  week_start: string;
  this_week: { tss: number; hours: number; rides: number; distance_km: number };
  deltas: { tss: number; hours: number; rides: number; distance_km: number };
  new_records: { secs: number; label: string; watts: number; prev: number | null; name: string; activity_id?: string }[];
  has_activity: boolean;
};

export type SegmentPoint = { f: number; d: number; ele: number; t: number; speed: number | null };
export type SegmentRide = { time_s: number | null; avg_speed_kmh: number | null; series: SegmentPoint[] };
export type MatchedSegment = {
  gain_m: number; length_m: number; length_m_a: number; length_m_b: number; grad_pct: number | null;
  a: SegmentRide; b: SegmentRide; delta_s: number; faster: "a" | "b" | "tie";
};
export type SegmentCompare = {
  matched: boolean; segments: MatchedSegment[];
  a_name: string; b_name: string; reason: string | null;
};

export async function fetchPmc(days = 90, forecastDays = 14): Promise<Pmc | null> {
  const r = await fetch(`${API}/analysis/pmc?days=${days}&forecast_days=${forecastDays}`);
  return r.ok ? await r.json() : null;
}

export async function fetchRecords(): Promise<{ records: PowerRecord[]; has_data: boolean }> {
  const r = await fetch(`${API}/analysis/records`);
  return r.ok ? await r.json() : { records: [], has_data: false };
}

export async function fetchWeeklyDigest(): Promise<WeeklyDigest | null> {
  const r = await fetch(`${API}/analysis/weekly-digest`);
  return r.ok ? await r.json() : null;
}

export async function fetchSegmentCompare(a: string, b: string): Promise<SegmentCompare | null> {
  const r = await fetch(`${API}/analysis/segment-compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  return r.ok ? await r.json() : null;
}
