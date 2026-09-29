/**
 * Stale BLE data guard: holds the last known power/cadence reading for a
 * configurable grace period (default 3 s) before decaying it toward zero.
 *
 * Smart trainers drop BLE packets constantly in WiFi-saturated environments.
 * Without this guard, a single missed packet makes the UI power reading
 * flash to 0 W and back, which is visually jarring and can trigger false
 * struggle-detection events.
 *
 * Usage:
 *   const guarded = useStaleGuard(ble.readings.power, 3000);
 *   // guarded.value  — the displayed value (held or decaying)
 *   // guarded.stale  — true when holding a stale value
 *   // guarded.raw    — the underlying raw reading
 */
import { useEffect, useRef, useState } from "react";

const TICK_MS = 200;

type GuardedValue = {
  /** The value to display (held during grace, decaying after). */
  value: number;
  /** True when holding a stale value (no fresh data for > freshness window). */
  stale: boolean;
  /** The underlying raw reading (may be null/0 during dropout). */
  raw: number | null;
};

/**
 * @param raw       Live BLE reading (null = no data this tick).
 * @param graceMs   How long to hold the last good value (default 3000 ms).
 * @param decayMs   How long the decay-to-zero ramp takes after grace (default 2000 ms).
 */
export function useStaleGuard(
  raw: number | null,
  graceMs: number = 3000,
  decayMs: number = 2000,
): GuardedValue {
  const [output, setOutput] = useState<GuardedValue>({ value: 0, stale: false, raw });
  const lastGoodRef = useRef<{ v: number; t: number }>({ v: 0, t: Date.now() });
  const rawRef = useRef(raw);

  useEffect(() => { rawRef.current = raw; }, [raw]);

  // When we receive a genuine non-null reading, update lastGood.
  useEffect(() => {
    if (raw != null && raw > 0) {
      lastGoodRef.current = { v: raw, t: Date.now() };
      setOutput({ value: raw, stale: false, raw });
    }
  }, [raw]);

  // Tick loop: handles the hold + decay phases.
  useEffect(() => {
    const iv = setInterval(() => {
      const r = rawRef.current;
      if (r != null && r > 0) return; // fresh data — handled by the effect above

      const { v: lastV, t: lastT } = lastGoodRef.current;
      const elapsed = Date.now() - lastT;

      if (elapsed < graceMs) {
        // Grace period: hold the last known value.
        setOutput({ value: lastV, stale: true, raw: r });
      } else if (elapsed < graceMs + decayMs) {
        // Decay phase: linear ramp from lastV → 0.
        const decayProgress = (elapsed - graceMs) / decayMs;
        const decayed = Math.round(lastV * (1 - decayProgress));
        setOutput({ value: Math.max(0, decayed), stale: true, raw: r });
      } else {
        // Fully decayed.
        setOutput({ value: 0, stale: true, raw: r });
      }
    }, TICK_MS);

    return () => clearInterval(iv);
  }, [graceMs, decayMs]);

  return output;
}
