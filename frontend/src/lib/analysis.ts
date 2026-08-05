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

export type ClimbAttempt = { activity_id: string; name: string; date: string; time_s: number | null; avg_speed_kmh: number | null; pr: boolean; gap_s: number | null };
export type ClimbEntry = { id: string; name: string; gain_m: number; length_m: number; grad_pct: number | null; count: number; attempts: ClimbAttempt[] };
export type FormTarget = { has_event: boolean; event_date?: string; event_name?: string; days_out?: number; past?: boolean; projected_form?: number; projected_fitness?: number; state?: string; fresh?: boolean; current_form?: number; current_fitness?: number };
export type WeeklyNote = { note: string; focus: string; has_activity: boolean };

export async function fetchPmc(days = 90, forecastDays = 14): Promise<Pmc | null> {
  const r = await fetch(`${API}/analysis/pmc?days=${days}&forecast_days=${forecastDays}`);
  return r.ok ? await r.json() : null;
}

export async function fetchClimbLeaderboard(): Promise<{ climbs: ClimbEntry[]; has_data: boolean }> {
  const r = await fetch(`${API}/analysis/climb-leaderboard`);
  return r.ok ? await r.json() : { climbs: [], has_data: false };
}

export async function fetchEvent(): Promise<{ event_date: string | null; event_name: string | null }> {
  const r = await fetch(`${API}/analysis/event`);
  return r.ok ? await r.json() : { event_date: null, event_name: null };
}

export async function saveEvent(event_date: string | null, event_name: string | null) {
  await fetch(`${API}/analysis/event`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_date, event_name }),
  });
}

export async function fetchFormTarget(): Promise<FormTarget | null> {
  const r = await fetch(`${API}/analysis/form-target`);
  return r.ok ? await r.json() : null;
}

export async function fetchWeeklyNote(coachName: string, coachGender: string, refresh = false): Promise<WeeklyNote | null> {
  const r = await fetch(`${API}/coach/weekly-note?coach_name=${encodeURIComponent(coachName)}&coach_gender=${coachGender}&refresh=${refresh}`);
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
