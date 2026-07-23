import { useEffect, useState } from "react";
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
