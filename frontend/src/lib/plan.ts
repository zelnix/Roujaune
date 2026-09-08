import { useEffect, useState } from "react";
import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLAN, TrainingPlan } from "../components/plan";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

// Lightweight cross-component signal so a plan change made on one screen (e.g.
// the coach rescheduling the plan from chat) re-fetches every usePlan() mount.
const _planSubs = new Set<() => void>();
export function subscribePlanChange(fn: () => void): () => void {
  _planSubs.add(fn);
  return () => { _planSubs.delete(fn); };
}
export function notifyPlanChanged(): void {
  _planSubs.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

// Cache key is versioned + rider-active-scoped (NOT keyed by the requested id,
// which is always the "build-and-climb" default). Bumping the version purges any
// legacy `roujaune:plan:build-and-climb` cache that could otherwise keep showing
// the wrong (demo) plan for a rider whose real plan is different.
const planCacheKey = (_id?: string) => `roujaune:plan:active:v2`;

// Neutral placeholder shown only until the rider's real (cached or live) plan
// arrives. Avoids flashing the bundled "Build & Climb" demo plan name to riders
// who are on a different plan (e.g. Green Lantern → "From Couch to Road").
// Neutral placeholder shown only until the rider's real plan arrives. It carries
// NO demo ("Build & Climb") content so nothing misleading can flash.
const PLAN_PLACEHOLDER: TrainingPlan = {
  ...PLAN, id: "", title: "Training Plan", label: "TRAINING PLAN", description: "",
  goals: [], phases: [], workouts: [], weeklyLoad: [], progressPct: 0,
  progress: {} as any, no_plan: false,
};

/** Map the FastAPI /api/plan document (snake_case) into the UI plan shape. */
function normalize(d: any): TrainingPlan {
  // A rider with no plan yet — return an empty shape (no demo fallback content).
  if (d?.no_plan || d?.id === "none") {
    return {
      ...PLAN,
      id: d.id ?? "none",
      title: d.title ?? "No training plan yet",
      label: "TRAINING PLAN",
      description: d.description ?? "",
      no_plan: !!d.no_plan,
      goals: [], phases: [], workouts: [], weeklyLoad: [], progressPct: 0,
      progress: {} as any, phase: undefined as any, hero: undefined,
      adaptation: "", adaptationStatus: "",
    } as TrainingPlan;
  }
  return {
    ...PLAN,
    id: d.id ?? PLAN.id,
    no_plan: false,
    plan_complete: d.plan_complete ?? false,
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
    weekTargets: d.week_targets ?? d.weekTargets ?? PLAN.weekTargets,
    autoAdjustment: d.auto_adjustment ?? d.autoAdjustment ?? undefined,
    hero: d.hero ?? PLAN.hero,
    tip: d.tip ?? PLAN.tip,
  };
}

/** Fetch the rider's training plan from the backend, with a skeleton loading
 * state and a graceful fallback to the bundled plan so the screen never breaks. */
export function usePlan(id = "build-and-climb") {
  const [plan, setPlan] = useState<TrainingPlan>(PLAN_PLACEHOLDER);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Re-fetch whenever any screen signals the plan changed (e.g. the coach
  // rescheduled it from chat), so the Today card / plan strip update live.
  useEffect(() => subscribePlanChange(() => setNonce((n) => n + 1)), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // One-time purge of legacy per-id caches that may hold a stale "Build &
      // Climb" plan for a rider who has since moved to a different plan.
      AsyncStorage.multiRemove([
        "roujaune:plan:build-and-climb",
        "roujaune:plan:couch-to-road",
        "roujaune:plan:ride-stronger",
        "roujaune:plan:ride-beyond",
      ]).catch(() => {});
      // Instant paint from the last-fetched plan (prevents the bundled
      // "Build & Climb" demo plan flashing before the real plan loads).
      try {
        const cached = await AsyncStorage.getItem(planCacheKey(id));
        if (cached && alive) { setPlan(JSON.parse(cached)); setLive(true); }
      } catch {
        /* ignore cache */
      }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${apiBase()}/api/plan?id=${id}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) {
          const p = normalize(data);
          setPlan(p); setLive(true);
          AsyncStorage.setItem(planCacheKey(id), JSON.stringify(p)).catch(() => {});
        }
      } catch {
        /* keep the cached (or bundled) plan already in state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, nonce]);

  const refresh = () => setNonce((n) => n + 1);
  return { plan, loading, live, refresh };
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

/* Detailed reasoning behind the current adaptation (AI-generated). */
export type AdaptationDetail = { summary: string; factors: { label: string; detail: string }[]; adjustments: string[] };

export async function fetchAdaptationDetail(coachName: string, coachGender: string, planId = "build-and-climb"): Promise<AdaptationDetail | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${apiBase()}/api/coach/adaptation/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, coach_name: coachName, coach_gender: coachGender, refresh: false }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const d = await res.json();
    return d?.detail ?? null;
  } catch {
    return null;
  }
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
