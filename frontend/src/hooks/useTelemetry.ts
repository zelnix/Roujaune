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
  elapsed: 1477,
  power: 251,
  cadence: 88,
  hr: 162,
  speed: 26.4,
  distance: 24.6,
  gradient: 7.8,
  erg: 100,
  paused: false,
  source: "estimated",
};

function wsUrl(): string {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
  const proto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  return `${proto}://${host}/api/ws/telemetry`;
}

/**
 * Live telemetry over WebSocket (smart-trainer / wearable bridge).
 * Handles connect / reconnect (backoff), stale-data detection (holds last
 * valid values then flags them as estimated) and ERG / pause control.
 */
export function useTelemetry(demo: boolean = false) {
  const [telemetry, setTelemetry] = useState<Telemetry>(DEFAULTS);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [stale, setStale] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const lastMsg = useRef<number>(Date.now());
  const retries = useRef(0);
  const closed = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoRef = useRef(demo);

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(wsUrl());
      ws.current = socket;

      socket.onopen = () => {
        retries.current = 0;
        setConnectionState("connected");
        // Tell the backend whether to stream real ("live") or simulated ("demo") data.
        try { socket.send(JSON.stringify({ type: "mode", mode: demoRef.current ? "demo" : "live" })); } catch { /* noop */ }
      };
      socket.onmessage = (ev) => {
        lastMsg.current = Date.now();
        setStale(false);
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "telemetry" && msg.data) setTelemetry(msg.data as Telemetry);
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

  // Switch the backend stream between live (real sensors only) and demo (simulated).
  useEffect(() => {
    demoRef.current = demo;
    send({ type: "mode", mode: demo ? "demo" : "live" });
  }, [demo, send]);

  const sendErg = useCallback((intensity: number) => send({ type: "erg", intensity }), [send]);
  const sendTarget = useCallback((watts: number) => send({ type: "target", watts }), [send]);
  const sendInit = useCallback((opts: { elapsed?: number; distance?: number; watts?: number }) => send({ type: "init", ...opts }), [send]);
  const sendSensor = useCallback((r: { power?: number | null; cadence?: number | null; hr?: number | null; speed?: number | null }) => send({ type: "sensor", ...r }), [send]);
  const pause = useCallback(() => send({ type: "pause" }), [send]);
  const resume = useCallback(() => send({ type: "resume" }), [send]);
  const simulateDropout = useCallback(() => send({ type: "dropout", seconds: 4 }), [send]);

  return { telemetry, connectionState, stale, sendErg, sendTarget, sendInit, sendSensor, pause, resume, simulateDropout };
}
