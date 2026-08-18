import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";

export type MusicProvider = "spotify" | "apple";
export type SavedPlaylist = { id: string; provider: MusicProvider; url: string; title: string };

const KEY = "workout_music_playlists_v1";

/** Detect which streaming service a pasted link/URI belongs to. */
export function detectProvider(raw: string): MusicProvider | null {
  const u = raw.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("open.spotify.com") || u.startsWith("spotify:")) return "spotify";
  if (u.includes("music.apple.com") || u.startsWith("itmss://") || u.startsWith("music://")) return "apple";
  return null;
}

/** Human-friendly label derived from the link (Apple links carry the name). */
function labelFor(provider: MusicProvider, raw: string): string {
  if (provider === "apple") {
    const m = raw.match(/\/playlist\/([^/?#]+)/i);
    if (m?.[1] && !/^pl\./i.test(m[1])) {
      const words = decodeURIComponent(m[1]).replace(/[-_]+/g, " ").trim();
      if (words) return words.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "Apple Music playlist";
  }
  return "Spotify playlist";
}

/** Best URL to open the playlist directly inside its app (falls back to https). */
export function toDeepLink(pl: SavedPlaylist): { primary: string; fallback: string } {
  if (pl.provider === "spotify") {
    const m = pl.url.match(/playlist[/:]([A-Za-z0-9]+)/);
    if (m?.[1]) return { primary: `spotify:playlist:${m[1]}`, fallback: pl.url };
    return { primary: pl.url, fallback: pl.url };
  }
  // Apple Music universal link opens the Music app on iOS; keep https as-is.
  const https = pl.url.startsWith("http") ? pl.url : `https://${pl.url.replace(/^\/+/, "")}`;
  return { primary: https, fallback: https };
}

/** Open the playlist in Spotify / Apple Music (background audio while riding). */
export async function openPlaylist(pl: SavedPlaylist): Promise<boolean> {
  const { primary, fallback } = toDeepLink(pl);
  try {
    if (Platform.OS !== "web" && primary !== fallback) {
      const can = await Linking.canOpenURL(primary);
      if (can) { await Linking.openURL(primary); return true; }
    }
    await Linking.openURL(fallback);
    return true;
  } catch {
    try { await Linking.openURL(fallback); return true; } catch { return false; }
  }
}

export async function loadPlaylists(): Promise<SavedPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedPlaylist[]) : [];
  } catch {
    return [];
  }
}

async function persist(list: SavedPlaylist[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** Fetch a Spotify playlist's real title via the public oEmbed endpoint (no key). */
export async function fetchSpotifyTitle(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const title = (data?.title ?? "").toString().trim();
    return title || null;
  } catch {
    return null;
  }
}

/** Add a pasted playlist link. Returns the updated list, or null if the link
 *  isn't a recognised Spotify/Apple Music playlist. Fetches the real Spotify
 *  playlist name via oEmbed when possible. */
export async function addPlaylist(raw: string, list: SavedPlaylist[]): Promise<SavedPlaylist[] | null> {
  const url = raw.trim();
  const provider = detectProvider(url);
  if (!provider) return null;
  if (list.some((p) => p.url === url)) return list;
  let title = labelFor(provider, url);
  if (provider === "spotify") {
    const real = await fetchSpotifyTitle(url);
    if (real) title = real;
  }
  const pl: SavedPlaylist = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    provider,
    url,
    title,
  };
  const next = [pl, ...list].slice(0, 20);
  await persist(next);
  return next;
}

export async function removePlaylist(id: string, list: SavedPlaylist[]): Promise<SavedPlaylist[]> {
  const next = list.filter((p) => p.id !== id);
  await persist(next);
  return next;
}
