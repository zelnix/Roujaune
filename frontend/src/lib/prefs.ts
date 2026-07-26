import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_ROUTE_KEY = "roujaune:lastRouteId";
const FAV_ROUTE_KEY = "roujaune:favRoute";
const VOICE_KEY = "roujaune:voiceId";
const COACH_KEY = "roujaune:coachId";
const COACH_STYLE_KEY = "roujaune:coachStyle";
const VOICE_GUIDANCE_KEY = "roujaune:voiceGuidance";
const SPEECH_RATE_KEY = "roujaune:speechRate";

// Mirror coaching preferences to the server so they persist across devices.
function prefsApi(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}
function pushRiderPref(patch: Record<string, unknown>): void {
  fetch(`${prefsApi()}/api/rider/prefs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => { /* keep local; re-syncs on next change */ });
}

// Mirror an arbitrary local (AsyncStorage) preference key to the server KV store
// so per-coach voice, favourite routes, etc. persist across devices too.
function remoteKvSet(key: string, value: string | null): void {
  fetch(`${prefsApi()}/api/rider/kv`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => { /* keep local; re-syncs on next change */ });
}

/** Pull every server-stored KV preference into the local cache at startup so
 * ALL preferences follow the rider across devices. */
export async function hydrateKvPrefs(): Promise<void> {
  try {
    const res = await fetch(`${prefsApi()}/api/rider/kv`);
    if (!res.ok) return;
    const d = await res.json();
    for (const [k, v] of Object.entries(d || {})) {
      if (typeof k === "string" && k.startsWith("roujaune:") && v != null) {
        await AsyncStorage.setItem(k, String(v));
      }
    }
  } catch {
    /* keep local cache */
  }
}

/** Persisted speaking speed for coach TTS (0.8 slow – 1.1 fast; default 0.95). */
export async function getSpeechRate(): Promise<number | null> {
  try { const v = await AsyncStorage.getItem(SPEECH_RATE_KEY); return v ? parseFloat(v) : null; } catch { return null; }
}
export async function setSpeechRate(rate: number): Promise<void> {
  try { await AsyncStorage.setItem(SPEECH_RATE_KEY, String(rate)); } catch { /* noop */ }
  pushRiderPref({ speech_rate: rate });
}

/** Persisted coaching style ("balanced" | "performance" | "calm" | "essential"). */
export async function getCoachStyle(): Promise<string | null> {
  try { return await AsyncStorage.getItem(COACH_STYLE_KEY); } catch { return null; }
}
export async function setCoachStyle(style: string): Promise<void> {
  try { await AsyncStorage.setItem(COACH_STYLE_KEY, style); } catch { /* noop */ }
  pushRiderPref({ coach_style: style });
}

/** Persisted voice guidance mode ("full" | "essential" | "visual" | "muted"). */
export async function getVoiceGuidance(): Promise<string | null> {
  try { return await AsyncStorage.getItem(VOICE_GUIDANCE_KEY); } catch { return null; }
}
export async function setVoiceGuidance(mode: string): Promise<void> {
  try { await AsyncStorage.setItem(VOICE_GUIDANCE_KEY, mode); } catch { /* noop */ }
  pushRiderPref({ voice_guidance: mode });
}

/** Hydrate the local cache from the server's rider prefs (call once at startup,
 * after auth). Ensures coaching preferences follow the rider across devices. */
export async function hydrateRiderPrefs(): Promise<void> {
  try {
    const res = await fetch(`${prefsApi()}/api/rider/prefs`);
    if (!res.ok) return;
    const d = await res.json();
    if (d?.coach_style) await AsyncStorage.setItem(COACH_STYLE_KEY, String(d.coach_style));
    if (d?.voice_guidance) await AsyncStorage.setItem(VOICE_GUIDANCE_KEY, String(d.voice_guidance));
    if (d?.speech_rate != null) await AsyncStorage.setItem(SPEECH_RATE_KEY, String(d.speech_rate));
  } catch {
    /* keep local cache */
  }
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
  remoteKvSet(`${VOICE_KEY}:${coachId}`, id);
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
  remoteKvSet(LAST_ROUTE_KEY, id);
}

/** Persisted favourite scenic route pinned per workout type (across sessions). */
export async function getFavoriteRoute(typeId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${FAV_ROUTE_KEY}:${typeId}`);
  } catch {
    return null;
  }
}

export async function setFavoriteRoute(typeId: string, routeId: string | null): Promise<void> {
  try {
    if (routeId) await AsyncStorage.setItem(`${FAV_ROUTE_KEY}:${typeId}`, routeId);
    else await AsyncStorage.removeItem(`${FAV_ROUTE_KEY}:${typeId}`);
  } catch {
    /* noop */
  }
  remoteKvSet(`${FAV_ROUTE_KEY}:${typeId}`, routeId);
}
