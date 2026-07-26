// Benchmark data access. Forward-compatible: results/sessions are served from
// `/api/benchmark/*` (added in later phases). Until those endpoints return
// data, these hooks resolve to empty — so the landing/history UI shows a real
// empty state now and lights up automatically once persistence is wired.
import { useCallback, useEffect, useState } from "react";
import type { BenchmarkResult } from "./types";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

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

/** Rider's benchmark history (empty until results are recorded). */
export function useBenchmarkResults() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetchBenchmarkResults();
    setResults(r);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { results, loading, reload };
}
