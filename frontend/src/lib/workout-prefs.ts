function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export async function fetchFavorites(): Promise<string[]> {
  try {
    const res = await fetch(`${apiBase()}/api/workout-favorites`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.favorites ?? [];
  } catch {
    return [];
  }
}

export async function toggleFavorite(workoutId: string): Promise<{ favorites: string[]; favorited: boolean }> {
  const res = await fetch(`${apiBase()}/api/workout-favorites/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workout_id: workoutId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type SchedulePayload = {
  workout_id: string;
  workout_name: string;
  duration?: string;
  tss?: string;
  zone?: string;
  color?: string;
  date?: string;
};

export async function scheduleWorkout(payload: SchedulePayload): Promise<void> {
  const res = await fetch(`${apiBase()}/api/calendar/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function unscheduleWorkout(entryId: string): Promise<void> {
  await fetch(`${apiBase()}/api/calendar/scheduled/${entryId}`, { method: "DELETE" });
}
