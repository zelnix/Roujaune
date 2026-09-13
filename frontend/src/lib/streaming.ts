import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Extract a YouTube video ID from any common URL form (or a bare 11-char ID). */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

export type StreamingService = {
  id: string;
  name: string;
  color: string;
  icon?: string; // MaterialCommunityIcons name (brand apps)
  label?: string; // short monogram shown when there's no brand icon (e.g. "9", "7+")
  appUrl: string; // deep-link / universal link that opens the app if installed
  webUrl: string; // fallback (browser)
  /** Free-to-air / ad-supported services worth TRYING inside our own in-app
   *  browser (like a YouTube embed). Paid DRM services (Netflix, Prime,
   *  Disney+, Apple TV, Stan, Binge, Kayo) always deep-link out instead —
   *  their video playback is blocked in any third-party embed/webview by
   *  design, so there's no point pretending otherwise. */
  embeddable?: boolean;
};

/** External streaming apps the rider can watch alongside the ride (their own
 *  subscription, on-device). Paid/DRM services deep-link out and rely on
 *  Picture-in-Picture / split-screen — we never embed their content (Netflix
 *  etc. actively block it). A few free-to-air services are flagged
 *  `embeddable` and get tried inside our own in-app browser first. */
export const STREAMING_SERVICES: StreamingService[] = [
  { id: "netflix", name: "Netflix", color: "#E50914", icon: "netflix", appUrl: "nflx://", webUrl: "https://www.netflix.com" },
  { id: "prime", name: "Prime Video", color: "#1FA0FF", icon: "filmstrip", appUrl: "https://app.primevideo.com", webUrl: "https://www.primevideo.com" },
  { id: "disney", name: "Disney+", color: "#1a3fe0", icon: "movie-open", appUrl: "disneyplus://", webUrl: "https://www.disneyplus.com" },
  { id: "appletv", name: "Apple TV", color: "#0a84ff", icon: "apple", appUrl: Platform.OS === "ios" ? "videos://" : "https://tv.apple.com", webUrl: "https://tv.apple.com" },
  { id: "youtube", name: "YouTube", color: "#FF0000", icon: "youtube", appUrl: "youtube://", webUrl: "https://www.youtube.com" },
  // --- Australian free-to-air & subscription services (universal links open --
  //     the app when installed, else the website) --------------------------- //
  { id: "sbs", name: "SBS On Demand", color: "#5A5A5A", label: "SBS", appUrl: "https://www.sbs.com.au/ondemand", webUrl: "https://www.sbs.com.au/ondemand", embeddable: true },
  { id: "9now", name: "9Now", color: "#0096D6", label: "9", appUrl: "https://www.9now.com.au", webUrl: "https://www.9now.com.au", embeddable: true },
  { id: "7plus", name: "7plus", color: "#EE3124", label: "7+", appUrl: "https://7plus.com.au", webUrl: "https://7plus.com.au", embeddable: true },
  { id: "10play", name: "10 play", color: "#005CB9", label: "10", appUrl: "https://10play.com.au", webUrl: "https://10play.com.au", embeddable: true },
  { id: "iview", name: "ABC iview", color: "#14C5C8", label: "iV", appUrl: "https://iview.abc.net.au", webUrl: "https://iview.abc.net.au", embeddable: true },
  { id: "stan", name: "Stan", color: "#0067FF", label: "S", appUrl: "https://www.stan.com.au", webUrl: "https://www.stan.com.au" },
  { id: "binge", name: "Binge", color: "#E4007C", label: "B", appUrl: "https://binge.com.au", webUrl: "https://binge.com.au" },
  { id: "kayo", name: "Kayo Sports", color: "#0A8F5B", label: "K", appUrl: "https://kayosports.com.au", webUrl: "https://kayosports.com.au" },
];

/** Open the streaming app if installed, else fall back to the web/store URL.
 *  Uses openURL with a try/catch fallback so an unhandled scheme never dead-ends. */
export async function launchStreaming(svc: StreamingService): Promise<boolean> {
  const tryOpen = async (url: string) => {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  };
  if (await tryOpen(svc.appUrl)) return true;
  return tryOpen(svc.webUrl);
}

/** Platform-specific tip for keeping ROUJAUNE running while watching another app. */
export function pipTip(name: string): string {
  return Platform.OS === "ios"
    ? `Start playing in ${name}, tap the Picture-in-Picture button, then swipe back here. Your ride keeps recording while the video floats on top.`
    : `Start playing in ${name}, then open split-screen with ROUJAUNE (or Picture-in-Picture). Your ride keeps recording alongside the video.`;
}

// --- Rider's own custom streaming apps ("More apps") --------------------- //
const CUSTOM_APPS_KEY = "roujaune.streaming.customapps";
const CUSTOM_APPS_MAX = 12;
export type CustomStreamingApp = { id: string; name: string; url: string };

/** Turn whatever the rider typed into an openable URL: keep an explicit scheme
 *  (e.g. `sbsondemand://`) as-is, otherwise assume a website and prefix https. */
export function normalizeAppUrl(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

export async function loadCustomApps(): Promise<CustomStreamingApp[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_APPS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Add a rider-named app (deduped by name, capped). Returns the new list. */
export async function addCustomApp(name: string, url: string): Promise<CustomStreamingApp[]> {
  const cleanName = (name || "").trim();
  const cleanUrl = normalizeAppUrl(url);
  if (!cleanName || !cleanUrl) return loadCustomApps();
  try {
    const cur = await loadCustomApps();
    const id = `custom-${Date.now()}`;
    const deduped = cur.filter((a) => a.name.trim().toLowerCase() !== cleanName.toLowerCase());
    const next = [{ id, name: cleanName, url: cleanUrl }, ...deduped].slice(0, CUSTOM_APPS_MAX);
    await AsyncStorage.setItem(CUSTOM_APPS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadCustomApps();
  }
}

export async function removeCustomApp(id: string): Promise<CustomStreamingApp[]> {
  try {
    const cur = await loadCustomApps();
    const next = cur.filter((a) => a.id !== id);
    await AsyncStorage.setItem(CUSTOM_APPS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadCustomApps();
  }
}

// --- Favourites (pinned to the top of the picker, in pin order) ---------- //
const FAV_KEY = "roujaune.streaming.favorites";

export async function loadFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Pin (move to front) or unpin a service/app id. Returns the new fav order. */
export async function toggleFavorite(id: string): Promise<string[]> {
  try {
    const cur = await loadFavorites();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadFavorites();
  }
}

/** Open a rider's custom app link, falling back to a store/web search so it
 *  never dead-ends if the deep-link scheme isn't installed. */
export async function launchCustomApp(app: CustomStreamingApp): Promise<boolean> {
  try {
    await Linking.openURL(app.url);
    return true;
  } catch {
    try {
      await Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(app.name)}`);
      return true;
    } catch {
      return false;
    }
  }
}

// --- Recently used "My YouTube" sources (one-tap reselection) ------------- //
const YT_RECENTS_KEY = "roujaune.youtube.recents";
const YT_RECENTS_MAX = 6;
export type YouTubeRecent = { id: string; url: string; ts: number; title?: string };

/** Public YouTube thumbnail for a video id (no API key needed). */
export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

/** Fetch a video's real title via YouTube's public oEmbed endpoint (no key). */
export async function fetchYouTubeTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.title === "string" ? j.title : null;
  } catch {
    return null;
  }
}

export async function loadYouTubeRecents(): Promise<YouTubeRecent[]> {
  try {
    const raw = await AsyncStorage.getItem(YT_RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Add/bump a video to the front of recents (deduped, capped). Resolves the
 *  real title via oEmbed when not supplied. */
export async function addYouTubeRecent(id: string, url: string, title?: string): Promise<YouTubeRecent[]> {
  try {
    const cur = await loadYouTubeRecents();
    const resolved = title ?? cur.find((r) => r.id === id)?.title ?? (await fetchYouTubeTitle(id)) ?? undefined;
    const next = [{ id, url, ts: Date.now(), title: resolved }, ...cur.filter((r) => r.id !== id)].slice(0, YT_RECENTS_MAX);
    await AsyncStorage.setItem(YT_RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
