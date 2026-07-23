import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachId, COACHES } from "../lib/coach-persona";
import { getVoiceId } from "../lib/prefs";

/** Lightweight coach text-to-speech for the chat (independent of the workout
 * audio engine). Picks the coach's Spanish (English) voice by number with a
 * gender fallback, speaks at a per-coach pitch, and tracks which message is
 * currently playing so the UI can show a stop/loading state. */

const ALLOWED = ["es", "en", "it", "fr"];
const FEMALE_NAMES = ["monica", "mónica", "paulina", "marisol", "esperanza", "sabina", "elena", "samantha", "karen", "victoria", "moira", "tessa", "fiona", "female"];
const PITCH: Record<CoachId, number> = { alberto: 0.82, adriana: 1.2 };

function isFemale(v: Speech.Voice): boolean {
  const s = `${v.name ?? ""} ${v.identifier ?? ""}`.toLowerCase();
  return FEMALE_NAMES.some((n) => s.includes(n));
}

export function useCoachSpeech(coachId: CoachId) {
  const voices = useRef<Speech.Voice[]>([]);
  const chosen = useRef<{ id?: string; lang: string }>({ id: undefined, lang: "es-ES" });
  const ready = useRef(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await Speech.getAvailableVoicesAsync();
        voices.current = all.filter((v) => {
          const l = (v.language ?? "").toLowerCase();
          return v.identifier && ALLOWED.some((p) => l.startsWith(p));
        });
      } catch { /* keep default */ }
      finally { ready.current = true; }
    })();
    return () => { try { Speech.stop(); } catch { /* noop */ } };
  }, []);

  // Resolve a voice whenever the coach changes.
  useEffect(() => {
    (async () => {
      const persona = COACHES[coachId];
      const es = voices.current.filter((v) => (v.language ?? "").toLowerCase().startsWith("es"));
      const pool = es.length ? es : voices.current;
      // saved per-coach pick first
      const saved = await getVoiceId(coachId);
      let pick = saved ? voices.current.find((v) => v.identifier === saved) : undefined;
      if (!pick && es.length >= persona.voiceNum) pick = es[persona.voiceNum - 1];
      if (!pick) pick = pool.find((v) => (persona.gender === "female" ? isFemale(v) : !isFemale(v)));
      if (!pick) pick = pool[0];
      chosen.current = { id: pick?.identifier, lang: pick?.language ?? "es-ES" };
    })();
  }, [coachId]);

  const stop = useCallback(() => { try { Speech.stop(); } catch { /* noop */ } setSpeakingId(null); }, []);

  const speak = useCallback((id: string, text: string) => {
    if (!text) return;
    try { Speech.stop(); } catch { /* noop */ }
    if (speakingId === id) { setSpeakingId(null); return; } // tapping the playing one stops it
    setSpeakingId(id);
    Speech.speak(text, {
      voice: chosen.current.id,
      language: chosen.current.lang,
      pitch: PITCH[coachId],
      rate: 0.94,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }, [coachId, speakingId]);

  return { speak, stop, speakingId };
}
