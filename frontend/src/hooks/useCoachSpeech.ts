import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import Constants from "expo-constants";
import { CoachId } from "../lib/coach-persona";
import { getToken } from "../lib/session";

const API = ((process.env.EXPO_PUBLIC_BACKEND_URL
  || (Constants.expoConfig?.extra as any)?.backendUrl || "") as string).replace(/\/$/, "") + "/api";

// Let coach audio play even when the iOS ringer switch is silenced.
setAudioModeAsync({ playsInSilentMode: true }).catch(() => { /* noop */ });

/** Coach text-to-speech powered by Gemini natural voices (Alberto = warm male,
 * Adriana = warm female, both English with a light Spanish accent). Audio is
 * generated server-side and streamed here; if the network/voice service is
 * unavailable we fall back to the device's built-in speech so it always speaks.
 * Same {speak, stop, speakingId} API as before, so every caller works unchanged. */
export function useCoachSpeech(coachId: CoachId) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const reqRef = useRef(0);

  const teardown = useCallback(() => {
    try { playerRef.current?.remove(); } catch { /* noop */ }
    playerRef.current = null;
    if (blobUrlRef.current) { try { URL.revokeObjectURL(blobUrlRef.current); } catch { /* noop */ } blobUrlRef.current = null; }
    try { Speech.stop(); } catch { /* noop */ }
  }, []);

  const stop = useCallback(() => {
    reqRef.current += 1;
    teardown();
    setSpeakingId(null);
  }, [teardown]);

  useEffect(() => () => { reqRef.current += 1; teardown(); }, [teardown]);

  const fallback = useCallback((text: string, myReq: number) => {
    if (myReq !== reqRef.current) return;
    try {
      Speech.speak(text, {
        language: "es-ES",
        onDone: () => { if (myReq === reqRef.current) setSpeakingId(null); },
        onStopped: () => { if (myReq === reqRef.current) setSpeakingId(null); },
        onError: () => { if (myReq === reqRef.current) setSpeakingId(null); },
      });
    } catch { setSpeakingId(null); }
  }, []);

  const speak = useCallback(async (id: string, text: string) => {
    if (!text) return;
    if (speakingId === id) { stop(); return; }   // tap the playing one to stop
    stop();
    const myReq = reqRef.current;
    setSpeakingId(id);

    const url = `${API}/coach/speak?coach_id=${coachId}&text=${encodeURIComponent(text)}`;
    try {
      let source: any;
      if (Platform.OS === "web") {
        const res = await fetch(url); // patched fetch attaches the bearer token
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        blobUrlRef.current = obj;
        source = obj;
      } else {
        const token = getToken();
        source = { uri: url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
      }
      if (myReq !== reqRef.current) {   // a newer speak/stop happened while fetching
        if (blobUrlRef.current === source) { URL.revokeObjectURL(source); blobUrlRef.current = null; }
        return;
      }
      const player = createAudioPlayer(source);
      playerRef.current = player;
      player.addListener("playbackStatusUpdate", (st: any) => {
        if (st?.didJustFinish && myReq === reqRef.current) { setSpeakingId(null); teardown(); }
      });
      player.play();
    } catch {
      teardown();
      fallback(text, myReq);
    }
  }, [coachId, speakingId, stop, teardown, fallback]);

  return { speak, stop, speakingId };
}
