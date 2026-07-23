import * as Speech from "expo-speech";
import { CoachId, CoachGender, COACHES } from "./coach-persona";

/** Known Spanish TTS voice names by gender (iOS/Android/desktop), used to pick a
 * gender-correct Spanish voice for each coach. Device voice metadata often omits
 * an explicit gender, so we detect it from the voice name/identifier. */
export const SPANISH_FEMALE = [
  "monica", "mónica", "paulina", "marisol", "esperanza", "angelica", "angélica",
  "catalina", "isabela", "luciana", "soledad", "elena", "laura", "carmen", "lucia",
  "lucía", "sofia", "sofía", "valentina", "ximena", "montse", "montserrat",
  "penelope", "penélope", "female", "mujer",
];
export const SPANISH_MALE = [
  "jorge", "diego", "juan", "carlos", "enrique", "miguel", "pablo", "gonzalo",
  "francisco", "javier", "andres", "andrés", "raul", "raúl", "antonio", "arturo",
  "marcelo", "male", "hombre",
];

export type ResolvedVoice = { id?: string; lang: string };

/** Per-coach speaking pitch. Voices are now gender-correct, so pitch is only a
 * gentle secondary distinction (kept subtle so it never sounds unnatural). */
export const COACH_PITCH: Record<CoachId, number> = { alberto: 0.9, adriana: 1.06 };

export function detectGender(v: Speech.Voice): CoachGender | "neutral" {
  const s = `${v.name ?? ""} ${v.identifier ?? ""}`.toLowerCase();
  if (SPANISH_FEMALE.some((n) => s.includes(n))) return "female";
  // strip "female" so the substring "male" inside it can't cause a false match
  const sm = s.replace(/female/g, "");
  if (SPANISH_MALE.some((n) => s.includes(n)) || sm.includes("male")) return "male";
  return "neutral";
}

const isSpanish = (v: Speech.Voice) => (v.language ?? "").toLowerCase().startsWith("es");

/** Pick the best voice for a coach: a Spanish voice matching the coach's gender,
 * kept distinct from `avoidId` (the other coach's voice). Falls back gracefully
 * through Spanish→gender→distinct→any so it never returns empty when voices exist. */
export function pickCoachVoice(voices: Speech.Voice[], coachId: CoachId, avoidId?: string): ResolvedVoice {
  const gender = COACHES[coachId].gender;
  const opp: CoachGender = gender === "male" ? "female" : "male";

  const seen = new Set<string>();
  const uniq = voices.filter((v) => v.identifier && !seen.has(v.identifier) && (seen.add(v.identifier), true));
  const notAvoid = (v: Speech.Voice) => v.identifier !== avoidId;
  const es = uniq.filter(isSpanish);

  const tiers: Speech.Voice[][] = [
    es.filter((v) => detectGender(v) === gender && notAvoid(v)),   // Spanish + gender + distinct
    es.filter((v) => detectGender(v) === gender),                  // Spanish + gender
    es.filter((v) => detectGender(v) !== opp && notAvoid(v)),      // Spanish, not opposite gender, distinct
    es.filter(notAvoid),                                           // any Spanish distinct
    uniq.filter((v) => detectGender(v) === gender && notAvoid(v)), // any language + gender
    uniq.filter(notAvoid),                                         // any distinct
    uniq,                                                          // anything
  ];
  for (const t of tiers) {
    if (t.length) return { id: t[0].identifier, lang: t[0].language ?? "es-ES" };
  }
  return { lang: "es-ES" };
}

/** Resolve DISTINCT gender-correct voices for both coaches at once so Alberto
 * (Spanish male) and Adriana (Spanish female) never collide on the same voice. */
export async function resolveBothCoachVoices(): Promise<Record<CoachId, ResolvedVoice>> {
  let voices: Speech.Voice[] = [];
  try { voices = await Speech.getAvailableVoicesAsync(); } catch { /* no device voices */ }
  const alberto = pickCoachVoice(voices, "alberto");
  const adriana = pickCoachVoice(voices, "adriana", alberto.id);
  return { alberto, adriana };
}
