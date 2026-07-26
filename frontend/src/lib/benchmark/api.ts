// Benchmark data access. `fetch` is auto-authed by installFetchAuth (session.ts),
// so plain calls carry the rider's token. Hooks resolve gracefully to empty so
// the UI shows honest empty states before any benchmark is completed.
import { useCallback, useEffect, useState } from "react";
import type { BenchmarkResult, BenchmarkProfile, ReadinessAnswer, ReadinessOutcome, BenchmarkSession } from "./types";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

const EMPTY_PROFILE: BenchmarkProfile = {
  ftp: null, ftpWkg: null, fiveMinPower: null, oneMinPower: null, sprintPower: null,
  aerobicEfficiency: null, preferredCadence: null, recoveryResponse: null, lastBenchmarkDate: null,
};

export async function fetchBenchmarkResults(): Promise<BenchmarkResult[]> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/results`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchBenchmarkProfile(): Promise<BenchmarkProfile> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/profile`);
    if (!res.ok) return EMPTY_PROFILE;
    const data = await res.json();
    return { ...EMPTY_PROFILE, ...(data || {}) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function createBenchmarkSession(input: {
  testId: string;
  readinessAnswers: Record<string, ReadinessAnswer>;
  readiness: ReadinessOutcome;
}): Promise<BenchmarkSession | null> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, status: "in_progress" }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveBenchmarkResult(payload: Record<string, unknown>): Promise<{ id?: string } | null> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface PlanReview {
  hasProposal: boolean;
  metric?: string; previous?: number; next?: number; delta?: number; deltaPct?: number;
  effectiveDate?: string; reason?: string; affected?: string[];
  zonesPreview?: { key: string; name: string; oldLow: number; oldHigh: number | null; newLow: number; newHigh: number | null }[];
  sourceTestId?: string;
}
export async function fetchPlanReview(): Promise<PlanReview> {
  try { const res = await fetch(`${apiBase()}/api/benchmark/plan-review`); return res.ok ? await res.json() : { hasProposal: false }; }
  catch { return { hasProposal: false }; }
}
export async function applyPlanReview(): Promise<boolean> {
  try { const res = await fetch(`${apiBase()}/api/benchmark/plan-review/apply`, { method: "POST" }); return res.ok; } catch { return false; }
}
export async function dismissPlanReview(): Promise<boolean> {
  try { const res = await fetch(`${apiBase()}/api/benchmark/plan-review/dismiss`, { method: "POST" }); return res.ok; } catch { return false; }
}
export function useBenchmarkPlanReview() {
  const [review, setReview] = useState<PlanReview>({ hasProposal: false });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { setReview(await fetchPlanReview()); setLoading(false); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { review, setReview, loading, reload };
}

export interface BenchmarkTrends {
  range: string;
  series: Record<string, { date: string; value: number }[]>;
  labels: Record<string, string>;
  units: Record<string, string>;
}
export async function fetchBenchmarkTrends(range: string): Promise<BenchmarkTrends> {
  try { const res = await fetch(`${apiBase()}/api/benchmark/trends?range=${range}`); return res.ok ? await res.json() : { range, series: {}, labels: {}, units: {} }; }
  catch { return { range, series: {}, labels: {}, units: {} }; }
}
export function useBenchmarkTrends(range: string) {
  const [trends, setTrends] = useState<BenchmarkTrends>({ range, series: {}, labels: {}, units: {} });
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; setLoading(true); fetchBenchmarkTrends(range).then((t) => { if (alive) { setTrends(t); setLoading(false); } }); return () => { alive = false; }; }, [range]);
  return { trends, loading };
}

export interface BenchmarkWeekDay { index: number; date: string; kind: "test" | "recovery" | "rest"; testId?: string; label: string; status: "scheduled" | "done" | "skipped"; }
export interface BenchmarkWeek { active: boolean; startDate?: string; days: BenchmarkWeekDay[]; }

export async function fetchBenchmarkWeek(): Promise<BenchmarkWeek> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/week`);
    if (!res.ok) return { active: false, days: [] };
    return await res.json();
  } catch { return { active: false, days: [] }; }
}
export async function startBenchmarkWeek(startDate?: string): Promise<BenchmarkWeek | null> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/week/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startDate ? { startDate } : {}),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
export async function patchBenchmarkWeekDay(index: number, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; week?: BenchmarkWeek }> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/week/day/${index}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, week: await res.json() };
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err?.detail || "Update failed" };
  } catch { return { ok: false, error: "Network error" }; }
}
export async function cancelBenchmarkWeek(): Promise<boolean> {
  try { const res = await fetch(`${apiBase()}/api/benchmark/week/cancel`, { method: "POST" }); return res.ok; }
  catch { return false; }
}
export function useBenchmarkWeek() {
  const [week, setWeek] = useState<BenchmarkWeek>({ active: false, days: [] });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { setWeek(await fetchBenchmarkWeek()); setLoading(false); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { week, setWeek, loading, reload };
}

export interface BenchmarkRecommendation {
  primary: { testId: string; score: number; reasons: string[] };
  ordered: { testId: string; score: number; reasons: string[] }[];
  status: "recommended" | "approved" | string;
  hasPower: boolean;
  isNew: boolean;
  capability: string;
  lastBenchmarkDate: string | null;
}

export async function fetchBenchmarkRecommendation(): Promise<BenchmarkRecommendation | null> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/recommendation`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useBenchmarkRecommendation() {
  const [rec, setRec] = useState<BenchmarkRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setRec(await fetchBenchmarkRecommendation());
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { rec, loading, reload };
}

export interface TrainingZone { key: string; name: string; lowPct: number; highPct: number | null; lowW: number; highW: number | null; }

export async function fetchBenchmarkZones(): Promise<{ ftp: number; zones: TrainingZone[] }> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/zones`);
    if (!res.ok) return { ftp: 0, zones: [] };
    return await res.json();
  } catch {
    return { ftp: 0, zones: [] };
  }
}

export async function setBenchmarkResultDecision(id: string, decision: "pending" | "accepted" | "excluded"): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/benchmark/results/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Rider's benchmark history (empty until results are recorded). */
export function useBenchmarkResults() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setResults(await fetchBenchmarkResults());
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { results, loading, reload };
}

/** Headline benchmark profile (all null until the first accepted benchmark). */
export function useBenchmarkProfile() {
  const [profile, setProfile] = useState<BenchmarkProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setProfile(await fetchBenchmarkProfile());
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { profile, loading, reload };
}

/** Training zones derived from the rider's current FTP (server-computed). */
export function useBenchmarkZones() {
  const [data, setData] = useState<{ ftp: number; zones: TrainingZone[] }>({ ftp: 0, zones: [] });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setData(await fetchBenchmarkZones());
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ftp: data.ftp, zones: data.zones, loading, reload };
}
