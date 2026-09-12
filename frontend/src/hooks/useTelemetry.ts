import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export type Telemetry = {
  elapsed: number;
  power: number;
  cadence: number;
  hr: number;
  speed: number;
  distance: number;
  gradient: number;
  erg: number;
  paused: boolean;
  source: string;
};

const DEFAULTS: Telemetry = {
  // Elapsed starts at 0 — a freshly-mounted ride hasn't started yet. Any
  // non-zero placeholder here would immediately exceed a short workout's
  // total duration before the first real telemetry frame arrives, tripping
  // the "workout complete" check the instant the screen mounts.
  elapsed: 0,
  power: 0,
  cadence: 0,
  hr: 0,
  speed: 0,
  distance: 0,
  gradient: 0,
  erg: 100,
  paused: false,
  source: "disconnected",
};

function wsUrl(): string {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
  const proto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  return `${proto}://${host}/api/ws/telemetry`;
}

/**
 * Live telemetry over WebSocket (smart-trainer / wearable bridge). LIVE
 * data only — every metric is 0 with `source: "disconnected"` until a real
 * BLE sensor reading is pushed in via `sendSensor`. Handles connect /
 * reconnect (backoff), stale-data detection (holds last valid values then
 * flags them so the UI can grey them out) and ERG / pause control.
 */
export function useTelemetry() {
  const [telemetry, setTelemetry] = useState<Telemetry>(DEFAULTS);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [stale, setStale] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const lastMsg = useRef<number>(Date.now());
  const retries = useRef(0);
  const closed = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last good frame + whether we've ever connected before, so a
  // dropped/re-established socket (brief background, network blip) can tell
  // the fresh server-side sim to resume from here instead of silently
  // restarting the ride at zero.
  const everConnected = useRef(false);
  const lastGood = useRef<{ elapsed: number; distance: number } | null>(null);

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(wsUrl());
      ws.current = socket;

      socket.onopen = () => {
        retries.current = 0;
        setConnectionState("connected");
        if (everConnected.current && lastGood.current) {
          try {
            socket.send(JSON.stringify({ type: "init", elapsed: lastGood.current.elapsed, distance: lastGood.current.distance }));
          } catch { /* noop */ }
        }
        everConnected.current = true;
      };
      socket.onmessage = (ev) => {
        lastMsg.current = Date.now();
        setStale(false);
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "telemetry" && msg.data) {
            setTelemetry(msg.data as Telemetry);
            lastGood.current = { elapsed: msg.data.elapsed, distance: msg.data.distance };
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      socket.onerror = () => {
        try { socket.close(); } catch { /* noop */ }
      };
      socket.onclose = () => {
        if (closed.current) return;
        setConnectionState("reconnecting");
        retries.current += 1;
        const delay = Math.min(5000, 500 * 2 ** retries.current);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    } catch {
      setConnectionState("disconnected");
    }
  }, []);

  useEffect(() => {
    closed.current = false;
    connect();
    // stale watchdog: no frame for >2.2s -> hold last value, mark estimated
    const watchdog = setInterval(() => {
      if (Date.now() - lastMsg.current > 2200) {
        setStale(true);
        setTelemetry((t) => (t.source === "estimated" ? t : { ...t, source: "estimated" }));
      }
    }, 700);

    return () => {
      closed.current = true;
      clearInterval(watchdog);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try { ws.current?.close(); } catch { /* noop */ }
    };
  }, [connect]);

  const send = useCallback((obj: object) => {
    const s = ws.current;
    if (s && s.readyState === 1) s.send(JSON.stringify(obj));
  }, []);

  const sendErg = useCallback((intensity: number) => send({ type: "erg", intensity }), [send]);
  const sendTarget = useCallback((watts: number) => send({ type: "target", watts }), [send]);
  const sendInit = useCallback((opts: { elapsed?: number; distance?: number; watts?: number }) => send({ type: "init", ...opts }), [send]);
  const sendSensor = useCallback((r: { power?: number | null; cadence?: number | null; hr?: number | null; speed?: number | null }) => send({ type: "sensor", ...r }), [send]);
  const pause = useCallback(() => send({ type: "pause" }), [send]);
  const resume = useCallback(() => send({ type: "resume" }), [send]);

  return { telemetry, connectionState, stale, sendErg, sendTarget, sendInit, sendSensor, pause, resume };
}
