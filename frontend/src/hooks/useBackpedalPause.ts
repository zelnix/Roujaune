/**
 * Backpedal-to-Pause — mimics TrainerRoad's quick-pause behaviour.
 *
 * 1. Cadence stays at 0 for ≥ THRESHOLD seconds  → auto-pause the workout.
 * 2. Rider resumes forward pedaling (cadence > 0) → auto-resume with a
 *    GRACE_PERIOD of reduced ERG so they can build cadence first.
 * 3. During the grace window, resistance linearly ramps from EASE_FLOOR
 *    (30 % of target) back to 100 %.
 *
 * The hook is purely observational — it fires callbacks so the parent
 * workout screen stays in control of the actual pause / resume / ERG.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ── Tunables ────────────────────────────────────────────────────────
const THRESHOLD_MS = 3000;      // 3 s of zero cadence → pause
const GRACE_PERIOD_MS = 5000;   // 5 s of reduced ERG on resume
const EASE_FLOOR = 0.30;        // 30 % of target during early grace
const TICK_MS = 200;            // polling interval

// ── Public types ────────────────────────────────────────────────────
export type BackpedalPhase =
  | "riding"     // normal pedaling
  | "detecting"  // cadence = 0, counting toward threshold
  | "paused"     // threshold exceeded — workout paused
  | "grace";     // rider resumed — ramping ERG back up

export type BackpedalPauseAPI = {
  phase: BackpedalPhase;
  /** Seconds remaining in the grace period (0 outside grace). */
  graceRemainingSec: number;
  /** Multiplier for the ERG target: 0.30 → 1.0 during grace, else 1.0. */
  graceEaseFactor: number;
  /** How long cadence has been zero during the "detecting" phase (0–3 s). */
  detectingSec: number;
  /** Call from the parent if the rider manually pauses / resumes —
   *  resets the backpedal state machine so it doesn't fight the UI. */
  reset: () => void;
};

// ── Hook ────────────────────────────────────────────────────────────
export function useBackpedalPause({
  cadence,
  trainerConnected,
  workoutPaused,
  enabled,
  onBackpedalPause,
  onGraceStart,
  onGraceEnd,
}: {
  /** Live cadence reading (rpm) from BLE / telemetry.  `null` = no data. */
  cadence: number | null;
  /** A power / cadence sensor is connected (cadence data is meaningful). */
  trainerConnected: boolean;
  /** Current pause state of the workout — avoids double-triggering. */
  workoutPaused: boolean;
  /** Master switch (rider preference in Settings). */
  enabled: boolean;
  /** Fired once when the 3 s zero-cadence threshold is exceeded. */
  onBackpedalPause: () => void;
  /** Fired when the rider starts pedaling again (grace period begins). */
  onGraceStart: () => void;
  /** Fired when the 5 s grace window expires (full ERG resumes). */
  onGraceEnd: () => void;
}): BackpedalPauseAPI {
  const [phase, setPhase] = useState<BackpedalPhase>("riding");
  const [graceRemainingSec, setGraceRemainingSec] = useState(0);
  const [graceEaseFactor, setGraceEaseFactor] = useState(1);
  const [detectingSec, setDetectingSec] = useState(0);

  // Keep live values in refs so the interval callback is stable.
  const cadRef = useRef(cadence);
  const phaseRef = useRef(phase);
  const pausedRef = useRef(workoutPaused);
  const zeroSinceRef = useRef<number | null>(null);
  const graceStartRef = useRef<number | null>(null);
  // Whether the current workout pause was triggered by THIS hook (not manual).
  const weTriggeredRef = useRef(false);

  useEffect(() => { cadRef.current = cadence; }, [cadence]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { pausedRef.current = workoutPaused; }, [workoutPaused]);

  // ── Reset on disable / disconnect ─────────────────────────────────
  const resetInternal = useCallback(() => {
    setPhase("riding");
    setGraceRemainingSec(0);
    setGraceEaseFactor(1);
    setDetectingSec(0);
    zeroSinceRef.current = null;
    graceStartRef.current = null;
    weTriggeredRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !trainerConnected) resetInternal();
  }, [enabled, trainerConnected, resetInternal]);

  // ── Main tick loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !trainerConnected) return;

    const iv = setInterval(() => {
      const now = Date.now();
      const cad = cadRef.current ?? 0;
      const s = phaseRef.current;

      // ── RIDING / DETECTING ──────────────────────────────────────
      if (s === "riding" || s === "detecting") {
        // If the workout was paused externally (not by us), freeze detection.
        if (pausedRef.current && !weTriggeredRef.current) {
          zeroSinceRef.current = null;
          if (s === "detecting") { setPhase("riding"); setDetectingSec(0); }
          return;
        }
        if (cad <= 0) {
          if (zeroSinceRef.current == null) {
            zeroSinceRef.current = now;
            setPhase("detecting");
          }
          const elapsed = now - zeroSinceRef.current;
          setDetectingSec(Math.min(3, Math.round(elapsed / 1000 * 10) / 10));
          if (elapsed >= THRESHOLD_MS) {
            weTriggeredRef.current = true;
            setPhase("paused");
            setDetectingSec(0);
            onBackpedalPause();
          }
        } else {
          zeroSinceRef.current = null;
          if (s === "detecting") { setPhase("riding"); setDetectingSec(0); }
        }
        return;
      }

      // ── PAUSED (backpedal-triggered) ────────────────────────────
      if (s === "paused") {
        if (cad > 0) {
          graceStartRef.current = now;
          setPhase("grace");
          setGraceEaseFactor(EASE_FLOOR);
          setGraceRemainingSec(Math.ceil(GRACE_PERIOD_MS / 1000));
          zeroSinceRef.current = null;
          onGraceStart();
        }
        return;
      }

      // ── GRACE PERIOD ────────────────────────────────────────────
      if (s === "grace") {
        const gs = graceStartRef.current ?? now;
        const elapsed = now - gs;
        if (elapsed >= GRACE_PERIOD_MS) {
          setPhase("riding");
          setGraceEaseFactor(1);
          setGraceRemainingSec(0);
          graceStartRef.current = null;
          weTriggeredRef.current = false;
          onGraceEnd();
        } else {
          const pct = elapsed / GRACE_PERIOD_MS;
          setGraceEaseFactor(Math.round((EASE_FLOOR + (1 - EASE_FLOOR) * pct) * 100) / 100);
          setGraceRemainingSec(Math.ceil((GRACE_PERIOD_MS - elapsed) / 1000));
        }
      }
    }, TICK_MS);

    return () => clearInterval(iv);
  }, [enabled, trainerConnected, onBackpedalPause, onGraceStart, onGraceEnd]);

  return { phase, graceRemainingSec, graceEaseFactor, detectingSec, reset: resetInternal };
}
