// Coach-created custom training plans: generate a preview from the rider's goal
// + weeks + days/week, then accept it to make it the active plan (+ calendar).
function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type CreatedDay = {
  day_name: string; kind: "cycling" | "strength" | "mobility" | "recovery" | "balance" | "rest";
  title: string; zone?: string; duration?: string; duration_min?: number; tss?: number;
};
export type CreatedWeek = { focus: string; days: CreatedDay[] };
export type CreatedPlan = {
  title: string; description: string;
  goals: { id?: string; title: string; description?: string; status?: string }[];
  weeks_count: number; days_per_week: number; created_by?: string; weeks: CreatedWeek[];
};

export async function generatePlan(
  coachName: string, coachGender: string, goal: string, weeks: number, daysPerWeek: number,
): Promise<CreatedPlan> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${apiBase()}/api/coach/create-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_name: coachName, coach_gender: coachGender, goal, weeks, days_per_week: daysPerWeek }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.plan as CreatedPlan;
  } finally {
    clearTimeout(timer);
  }
}

export async function acceptPlan(plan: CreatedPlan, coachName: string): Promise<{ plan_id: string; title: string }> {
  const res = await fetch(`${apiBase()}/api/coach/create-plan/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, coach_name: coachName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
