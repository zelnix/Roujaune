// Fetches an AI coaching cue (Alberto persona) from the backend.

export type Telemetry = { power: number; hr: number; cadence: number; speed: number; elapsed: number };
export type CoachContext = {
  power_target: number;
  cadence_low: number;
  cadence_high: number;
  workout: string;
  segment?: string | null;
  zone?: string | null;
  route?: string | null;
  seated?: boolean;
  coach_name?: string;
  coach_gender?: string;
  cue_kind?: "live" | "intro" | "next_preview" | "extend_advice" | "struggle" | "safety" | "recover";
  next_segment?: string | null;
  next_zone?: string | null;
  next_target?: number | null;
  // Struggle-detection context (sent with cue_kind "struggle" | "safety").
  struggle_reasons?: string[];
  struggle_primary?: string | null;
  struggle_severity?: string | null;
  struggle_safety?: boolean;
  power_deficit_pct?: number;
  w_prime_pct?: number;
  near_max_hr_pct?: number;
  place?: string | null;
  eased_pct?: number;
};

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/** Ask Alberto for one short spoken cue. Rejects on any error/timeout so the
 * caller can fall back to the local rule-based cue. */
export async function fetchCoachCue(t: Telemetry, ctx: CoachContext, timeoutMs = 6000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/coach/cue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        power: Math.round(t.power),
        hr: Math.round(t.hr),
        cadence: Math.round(t.cadence),
        speed: t.speed,
        elapsed: Math.round(t.elapsed),
        ...ctx,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`coach ${res.status}`);
    const data = await res.json();
    const cue = (data?.cue ?? "").toString().trim();
    if (!cue) throw new Error("empty cue");
    return cue;
  } finally {
    clearTimeout(timer);
  }
}

export type ExtendPlan = {
  advice: string;
  recommend: "extend" | "finish";
  suggested: "10min" | "20min" | "5km" | null;
};

/** After completing a workout, ask the coach whether to extend and by how much. */
export async function fetchExtendPlan(
  t: Telemetry,
  ctx: { workout: string; type_id: string; route?: string | null; wearable_on: boolean; coach_name?: string; coach_gender?: string },
  timeoutMs = 8000,
): Promise<ExtendPlan> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/coach/extend-advice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        power: Math.round(t.power),
        hr: Math.round(t.hr),
        cadence: Math.round(t.cadence),
        elapsed: Math.round(t.elapsed),
        ...ctx,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`extend ${res.status}`);
    const data = await res.json();
    return {
      advice: (data?.advice ?? "").toString().trim(),
      recommend: data?.recommend === "finish" ? "finish" : "extend",
      suggested: ["10min", "20min", "5km"].includes(data?.suggested) ? data.suggested : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
