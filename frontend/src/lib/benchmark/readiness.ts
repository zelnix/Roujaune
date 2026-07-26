// Readiness screening (Part 5). Runs before any benchmark begins. Never
// diagnoses — it screens for warning symptoms and fatigue, and gates maximal
// tests when significant warning symptoms are reported.
import type { ReadinessQuestion, ReadinessAnswer, ReadinessStatus, ReadinessOutcome } from "./types";

export const READINESS_QUESTIONS: ReadinessQuestion[] = [
  { id: "well", text: "Do you feel well enough to perform this workout today?", goodAnswer: "yes" },
  { id: "symptoms", text: "Have you recently experienced chest pain, dizziness, fainting or unusual breathlessness?", goodAnswer: "no", danger: true },
  { id: "illness", text: "Are you recovering from illness or injury?", goodAnswer: "no" },
  { id: "hard_workout", text: "Have you completed a very hard workout in the previous 24 hours?", goodAnswer: "no" },
  { id: "sleep", text: "Did you sleep significantly less than usual?", goodAnswer: "no" },
  { id: "fuelled", text: "Have you eaten and hydrated appropriately?", goodAnswer: "yes" },
  { id: "setup", text: "Is your bike or trainer safely set up?", goodAnswer: "yes" },
];

export const READINESS_MESSAGES: Record<ReadinessStatus, string> = {
  ready: "You appear ready to continue with today's benchmark setup.",
  caution: "Your result may be affected by fatigue or recovery. You can continue, choose a lighter benchmark or reschedule.",
  do_not_start: "Do not begin this benchmark workout. Stop and seek appropriate medical advice before returning to high-intensity exercise.",
};

/** Compute the readiness status from the collected answers. */
export function evaluateReadiness(answers: Record<string, ReadinessAnswer>): ReadinessStatus {
  // A "bad" answer to a danger question (warning symptoms) ⇒ Do Not Start.
  for (const q of READINESS_QUESTIONS) {
    const a = answers[q.id];
    if (q.danger && a && a !== q.goodAnswer) return "do_not_start";
  }
  // Any other non-ideal answer ⇒ Caution.
  const anyBad = READINESS_QUESTIONS.some((q) => {
    const a = answers[q.id];
    return a != null && a !== q.goodAnswer;
  });
  return anyBad ? "caution" : "ready";
}

export function buildOutcome(status: ReadinessStatus): ReadinessOutcome {
  return { status, message: READINESS_MESSAGES[status], respondedAt: new Date().toISOString() };
}

export function allAnswered(answers: Record<string, ReadinessAnswer>): boolean {
  return READINESS_QUESTIONS.every((q) => answers[q.id] != null);
}

// In-memory cache so answers survive back-navigation within the app session.
const cache = new Map<string, Record<string, ReadinessAnswer>>();
export function loadCachedAnswers(testId: string): Record<string, ReadinessAnswer> {
  return { ...(cache.get(testId) ?? {}) };
}
export function cacheAnswers(testId: string, answers: Record<string, ReadinessAnswer>): void {
  cache.set(testId, { ...answers });
}
