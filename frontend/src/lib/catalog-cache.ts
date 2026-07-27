// In-memory overlay of the rider's effective workout catalog, fetched from the
// backend (global catalog overlaid by the rider's personal/coach-edited copies).
// `getWorkout()` in workout-catalog.ts checks this cache first, then falls back
// to the bundled definitions — so the app works offline and picks up rider
// copies + coach edits the moment the cache is warm.
import type { Workout } from "./workout-catalog";

const _cache = new Map<string, Workout>();

export function setCatalogCache(list: Workout[]): void {
  _cache.clear();
  for (const w of list) if (w && w.id) _cache.set(w.id, w);
}

export function cachedWorkout(id?: string | null): Workout | undefined {
  return id ? _cache.get(id) : undefined;
}

export function catalogCacheSize(): number {
  return _cache.size;
}
