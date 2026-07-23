import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceId, setVoiceId } from "../lib/prefs";
import { useCoach, setCoach as persistCoach, COACHES, CoachId, getCoachRate } from "../lib/coach-persona";
import { detectGender, COACH_PITCH } from "../lib/coach-voice";

// 10 royalty-free upbeat instrumental tracks that rotate randomly during a
// ride (admin-replaceable). When one finishes, a new random track plays; no
// track repeats until the whole set has been played.
const MUSIC_TRACKS = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
];

// A fresh shuffled play order (Fisher–Yates) so tracks rotate without repeats.
function shuffledOrder(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DUCK = 0.22; // music volume multiplier while Alberto is speaking
const PREVIEW = "Alright, let's ride. Hold steady and breathe.";

export type VoiceOption = { id: string; label: string; sublabel: string; accent: string; gender: "male" | "female" | "neutral"; lang: string; num: number };

// A human-readable name for a device voice (falls back to the identifier tail).
function readableName(v: Speech.Voice): string {
  const name = (v.name ?? "").trim();
  if (name && !name.startsWith("com.") && !/^[a-z]{2}([-_][a-z0-9]+)+$/i.test(name)) return name;
  const id = v.identifier ?? "";
  const tail = id.split(/[._-]/).filter(Boolean).pop() ?? id;
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : "Voice";
}

// The four accent groups Alberto can read English in.
const ALLOWED = ["es", "en", "it", "fr"] as const;
function accentOf(lang: string): string {
  const l = (lang || "").toLowerCase();
  if (l.startsWith("es")) return "Spanish (English)";
  if (l.startsWith("it")) return "Italian (English)";
  if (l.startsWith("fr")) return "French (English)";
  return "English";
}
function genderOf(v: Speech.Voice): "male" | "female" | "neutral" {
  return detectGender(v);
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

/** Choose the device voice for a coach persona — GENDER-FIRST so Alberto is a
 * Spanish-accented male voice and Adriana a Spanish-accented female voice.
 * Priority: the rider's explicit manual pick for this coach → Spanish + matching
 * gender (distinct from the other coach) → matching gender → any distinct Spanish
 * → any distinct. `avoidId` keeps the two coaches on different device voices. */
function pickVoiceForCoach(opts: VoiceOption[], coachId: CoachId, savedId?: string | null, avoidId?: string): VoiceOption | undefined {
  if (!opts.length) return undefined;
  const persona = COACHES[coachId];
  const opp = persona.gender === "male" ? "female" : "male";
  const notAvoid = (o: VoiceOption) => o.id !== avoidId;

  // 1. The rider's own manual pick for this coach always wins.
  if (savedId) { const s = opts.find((o) => o.id === savedId); if (s) return s; }

  const es = opts.filter((o) => o.accent === "Spanish (English)");
  const tiers: VoiceOption[][] = [
    es.filter((o) => o.gender === persona.gender && notAvoid(o)),  // Spanish + gender + distinct
    es.filter((o) => o.gender === persona.gender),                 // Spanish + gender
    es.filter((o) => o.gender !== opp && notAvoid(o)),             // Spanish, not opposite gender, distinct
    es.filter(notAvoid),                                           // any Spanish distinct
    opts.filter((o) => o.gender === persona.gender && notAvoid(o)),// any accent + gender distinct
    opts.filter(notAvoid),                                         // any distinct
  ];
  for (const t of tiers) { if (t.length) return t[0]; }
  return opts[0];
}

// Per-coach speaking pitch (shared) — a gentle secondary distinction now that
// voices are gender-correct.
const PITCH = COACH_PITCH;

/** Cycling music + the coach's spoken cues.
 * Music softens (ducks) while a cue is spoken, then returns to full volume.
 * Alberto speaks as a male voice with a mild Spanish accent (reading English). */
export function useWorkoutAudio() {
  // Random rotation state: a shuffled order + a pointer into it. `trackIdx` is
  // the current track (surfaced for the UI's "now playing" label if needed).
  const orderRef = useRef<number[]>(shuffledOrder(MUSIC_TRACKS.length));
  const ptrRef = useRef(0);
  const [firstUri] = useState(() => MUSIC_TRACKS[orderRef.current[0]]);
  const [trackIdx, setTrackIdx] = useState(() => orderRef.current[0]);
  const player = useAudioPlayer({ uri: firstUri });
  const [musicOn, setMusicOn] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const [voiceOn, setVoiceOn] = useState(true);
  const speaking = useRef(false);
  const voice = useRef<{ id?: string; lang: string }>({ id: undefined, lang: "es-ES" });
  const pitchRef = useRef(0.9);
  const voiceReady = useRef(false);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceIdState] = useState<string | undefined>(undefined);
  const savedVoices = useRef<Partial<Record<CoachId, string>>>({});
  const coachVoiceRef = useRef<Partial<Record<CoachId, { id?: string; lang: string }>>>({});
  const persona = useCoach();
  const coach = persona.id;

  // Build a curated, de-duplicated list of Spanish/English voices for the
  // selector, and choose Alberto's default (a Spanish male) or the rider's
  // previously saved voice.
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        // Only Spanish, English, Italian and French voices (all read English,
        // giving Alberto the chosen accent).
        const relevant = voices.filter((v) => {
          const l = (v.language ?? "").toLowerCase();
          return v.identifier && ALLOWED.some((p) => l.startsWith(p));
        });
        // Deduped by identifier; devices often expose no name/gender metadata,
        // so we number them per accent and let the rider preview by ear.
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
          opts.push({ id: v.identifier, label, sublabel, accent, gender, lang: v.language ?? "es-ES", num: n });
        }
        // Sort: detected males first (Alberto's preference), then neutral, then female.
        const rank = (o: VoiceOption) => (o.gender === "male" ? 0 : o.gender === "neutral" ? 1 : 2);
        opts.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
        setVoiceOptions(opts);
        // Load each coach's saved pick, then resolve a DISTINCT voice for both
        // so Alberto and Adriana never end up on the same device voice.
        const ids = Object.keys(COACHES) as CoachId[];
        const saved: Partial<Record<CoachId, string>> = {};
        for (const id of ids) { const v = await getVoiceId(id); if (v) saved[id] = v; }
        savedVoices.current = saved;
        const resolved: Partial<Record<CoachId, { id?: string; lang: string }>> = {};
        let taken: string | undefined;
        for (const id of ids) {
          const chosen = pickVoiceForCoach(opts, id, saved[id], taken);
          if (chosen) { resolved[id] = { id: chosen.id, lang: chosen.lang }; taken = chosen.id; }
        }
        coachVoiceRef.current = resolved;
      } catch {
        /* keep default es-ES */
      } finally {
        voiceReady.current = true;
      }
    })();
  }, []);

  // Apply the current coach's resolved voice + pitch whenever the coach changes
  // (also covers the persisted coach loading in on a cold start).
  useEffect(() => {
    if (!voiceOptions.length) return;
    let chosen = coachVoiceRef.current[coach];
    if (!chosen) {
      const other = coach === "alberto" ? "adriana" : "alberto";
      const picked = pickVoiceForCoach(voiceOptions, coach, savedVoices.current[coach], coachVoiceRef.current[other]?.id);
      if (picked) { chosen = { id: picked.id, lang: picked.lang }; coachVoiceRef.current[coach] = chosen; }
    }
    pitchRef.current = PITCH[coach];
    if (chosen && chosen.id !== voice.current.id) {
      voice.current = { id: chosen.id, lang: chosen.lang };
      setVoiceIdState(chosen.id);
    } else if (chosen) {
      setVoiceIdState(chosen.id);
    }
  }, [coach, voiceOptions]);

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

  // No native loop — we advance to the next random track when one finishes.
  useEffect(() => {
    try { player.loop = false; } catch { /* noop */ }
  }, [player]);

  // Advance to the next track in the shuffled order (reshuffles once exhausted).
  const advanceTrack = useCallback(() => {
    ptrRef.current += 1;
    if (ptrRef.current >= orderRef.current.length) {
      orderRef.current = shuffledOrder(MUSIC_TRACKS.length);
      ptrRef.current = 0;
    }
    const idx = orderRef.current[ptrRef.current];
    setTrackIdx(idx);
    try {
      player.replace({ uri: MUSIC_TRACKS[idx] });
      player.loop = false;
      player.volume = musicOn ? volume * (speaking.current ? DUCK : 1) : 0;
      if (musicOn) player.play();
    } catch { /* player not ready */ }
  }, [player, musicOn, volume]);

  // When the current track finishes, roll to the next random one.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (status?.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      advanceTrack();
    } else if (!status?.didJustFinish) {
      finishedRef.current = false;
    }
  }, [status?.didJustFinish, advanceTrack]);

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
      pitch: pitchRef.current,
      rate: getCoachRate(),           // rider's chosen speaking speed
      onDone: () => duck(false),
      onStopped: () => duck(false),
      onError: () => duck(false),
    });
  }, [voiceOn, duck]);

  /** Change the current coach's voice, persist it (per coach), and preview it. */
  const selectVoice = useCallback((id: string) => {
    const opt = voiceOptions.find((o) => o.id === id);
    if (!opt) return;
    voice.current = { id: opt.id, lang: opt.lang };
    coachVoiceRef.current[coach] = { id: opt.id, lang: opt.lang };
    savedVoices.current[coach] = opt.id;
    setVoiceIdState(opt.id);
    setVoiceId(coach, opt.id);
    Speech.stop();
    if (voiceOn) {
      duck(true);
      Speech.speak(PREVIEW, {
        voice: opt.id, language: opt.lang, pitch: pitchRef.current, rate: getCoachRate(),
        onDone: () => duck(false), onStopped: () => duck(false), onError: () => duck(false),
      });
    }
  }, [voiceOptions, voiceOn, duck, coach]);

  /** Switch coach persona (Alberto ↔ Adriana): updates the app-wide persona and
   * applies that coach's own saved/resolved voice (kept distinct from the other). */
  const chooseCoach = useCallback((id: CoachId) => {
    persistCoach(id);
    pitchRef.current = PITCH[id];
    let chosen = coachVoiceRef.current[id];
    if (!chosen) {
      const other = id === "alberto" ? "adriana" : "alberto";
      const picked = pickVoiceForCoach(voiceOptions, id, savedVoices.current[id], coachVoiceRef.current[other]?.id);
      if (picked) { chosen = { id: picked.id, lang: picked.lang }; coachVoiceRef.current[id] = chosen; }
    }
    if (chosen) {
      voice.current = { id: chosen.id, lang: chosen.lang };
      setVoiceIdState(chosen.id);
      Speech.stop();
      if (voiceOn) {
        duck(true);
        Speech.speak(PREVIEW, {
          voice: chosen.id, language: chosen.lang, pitch: PITCH[id], rate: getCoachRate(),
          onDone: () => duck(false), onStopped: () => duck(false), onError: () => duck(false),
        });
      }
    }
  }, [voiceOptions, voiceOn, duck]);

  return { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice, coach, chooseCoach, coachName: COACHES[coach].name, trackIdx, trackCount: MUSIC_TRACKS.length };
}
