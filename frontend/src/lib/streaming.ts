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
  icon: string; // MaterialCommunityIcons name
  appUrl: string; // deep-link / universal link that opens the app if installed
  webUrl: string; // fallback (browser)
};

/** External streaming apps the rider can watch alongside the ride (their own
 *  subscription, on-device). We deep-link out and rely on Picture-in-Picture /
 *  split-screen so ROUJAUNE keeps recording — we never embed their content. */
export const STREAMING_SERVICES: StreamingService[] = [
  { id: "netflix", name: "Netflix", color: "#E50914", icon: "netflix", appUrl: "nflx://", webUrl: "https://www.netflix.com" },
  { id: "prime", name: "Prime Video", color: "#1FA0FF", icon: "filmstrip", appUrl: "https://app.primevideo.com", webUrl: "https://www.primevideo.com" },
  { id: "disney", name: "Disney+", color: "#1a3fe0", icon: "movie-open", appUrl: "disneyplus://", webUrl: "https://www.disneyplus.com" },
  { id: "appletv", name: "Apple TV", color: "#0a84ff", icon: "apple", appUrl: Platform.OS === "ios" ? "videos://" : "https://tv.apple.com", webUrl: "https://tv.apple.com" },
  { id: "youtube", name: "YouTube", color: "#FF0000", icon: "youtube", appUrl: "youtube://", webUrl: "https://www.youtube.com" },
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
