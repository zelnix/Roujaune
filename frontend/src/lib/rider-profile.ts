// Rider profile: physical attributes (weight/age/gender) live on the backend so
// they feed Alberto/Adriana's coaching; the avatar photo is stored locally.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RiderProfile = { name: string; weight_kg: number; age: number; gender: string };

const DEFAULT: RiderProfile = { name: "Rider One", weight_kg: 78, age: 42, gender: "male" };
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
          const p: RiderProfile = { name: d.name, weight_kg: d.weight_kg, age: d.age, gender: d.gender };
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

export function useRiderSeason() {
  const [season, setSeason] = useState<SeasonStats | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base()}/api/rider/season`);
        if (res.ok && alive) setSeason(await res.json());
      } catch {
        /* leave null → screen shows placeholders */
      }
    })();
    return () => { alive = false; };
  }, []);
  return season;
}
