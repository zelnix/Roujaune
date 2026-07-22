// Fetches an AI coaching cue (Alberto persona) from the backend.

export type Telemetry = { power: number; hr: number; cadence: number; speed: number; elapsed: number };
export type CoachContext = {
  power_target: number;
  cadence_low: number;
  cadence_high: number;
  workout: string;
  route?: string | null;
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
