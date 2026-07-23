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
): Promise<{ user_message: ChatMessage; coach_message: ChatMessage }> {
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
