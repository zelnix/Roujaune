import { useCallback, useEffect, useRef, useState } from "react";
import type { BleDevice, BleReadings, PermState, ControlMode } from "./useBleSensors";

/**
 * Web / preview DEMO simulation of the BLE sensor flow.
 *
 * Real Bluetooth needs a native build, so in the web preview / Expo Go we
 * simulate the full journey — scanning, discovering demo sensors, connecting,
 * streaming live power/cadence/HR/speed, battery + signal, and a reconnect
 * cycle — so the whole experience is demonstrable and testable. Every device
 * is clearly labelled "(Demo)". On a real device the native hook in
 * `useBleSensors.ts` drives actual hardware instead.
 */
const DEMO_DEVICES: BleDevice[] = [
  { id: "demo-trainer", name: "Demo Smart Trainer (Demo)" },
  { id: "demo-hr", name: "Demo Heart Rate (Demo)" },
  { id: "demo-cadence", name: "Demo Cadence (Demo)" },
];

export function useBleSensors(_wheelCircumferenceMm?: number) {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connected, setConnected] = useState<BleDevice[]>([]);
  const [readings, setReadings] = useState<BleReadings>({ power: null, cadence: null, hr: null, speed: null, wheelRevs: null, ts: 0 });
  const [battery, setBattery] = useState<Record<string, number>>({});
  const [rssi, setRssi] = useState<Record<string, number>>({});
  const [reconnecting, setReconnecting] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scanTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readIv = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedRef = useRef<BleDevice[]>([]);
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  const clearScanTimers = () => { scanTimers.current.forEach(clearTimeout); scanTimers.current = []; };

  const stopScan = useCallback(() => { clearScanTimers(); setScanning(false); }, []);

  const startScan = useCallback(async () => {
    setError(null);
    setDevices([]);
    setScanning(true);
    clearScanTimers();
    // Reveal demo sensors one by one, like a real advertisement stream.
    const reveal = (d: BleDevice, ms: number) => {
      scanTimers.current.push(setTimeout(() => {
        setDevices((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d]));
      }, ms));
    };
    reveal(DEMO_DEVICES[0], 900);
    reveal(DEMO_DEVICES[1], 1800);
    reveal(DEMO_DEVICES[2], 2700);
    scanTimers.current.push(setTimeout(() => setScanning(false), 4000));
  }, []);

  const startReadings = useCallback(() => {
    if (readIv.current) return;
    readIv.current = setInterval(() => {
      if (connectedRef.current.length === 0) return;
      const ids = connectedRef.current.map((d) => d.id);
      setReadings((r) => ({
        power: ids.includes("demo-trainer") ? Math.round(180 + Math.sin(Date.now() / 1500) * 40 + (Math.random() * 12 - 6)) : r.power,
        cadence: (ids.includes("demo-trainer") || ids.includes("demo-cadence")) ? Math.round(88 + Math.sin(Date.now() / 2000) * 6) : r.cadence,
        hr: ids.includes("demo-hr") ? Math.round(142 + Math.sin(Date.now() / 4000) * 10) : r.hr,
        speed: ids.includes("demo-trainer") ? Math.round((30 + Math.sin(Date.now() / 1800) * 4) * 10) / 10 : r.speed,
        wheelRevs: r.wheelRevs,
        ts: Date.now(),
      }));
    }, 1000);
  }, []);

  const connect = useCallback(async (id: string) => {
    const dev = DEMO_DEVICES.find((d) => d.id === id);
    if (!dev) { setError("Connection failed"); return; }
    setError(null);
    setDevices((prev) => prev.filter((d) => d.id !== id));
    setConnected((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, dev]));
    setBattery((b) => ({ ...b, [id]: id === "demo-hr" ? 78 : id === "demo-cadence" ? 45 : 92 }));
    setRssi((r) => ({ ...r, [id]: -58 }));
    startReadings();

    // Demo a brief reconnect cycle once, so the "Reconnecting…" UI is visible.
    if (id === "demo-trainer") {
      setTimeout(() => {
        if (!connectedRef.current.some((d) => d.id === id)) return;
        setReconnecting((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setTimeout(() => setReconnecting((prev) => prev.filter((x) => x !== id)), 2500);
      }, 6000);
    }
  }, [startReadings]);

  const disconnect = useCallback(async (id: string) => {
    setReconnecting((prev) => prev.filter((x) => x !== id));
    setConnected((prev) => prev.filter((d) => d.id !== id));
    setBattery((b) => { const n = { ...b }; delete n[id]; return n; });
    setRssi((r) => { const n = { ...r }; delete n[id]; return n; });
    if (connectedRef.current.filter((d) => d.id !== id).length === 0 && readIv.current) {
      clearInterval(readIv.current); readIv.current = null;
      setReadings({ power: null, cadence: null, hr: null, speed: null, wheelRevs: null, ts: 0 });
    }
  }, []);

  useEffect(() => () => { clearScanTimers(); if (readIv.current) clearInterval(readIv.current); }, []);

  const noopBool = useCallback(async () => false, []);
  const noopVoid = useCallback(async () => {}, []);
  // Web preview has no real device to re-establish — just reuse the demo
  // connect flow so the global BLE context's boot logic has something to call.
  const connectSilently = useCallback((id: string, _name: string) => { connect(id); }, [connect]);

  return {
    supported: true,
    poweredOn: true,
    scanning,
    devices,
    connected,
    readings,
    permissionStatus: "granted" as PermState,
    error,
    requestPermission: async () => true,
    startScan,
    stopScan,
    connect,
    disconnect,
    connectSilently,
    battery,
    reconnecting,
    rssi,
    // FTMS trainer control — not simulated in preview.
    hasTrainerControl: false,
    controlMode: null as ControlMode,
    controlValue: 0,
    setErgWatts: noopBool,
    setResistance: noopBool,
    setSimGrade: noopBool,
    resetTrainer: noopVoid,
  };
}
