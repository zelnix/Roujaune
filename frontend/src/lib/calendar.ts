import { useCallback, useEffect, useState } from "react";
import { subscribePlanChange } from "./plan";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/* ── types ──────────────────────────────────────────────────────────────── */
export type SessionType = "cycling" | "fb50" | "wellness";
export type SessionStatus =
  | "planned" | "scheduled" | "today" | "completed" | "rescheduled" | "rest";

export type CalendarSession = {
  id: string;
  type: SessionType;
  title: string;
  subtitle?: string;
  brand?: string;
  duration: string;
  zone?: string;
  tss?: string;
  status: SessionStatus;
  color?: string;
  category?: string;
  target_power?: number;
  workout_id?: string;
  profile?: number[];
  created_by?: string;
  checkin?: boolean;
};

export type ReadinessMetric = { key: string; label: string; value: number; display: string };
export type Readiness = { score: number; status: string; source?: string; metrics?: ReadinessMetric[] };

export type ScheduledWorkout = {
  id: string;
  workout_id: string;
  title: string;
  duration?: string;
  tss?: string;
  zone?: string;
  color?: string;
  date: string;
  status?: string;
};

export type CalendarDay = {
  date: string;
  day_name: string;
  day_num: string;
  focus: string;
  cycling: CalendarSession | null;
  fb50: CalendarSession | null;
  wellness: CalendarSession | null;
  readiness: Readiness;
  scheduled?: ScheduledWorkout[];
};

export type ZoneBar = { z: string; pct: number; time: string; color: string };
export type WeekSummary = {
  workouts_completed: number;
  workouts_planned: number;
  duration: string;
  tss: string;
  zones: ZoneBar[];
};

export type CalendarWeek = {
  id: string;
  start_date: string;
  end_date: string;
  range_label: string;
  selected_date: string;
  days: CalendarDay[];
  summary: WeekSummary;
  tip: string;
};

/* ── data hook ──────────────────────────────────────────────────────────── */
export function useCalendarWeek(focusDate?: string, start = "2025-05-12") {
  const [week, setWeek] = useState<CalendarWeek | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const qs = focusDate ? `date=${focusDate}` : `start=${start}`;
      const res = await fetch(`${apiBase()}/api/calendar/week?${qs}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWeek(await res.json());
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }, [start, focusDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribePlanChange(() => { load(); }), [load]);

  return { week, setWeek, loading, reload: load };
}

/* ── mutations ──────────────────────────────────────────────────────────── */
export async function moveSession(params: {
  week_start: string; session_type: SessionType; from_date: string; to_date: string;
}): Promise<CalendarWeek | null> {
  try {
    const res = await fetch(`${apiBase()}/api/calendar/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function completeSupplementary(kind: string, title: string, date: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${apiBase()}/api/rider/supplementary/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, date }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return !!d.completed;
  } catch {
    return null;
  }
}

export async function requestAlbertoReview(params: {
  session_title: string; session_type: SessionType; from_day: string; to_day: string;
  to_focus?: string; to_existing?: string; coach_name: string; coach_gender: string;
}): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${apiBase()}/api/calendar/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.message ?? "").toString().trim() ||
      `Moving ${params.session_title} to ${params.to_day} looks fine.`;
  } catch {
    return `Moving ${params.session_title} to ${params.to_day} looks fine. Keep an easy day either side.`;
  }
}

/* ── status presentation (supportive language, colour-independent) ──────── */
export const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "Planned",
  scheduled: "Scheduled",
  today: "Scheduled today",
  completed: "Completed",
  rescheduled: "Moved to another day",
  rest: "Rest day",
};

export const FILTERS = [
  "All", "Cycling", "FB50", "Recovery",
  "Completed", "Planned", "Coach-generated",
] as const;
