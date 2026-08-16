/** Aggregate analysis API: PMC (Fitness/Fatigue/Form) + Form Forecast, weekly
 * digest, all-time power records, and GPS segment (climb) comparison. */
const API = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";

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
export type ClimbEntry = { id: string; name: string; gain_m: number; length_m: number; grad_pct: number | null; count: number; path: [number, number][]; new_pr: boolean; pr_improvement_s: number | null; attempts: ClimbAttempt[] };
export type Streak = { current_weeks: number; best_weeks: number; this_week_rides: number; active: boolean; weeks_ridden: number; at_risk: boolean; days_left: number; weekday: number; freeze_tokens: number; frozen_weeks: number; can_freeze: boolean; suggest_freeze: boolean; gap_week: string };
export type TaperNote = { has_event: boolean; fresh?: boolean; days_out?: number; projected_form?: number; note?: string; actions?: string[] };
export type TaperApply = { applied: boolean; week?: number; reason?: string; already?: boolean; summary?: string | null };
export type Milestones = { total_rides: number; total_km: number; total_hours: number; total_tss: number; recent: { kind: string; label: string; value: number; blurb: string } | null; next_rides: number | null; rides_to_next: number | null; prev_rides: number; rides_progress: number; next_km: number | null; km_to_next: number | null; prev_km: number; km_progress: number };
export type MilestoneNote = { has_milestone: boolean; label?: string; note?: string };
export type ClimbSplit = { index: number; from_d: number; to_d: number; times: Record<string, number>; fastest: string | null };
export type SplitPr = { index: number; from_d: number; to_d: number; time_s: number | null };
export type SeasonRecap = { year: number; rides: number; distance_km: number; hours: number; tss: number; climbs_conquered: number; biggest_climb_m: number; longest_ride_km: number; records_set: number; has_data: boolean };
export type MilestoneWallRow = { value: number; label: string; reached: boolean };
export type MilestoneWallCategory = { key: string; title: string; icon: string; current: number; rows: MilestoneWallRow[] };
export type MilestoneWall = { categories: MilestoneWallCategory[]; earned: number; total: number };
export type ClimbDetailPoint = { d: number; ele?: number; speed?: number | null; t?: number };
export type ClimbDetailAttempt = { activity_id: string; name: string; date: string; time_s: number | null; avg_speed_kmh: number | null; pr: boolean; gap_s: number | null; series: ClimbDetailPoint[] };
export type ClimbDetail = { found: boolean; id?: string; name?: string; gain_m?: number; length_m?: number; grad_pct?: number | null; count?: number; path?: [number, number][]; profile?: ClimbDetailPoint[]; splits?: ClimbSplit[]; recent_split_prs?: SplitPr[]; recent_activity_id?: string; attempts?: ClimbDetailAttempt[] };
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

export async function fetchStreak(): Promise<Streak | null> {
  const r = await fetch(`${API}/analysis/streak`);
  return r.ok ? await r.json() : null;
}

export async function fetchTaperNote(coachName: string, coachGender: string, refresh = false): Promise<TaperNote | null> {
  const r = await fetch(`${API}/coach/taper-note?coach_name=${encodeURIComponent(coachName)}&coach_gender=${coachGender}&refresh=${refresh}`);
  return r.ok ? await r.json() : null;
}

export async function applyTaper(coachName: string): Promise<TaperApply | null> {
  const r = await fetch(`${API}/coach/taper-apply`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coach_name: coachName }),
  });
  return r.ok ? await r.json() : null;
}

export async function fetchMilestones(): Promise<Milestones | null> {
  const r = await fetch(`${API}/analysis/milestones`);
  return r.ok ? await r.json() : null;
}

export async function fetchMilestoneNote(coachName: string, coachGender: string, refresh = false): Promise<MilestoneNote | null> {
  const r = await fetch(`${API}/coach/milestone-note?coach_name=${encodeURIComponent(coachName)}&coach_gender=${coachGender}&refresh=${refresh}`);
  return r.ok ? await r.json() : null;
}

export async function useStreakFreeze(): Promise<{ ok: boolean; reason?: string; frozen_week?: string } | null> {
  const r = await fetch(`${API}/analysis/streak-freeze`, { method: "POST" });
  return r.ok ? await r.json() : null;
}

export async function fetchSeasonRecap(year?: number): Promise<SeasonRecap | null> {
  const r = await fetch(`${API}/analysis/season-recap${year ? `?year=${year}` : ""}`);
  return r.ok ? await r.json() : null;
}

export async function fetchMilestoneWall(): Promise<MilestoneWall | null> {
  const r = await fetch(`${API}/analysis/milestone-wall`);
  return r.ok ? await r.json() : null;
}

export async function fetchClimbDetail(id: string): Promise<ClimbDetail | null> {
  const r = await fetch(`${API}/analysis/climb-detail?id=${encodeURIComponent(id)}`);
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

export type EmailPrefs = { weekly_digest: boolean; digest_weekday: number };

export async function fetchEmailPrefs(): Promise<EmailPrefs> {
  const r = await fetch(`${API}/analysis/email-prefs`);
  return r.ok ? await r.json() : { weekly_digest: false, digest_weekday: 0 };
}

export async function setEmailPrefs(prefs: Partial<EmailPrefs>): Promise<void> {
  await fetch(`${API}/analysis/email-prefs`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
}

export async function emailDigestNow(): Promise<{ ok: boolean }> {
  const r = await fetch(`${API}/analysis/email-digest`, { method: "POST" });
  return r.ok ? await r.json() : { ok: false };
}

export async function fetchSegmentCompare(a: string, b: string): Promise<SegmentCompare | null> {
  const r = await fetch(`${API}/analysis/segment-compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  return r.ok ? await r.json() : null;
}
