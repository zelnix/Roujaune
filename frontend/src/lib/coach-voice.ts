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

export type CoachVoiceOption = { id: string; label: string; gender: CoachGender | "neutral"; lang: string };

/** A curated, de-duplicated list of Spanish voices the rider can choose from
 * per coach (labelled by detected gender + a friendly index). Empty in the web
 * preview (no device voices) — populated on a real device / Expo Go. */
export function listSpanishVoices(voices: Speech.Voice[]): CoachVoiceOption[] {
  const seen = new Set<string>();
  const out: CoachVoiceOption[] = [];
  let male = 0, female = 0, other = 0;
  for (const v of voices) {
    if (!v.identifier || seen.has(v.identifier) || !isSpanish(v)) continue;
    seen.add(v.identifier);
    const g = detectGender(v);
    const n = g === "female" ? ++female : g === "male" ? ++male : ++other;
    const gLabel = g === "female" ? "Female" : g === "male" ? "Male" : "Voice";
    out.push({ id: v.identifier, label: `${gLabel} ${n}`, gender: g, lang: v.language ?? "es-ES" });
  }
  // males first, then neutral, then female
  const rank = (o: CoachVoiceOption) => (o.gender === "male" ? 0 : o.gender === "neutral" ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  return out;
}

/** Pick the best voice for a coach: a Spanish voice matching the coach's gender,
 * kept distinct from `avoidId` (the other coach's voice). A rider's explicit
 * `savedId` always wins. Falls back gracefully through Spanish→gender→distinct→any. */
export function pickCoachVoice(voices: Speech.Voice[], coachId: CoachId, avoidId?: string, savedId?: string | null): ResolvedVoice {
  const gender = COACHES[coachId].gender;
  const opp: CoachGender = gender === "male" ? "female" : "male";

  const seen = new Set<string>();
  const uniq = voices.filter((v) => v.identifier && !seen.has(v.identifier) && (seen.add(v.identifier), true));

  // 0. The rider's explicit manual pick for this coach always wins.
  if (savedId) { const s = uniq.find((v) => v.identifier === savedId); if (s) return { id: s.identifier, lang: s.language ?? "es-ES" }; }

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
 * (Spanish male) and Adriana (Spanish female) never collide. Honors each coach's
 * saved manual pick when provided. */
export async function resolveBothCoachVoices(saved?: Partial<Record<CoachId, string | null>>): Promise<Record<CoachId, ResolvedVoice>> {
  let voices: Speech.Voice[] = [];
  try { voices = await Speech.getAvailableVoicesAsync(); } catch { /* no device voices */ }
  const alberto = pickCoachVoice(voices, "alberto", undefined, saved?.alberto);
  const adriana = pickCoachVoice(voices, "adriana", alberto.id, saved?.adriana);
  return { alberto, adriana };
}

/** Load available Spanish voices for the picker UI. */
export async function loadSpanishVoices(): Promise<CoachVoiceOption[]> {
  let voices: Speech.Voice[] = [];
  try { voices = await Speech.getAvailableVoicesAsync(); } catch { /* none */ }
  return listSpanishVoices(voices);
}
