import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_ROUTE_KEY = "roujaune:lastRouteId";
const VOICE_KEY = "roujaune:voiceId";
const COACH_KEY = "roujaune:coachId";
const COACH_STYLE_KEY = "roujaune:coachStyle";
const VOICE_GUIDANCE_KEY = "roujaune:voiceGuidance";

/** Persisted coaching style ("balanced" | "performance" | "calm" | "essential"). */
export async function getCoachStyle(): Promise<string | null> {
  try { return await AsyncStorage.getItem(COACH_STYLE_KEY); } catch { return null; }
}
export async function setCoachStyle(style: string): Promise<void> {
  try { await AsyncStorage.setItem(COACH_STYLE_KEY, style); } catch { /* noop */ }
}

/** Persisted voice guidance mode ("full" | "essential" | "visual" | "muted"). */
export async function getVoiceGuidance(): Promise<string | null> {
  try { return await AsyncStorage.getItem(VOICE_GUIDANCE_KEY); } catch { return null; }
}
export async function setVoiceGuidance(mode: string): Promise<void> {
  try { await AsyncStorage.setItem(VOICE_GUIDANCE_KEY, mode); } catch { /* noop */ }
}

/** Persisted coach persona id ("alberto" | "adriana"). */
export async function getCoachId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(COACH_KEY);
  } catch {
    return null;
  }
}

export async function setCoachId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(COACH_KEY, id);
  } catch {
    /* noop */
  }
}

/** Persisted identifier of a coach's chosen TTS voice (per coach, across sessions). */
export async function getVoiceId(coachId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${VOICE_KEY}:${coachId}`);
  } catch {
    return null;
  }
}

export async function setVoiceId(coachId: string, id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(`${VOICE_KEY}:${coachId}`, id);
    else await AsyncStorage.removeItem(`${VOICE_KEY}:${coachId}`);
  } catch {
    /* noop */
  }
}

/** Persisted id of the last route the rider chose (across sessions). */
export async function getLastRouteId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ROUTE_KEY);
  } catch {
    return null;
  }
}

export async function setLastRouteId(id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(LAST_ROUTE_KEY, id);
    else await AsyncStorage.removeItem(LAST_ROUTE_KEY);
  } catch {
    /* noop */
  }
}
