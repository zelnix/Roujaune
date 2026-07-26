import { useEffect, useState } from "react";
import * as Location from "expo-location";

export type HomeLocation = { city: string; lat: number; lon: number };

export type DailyForecast = { label: string; tmax: number; tmin: number; icon: WeatherState["icon"] };

export type WeatherState = {
  temp: string;          // e.g. "18°C"
  place: string;         // e.g. "Nice, France"
  dateLabel: string;     // e.g. "Sunday, 26 July"
  icon: "sunny" | "partly-sunny" | "cloudy" | "rainy" | "snow" | "thunderstorm";
  source: "gps" | "home" | "default";
  loading: boolean;
  daily: DailyForecast[]; // next 7 days
};

// WMO weather-code → a coarse Ionicons name for the hero badge.
function iconFor(code: number): WeatherState["icon"] {
  if (code === 0) return "sunny";
  if (code <= 2) return "partly-sunny";
  if (code === 3 || code === 45 || code === 48) return "cloudy";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 95) return "thunderstorm";
  return "rainy";
}

function todayLabel(): string {
  try {
    return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

async function fetchWeather(lat: number, lon: number): Promise<{ temp: string; icon: WeatherState["icon"]; daily: DailyForecast[] } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const d = await res.json();
    const t = d?.current?.temperature_2m;
    const code = d?.current?.weather_code ?? 0;
    if (t == null) return null;
    const daily: DailyForecast[] = [];
    const times: string[] = d?.daily?.time ?? [];
    const codes: number[] = d?.daily?.weather_code ?? [];
    const tmax: number[] = d?.daily?.temperature_2m_max ?? [];
    const tmin: number[] = d?.daily?.temperature_2m_min ?? [];
    for (let i = 0; i < times.length; i++) {
      let label = times[i];
      try { label = new Date(times[i]).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); } catch { /* keep iso */ }
      daily.push({ label, tmax: Math.round(tmax[i]), tmin: Math.round(tmin[i]), icon: iconFor(codes[i] ?? 0) });
    }
    return { temp: `${Math.round(t)}°C`, icon: iconFor(code), daily };
  } catch {
    return null;
  }
}

/** Live local weather for the home hero: tries device GPS first, then falls
 * back to the rider's saved home location (useful indoors where GPS fails),
 * then to a sensible default. Never blocks or dead-ends the UI. */
export function useWeather(home: HomeLocation): WeatherState {
  const [state, setState] = useState<WeatherState>({
    temp: "—", place: home.city, dateLabel: todayLabel(), icon: "partly-sunny", source: "default", loading: true, daily: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Try GPS (best-effort; indoors this often fails → we fall back).
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        let granted = status === "granted";
        if (!granted) {
          const req = await Location.requestForegroundPermissionsAsync();
          granted = req.status === "granted";
        }
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const w = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
          if (w && alive) {
            let place = home.city;
            try {
              const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              const g = geo?.[0];
              if (g) place = [g.city || g.subregion || g.region, g.country].filter(Boolean).join(", ");
            } catch { /* keep home city */ }
            setState({ ...w, place, dateLabel: todayLabel(), source: "gps", loading: false });
            return;
          }
        }
      } catch { /* fall through to home location */ }

      // 2) Fall back to the saved home location.
      const w = await fetchWeather(home.lat, home.lon);
      if (!alive) return;
      if (w) {
        setState({ ...w, place: home.city, dateLabel: todayLabel(), source: "home", loading: false });
      } else {
        setState((s) => ({ ...s, place: home.city, dateLabel: todayLabel(), loading: false }));
      }
    })();
    return () => { alive = false; };
  }, [home.lat, home.lon, home.city]);

  return state;
}
