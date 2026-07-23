import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, useApiData, Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC, colorOf } from "@/src/components/calendar";
import { useSettings } from "@/src/lib/settings";

type Service = { id: string; name: string; detail: string; connected: boolean; icon: string; color: string };
type ConnData = { services: Service[] };

export default function ConnectionsScreen() {
  const { data } = useApiData<ConnData>("/api/connections");
  const { settings, setSetting } = useSettings();
  const [svc, setSvc] = React.useState<Record<string, boolean>>({});

  const isOn = (s: Service) => svc[s.id] ?? s.connected;

  // Real device state — these flags actually drive the live-workout HUD
  // (Power/Cadence/Speed from the trainer, Heart Rate from the wearable).
  const devices = [
    { id: "trainer", key: "hasTrainer" as const, name: "Smart Trainer", type: "Power · Cadence · Speed · ERG", icon: "bicycle", connected: settings.hasTrainer, detail: settings.hasTrainer ? "Feeding live power & cadence" : "Not connected" },
    { id: "wearable", key: "hasWearable" as const, name: "Heart Rate Monitor", type: "Heart rate", icon: "heart", connected: settings.hasWearable, detail: settings.hasWearable ? "Feeding live heart rate" : "Not connected" },
  ];

  return (
    <AppScaffold active="connections" title="Connections" subtitle="Your devices, sensors and connected services.">
      <Card testID="devices">
        <SectionTitle label="DEVICES & SENSORS" />
        <View style={s.devGrid}>
          {devices.map((dev) => {
            const on = dev.connected;
            return (
              <View key={dev.id} testID={`device-${dev.id}`} style={[s.devCard, on && s.devOn]}>
                <View style={s.devHead}>
                  <View style={[s.devIcon, { borderColor: on ? "rgba(85,200,80,0.4)" : CC.borderSoft }]}>
                    <Ionicons name={dev.icon as any} size={18} color={on ? CC.green : CC.dim} />
                  </View>
                  <View style={[s.dot, { backgroundColor: on ? CC.green : "rgba(255,255,255,0.2)" }]} />
                </View>
                <Text style={s.devName}>{dev.name}</Text>
                <Text style={s.devType}>{dev.type}</Text>
                <Text style={[s.devDetail, { color: on ? CC.green : CC.dim }]}>{dev.detail}</Text>
                <Pressable testID={`device-btn-${dev.id}`} onPress={() => setSetting(dev.key, !on)} style={({ hovered }: any) => [s.devBtn, on && s.devBtnOn, hovered && s.hover]}>
                  <Ionicons name={on ? "close-circle-outline" : "bluetooth"} size={14} color={on ? CC.white : "#04210F"} />
                  <Text style={[s.devBtnText, !on && { color: "#04210F" }]}>{on ? "Disconnect" : "Connect"}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <Text style={s.note}>
          <Ionicons name="information-circle-outline" size={12} color={CC.dim} /> These control the live ride data. Bluetooth pairing with a physical trainer/strap works on an installed build.
        </Text>
      </Card>

      {data?.services ? (
        <Card testID="services">
          <SectionTitle label="CONNECTED SERVICES" color={CC.rouge} />
          {data.services.map((sv, i) => (
            <View key={sv.id} style={[s.svcRow, i < data.services.length - 1 && s.divider]}>
              <View style={[s.svcIcon, { backgroundColor: `${colorOf(sv.color)}22` }]}>
                <Ionicons name={sv.icon as any} size={18} color={colorOf(sv.color)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.svcName}>{sv.name}</Text>
                <Text style={s.svcDetail}>{sv.detail}</Text>
              </View>
              <Text style={[s.svcStatus, { color: isOn(sv) ? CC.green : CC.dim }]}>{isOn(sv) ? "Connected" : "Off"}</Text>
              <Toggle testID={`svc-${sv.id}`} on={isOn(sv)} onToggle={() => setSvc((m) => ({ ...m, [sv.id]: !isOn(sv) }))} />
            </View>
          ))}
        </Card>
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
  note: { color: CC.dim, fontSize: 11.5, marginTop: 14, lineHeight: 16 },
  svcRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  svcIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  svcName: { color: CC.white, fontSize: 14.5, fontWeight: "700" },
  svcDetail: { color: CC.dim, fontSize: 12, marginTop: 1 },
  svcStatus: { fontSize: 12, fontWeight: "700" },
});
