import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow } from "../theme";
import type { BleDevice, BleReadings, PermState } from "../hooks/useBleSensors";

export function BleSensorsPanel({
  supported, poweredOn, scanning, devices, connected, readings, permissionStatus, error,
  onScan, onStopScan, onConnect, onDisconnect, onClose, units = "metric",
}: {
  supported: boolean;
  poweredOn: boolean;
  scanning: boolean;
  devices: BleDevice[];
  connected: BleDevice[];
  readings: BleReadings;
  permissionStatus: PermState;
  error: string | null;
  onScan: () => void;
  onStopScan: () => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onClose: () => void;
  units?: "metric" | "imperial";
}) {
  const connectedIds = new Set(connected.map((d) => d.id));
  const discovered = devices.filter((d) => !connectedIds.has(d.id));
  const live = readings.ts > 0 && Date.now() - readings.ts < 4000;
  const speedLabel = readings.speed != null
    ? (units === "imperial" ? `${Math.round(readings.speed * 0.621371 * 10) / 10} mph` : `${readings.speed} km/h`)
    : "—";

  return (
    <Pressable style={styles.overlay} onPress={onClose} testID="ble-panel">
      <Pressable style={styles.panel} onPress={() => { /* swallow */ }}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Bluetooth sensors</Text>
            <Text style={styles.sub}>Trainer · power · cadence · speed · heart rate</Text>
          </View>
          <Pressable onPress={onClose} testID="ble-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>

        {!supported ? (
          <View style={styles.notice} testID="ble-unsupported">
            <Ionicons name="bluetooth" size={22} color={colors.yellow} />
            <Text style={styles.noticeText}>
              Bluetooth pairing needs a native build. Publish your app and generate an iOS/Android build to connect
              real sensors — it can&apos;t run in the web preview or Expo Go.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.explain}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
              <Text style={styles.explainText}>We use Bluetooth only to read your trainer and heart-rate sensor during the ride.</Text>
            </View>

            {!poweredOn && (
              <View style={styles.warn}><Ionicons name="alert-circle" size={16} color={colors.red} /><Text style={styles.warnText}>Turn on Bluetooth to find your sensors.</Text></View>
            )}

            {permissionStatus === "blocked" && (
              <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="ble-open-settings">
                <Ionicons name="settings-outline" size={16} color="#fff" />
                <Text style={styles.settingsBtnText}>Open Settings to allow Bluetooth</Text>
              </Pressable>
            )}

            {/* Live readings */}
            <View style={styles.readings}>
              <Reading label="POWER" value={readings.power != null ? `${readings.power} W` : "—"} live={live} />
              <Reading label="CADENCE" value={readings.cadence != null ? `${readings.cadence} rpm` : "—"} live={live} />
              <Reading label="SPEED" value={speedLabel} live={live} />
              <Reading label="HEART RATE" value={readings.hr != null ? `${readings.hr} bpm` : "—"} live={live} />
            </View>

            {connected.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={styles.section}>CONNECTED</Text>
                {connected.map((d) => (
                  <View key={d.id} style={styles.deviceRow}>
                    <Ionicons name="bluetooth" size={16} color={colors.green} />
                    <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
                    <Pressable onPress={() => onDisconnect(d.id)} testID={`ble-disconnect-${d.id}`} style={styles.disconnect}>
                      <Text style={styles.disconnectText}>Disconnect</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.scanRow}>
              <Text style={styles.section}>{scanning ? "SCANNING…" : "AVAILABLE"}</Text>
              {scanning ? (
                <Pressable onPress={onStopScan} testID="ble-stop" style={styles.scanBtn}><Text style={styles.scanBtnText}>Stop</Text></Pressable>
              ) : (
                <Pressable onPress={onScan} testID="ble-scan" style={styles.scanBtn}><Ionicons name="search" size={14} color={colors.yellow} /><Text style={styles.scanBtnText}>Scan</Text></Pressable>
              )}
            </View>

            <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: 8 }}>
              {scanning && discovered.length === 0 && (
                <View style={styles.deviceRow}><ActivityIndicator color={colors.yellow} /><Text style={styles.deviceName}>Looking for sensors…</Text></View>
              )}
              {!scanning && discovered.length === 0 && (
                <Text style={styles.empty}>No sensors yet — tap Scan with your trainer/HR strap awake.</Text>
              )}
              {discovered.map((d) => (
                <Pressable key={d.id} style={styles.deviceRow} onPress={() => onConnect(d.id)} testID={`ble-connect-${d.id}`}>
                  <Ionicons name="bluetooth-outline" size={16} color={colors.textDim} />
                  <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
                  <Ionicons name="add-circle" size={20} color={colors.yellow} />
                </Pressable>
              ))}
            </ScrollView>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

function Reading({ label, value, live }: { label: string; value: string; live: boolean }) {
  return (
    <View style={styles.reading}>
      <Text style={styles.readingLabel}>{label}</Text>
      <Text style={[styles.readingValue, live && value !== "—" && { color: colors.green }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", zIndex: 60 },
  panel: { width: 460, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "rgba(233,180,76,0.08)", borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: "rgba(233,180,76,0.3)" },
  noticeText: { flex: 1, color: colors.white, fontSize: 13.5, lineHeight: 19 },
  explain: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  explainText: { flex: 1, color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
  warn: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "rgba(224,30,43,0.08)", borderRadius: radius.sm, padding: 10 },
  warnText: { color: colors.red, fontSize: 13, fontWeight: "600" },
  settingsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 12 },
  settingsBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  readings: { flexDirection: "row", gap: 8, marginVertical: 4 },
  reading: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center" },
  readingLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  readingValue: { color: colors.white, fontSize: 17, fontWeight: "800", marginTop: 4 },
  section: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(233,180,76,0.14)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  scanBtnText: { color: colors.yellow, fontWeight: "800", fontSize: 12.5 },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12 },
  deviceName: { flex: 1, color: colors.white, fontSize: 14, fontWeight: "600" },
  disconnect: { backgroundColor: "rgba(224,30,43,0.1)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  disconnectText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  empty: { color: colors.textDim, fontSize: 12.5, paddingVertical: 8 },
  errorText: { color: colors.red, fontSize: 12.5, marginTop: 4 },
});
