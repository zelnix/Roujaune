import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_ROUTE_KEY = "roujaune:lastRouteId";
const VOICE_KEY = "roujaune:voiceId";
const KIT_KEY = "roujaune:kitPreset";

/** Persisted 3D-rider kit preset key (e.g. "yellow"). */
export async function getKitPreset(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KIT_KEY);
  } catch {
    return null;
  }
}

export async function setKitPreset(preset: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KIT_KEY, preset);
  } catch {
    /* noop */
  }
}

/** Persisted identifier of Alberto's chosen TTS voice (across sessions). */
export async function getVoiceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export async function setVoiceId(id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(VOICE_KEY, id);
    else await AsyncStorage.removeItem(VOICE_KEY);
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
