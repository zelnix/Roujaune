import { useEffect, useState } from "react";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

export type TimelineRange = "week" | "month" | "3m" | "6m" | "1y";

export type TimelineBucket = { label: string; tss: number; hours: number; rides: number };
export type TimelineSummary = {
  rides: number; hours: number; tss: number; distance_km: number;
  elevation_m: number; avg_power: number; tss_delta_pct: number;
};
export type TimelineData = {
  range: TimelineRange;
  offset: number;
  has_next: boolean;
  window_label: string;
  buckets: TimelineBucket[];
  summary: TimelineSummary;
  recent: { title: string; date: string; tss: number; distance: string; color: string }[];
};

export const RANGE_OPTIONS: { key: TimelineRange; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "1y", label: "1 Year" },
];

/** Fetch the rider's bucketed, scrollable progress timeline. `offset` scrolls
 * whole windows into the past (0 = the window ending today). */
export function useProgressTimeline(range: TimelineRange, offset: number) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${apiBase()}/api/progress/timeline?range=${range}&offset=${offset}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (alive) setData(d);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [range, offset]);

  return { data, loading };
}
