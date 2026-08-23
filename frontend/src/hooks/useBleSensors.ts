import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  UUID,
  b64ToBytes,
  bytesToB64,
  parseHeartRate,
  parseCyclingPower,
  parseCsc,
  parseIndoorBikeData,
  FTMSControl,
  cadenceFromCrank,
  speedFromWheel,
  type CrankSample,
  type WheelSample,
} from "@/src/lib/ble/parse";

export type BleDevice = { id: string; name: string };
export type BleReadings = { power: number | null; cadence: number | null; hr: number | null; speed: number | null; wheelRevs: number | null; ts: number };
export type PermState = "unknown" | "granted" | "denied" | "blocked";
export type ControlMode = "erg" | "resistance" | "sim" | null;

// Lazily load the native module so the app keeps working in Expo Go / web,
// where the BLE native module is not linked.
let BleModule: any = null;
let bleLoadError = false;
function loadBle(): any {
  if (BleModule || bleLoadError) return BleModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BleModule = require("react-native-ble-plx");
  } catch {
    bleLoadError = true;
  }
  return BleModule;
}

const RELEVANT_SERVICES = [UUID.heartRate, UUID.cyclingPower, UUID.csc, UUID.fitnessMachine];

/**
 * Connects to standard Bluetooth LE cycling sensors (Cycling Power 0x1818,
 * Speed & Cadence 0x1816, Heart Rate 0x180D) and streams real power / cadence /
 * heart-rate readings. Requires a native build — in Expo Go / web `supported`
 * is false and the UI guides the rider to build the app.
 */
export function useBleSensors(wheelCircumferenceMm: number = 2105) {
  const managerRef = useRef<any>(null);
  const [supported, setSupported] = useState(false);
  const [poweredOn, setPoweredOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connected, setConnected] = useState<BleDevice[]>([]);
  const [readings, setReadings] = useState<BleReadings>({ power: null, cadence: null, hr: null, speed: null, wheelRevs: null, ts: 0 });
  const [battery, setBattery] = useState<Record<string, number>>({});
  const [reconnecting, setReconnecting] = useState<string[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<PermState>("unknown");
  const [error, setError] = useState<string | null>(null);
  // FTMS smart-trainer control (ERG / resistance / grade). Available only when a
  // connected trainer exposes the Fitness Machine Control Point and grants control.
  const [hasTrainerControl, setHasTrainerControl] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>(null);
  const [controlValue, setControlValue] = useState<number>(0);
  const controlRef = useRef<{ device: any; service: string; char: string } | null>(null);

  // Per-device crank / wheel state so a standalone cadence sensor and a power
  // meter (or a separate speed sensor) never trample each other's samples.
  const crankState = useRef<Record<string, CrankSample>>({});
  const wheelState = useRef<Record<string, WheelSample>>({});
  const circumferenceRef = useRef(wheelCircumferenceMm);
  useEffect(() => { circumferenceRef.current = wheelCircumferenceMm || 2105; }, [wheelCircumferenceMm]);
  const seen = useRef<Set<string>>(new Set());
  const subs = useRef<any[]>([]);
  // Auto-reconnect bookkeeping.
  const intentionalRef = useRef<Set<string>>(new Set());
  const reconnectTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const openRef = useRef<((id: string, name?: string) => Promise<boolean>) | null>(null);

  // Init the manager once (native only).
  useEffect(() => {
    const mod = loadBle();
    if (!mod?.BleManager) {
      setSupported(false);
      return;
    }
    let manager: any;
    try {
      manager = new mod.BleManager();
    } catch {
      setSupported(false);
      return;
    }
    managerRef.current = manager;
    setSupported(true);
    const sub = manager.onStateChange((state: string) => setPoweredOn(state === "PoweredOn"), true);
    return () => {
      try { sub?.remove(); } catch { /* noop */ }
      subs.current.forEach((s) => { try { s.remove(); } catch { /* noop */ } });
      Object.values(reconnectTimers.current).forEach((t) => { try { clearTimeout(t); } catch { /* noop */ } });
      try { manager.destroy(); } catch { /* noop */ }
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "android" && Platform.Version >= 31) {
      try {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        const scan = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
        const conn = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
        const granted = scan === "granted" && conn === "granted";
        const blocked = scan === "never_ask_again" || conn === "never_ask_again";
        setPermissionStatus(granted ? "granted" : blocked ? "blocked" : "denied");
        return granted;
      } catch {
        setPermissionStatus("denied");
        return false;
      }
    }
    // iOS + Android <31: permission is handled by the OS on first scan.
    setPermissionStatus("granted");
    return true;
  }, []);

  const stopScan = useCallback(() => {
    try { managerRef.current?.stopDeviceScan(); } catch { /* noop */ }
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    const ok = await requestPermission();
    if (!ok) return;
    setError(null);
    setDevices([]);
    seen.current = new Set();
    setScanning(true);
    manager.startDeviceScan(RELEVANT_SERVICES, null, (err: any, device: any) => {
      if (err) {
        setError(err?.message ?? "Scan failed");
        setScanning(false);
        return;
      }
      if (!device?.id || seen.current.has(device.id)) return;
      seen.current.add(device.id);
      setDevices((prev) => [...prev, { id: device.id, name: device.name || device.localName || "Unknown sensor" }]);
    });
    // Auto-stop after 15s to save battery.
    setTimeout(() => stopScan(), 15000);
  }, [requestPermission, stopScan]);

  const handleValue = useCallback((deviceId: string, serviceUuid: string, charUuid: string, value: string | null) => {
    if (!value) return;
    const bytes = b64ToBytes(value);
    const cu = charUuid.toLowerCase();
    if (cu === UUID.heartRateMeasurement) {
      const hr = parseHeartRate(bytes);
      if (hr != null) setReadings((r) => ({ ...r, hr, ts: Date.now() }));
    } else if (cu === UUID.cyclingPowerMeasurement) {
      const cp = parseCyclingPower(bytes);
      if (cp) {
        setReadings((r) => {
          const next = { ...r, power: cp.power, ts: Date.now() };
          if (cp.crank) {
            const prev = crankState.current[deviceId];
            if (prev) {
              const c = cadenceFromCrank(prev, cp.crank);
              if (c != null) next.cadence = c;
            }
            crankState.current[deviceId] = cp.crank;
          }
          if (cp.wheel) {
            const prevW = wheelState.current[deviceId];
            if (prevW) {
              const sp = speedFromWheel(prevW, cp.wheel, circumferenceRef.current);
              if (sp != null) next.speed = sp;
            }
            wheelState.current[deviceId] = cp.wheel;
            next.wheelRevs = cp.wheel.revs;
          }
          return next;
        });
      }
    } else if (cu === UUID.cscMeasurement) {
      const csc = parseCsc(bytes);
      if (csc) {
        setReadings((r) => {
          const next = { ...r, ts: Date.now() };
          if (csc.crank) {
            const prev = crankState.current[deviceId];
            if (prev) {
              const c = cadenceFromCrank(prev, csc.crank);
              if (c != null) next.cadence = c;
            }
            crankState.current[deviceId] = csc.crank;
          }
          if (csc.wheel) {
            const prevW = wheelState.current[deviceId];
            if (prevW) {
              const sp = speedFromWheel(prevW, csc.wheel, circumferenceRef.current);
              if (sp != null) next.speed = sp;
            }
            wheelState.current[deviceId] = csc.wheel;
            next.wheelRevs = csc.wheel.revs;
          }
          return next;
        });
      }
    } else if (cu === UUID.indoorBikeData) {
      const ib = parseIndoorBikeData(bytes);
      if (ib) {
        setReadings((r) => ({
          ...r,
          power: ib.power != null ? ib.power : r.power,
          cadence: ib.cadence != null ? ib.cadence : r.cadence,
          speed: ib.speed != null ? ib.speed : r.speed,
          hr: ib.hr != null ? ib.hr : r.hr,
          ts: Date.now(),
        }));
      }
    }
  }, []);

  const monitor = useCallback((device: any, serviceUuid: string, charUuid: string) => {
    const sub = device.monitorCharacteristicForService(serviceUuid, charUuid, (err: any, ch: any) => {
      if (err) return;
      handleValue(device.id, serviceUuid, charUuid, ch?.value ?? null);
    });
    subs.current.push(sub);
  }, [handleValue]);

  // Write a raw FTMS control-point command (op-code + params) with response.
  const writeControlRaw = useCallback(async (cmd: number[]): Promise<boolean> => {
    const c = controlRef.current;
    if (!c) return false;
    try {
      await c.device.writeCharacteristicWithResponseForService(c.service, c.char, bytesToB64(cmd));
      return true;
    } catch {
      return false;
    }
  }, []);

  /** ERG mode: hold the trainer at a fixed target power (watts). */
  const setErgWatts = useCallback(async (watts: number): Promise<boolean> => {
    const ok = await writeControlRaw(FTMSControl.setTargetPower(watts));
    if (ok) { setControlMode("erg"); setControlValue(Math.round(watts)); }
    return ok;
  }, [writeControlRaw]);

  /** Fixed resistance level (device-specific units). */
  const setResistance = useCallback(async (level: number): Promise<boolean> => {
    const ok = await writeControlRaw(FTMSControl.setResistance(level));
    if (ok) { setControlMode("resistance"); setControlValue(Math.round(level)); }
    return ok;
  }, [writeControlRaw]);

  /** Simulation mode: set road gradient (%) so the trainer emulates the climb. */
  const setSimGrade = useCallback(async (gradePct: number): Promise<boolean> => {
    const ok = await writeControlRaw(FTMSControl.setSimGrade(gradePct));
    if (ok) { setControlMode("sim"); setControlValue(Math.round(gradePct * 10) / 10); }
    return ok;
  }, [writeControlRaw]);

  const resetTrainer = useCallback(async (): Promise<void> => {
    await writeControlRaw(FTMSControl.reset());
    setControlMode(null); setControlValue(0);
  }, [writeControlRaw]);

  // ── Battery Service (0x180F) — read the level once and subscribe for updates.
  const readBattery = useCallback(async (device: any, id: string) => {
    try {
      const svcs = await device.services();
      const bat = svcs.find((s: any) => s.uuid.toLowerCase() === UUID.battery);
      if (!bat) return;
      const chars = await bat.characteristics();
      const lvl = chars.find((c: any) => c.uuid.toLowerCase() === UUID.batteryLevel);
      if (!lvl) return;
      const read = await device.readCharacteristicForService(bat.uuid, lvl.uuid);
      const bytes = b64ToBytes(read?.value ?? "");
      if (bytes.length) setBattery((b) => ({ ...b, [id]: bytes[0] }));
      if (lvl.isNotifiable) {
        const sub = device.monitorCharacteristicForService(bat.uuid, lvl.uuid, (err: any, ch: any) => {
          if (err) return;
          const bb = b64ToBytes(ch?.value ?? "");
          if (bb.length) setBattery((b) => ({ ...b, [id]: bb[0] }));
        });
        subs.current.push(sub);
      }
    } catch { /* battery is optional */ }
  }, []);

  // Retry a dropped connection with backoff until it comes back (or the rider
  // cancels). Keeps a ride from stalling when a strap/trainer briefly drops.
  const attemptReconnect = useCallback((id: string, name: string, tries = 0) => {
    if (intentionalRef.current.has(id)) return;
    const MAX = 8;
    if (tries >= MAX) {
      setReconnecting((prev) => prev.filter((x) => x !== id));
      setConnected((prev) => prev.filter((d) => d.id !== id));
      setBattery((b) => { const n = { ...b }; delete n[id]; return n; });
      setError(`${name || "Sensor"} lost — tap to reconnect`);
      return;
    }
    setReconnecting((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const delay = Math.min(8000, Math.round(800 * Math.pow(1.6, tries)));
    reconnectTimers.current[id] = setTimeout(async () => {
      if (intentionalRef.current.has(id)) return;
      const ok = await openRef.current?.(id, name);
      if (!ok) attemptReconnect(id, name, tries + 1);
    }, delay);
  }, []);

  // Discover services, subscribe to sensor characteristics, wire FTMS control &
  // battery, and register a disconnect handler that auto-reconnects.
  const setupDevice = useCallback(async (device: any, id: string) => {
    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    for (const svc of services) {
      const su = svc.uuid.toLowerCase();
      if (![UUID.heartRate, UUID.cyclingPower, UUID.csc, UUID.fitnessMachine].includes(su)) continue;
      const chars = await svc.characteristics();
      for (const ch of chars) {
        const cu = ch.uuid.toLowerCase();
        if ([UUID.heartRateMeasurement, UUID.cyclingPowerMeasurement, UUID.cscMeasurement, UUID.indoorBikeData].includes(cu)) {
          monitor(device, svc.uuid, ch.uuid);
        }
        if (cu === UUID.fitnessMachineControlPoint) {
          controlRef.current = { device, service: svc.uuid, char: ch.uuid };
        }
      }
    }
    if (controlRef.current) {
      try {
        await writeControlRaw(FTMSControl.requestControl());
        await writeControlRaw(FTMSControl.start());
        setHasTrainerControl(true);
      } catch { /* control not granted — reading still works */ }
    }
    await readBattery(device, id);
    device.onDisconnected((_err: any, dev: any) => {
      delete crankState.current[id];
      delete wheelState.current[id];
      if (controlRef.current?.device?.id === id) {
        controlRef.current = null;
        setHasTrainerControl(false);
        setControlMode(null);
      }
      if (intentionalRef.current.has(id)) {
        intentionalRef.current.delete(id);
        setConnected((prev) => prev.filter((d) => d.id !== id));
        setBattery((b) => { const n = { ...b }; delete n[id]; return n; });
      } else {
        attemptReconnect(id, dev?.name || device?.name || "Sensor");
      }
    });
    setError(null);
    setReconnecting((prev) => prev.filter((x) => x !== id));
    setConnected((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, { id, name: device.name || "Sensor" }]));
  }, [monitor, readBattery, attemptReconnect, writeControlRaw]);

  const openConnection = useCallback(async (id: string): Promise<boolean> => {
    const manager = managerRef.current;
    if (!manager) return false;
    try {
      const device = await manager.connectToDevice(id, { autoConnect: false });
      await setupDevice(device, id);
      return true;
    } catch (e: any) {
      return false;
    }
  }, [setupDevice]);
  useEffect(() => { openRef.current = openConnection; }, [openConnection]);

  const connect = useCallback(async (id: string) => {
    intentionalRef.current.delete(id);
    const t = reconnectTimers.current[id];
    if (t) { clearTimeout(t); delete reconnectTimers.current[id]; }
    stopScan();
    const ok = await openConnection(id);
    if (!ok) setError("Connection failed");
  }, [openConnection, stopScan]);

  const disconnect = useCallback(async (id: string) => {
    intentionalRef.current.add(id);
    const t = reconnectTimers.current[id];
    if (t) { clearTimeout(t); delete reconnectTimers.current[id]; }
    setReconnecting((prev) => prev.filter((x) => x !== id));
    try { await managerRef.current?.cancelDeviceConnection(id); } catch { /* noop */ }
    delete crankState.current[id];
    delete wheelState.current[id];
    if (controlRef.current?.device?.id === id) {
      controlRef.current = null;
      setHasTrainerControl(false);
      setControlMode(null);
    }
    setConnected((prev) => prev.filter((d) => d.id !== id));
    setBattery((b) => { const n = { ...b }; delete n[id]; return n; });
  }, []);

  return {
    supported, poweredOn, scanning, devices, connected, readings, permissionStatus,
    error, requestPermission, startScan, stopScan, connect, disconnect,
    // Auto-reconnect + battery
    battery, reconnecting,
    // FTMS trainer control
    hasTrainerControl, controlMode, controlValue,
    setErgWatts, setResistance, setSimGrade, resetTrainer,
  };
}
