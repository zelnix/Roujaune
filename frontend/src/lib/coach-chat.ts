import { CoachPersona, CoachStyle } from "./coach-persona";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type ChatMessage = { id: string; role: "user" | "coach"; text: string; at: string };

export async function fetchChatHistory(coachName: string): Promise<ChatMessage[]> {
  const res = await fetch(`${apiBase()}/api/coach/chat/history?coach_name=${encodeURIComponent(coachName)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.messages ?? [];
}

export async function sendChatMessage(
  persona: CoachPersona,
  style: CoachStyle,
  message: string
): Promise<{ user_message: ChatMessage; coach_message: ChatMessage; plan_updated?: boolean; plan_change?: string }> {
  const res = await fetch(`${apiBase()}/api/coach/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      coach_name: persona.name,
      coach_gender: persona.gender,
      coaching_style: style,
      message,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearChatHistory(coachName: string): Promise<void> {
  await fetch(`${apiBase()}/api/coach/chat/history?coach_name=${encodeURIComponent(coachName)}`, { method: "DELETE" });
}

/** A few coach-agnostic conversation starters for an empty thread. */
export const CHAT_SUGGESTIONS = [
  "How's my training going?",
  "I'm feeling tired — should I still ride today?",
  "Any FB50 exercises to help my climbing?",
  "Help me stay motivated this week.",
];

export type LatestRide = { workout: string; routeName?: string };

/** The rider's most recent ride, used to offer a contextual chat starter. */
export async function fetchLatestRide(): Promise<LatestRide | null> {
  try {
    const res = await fetch(`${apiBase()}/api/rides/history?limit=1`);
    if (!res.ok) return null;
    const rides = await res.json();
    const r = Array.isArray(rides) ? rides[0] : null;
    if (!r) return null;
    const routeName = r.route && typeof r.route === "object" ? r.route.name : (typeof r.route === "string" ? r.route : undefined);
    return { workout: r.workout ?? "your last ride", routeName };
  } catch {
    return null;
  }
}
