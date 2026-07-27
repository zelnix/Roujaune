// Daily Check-in + live readiness. Feeds the backend readiness engine and
// surfaces today's score across Home, Plan and Calendar.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

function base(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type CheckinInput = {
  sleep_hours: number;
  sleep_quality: number; // 0–10
  energy: number;        // 0–10
  soreness: number;      // 0–10 (higher = more sore)
  stress: number;        // 0–10 (higher = more stressed)
  motivation: number;    // 0–10
};

export type ReadinessResult = {
  readinessScore: number;
  status: string;
  safetyOverride: boolean;
  confidence: string;
  mainFactors: string[];
  date?: string;
};

export type TodayReadiness = {
  available: boolean;
  score?: number;
  status?: string;
  band?: string;
  mainFactors?: string[];
  safetyOverride?: boolean;
  confidence?: string;
  date?: string;
  metrics?: { key: string; label: string; value: number; display: string }[];
};

export async function submitCheckin(payload: {
  checkin: CheckinInput;
  symptoms?: Record<string, boolean>;
  flags?: Record<string, boolean>;
  date?: string;
}): Promise<ReadinessResult> {
  const res = await fetch(`${base()}/api/rider/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/** Reloads whenever the screen regains focus (e.g. returning from check-in). */
export function useTodayReadiness() {
  const [readiness, setReadiness] = useState<TodayReadiness>({ available: false });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base()}/api/rider/readiness/today`);
      if (res.ok) setReadiness(await res.json());
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { readiness, loading, reload: load };
}

export type Tone = { color: string; label: string };

/** Map a readiness score (+ safety override) to a colour and short label. */
export function readinessTone(score?: number, safety?: boolean): Tone {
  if (safety) return { color: "#C91727", label: "Do Not Train" };
  if (score == null) return { color: "#A7A8A5", label: "Check in" };
  if (score >= 70) return { color: "#55C850", label: "Good to go" };
  if (score >= 55) return { color: "#FFC20A", label: "Proceed with caution" };
  if (score >= 40) return { color: "#E8631C", label: "Recovery recommended" };
  return { color: "#C91727", label: "Rest & reassess" };
}

/** Whether today's readiness should soften/gate the planned session. */
export function shouldGate(r: TodayReadiness): boolean {
  return !!r.available && (!!r.safetyOverride || (r.score != null && r.score < 55));
}
