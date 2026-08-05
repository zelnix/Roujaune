/** Aggregate analysis API: PMC (Fitness/Fatigue/Form) + all-time power records. */
import Constants from "expo-constants";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL
  || (Constants.expoConfig?.extra as any)?.backendUrl || "") + "/api";

export type PmcPoint = { date: string; ctl: number; atl: number; tsb: number; tss: number };
export type Pmc = {
  series: PmcPoint[];
  fitness: number; fatigue: number; form: number;
  ramp_rate: number; form_state: string; weekly_tss: number;
};
export type PowerRecord = { secs: number; label: string; watts: number | null; activity_id?: string; name?: string; date?: string };

export async function fetchPmc(days = 90): Promise<Pmc | null> {
  const r = await fetch(`${API}/analysis/pmc?days=${days}`);
  return r.ok ? await r.json() : null;
}

export async function fetchRecords(): Promise<{ records: PowerRecord[]; has_data: boolean }> {
  const r = await fetch(`${API}/analysis/records`);
  return r.ok ? await r.json() : { records: [], has_data: false };
}
