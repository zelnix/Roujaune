import { useAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";

// Royalty-free instrumental track used as upbeat cycling music (admin-replaceable).
const MUSIC_SOURCE = { uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" };

const DUCK = 0.22; // music volume multiplier while Alberto is speaking

/** Cycling music + Alberto's spoken coaching cues.
 * Music softens (ducks) while a cue is spoken, then returns to full volume.
 * Alberto speaks as an older British male (en-GB voice reading English). */
export function useWorkoutAudio() {
  const player = useAudioPlayer(MUSIC_SOURCE);
  const [musicOn, setMusicOn] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const [voiceOn, setVoiceOn] = useState(true);
  const speaking = useRef(false);
  const voice = useRef<{ id?: string; lang: string }>({ id: undefined, lang: "en-GB" });

  // Pick an older British male voice (prefer named en-GB male voices such as
  // Daniel/Arthur/Oliver/George, which read as mature British English).
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const nameOf = (v: Speech.Voice) => `${v.name ?? ""} ${v.identifier ?? ""}`.toLowerCase();
        const maleHints = ["daniel", "arthur", "oliver", "george", "graham", "male"];
        const isMale = (v: Speech.Voice) => maleHints.some((n) => nameOf(v).includes(n));
        const gb = voices.filter((v) => (v.language ?? "").toLowerCase() === "en-gb");
        const en = voices.filter((v) => (v.language ?? "").toLowerCase().startsWith("en"));
        const chosen =
          gb.find(isMale) || gb[0] || en.find(isMale) || en[0];
        if (chosen) voice.current = { id: chosen.identifier, lang: chosen.language ?? "en-GB" };
      } catch {
        /* keep default en-GB */
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
    if (!voiceOn || !text) return;
    Speech.stop();
    duck(true);
    Speech.speak(text, {
      voice: voice.current.id,        // older British male
      language: voice.current.lang,
      pitch: 0.85,                    // lower, mature tone
      rate: 0.88,                     // measured, unhurried delivery
      onDone: () => duck(false),
      onStopped: () => duck(false),
      onError: () => duck(false),
    });
  }, [voiceOn, duck]);

  return { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak };
}
