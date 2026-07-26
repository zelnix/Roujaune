import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  UUID,
  b64ToBytes,
  parseHeartRate,
  parseCyclingPower,
  parseCsc,
  cadenceFromCrank,
  speedFromWheel,
  type CrankSample,
  type WheelSample,
} from "@/src/lib/ble/parse";

export type BleDevice = { id: string; name: string };
export type BleReadings = { power: number | null; cadence: number | null; hr: number | null; speed: number | null; ts: number };
export type PermState = "unknown" | "granted" | "denied" | "blocked";

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

const RELEVANT_SERVICES = [UUID.heartRate, UUID.cyclingPower, UUID.csc];

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
  const [readings, setReadings] = useState<BleReadings>({ power: null, cadence: null, hr: null, speed: null, ts: 0 });
  const [permissionStatus, setPermissionStatus] = useState<PermState>("unknown");
  const [error, setError] = useState<string | null>(null);

  // Per-device crank / wheel state so a standalone cadence sensor and a power
  // meter (or a separate speed sensor) never trample each other's samples.
  const crankState = useRef<Record<string, CrankSample>>({});
  const wheelState = useRef<Record<string, WheelSample>>({});
  const circumferenceRef = useRef(wheelCircumferenceMm);
  useEffect(() => { circumferenceRef.current = wheelCircumferenceMm || 2105; }, [wheelCircumferenceMm]);
  const seen = useRef<Set<string>>(new Set());
  const subs = useRef<any[]>([]);

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
          }
          return next;
        });
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

  const connect = useCallback(async (id: string) => {
    const manager = managerRef.current;
    if (!manager) return;
    stopScan();
    try {
      const device = await manager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();
      const services = await device.services();
      for (const svc of services) {
        const su = svc.uuid.toLowerCase();
        if (![UUID.heartRate, UUID.cyclingPower, UUID.csc].includes(su)) continue;
        const chars = await svc.characteristics();
        for (const ch of chars) {
          const cu = ch.uuid.toLowerCase();
          if ([UUID.heartRateMeasurement, UUID.cyclingPowerMeasurement, UUID.cscMeasurement].includes(cu)) {
            monitor(device, svc.uuid, ch.uuid);
          }
        }
      }
      device.onDisconnected(() => {
        delete crankState.current[id];
        delete wheelState.current[id];
        setConnected((prev) => prev.filter((d) => d.id !== id));
      });
      setConnected((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, { id, name: device.name || "Sensor" }]));
    } catch (e: any) {
      setError(e?.message ?? "Connection failed");
    }
  }, [monitor, stopScan]);

  const disconnect = useCallback(async (id: string) => {
    try { await managerRef.current?.cancelDeviceConnection(id); } catch { /* noop */ }
    delete crankState.current[id];
    delete wheelState.current[id];
    setConnected((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return {
    supported, poweredOn, scanning, devices, connected, readings, permissionStatus,
    error, requestPermission, startScan, stopScan, connect, disconnect,
  };
}
