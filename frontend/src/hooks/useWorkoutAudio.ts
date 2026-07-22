import { useAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceId, setVoiceId } from "../lib/prefs";

// Royalty-free instrumental track used as upbeat cycling music (admin-replaceable).
const MUSIC_SOURCE = { uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" };

const DUCK = 0.22; // music volume multiplier while Alberto is speaking
const PREVIEW = "Alright, let's ride. Hold steady and breathe.";

export type VoiceOption = { id: string; label: string; accent: string; gender: "male" | "female" | "neutral"; lang: string };

// Friendly accent label from a BCP-47 language tag.
const ACCENTS: Record<string, string> = {
  "es-es": "Spanish", "es-mx": "Mexican Spanish", "es-us": "US Spanish", "es-ar": "Argentine Spanish",
  "es-co": "Colombian Spanish", "es-419": "Latin Spanish",
  "en-gb": "British", "en-us": "American", "en-au": "Australian", "en-ie": "Irish",
  "en-in": "Indian", "en-za": "South African", "en-ca": "Canadian",
};
function accentOf(lang: string): string {
  const l = (lang || "").toLowerCase();
  return ACCENTS[l] || (l.startsWith("es") ? "Spanish" : l.startsWith("en") ? "English" : lang);
}
const FEMALE_NAMES = ["monica", "mónica", "paulina", "marisol", "esperanza", "mujer", "sabina", "elena", "samantha", "karen", "victoria", "moira", "tessa", "fiona"];
const MALE_NAMES = ["jorge", "diego", "carlos", "enrique", "miguel", "pablo", "juan", "hombre", "gonzalo", "daniel", "arthur", "oliver", "aaron", "fred", "reed", "rishi"];
function genderOf(v: Speech.Voice): "male" | "female" | "neutral" {
  const s = `${v.name ?? ""} ${v.identifier ?? ""}`.toLowerCase();
  const isFemale = s.includes("female") || FEMALE_NAMES.some((n) => s.includes(n));
  if (isFemale) return "female";
  // Strip "female" so the substring "male" inside it can't cause a false match.
  const sm = s.replace(/female/g, "");
  if (sm.includes("male") || MALE_NAMES.some((n) => s.includes(n))) return "male";
  return "neutral";
}

// Speak numbers in English words so a Spanish voice doesn't read digits in
// Spanish (e.g. "251" → "two hundred fifty one").
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function intToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + intToWords(n % 100) : "");
  return intToWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + intToWords(n % 1000) : "");
}
function numbersToWords(text: string): string {
  return text.replace(/\d+/g, (m) => {
    const n = parseInt(m, 10);
    return n <= 9999 ? intToWords(n) : m;
  });
}

/** Cycling music + Alberto's spoken coaching cues.
 * Music softens (ducks) while a cue is spoken, then returns to full volume.
 * Alberto speaks as a male voice with a mild Spanish accent (reading English). */
export function useWorkoutAudio() {
  const player = useAudioPlayer(MUSIC_SOURCE);
  const [musicOn, setMusicOn] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const [voiceOn, setVoiceOn] = useState(true);
  const speaking = useRef(false);
  const voice = useRef<{ id?: string; lang: string }>({ id: undefined, lang: "es-ES" });
  const voiceReady = useRef(false);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceIdState] = useState<string | undefined>(undefined);

  // Build a curated, de-duplicated list of Spanish/English voices for the
  // selector, and choose Alberto's default (a Spanish male) or the rider's
  // previously saved voice.
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const relevant = voices.filter((v) => {
          const l = (v.language ?? "").toLowerCase();
          return v.identifier && (l.startsWith("es") || l.startsWith("en"));
        });
        // Keep EVERY voice (deduped by identifier only) so a male voice is
        // always reachable even when the OS doesn't expose gender metadata.
        const seenId = new Set<string>();
        const opts: VoiceOption[] = [];
        const labelCount: Record<string, number> = {};
        for (const v of relevant) {
          if (seenId.has(v.identifier)) continue;
          seenId.add(v.identifier);
          const gender = genderOf(v);
          const accent = accentOf(v.language ?? "");
          const gTag = gender === "female" ? " (female)" : gender === "male" ? " (male)" : "";
          let label = `${accent}${gTag}`;
          const n = (labelCount[label] = (labelCount[label] ?? 0) + 1);
          if (n > 1) label = `${label} ${n}`;
          opts.push({ id: v.identifier, label, accent, gender, lang: v.language ?? "es-ES" });
        }
        // Sort: Spanish male first (Alberto's default), then other males, neutral, female.
        const rank = (o: VoiceOption) =>
          (o.accent === "Spanish" && o.gender === "male" ? 0 : o.gender === "male" ? 1 : o.gender === "neutral" ? 2 : 3);
        opts.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
        setVoiceOptions(opts);

        const saved = await getVoiceId();
        const chosen = (saved && opts.find((o) => o.id === saved)) || opts[0];
        if (chosen) {
          voice.current = { id: chosen.id, lang: chosen.lang };
          setVoiceIdState(chosen.id);
        }
      } catch {
        /* keep default es-ES */
      } finally {
        voiceReady.current = true;
      }
    })();
  }, []);

  const apply = useCallback(() => {
    try {
      player.volume = musicOn ? volume * (speaking.current ? DUCK : 1) : 0;
      if (musicOn) player.play();
      else player.pause();
    } catch {
      /* player not ready yet */
    }
  }, [player, musicOn, volume]);

  useEffect(() => {
    try { player.loop = true; } catch { /* noop */ }
  }, [player]);

  useEffect(() => { apply(); }, [apply]);

  useEffect(() => {
    return () => { try { Speech.stop(); player.pause(); } catch { /* noop */ } };
  }, [player]);

  const setVolume = useCallback((v: number) => setVolumeState(Math.max(0, Math.min(1, v))), []);
  const toggleMusic = useCallback(() => setMusicOn((m) => !m), []);
  const toggleVoice = useCallback(() => setVoiceOn((v) => !v), []);

  const duck = useCallback((on: boolean) => {
    speaking.current = on;
    try { if (musicOn) player.volume = volume * (on ? DUCK : 1); } catch { /* noop */ }
  }, [player, musicOn, volume]);

  /** Speak an in-workout instruction aloud (with music ducking). */
  const speak = useCallback((text: string) => {
    if (!voiceOn || !text || !voiceReady.current) return;
    Speech.stop();
    duck(true);
    Speech.speak(numbersToWords(text), {
      voice: voice.current.id,        // male Spanish voice → mild Spanish accent
      language: voice.current.lang,
      pitch: 0.9,
      rate: 0.92,                     // clear, well-paced English
      onDone: () => duck(false),
      onStopped: () => duck(false),
      onError: () => duck(false),
    });
  }, [voiceOn, duck]);

  /** Change Alberto's voice, persist it, and speak a short preview. */
  const selectVoice = useCallback((id: string) => {
    const opt = voiceOptions.find((o) => o.id === id);
    if (!opt) return;
    voice.current = { id: opt.id, lang: opt.lang };
    setVoiceIdState(opt.id);
    setVoiceId(opt.id);
    Speech.stop();
    if (voiceOn) {
      duck(true);
      Speech.speak(PREVIEW, {
        voice: opt.id, language: opt.lang, pitch: 0.9, rate: 0.92,
        onDone: () => duck(false), onStopped: () => duck(false), onError: () => duck(false),
      });
    }
  }, [voiceOptions, voiceOn, duck]);

  return { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice };
}
