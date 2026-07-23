import { useEffect, useState } from "react";
import React from "react";
import { PLAN, TrainingPlan } from "../components/plan";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/** Map the FastAPI /api/plan document (snake_case) into the UI plan shape. */
function normalize(d: any): TrainingPlan {
  return {
    ...PLAN,
    title: d.title ?? PLAN.title,
    label: d.label ?? PLAN.label,
    description: d.description ?? PLAN.description,
    durationWeeks: d.duration_label ?? d.durationWeeks ?? PLAN.durationWeeks,
    avgDays: d.average_label ?? d.avgDays ?? PLAN.avgDays,
    phase: d.phase ?? PLAN.phase,
    goals: d.goals ?? PLAN.goals,
    phases: d.phases ?? PLAN.phases,
    weeklyLoad: d.weekly_load ?? d.weeklyLoad ?? PLAN.weeklyLoad,
    youAreHere: d.you_are_here ?? d.youAreHere ?? PLAN.youAreHere,
    workouts: d.workouts ?? PLAN.workouts,
    adaptation: d.adaptation ?? PLAN.adaptation,
    adaptationStatus: d.adaptation_status ?? d.adaptationStatus ?? PLAN.adaptationStatus,
    progressPct: d.progress_pct ?? d.progressPct ?? PLAN.progressPct,
    progress: d.progress ?? PLAN.progress,
    tip: d.tip ?? PLAN.tip,
  };
}

/** Fetch the rider's training plan from the backend, with a skeleton loading
 * state and a graceful fallback to the bundled plan so the screen never breaks. */
export function usePlan(id = "build-and-climb") {
  const [plan, setPlan] = useState<TrainingPlan>(PLAN);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${apiBase()}/api/plan?id=${id}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) { setPlan(normalize(data)); setLive(true); }
      } catch {
        if (alive) setPlan(PLAN); // keep the bundled plan
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  return { plan, loading, live };
}

/** Fetch the coach's AI-generated plan adaptation. Cached server-side per
 * plan+coach; pass refresh() to regenerate. Falls back to the plan's static
 * adaptation text while loading or on error so the card never looks empty. */
export function useAdaptation(coachName: string, coachGender: string, planId = "build-and-climb") {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = React.useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(`${apiBase()}/api/coach/adaptation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, coach_name: coachName, coach_gender: coachGender, refresh }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.adaptation) setText(data.adaptation);
    } catch {
      /* keep whatever we have; card falls back to static text */
    } finally {
      setLoading(false);
    }
  }, [coachName, coachGender, planId]);

  useEffect(() => { load(false); }, [load]);

  return { text, loading, refresh: () => load(true) };
}

/* ── Training Plan action-button data (Edit Goals / View Progress / View All Adaptations) ── */
export type AdaptationEntry = { id: string; coach: string; text: string; trigger: string; at: string };

export async function fetchAdaptations(coachName: string, planId = "build-and-climb"): Promise<AdaptationEntry[]> {
  const res = await fetch(`${apiBase()}/api/plan/adaptations?plan_id=${planId}&coach_name=${encodeURIComponent(coachName)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.adaptations ?? [];
}

export type PlanProgressDetail = {
  progress_pct: number;
  summary: Record<string, string>;
  fitness: { ctl: number; atl: number; tsb: number; ctl_delta: string; form_label: string };
  trend: { ctl: number[]; atl: number[]; labels: string[] };
  metrics: { label: string; value: string; delta: string; up: boolean }[];
  weeks: { label: string; tss: number; done: boolean; current: boolean }[];
};

export async function fetchPlanProgress(planId = "build-and-climb"): Promise<PlanProgressDetail> {
  const res = await fetch(`${apiBase()}/api/plan/progress?plan_id=${planId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type EditableGoal = { id: string; title: string; description: string; status: "complete" | "incomplete" };
export async function savePlanGoals(goals: EditableGoal[], planId = "build-and-climb"): Promise<void> {
  const res = await fetch(`${apiBase()}/api/plan/goals`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId, goals }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ── Adaptive per-zone targets (auto-tuned from ride execution) ── */
export type ZoneTarget = { zone: string; bias: number; recent: number[] };

export function useAdaptiveTargets(planId = "build-and-climb") {
  const [targets, setTargets] = useState<ZoneTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/plan/targets?plan_id=${planId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const zones: string[] = data?.zones ?? ["Z2", "Z3", "Z4", "Z5", "Z6"];
        const bias = data?.zone_bias ?? {};
        const exec = data?.zone_exec ?? {};
        const list: ZoneTarget[] = zones.map((z) => ({ zone: z, bias: bias[z] ?? 0, recent: exec[z] ?? [] }));
        if (alive) setTargets(list);
      } catch {
        if (alive) setTargets([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [planId]);

  return { targets, loading };
}
