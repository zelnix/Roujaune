import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useSettings } from "@/src/lib/settings";
import { HealthSyncCard } from "@/src/components/HealthSyncCard";
import { useBleSensors } from "@/src/hooks/useBleSensors";
import { BleSensorsPanel } from "@/src/components/BleSensorsPanel";
import {
  useConnections, useImportedActivities, Provider, startConnect, syncNow, disconnect,
  deleteImported, updateConnSettings, statusChip, relTime, rideTypeLabel,
} from "@/src/lib/ridesync";

function fmtKm(m: number | null) { return m == null ? "—" : `${(m / 1000).toFixed(1)} km`; }
function fmtDur(s: number | null) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60);
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

function ProviderRow({ p, onChanged, showToast }: { p: Provider; onChanged: () => void; showToast: (m: string) => void }) {
  const [busy, setBusy] = React.useState<null | string>(null);
  const chip = statusChip(p);

  const run = async (label: string, fn: () => Promise<any>, done?: string) => {
    setBusy(label);
    try { await fn(); if (done) showToast(done); } catch { showToast("Something went wrong"); }
    finally { setBusy(null); onChanged(); }
  };

  const onConnect = async () => {
    setBusy("connect");
    try {
      const r: any = await startConnect(p.id);
      if (r?.setup_required) {
        const steps = "To enable: create an OAuth client in Google Cloud Console, enable the Fitness API, then add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend and register this app's redirect URL.";
        Alert.alert(`Connect ${p.name}`, `${r.message}\n\n${steps}`);
      } else if (r?.connected) {
        showToast(`${p.name} connected — imported ${r.sync?.imported ?? 0} rides`);
      } else if (r?.error) {
        showToast(r.error);
      }
    } catch { showToast("Connection failed"); }
    finally { setBusy(null); onChanged(); }
  };

  const onDelete = () => Alert.alert("Remove imported rides?",
    `This deletes all rides imported from ${p.name}. Your indoor Roujaune workouts are never affected.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Delete", style: "destructive", onPress: () => run("delete", () => deleteImported(p.id), "Imported rides removed") }]);

  const isNative = p.kind === "device_native";

  return (
    <View testID={`provider-${p.id}`} style={s.provCard}>
      <View style={s.provHead}>
        <View style={[s.provIcon, { borderColor: p.connected ? "rgba(85,200,80,0.4)" : CC.borderSoft }]}>
          <Ionicons name={p.icon as any} size={18} color={p.connected ? CC.green : CC.dim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.provName}>{p.name}</Text>
          <Text style={s.provSub}>{isNative ? "On-device health data" : "Outdoor cycling activities"}</Text>
        </View>
        <View style={[s.chip, { borderColor: chip.color }]}>
          <View style={[s.chipDot, { backgroundColor: chip.color }]} />
          <Text style={[s.chipText, { color: chip.color }]}>{chip.label}</Text>
        </View>
      </View>

      {p.connected ? (
        <>
          <Text style={s.metaLine}>Last synced {relTime(p.last_successful_sync_at)}{p.provider_account_id ? ` · ${p.provider_account_id}` : ""}</Text>
          {p.last_error ? <Text style={[s.metaLine, { color: CC.red }]}>{p.last_error}</Text> : null}
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Import GPS routes</Text>
            <Toggle testID={`route-${p.id}`} on={!p.disable_route_import}
              onToggle={() => run("route", () => updateConnSettings(p.id, { disable_route_import: !p.disable_route_import }))} />
          </View>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Automatic syncing</Text>
            <Toggle testID={`auto-${p.id}`} on={!p.disable_auto_sync}
              onToggle={() => run("auto", () => updateConnSettings(p.id, { disable_auto_sync: !p.disable_auto_sync }))} />
          </View>
          <View style={s.actionRow}>
            <Pressable testID={`sync-${p.id}`} disabled={!!busy} onPress={() => run("sync", () => syncNow(p.id), "Sync complete")} style={[s.btn, s.btnPrimary]}>
              {busy === "sync" ? <ActivityIndicator size="small" color="#04210F" /> : <Ionicons name="sync" size={14} color="#04210F" />}
              <Text style={[s.btnText, { color: "#04210F" }]}>Sync now</Text>
            </Pressable>
            <Pressable testID={`disconnect-${p.id}`} disabled={!!busy} onPress={() => run("disc", () => disconnect(p.id), `${p.name} disconnected`)} style={[s.btn, s.btnGhost]}>
              <Text style={s.btnText}>Disconnect</Text>
            </Pressable>
            <Pressable testID={`delete-${p.id}`} disabled={!!busy} onPress={onDelete} style={[s.btn, s.btnGhost]}>
              <Ionicons name="trash-outline" size={14} color={CC.dim} />
              <Text style={[s.btnText, { color: CC.dim }]}>Delete data</Text>
            </Pressable>
          </View>
        </>
      ) : isNative ? (
        <Text style={s.metaLine}>
          <Ionicons name="phone-portrait-outline" size={12} color={CC.dim} /> Available in an installed iOS/Android build with your permission.
        </Text>
      ) : (
        <View style={s.actionRow}>
          <Pressable testID={`connect-${p.id}`} disabled={!!busy} onPress={onConnect} style={[s.btn, s.btnPrimary]}>
            {busy === "connect" ? <ActivityIndicator size="small" color="#04210F" /> : <Ionicons name="link" size={14} color="#04210F" />}
            <Text style={[s.btnText, { color: "#04210F" }]}>{p.configured ? "Connect" : "Set up"}</Text>
          </Pressable>
          {!p.configured ? <Text style={[s.metaLine, { flex: 1 }]}>Requires {p.name} credentials</Text> : null}
        </View>
      )}
    </View>
  );
}

export default function ConnectionsScreen() {
  const { data, reload } = useConnections();
  const { items, reload: reloadRides } = useImportedActivities();
  const { settings, setSetting } = useSettings();
  const [toast, setToast] = React.useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const refresh = () => { reload(); reloadRides(); };

  // Real Bluetooth LE pairing (same engine used during rides): scan → select → connect.
  const ble = useBleSensors(settings.wheelCircumference);
  const [showBle, setShowBle] = React.useState(false);
  // A power/cadence/speed sensor is a "trainer"; a heart-rate sensor is a "wearable".
  const bleTrainer = ble.connected.length > 0 && (ble.readings.power != null || ble.readings.cadence != null || ble.readings.speed != null);
  const bleWearable = ble.connected.length > 0 && ble.readings.hr != null;
  // Remember the rider owns this hardware so ride screens show live telemetry.
  React.useEffect(() => { if (bleTrainer && !settings.hasTrainer) setSetting("hasTrainer", true); }, [bleTrainer]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (bleWearable && !settings.hasWearable) setSetting("hasWearable", true); }, [bleWearable]); // eslint-disable-line react-hooks/exhaustive-deps

  const devices = [
    {
      id: "trainer", name: "Smart Trainer", type: "Power · Cadence · Speed", icon: "bicycle",
      connected: bleTrainer || settings.hasTrainer, live: bleTrainer,
      detail: bleTrainer
        ? `Live · ${ble.readings.power != null ? `${ble.readings.power} W` : "—"}${ble.readings.cadence != null ? ` · ${ble.readings.cadence} rpm` : ""}`
        : settings.hasTrainer ? "Paired — tap Connect to pair a device" : "Not connected",
    },
    {
      id: "wearable", name: "Heart Rate Monitor", type: "Heart rate", icon: "heart",
      connected: bleWearable || settings.hasWearable, live: bleWearable,
      detail: bleWearable
        ? `Live · ${ble.readings.hr != null ? `${ble.readings.hr} bpm` : "—"}`
        : settings.hasWearable ? "Paired — tap Connect to pair a device" : "Not connected",
    },
  ];

  return (
    <AppScaffold active="connections" title="Connections" subtitle="Your devices, sensors and outdoor ride syncing.">
      <Card testID="devices">
        <SectionTitle label="DEVICES & SENSORS" />
        <Text style={s.blurb}>Pair your smart trainer and heart-rate sensor over Bluetooth. Tap Connect to scan and choose your device. Bluetooth pairing needs an installed iOS/Android build — it can&apos;t scan in the web preview.</Text>
        <View style={[s.devGrid, { marginTop: 12 }]}>
          {devices.map((dev) => {
            const on = dev.connected;
            return (
              <View key={dev.id} testID={`device-${dev.id}`} style={[s.devCard, on && s.devOn]}>
                <View style={s.devHead}>
                  <View style={[s.devIcon, { borderColor: on ? "rgba(85,200,80,0.4)" : CC.borderSoft }]}>
                    <Ionicons name={dev.icon as any} size={18} color={on ? CC.green : CC.dim} />
                  </View>
                  <View style={[s.dot, { backgroundColor: dev.live ? CC.green : on ? "rgba(85,200,80,0.5)" : "rgba(255,255,255,0.2)" }]} />
                </View>
                <Text style={s.devName}>{dev.name}</Text>
                <Text style={s.devType}>{dev.type}</Text>
                <Text style={[s.devDetail, { color: on ? CC.green : CC.dim }]}>{dev.detail}</Text>
                <Pressable testID={`device-btn-${dev.id}`} onPress={() => setShowBle(true)} style={({ hovered }: any) => [s.devBtn, on && s.devBtnOn, hovered && s.hover]}>
                  <Ionicons name="bluetooth" size={14} color={on ? CC.white : "#04210F"} />
                  <Text style={[s.devBtnText, !on && { color: "#04210F" }]}>{dev.live ? "Manage" : "Connect"}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      <HealthSyncCard showToast={showToast} />

      <Card testID="ride-sync">
        <SectionTitle label="OUTDOOR RIDE SYNC" color={CC.rouge} />
        <Text style={s.blurb}>Connect a platform to automatically import your outdoor rides. We only import what you authorise, tokens are encrypted, and you can disconnect or delete imported data anytime.</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          {(data?.providers ?? []).filter((p) => p.kind !== "device_native").map((p) => (
            <ProviderRow key={p.id} p={p} onChanged={refresh} showToast={showToast} />
          ))}
        </View>
      </Card>

      <Card testID="imported-rides">
        <SectionTitle label={`IMPORTED OUTDOOR RIDES${data ? ` · ${data.imported_activities}` : ""}`} />
        {items.length === 0 ? (
          <Text style={s.blurb}>No imported rides yet. Connect a platform above to see your outdoor rides here — they&apos;ll also flow into your history, progress and coaching.</Text>
        ) : (
          items.filter((a) => a.is_canonical !== false).map((a, i) => (
            <View key={a.id} testID={`ride-${a.id}`} style={[s.rideRow, i > 0 && s.divider]}>
              <View style={[s.rideIcon]}>
                <Ionicons name="bicycle" size={16} color={CC.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rideName} numberOfLines={1}>{a.name ?? "Outdoor Ride"}</Text>
                <Text style={s.rideMeta}>{rideTypeLabel(a.ride_type)} · {a.provider}{a.source_references && a.source_references.length > 1 ? " +1" : ""}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.rideStat}>{fmtKm(a.distance_metres)} · {fmtDur(a.elapsed_seconds)}</Text>
                <Text style={s.rideMeta}>{relTime(a.started_at)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {showBle && (
        <BleSensorsPanel
          supported={ble.supported}
          poweredOn={ble.poweredOn}
          scanning={ble.scanning}
          devices={ble.devices}
          connected={ble.connected}
          readings={ble.readings}
          battery={ble.battery}
          reconnecting={ble.reconnecting}
          permissionStatus={ble.permissionStatus}
          error={ble.error}
          onScan={ble.startScan}
          onStopScan={ble.stopScan}
          onConnect={ble.connect}
          onDisconnect={ble.disconnect}
          onClose={() => setShowBle(false)}
          units={settings.units}
        />
      )}

      {toast ? (
        <View style={[s.toast, { pointerEvents: "none" }]}><Text style={s.toastText}>{toast}</Text></View>
      ) : null}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  devGrid: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  devCard: { flex: 1, minWidth: 220, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 16 },
  devOn: { borderColor: "rgba(85,200,80,0.25)" },
  devHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  devIcon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  devName: { color: CC.white, fontSize: 15, fontWeight: "800", marginTop: 12 },
  devType: { color: CC.dim, fontSize: 12, marginTop: 1 },
  devDetail: { fontSize: 12, fontWeight: "600", marginTop: 8 },
  devBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 9, minHeight: 40, backgroundColor: CC.yellow },
  devBtnOn: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: CC.border },
  hover: { borderColor: "rgba(255,255,255,0.28)" },
  devBtnText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },

  blurb: { color: CC.dim, fontSize: 12.5, lineHeight: 18, marginTop: 2 },

  provCard: { backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 16 },
  provHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  provIcon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  provName: { color: CC.white, fontSize: 15, fontWeight: "800" },
  provSub: { color: CC.dim, fontSize: 12, marginTop: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 11.5, fontWeight: "800" },
  metaLine: { color: CC.dim, fontSize: 12, marginTop: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  toggleLabel: { color: CC.white, fontSize: 13, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40 },
  btnPrimary: { backgroundColor: CC.yellow },
  btnGhost: { borderWidth: 1, borderColor: CC.border },
  btnText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },

  rideRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: CC.borderSoft },
  rideIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(85,200,80,0.13)" },
  rideName: { color: CC.white, fontSize: 14, fontWeight: "700" },
  rideMeta: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  rideStat: { color: CC.white, fontSize: 12.5, fontWeight: "700" },

  toast: { position: "absolute", bottom: 24, alignSelf: "center", backgroundColor: "rgba(20,22,20,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
});
