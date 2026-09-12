import React from "react";
import {
  StruggleEngine, StruggleState, StruggleConfig, StruggleMoment, resolveMaxHr,
} from "@/src/lib/struggle";

export type StruggleMonitorOpts = {
  power: number;
  cadence: number;
  hr: number;
  elapsed: number;
  source: string;         // telemetry source (sensor/trainer/estimated/disconnected)
  balance?: number | null;
  targetW: number;
  ftp: number;
  maxHr: number;          // rider-set max HR (0 if unset)
  age: number;            // rider age (0 if unset) — used for 220−age fallback
  cadLow: number;
  cadHigh: number;
  ergMode: boolean;
  trainerOn: boolean;
  wearableOn: boolean;
  paused: boolean;
  remainingIntervalSec?: number;   // seconds left in the current interval — powers the predictive W′ gate
  onStruggle: (s: StruggleState) => void; // fired once per struggle onset
  onSafety: (s: StruggleState) => void;   // fired once when a safety override trips
  onRecover: () => void;                   // fired once when the rider recovers
};

const ONSET_COOLDOWN_MS = 45000; // min gap between struggle cues
const RECOVER_HOLD_SEC = 12;     // inactive this long → recovered

/**
 * Drives the StruggleEngine from the live telemetry feed and surfaces onset /
 * safety / recovery transitions to the workout screen. Returns the current
 * struggle state (for the HUD) and a getter for the logged moments.
 */
export function useStruggleMonitor(o: StruggleMonitorOpts) {
  const engineRef = React.useRef<StruggleEngine | null>(null);
  const [state, setState] = React.useState<StruggleState | null>(null);
  const momentsRef = React.useRef<StruggleMoment[]>([]);

  // Latest options in a ref so the telemetry effect doesn't re-subscribe.
  const oRef = React.useRef(o);
  React.useEffect(() => { oRef.current = o; }, [o]);

  // Onset / recovery bookkeeping.
  const activeRef = React.useRef(false);
  const lastOnsetAt = React.useRef(0);
  const recoveredSinceT = React.useRef<number | null>(null);
  const lastSampleT = React.useRef(-1);

  // (Re)build the engine when the personalisation inputs change.
  const maxHrResolved = resolveMaxHr(o.maxHr, o.age);
  React.useEffect(() => {
    const cfg: StruggleConfig = {
      ftp: o.ftp, maxHr: maxHrResolved, age: o.age, cadLow: o.cadLow, cadHigh: o.cadHigh,
      ergMode: o.ergMode, trainerOn: o.trainerOn, wearableOn: o.wearableOn,
    };
    if (!engineRef.current) engineRef.current = new StruggleEngine(cfg);
    else engineRef.current.setConfig(cfg);
  }, [o.ftp, maxHrResolved, o.age, o.cadLow, o.cadHigh, o.ergMode, o.trainerOn, o.wearableOn]);

  React.useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const opt = oRef.current;
    // Only feed real/simulated data — never the "disconnected" placeholder.
    if (opt.paused || !(opt.source === "sensor" || opt.source === "trainer" || opt.source === "estimated")) return;
    // De-dupe repeat ticks at the same elapsed second.
    if (opt.elapsed <= lastSampleT.current) return;
    lastSampleT.current = opt.elapsed;

    eng.push({
      t: opt.elapsed, power: opt.power, cadence: opt.cadence, hr: opt.hr,
      target: opt.targetW, balance: opt.balance ?? null, remainingSec: opt.remainingIntervalSec ?? 0,
    });
    const s = eng.evaluate();
    setState(s);

    if (s.active) {
      recoveredSinceT.current = null;
      const now = Date.now();
      if (!activeRef.current && now - lastOnsetAt.current > ONSET_COOLDOWN_MS) {
        activeRef.current = true;
        lastOnsetAt.current = now;
        momentsRef.current.push({
          t: opt.elapsed,
          reasons: s.reasons,
          primary: s.primary,
          severity: s.severity === "high" ? "high" : "mild",
          safety: s.safety,
          segment: null,
        });
        if (momentsRef.current.length > 40) momentsRef.current.shift();
        if (s.safety) opt.onSafety(s);
        else opt.onStruggle(s);
      }
    } else if (activeRef.current) {
      // Require a sustained calm spell before declaring recovery.
      if (recoveredSinceT.current == null) recoveredSinceT.current = opt.elapsed;
      else if (opt.elapsed - recoveredSinceT.current >= RECOVER_HOLD_SEC) {
        activeRef.current = false;
        recoveredSinceT.current = null;
        opt.onRecover();
      }
    }
  }, [o.elapsed, o.power, o.cadence, o.hr, o.source, o.paused, o.targetW]);

  const reset = React.useCallback(() => {
    engineRef.current?.reset();
    momentsRef.current = [];
    activeRef.current = false;
    recoveredSinceT.current = null;
    lastSampleT.current = -1;
    setState(null);
  }, []);

  return { state, moments: momentsRef, reset };
}
