import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useBleSensors, type BleDevice } from "@/src/hooks/useBleSensors";
import { colors, radius } from "@/src/theme";

const KNOWN_DEVICES_KEY = "roujaune:ble:knownDevices";

async function loadKnownDevices(): Promise<BleDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveKnownDevices(list: BleDevice[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(list));
  } catch {
    /* best-effort persistence — a missed save just skips one auto-reconnect */
  }
}

type BleApi = ReturnType<typeof useBleSensors>;
type BLEContextValue = BleApi & {
  /** Disconnects AND forgets the sensor, so it no longer auto-reconnects on
   *  next launch. Use this for an explicit rider-initiated "Disconnect". */
  disconnect: (id: string) => Promise<void>;
  /** Ride/setup screens call this once their own rider settings have loaded
   *  so wheel-revs → speed math uses the rider's real tyre roll-out. Kept
   *  out of the provider itself so mounting BLE globally never triggers a
   *  settings fetch before the rider is signed in. */
  setWheelCircumferenceMm: (mm: number) => void;
};

const BLEContext = createContext<BLEContextValue | null>(null);

/**
 * App-level Bluetooth connection. Mounted once above the whole navigation
 * stack so a rider's trainer / HR strap stays connected while they move
 * between screens — it only disconnects when the app itself is closed.
 * Also remembers previously-paired sensors and quietly tries to reconnect
 * them the next time the app opens, showing a small "Reconnecting…" pill.
 */
export function BLEProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // Default 700x25c roll-out until a screen with the rider's real settings
  // mounts and calls setWheelCircumferenceMm — keeps this provider free of
  // any network/auth dependency so it can mount before sign-in.
  const [wheelMm, setWheelCircumferenceMm] = useState(2105);
  const ble = useBleSensors(wheelMm);

  const [known, setKnown] = useState<BleDevice[]>([]);
  const knownLoaded = useRef(false);
  const attemptedRef = useRef<Set<string>>(new Set());

  // Load previously-paired sensors once at boot.
  useEffect(() => {
    loadKnownDevices().then((list) => {
      setKnown(list);
      knownLoaded.current = true;
    });
  }, []);

  // Remember every sensor the rider connects, so we can offer it again next launch.
  useEffect(() => {
    if (!knownLoaded.current) return;
    setKnown((prev) => {
      const newOnes = ble.connected.filter((d) => !prev.some((k) => k.id === d.id));
      if (newOnes.length === 0) return prev;
      const merged = [...prev, ...newOnes];
      saveKnownDevices(merged);
      return merged;
    });
  }, [ble.connected]);

  // Once Bluetooth is ready, quietly try to reconnect every known sensor —
  // permission was already granted the first time the rider paired it, so
  // this never surfaces a new native permission prompt.
  useEffect(() => {
    if (!ble.supported || !ble.poweredOn || !knownLoaded.current || known.length === 0) return;
    (async () => {
      await ble.requestPermission();
      known.forEach((d) => {
        if (attemptedRef.current.has(d.id)) return;
        if (ble.connected.some((c) => c.id === d.id)) return;
        attemptedRef.current.add(d.id);
        ble.connectSilently(d.id, d.name);
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ble.supported, ble.poweredOn, known]);

  const forgetDevice = useCallback(async (id: string) => {
    setKnown((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveKnownDevices(next);
      return next;
    });
  }, []);

  const disconnect = useCallback(async (id: string) => {
    await ble.disconnect(id);
    await forgetDevice(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ble.disconnect, forgetDevice]);

  // Name for the reconnecting pill — prefer the known/paired label.
  const reconnectingId = ble.reconnecting[0];
  const reconnectingName = reconnectingId
    ? known.find((d) => d.id === reconnectingId)?.name
      ?? ble.connected.find((d) => d.id === reconnectingId)?.name
      ?? "sensor"
    : null;

  const value: BLEContextValue = { ...ble, disconnect, setWheelCircumferenceMm };

  return (
    <BLEContext.Provider value={value}>
      {children}
      {reconnectingName ? (
        <View style={[styles.banner, { top: insets.top + 10, pointerEvents: "none" }]}>
          <View style={styles.dot} />
          <Text style={styles.bannerText}>Reconnecting to {reconnectingName}…</Text>
        </View>
      ) : null}
    </BLEContext.Provider>
  );
}

/** Access the single app-wide BLE connection from any screen. */
export function useBLE(): BLEContextValue {
  const ctx = useContext(BLEContext);
  if (!ctx) throw new Error("useBLE must be used within a BLEProvider");
  return ctx;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(20,22,20,0.94)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    zIndex: 999,
    elevation: 20,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.yellow },
  bannerText: { color: colors.yellow, fontSize: 12, fontWeight: "700" },
});
