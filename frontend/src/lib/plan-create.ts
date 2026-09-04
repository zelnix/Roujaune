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
  coachName: string, coachGender: string, goal: string, weeks: number, daysPerWeek: number, eventDate?: string | null,
): Promise<CreatedPlan> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${apiBase()}/api/coach/create-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_name: coachName, coach_gender: coachGender, goal, weeks, days_per_week: daysPerWeek, event_date: eventDate || undefined }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.plan as CreatedPlan;
  } finally {
    clearTimeout(timer);
  }
}

export type SwapMode = "easier" | "harder" | "focus";

export async function swapSession(args: {
  day: Partial<CreatedDay> & { workout_id?: string }; mode: SwapMode; coachName: string; coachGender?: string;
  goal?: string; focusHint?: string; planId?: string; week?: number; dayIndex?: number;
  override?: Partial<CreatedDay>;
}): Promise<CreatedDay & { workout_id?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${apiBase()}/api/coach/swap-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day: args.day, mode: args.mode, coach_name: args.coachName, coach_gender: args.coachGender,
        goal: args.goal, focus_hint: args.focusHint, plan_id: args.planId, week: args.week, day_index: args.dayIndex,
        override: args.override,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).day;
  } finally {
    clearTimeout(timer);
  }
}

export type PlanTemplate = { id: string; title: string; weeks_count: number; days_per_week: number; saved_at: string; plan: CreatedPlan };

export async function saveTemplate(plan: CreatedPlan): Promise<{ id: string; title: string }> {
  const res = await fetch(`${apiBase()}/api/coach/plan-templates`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function listTemplates(): Promise<PlanTemplate[]> {
  const res = await fetch(`${apiBase()}/api/coach/plan-templates`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).templates as PlanTemplate[];
}

export async function deleteTemplate(id: string): Promise<void> {
  await fetch(`${apiBase()}/api/coach/plan-templates/${id}`, { method: "DELETE" });
}

export async function renameTemplate(id: string, title: string): Promise<void> {
  await fetch(`${apiBase()}/api/coach/plan-templates/${id}/rename`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
  });
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
