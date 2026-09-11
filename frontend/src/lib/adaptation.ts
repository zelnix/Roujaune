// Longitudinal adaptation assessment — EF / decoupling / HRR / W'-drain trends
// plus the coach's acting recommendations. Backed by GET /api/analysis/adaptation.

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type Trend = { slope: number; early: number; late: number; pct: number; n: number } | null;
export type Callout = { kind: string; good: boolean; text: string };
export type CoachActions = { auto_apply: string[]; confirm: { kind: string; text: string }[] };

export type Adaptation = {
  has_data: boolean;
  ride_count: number;
  trends: { ef: Trend; ef_z2: Trend; decoupling: Trend; hrr: Trend; w_prime: Trend };
  series: { ef: number[]; decoupling: number[]; hrr: number[]; w_prime: number[] };
  load: { ctl: number; tsb: number; ramp_rate: number; form_state?: string };
  callouts: Callout[];
  coach_actions: CoachActions;
};

export async function fetchAdaptation(weeks = 8): Promise<Adaptation | null> {
  try {
    const res = await fetch(`${apiBase()}/api/analysis/adaptation?weeks=${weeks}`);
    if (!res.ok) return null;
    return (await res.json()) as Adaptation;
  } catch {
    return null;
  }
}
