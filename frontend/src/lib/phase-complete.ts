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
