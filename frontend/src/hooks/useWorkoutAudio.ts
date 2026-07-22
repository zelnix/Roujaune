import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceId, setVoiceId, getVoicePitch, setVoicePitch } from "../lib/prefs";

// Royalty-free instrumental track used as upbeat cycling music (admin-replaceable).
const MUSIC_SOURCE = { uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" };

const DUCK = 0.22; // music volume multiplier while Alberto is speaking
const PREVIEW = "Alright, let's ride. Hold steady and breathe.";

export type VoiceOption = { id: string; label: string; sublabel: string; accent: string; gender: "male" | "female" | "neutral"; lang: string };

// A human-readable name for a device voice (falls back to the identifier tail).
function readableName(v: Speech.Voice): string {
  const name = (v.name ?? "").trim();
  if (name && !name.startsWith("com.") && !/^[a-z]{2}([-_][a-z0-9]+)+$/i.test(name)) return name;
  const id = v.identifier ?? "";
  const tail = id.split(/[._-]/).filter(Boolean).pop() ?? id;
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : "Voice";
}

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
  const [pitch, setPitchState] = useState(0.8); // <1 = deeper/masculine, >1 = higher
  const pitchRef = useRef(0.8);

  // Build a curated, de-duplicated list of Spanish/English voices for the
  // selector, and choose Alberto's default (a Spanish male) or the rider's
  // previously saved voice.
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const relevant = voices.filter((v) => v.identifier);
        // Keep EVERY voice on the device (deduped by identifier only) so any
        // voice — any language, male or female — is reachable. Devices often
        // expose no name/gender metadata, so we number them per accent and let
        // the rider preview by ear.
        const seenId = new Set<string>();
        const opts: VoiceOption[] = [];
        const perAccent: Record<string, number> = {};
        for (const v of relevant) {
          if (seenId.has(v.identifier)) continue;
          seenId.add(v.identifier);
          const gender = genderOf(v);
          const accent = accentOf(v.language ?? "");
          const n = (perAccent[accent] = (perAccent[accent] ?? 0) + 1);
          const gTag = gender === "female" ? " · female" : gender === "male" ? " · male" : "";
          const label = `${accent} voice ${n}`;
          const sublabel = `${readableName(v)}${gTag}`;
          opts.push({ id: v.identifier, label, sublabel, accent, gender, lang: v.language ?? "es-ES" });
        }
        // Sort: detected males first (Alberto's preference), then neutral, then female.
        const rank = (o: VoiceOption) => (o.gender === "male" ? 0 : o.gender === "neutral" ? 1 : 2);
        opts.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
        setVoiceOptions(opts);

        const saved = await getVoiceId();
        const chosen = (saved && opts.find((o) => o.id === saved)) || opts[0];
        if (chosen) {
          voice.current = { id: chosen.id, lang: chosen.lang };
          setVoiceIdState(chosen.id);
        }
        const savedPitch = await getVoicePitch();
        if (savedPitch != null) { pitchRef.current = savedPitch; setPitchState(savedPitch); }
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

  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    try { player.loop = true; } catch { /* noop */ }
  }, [player]);

  // Start / update playback as soon as the track is loaded (fixes music not
  // playing until the volume was nudged).
  useEffect(() => { if (status?.isLoaded) apply(); }, [status?.isLoaded, apply]);

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
      voice: voice.current.id,
      language: voice.current.lang,
      pitch: pitchRef.current,        // rider-controlled tone (deep = masculine)
      rate: 0.92,                     // clear, well-paced English
      onDone: () => duck(false),
      onStopped: () => duck(false),
      onError: () => duck(false),
    });
  }, [voiceOn, duck]);

  /** Adjust the voice tone/pitch (lower = deeper/masculine), persist it, preview. */
  const setPitch = useCallback((p: number) => {
    const clamped = Math.max(0.5, Math.min(1.5, Math.round(p * 100) / 100));
    pitchRef.current = clamped;
    setPitchState(clamped);
    setVoicePitch(clamped);
    Speech.stop();
    if (voiceOn) {
      duck(true);
      Speech.speak(PREVIEW, {
        voice: voice.current.id, language: voice.current.lang, pitch: clamped, rate: 0.92,
        onDone: () => duck(false), onStopped: () => duck(false), onError: () => duck(false),
      });
    }
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
        voice: opt.id, language: opt.lang, pitch: pitchRef.current, rate: 0.92,
        onDone: () => duck(false), onStopped: () => duck(false), onError: () => duck(false),
      });
    }
  }, [voiceOptions, voiceOn, duck]);

  return { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice, pitch, setPitch };
}
