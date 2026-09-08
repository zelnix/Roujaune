import React from "react";
import { notifyPlanChanged } from "./plan";

export type MissedItem = { id?: string; date: string; title: string; suggested_date?: string };
export type MissedWorkouts = {
  count: number;
  missed: MissedItem[];
  suggested_date?: string;
  guidance: string;
  refresh?: () => void;
};

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

/** Skip or reschedule a missed session. Reschedule uses `date` (or the coach's
 * safe pick when omitted). Signals the whole app so the plan/calendar refresh. */
export async function resolveMissed(
  entryId: string,
  action: "skip" | "reschedule",
  date?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/rider/missed/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entryId, action, date: date || "" }),
    });
    if (res.ok) { notifyPlanChanged(); return true; }
  } catch { /* best-effort */ }
  return false;
}

/** Safe missed-workout signal for the Home notification area. */
export function useMissedWorkouts(): MissedWorkouts {
  const [data, setData] = React.useState<MissedWorkouts>({ count: 0, missed: [], guidance: "" });
  const [nonce, setNonce] = React.useState(0);
  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/rider/missed`);
        if (res.ok) {
          const j = (await res.json()) as MissedWorkouts;
          if (alive) setData({ ...j, refresh });
        }
      } catch {
        // best-effort
      }
    })();
    return () => { alive = false; };
  }, [nonce, refresh]);
  return data;
}
