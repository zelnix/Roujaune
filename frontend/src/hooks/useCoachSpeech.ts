import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachId, getCoachRate } from "../lib/coach-persona";
import { getVoiceId } from "../lib/prefs";
import { resolveBothCoachVoices, ResolvedVoice, COACH_PITCH } from "../lib/coach-voice";

/** Lightweight coach text-to-speech for the chat (independent of the workout
 * audio engine). Uses the shared gender-first picker so Alberto speaks with a
 * Spanish-accented male voice and Adriana with a Spanish-accented female voice,
 * honoring the rider's per-coach manual pick and speaking-speed preference. */
export function useCoachSpeech(coachId: CoachId) {
  const resolved = useRef<Record<CoachId, ResolvedVoice> | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = { alberto: await getVoiceId("alberto"), adriana: await getVoiceId("adriana") };
      const r = await resolveBothCoachVoices(saved);
      if (alive) resolved.current = r;
    })();
    return () => { alive = false; try { Speech.stop(); } catch { /* noop */ } };
  }, []);

  const stop = useCallback(() => { try { Speech.stop(); } catch { /* noop */ } setSpeakingId(null); }, []);

  const speak = useCallback((id: string, text: string) => {
    if (!text) return;
    try { Speech.stop(); } catch { /* noop */ }
    if (speakingId === id) { setSpeakingId(null); return; } // tapping the playing one stops it
    setSpeakingId(id);
    const v = resolved.current?.[coachId] ?? { lang: "es-ES" };
    Speech.speak(text, {
      voice: v.id,
      language: v.lang,
      pitch: COACH_PITCH[coachId],
      rate: getCoachRate(),
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }, [coachId, speakingId]);

  return { speak, stop, speakingId };
}
