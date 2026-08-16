// Rider profile: physical attributes (weight/age/gender) live on the backend so
// they feed Alberto/Adriana's coaching; the avatar photo is stored locally.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Capability = "beginner" | "intermediate" | "advanced";
export type RiderProfile = { name: string; weight_kg: number; age: number; gender: string; city: string; region: string; country: string; capability: Capability };

const DEFAULT: RiderProfile = { name: "Rider One", weight_kg: 78, age: 42, gender: "male", city: "", region: "", country: "", capability: "intermediate" };
const AVATAR_KEY = "roujaune:riderAvatar";
const PROFILE_KEY = "roujaune:riderProfile";

// Module-level snapshots so non-React code (coach context builders) can read
// them AND so every mounted useRiderProfile() consumer (Home hero, Profile…)
// stays in sync the instant the avatar/profile changes.
let _snap: RiderProfile = { ...DEFAULT };
let _avatarSnap: string | null = null;
const _listeners = new Set<() => void>();
function _emit() { _listeners.forEach((l) => l()); }

export function getRiderProfile(): RiderProfile {
  return _snap;
}

/** Clear cached rider identity from memory (call on logout / account delete
 *  so nothing leaks into the next account signing in on this runtime). */
export function resetRiderProfile() {
  _snap = { ...DEFAULT };
  _avatarSnap = null;
  _emit();
}

// Hydrate the module snapshots from the last-known cache as early as possible
// so no screen shows a placeholder avatar/name on cold start.
AsyncStorage.getItem(PROFILE_KEY).then((raw) => {
  if (raw) {
    try { _snap = { ...DEFAULT, ...JSON.parse(raw) }; _emit(); } catch { /* ignore */ }
  }
}).catch(() => {});
AsyncStorage.getItem(AVATAR_KEY).then((a) => {
  if (a) { _avatarSnap = a; _emit(); }
}).catch(() => {});

function base(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export function useRiderProfile() {
  const [profile, setProfile] = useState<RiderProfile>(_snap);
  const [avatar, setAvatarState] = useState<string | null>(_avatarSnap);
  const [loaded, setLoaded] = useState(false);

  // Keep every mounted consumer in sync with the shared snapshots.
  useEffect(() => {
    const l = () => { setProfile(_snap); setAvatarState(_avatarSnap); };
    _listeners.add(l);
    l();
    return () => { _listeners.delete(l); };
  }, []);

  useEffect(() => {
    (async () => {
      // 1) Instant paint from the cached profile + avatar (prevents flashes).
      try {
        const cached = await AsyncStorage.getItem(PROFILE_KEY);
        if (cached) {
          _snap = { ...DEFAULT, ...JSON.parse(cached) };
          _emit();
        }
      } catch {
        /* ignore cache */
      }
      try {
        const a = await AsyncStorage.getItem(AVATAR_KEY);
        if (a) { _avatarSnap = a; _emit(); }
      } catch {
        /* no avatar */
      }
      // 2) Reconcile with the backend (source of truth) and refresh the cache.
      try {
        const res = await fetch(`${base()}/api/rider/profile`);
        if (res.ok) {
          const d = await res.json();
          _snap = {
            name: d.name ?? DEFAULT.name,
            weight_kg: typeof d.weight_kg === "number" && !isNaN(d.weight_kg) ? d.weight_kg : DEFAULT.weight_kg,
            age: typeof d.age === "number" && !isNaN(d.age) ? d.age : DEFAULT.age,
            gender: d.gender ?? DEFAULT.gender,
            city: d.city ?? "", region: d.region ?? "", country: d.country ?? "",
            capability: d.capability ?? "intermediate",
          };
          AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(_snap)).catch(() => {});
          // Avatar: backend is the source of truth across devices. An explicit
          // empty string means "no avatar" and should clear a stale local one.
          if (typeof d.avatar === "string") {
            _avatarSnap = d.avatar || null;
            if (d.avatar) AsyncStorage.setItem(AVATAR_KEY, d.avatar).catch(() => {});
            else AsyncStorage.removeItem(AVATAR_KEY).catch(() => {});
          }
          _emit();
        }
      } catch {
        /* keep cache/defaults */
      }
      setLoaded(true);
    })();
  }, []);

  const update = useCallback(async (patch: Partial<RiderProfile>) => {
    _snap = { ..._snap, ...patch };
    _emit();
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(_snap)).catch(() => {});
    try {
      await fetch(`${base()}/api/rider/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      /* offline: kept locally in snapshot */
    }
  }, []);

  const setAvatar = useCallback(async (uri: string) => {
    _avatarSnap = uri;
    _emit();
    AsyncStorage.setItem(AVATAR_KEY, uri).catch(() => {});
    try {
      await fetch(`${base()}/api/rider/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: uri }),
      });
    } catch {
      /* offline: kept locally in AsyncStorage */
    }
  }, []);

  return { profile, avatar, loaded, update, setAvatar };
}

export type SeasonStats = { rides: number; distance_km: number; elevation_m: number; hours: number; streak: number; supplementary?: number };

export type Weather = { value: string; sub: string } | null;

export function useWeather() {
  const [weather, setWeather] = useState<Weather>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const p = _snap;
      if (!p.city && !p.region) {
        if (alive) setWeather(null);
        return;
      }
      try {
        const q = new URLSearchParams({ city: p.city, region: p.region, country: p.country }).toString();
        const res = await fetch(`${base()}/api/weather?${q}`);
        const d = await res.json();
        if (alive && d?.available) setWeather({ value: `${d.temp_c}`, sub: `${d.place} · feels ${d.feels_c}°C` });
        else if (alive) setWeather(null);
      } catch {
        if (alive) setWeather(null);
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return weather;
}

export type Achievement = { icon: string; label: string; sub: string; color: string };

export function useRiderAchievements() {
  const [list, setList] = useState<Achievement[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base()}/api/rider/achievements`);
        if (res.ok && alive) { const j = await res.json(); setList(j.achievements ?? []); }
      } catch { /* leave null */ }
    })();
    return () => { alive = false; };
  }, []);
  return list;
}

export function useRiderSeason(days = 0) {
  const [season, setSeason] = useState<SeasonStats | null>(null);
  useEffect(() => {
    let alive = true;
    setSeason(null);
    (async () => {
      try {
        const res = await fetch(`${base()}/api/rider/season?days=${days}`);
        if (res.ok && alive) setSeason(await res.json());
      } catch {
        /* leave null → screen shows placeholders */
      }
    })();
    return () => { alive = false; };
  }, [days]);
  return season;
}
