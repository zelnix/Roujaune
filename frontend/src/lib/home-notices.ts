import React from "react";

export type MissedWorkouts = {
  count: number;
  missed: { date: string; title: string }[];
  guidance: string;
};

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/** Safe missed-workout signal for the Home notification area. */
export function useMissedWorkouts(): MissedWorkouts {
  const [data, setData] = React.useState<MissedWorkouts>({ count: 0, missed: [], guidance: "" });
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/rider/missed`);
        if (res.ok) {
          const j = (await res.json()) as MissedWorkouts;
          if (alive) setData(j);
        }
      } catch {
        // best-effort
      }
    })();
    return () => { alive = false; };
  }, []);
  return data;
}
