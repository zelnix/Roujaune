// Rider profile: physical attributes (weight/age/gender) live on the backend so
// they feed Alberto/Adriana's coaching; the avatar photo is stored locally.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RiderProfile = { name: string; weight_kg: number; age: number; gender: string; city: string; region: string; country: string };

const DEFAULT: RiderProfile = { name: "Rider One", weight_kg: 78, age: 42, gender: "male", city: "", region: "", country: "" };
const AVATAR_KEY = "roujaune:riderAvatar";

// Module-level snapshot so non-React code (coach context builders) can read it.
let _snap: RiderProfile = { ...DEFAULT };
export function getRiderProfile(): RiderProfile {
  return _snap;
}

function base(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export function useRiderProfile() {
  const [profile, setProfile] = useState<RiderProfile>(_snap);
  const [avatar, setAvatarState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base()}/api/rider/profile`);
        if (res.ok) {
          const d = await res.json();
          const p: RiderProfile = { name: d.name, weight_kg: d.weight_kg, age: d.age, gender: d.gender, city: d.city ?? "", region: d.region ?? "", country: d.country ?? "" };
          _snap = p;
          setProfile(p);
        }
      } catch {
        /* keep defaults */
      }
      try {
        const a = await AsyncStorage.getItem(AVATAR_KEY);
        if (a) setAvatarState(a);
      } catch {
        /* no avatar */
      }
      setLoaded(true);
    })();
  }, []);

  const update = useCallback(async (patch: Partial<RiderProfile>) => {
    const next = { ..._snap, ...patch };
    _snap = next;
    setProfile(next);
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
    setAvatarState(uri);
    try {
      await AsyncStorage.setItem(AVATAR_KEY, uri);
    } catch {
      /* ignore */
    }
  }, []);

  return { profile, avatar, loaded, update, setAvatar };
}

export type SeasonStats = { rides: number; distance_km: number; elevation_m: number; hours: number; streak: number };

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
