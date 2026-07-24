import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { COUCH_TO_ROAD } from "./programs/couch-to-road";
import { RIDE_STRONGER } from "./programs/ride-stronger";
import { RIDE_BEYOND } from "./programs/ride-beyond";
import type { TrainingPlan } from "../components/plan";

// Frontend program catalog keyed by plan id — the phase-completion strings
// (badge heading, summary, coach message) are authored here.
const PROGRAMS: Record<string, any> = {
  "couch-to-road": COUCH_TO_ROAD,
  "ride-stronger": RIDE_STRONGER,
  "ride-beyond": RIDE_BEYOND,
};

export type PhaseComplete = { heading: string; summary: string[]; coachMessage: string };
export type CelebrationData = {
  planId: string;
  number: number;
  name: string;
  weeks: string;
  complete: PhaseComplete;
  isPlanEnd?: boolean;
  endMessage?: string;
};

/** Return the authored phase-completion content for a plan/phase, or null. */
export function getPhaseComplete(planId: string, phaseNumber: number): CelebrationData | null {
  const prog = PROGRAMS[planId];
  if (!prog) return null;
  const phase = prog.phases.find((p: any) => p.number === phaseNumber);
  if (!phase || !phase.complete) return null;
  return {
    planId,
    number: phase.number,
    name: phase.name,
    weeks: phase.weeksLabel,
    complete: phase.complete,
  };
}

const key = (planId: string) => `phaseCelebrated:${planId}`;
const planKey = (planId: string) => `planCompleted:${planId}`;

/** Return the plan-completion payload (final-phase badge + program end message). */
export function getPlanEnd(planId: string): CelebrationData | null {
  const prog = PROGRAMS[planId];
  if (!prog || !prog.phases?.length) return null;
  const finalPhase = prog.phases[prog.phases.length - 1];
  if (!finalPhase?.complete) return null;
  return {
    planId,
    number: finalPhase.number,
    name: prog.name,
    weeks: `${prog.durationWeeks} weeks`,
    complete: finalPhase.complete,
    isPlanEnd: true,
    endMessage: prog.endMessage,
  };
}

async function getLastCelebrated(planId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(key(planId));
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}
async function setLastCelebrated(planId: string, n: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key(planId), String(n));
  } catch {
    /* noop */
  }
}

/** Detects when the rider has newly completed a training-plan phase and returns
 * the celebration payload once (persisted per plan so it only fires a single
 * time per phase). Returns { celebration, dismiss }. */
export function usePhaseCelebration(plan: TrainingPlan | null | undefined) {
  const [celebration, setCelebration] = React.useState<CelebrationData | null>(null);

  React.useEffect(() => {
    if (!plan) return;
    const planId = (plan as any).id as string | undefined;
    const phases = (plan as any).phases as { number: number; pct: number }[] | undefined;
    if (!planId || !phases || !phases.length) return;

    const completed = phases.filter((p) => (p.pct ?? 0) >= 100).map((p) => p.number);
    const highest = completed.length ? Math.max(...completed) : 0;
    if (highest <= 0) return;

    let alive = true;
    (async () => {
      const last = await getLastCelebrated(planId);
      if (!alive || highest <= last) return;
      const cd = getPhaseComplete(planId, highest);
      if (cd) setCelebration(cd);
      else await setLastCelebrated(planId, highest); // no authored content → just record
    })();
    return () => {
      alive = false;
    };
  }, [plan]);

  const dismiss = React.useCallback(async () => {
    if (celebration) await setLastCelebrated(celebration.planId, celebration.number);
    setCelebration(null);
  }, [celebration]);

  return { celebration, dismiss };
}

/** Fires once, the first time the backend reports the whole plan finished
 * (`plan_complete`), showing the grand plan-completion screen. Persisted per plan. */
export function usePlanCompletion(plan: TrainingPlan | null | undefined) {
  const [completion, setCompletion] = React.useState<CelebrationData | null>(null);

  React.useEffect(() => {
    if (!plan) return;
    const planId = (plan as any).id as string | undefined;
    const done = (plan as any).plan_complete as boolean | undefined;
    if (!planId || !done) return;

    let alive = true;
    (async () => {
      let seen = "0";
      try {
        seen = (await AsyncStorage.getItem(planKey(planId))) || "0";
      } catch {
        /* noop */
      }
      if (!alive || seen === "1") return;
      const cd = getPlanEnd(planId);
      if (cd) setCompletion(cd);
      else await AsyncStorage.setItem(planKey(planId), "1").catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [plan]);

  const dismiss = React.useCallback(async () => {
    if (completion) {
      try {
        await AsyncStorage.setItem(planKey(completion.planId), "1");
      } catch {
        /* noop */
      }
    }
    setCompletion(null);
  }, [completion]);

  return { completion, dismiss };
}
