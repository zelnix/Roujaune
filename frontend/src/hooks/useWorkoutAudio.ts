import { useAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";

// Royalty-free instrumental track used as upbeat cycling music (admin-replaceable).
const MUSIC_SOURCE = { uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" };

const DUCK = 0.22; // music volume multiplier while Alberto is speaking

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

  // Pick a MALE Spanish voice reading English (mild Spanish accent). Never fall
  // back to a female voice — if no Spanish male exists, use an English male so
  // the gender stays consistent throughout the workout.
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const nameOf = (v: Speech.Voice) => `${v.name ?? ""} ${v.identifier ?? ""}`.toLowerCase();
        const maleNames = ["jorge", "diego", "carlos", "enrique", "miguel", "pablo", "juan", "hombre", "gonzalo"];
        const femaleNames = ["monica", "mónica", "paulina", "marisol", "esperanza", "mujer", "sabina", "elena"];
        // NOTE: check female first — the substring "female" contains "male",
        // so a female voice must never be classified as male.
        const isFemale = (v: Speech.Voice) => nameOf(v).includes("female") || femaleNames.some((n) => nameOf(v).includes(n));
        const isMale = (v: Speech.Voice) => !isFemale(v) && (nameOf(v).includes("#male") || / male/.test(nameOf(v)) || maleNames.some((n) => nameOf(v).includes(n)));
        const es = voices.filter((v) => (v.language ?? "").toLowerCase().startsWith("es"));
        const en = voices.filter((v) => (v.language ?? "").toLowerCase().startsWith("en"));
        const chosen =
          es.find(isMale) ||                 // explicit Spanish male
          es.find((v) => !isFemale(v)) ||    // any Spanish voice that isn't female
          en.find(isMale);                   // last resort: English male (no accent)
        if (chosen) voice.current = { id: chosen.identifier, lang: chosen.language ?? "es-ES" };
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

  return { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak };
}
