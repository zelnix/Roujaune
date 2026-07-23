import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, useApiData, Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC, colorOf } from "@/src/components/calendar";

type Device = { id: string; name: string; type: string; status: string; detail: string; icon: string; color: string };
type Service = { id: string; name: string; detail: string; connected: boolean; icon: string; color: string };
type ConnData = { devices: Device[]; services: Service[] };

export default function ConnectionsScreen() {
  const { data } = useApiData<ConnData>("/api/connections");
  const [svc, setSvc] = React.useState<Record<string, boolean>>({});
  const d = data;

  const isOn = (s: Service) => svc[s.id] ?? s.connected;

  return (
    <AppScaffold active="connections" title="Connections" subtitle="Your devices, sensors and connected services.">
      {d ? (
        <>
          <Card testID="devices">
            <SectionTitle label="DEVICES & SENSORS" />
            <View style={s.devGrid}>
              {d.devices.map((dev) => {
                const on = dev.status === "connected";
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
                    <Pressable testID={`device-btn-${dev.id}`} style={({ hovered }: any) => [s.devBtn, hovered && s.hover]}>
                      <Text style={s.devBtnText}>{on ? "Manage" : "Reconnect"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </Card>

          <Card testID="services">
            <SectionTitle label="CONNECTED SERVICES" color={CC.rouge} />
            {d.services.map((sv, i) => (
              <View key={sv.id} style={[s.svcRow, i < d.services.length - 1 && s.divider]}>
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
        </>
      ) : <Text style={s.loading}>Loading connections…</Text>}
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
  devBtn: { marginTop: 12, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 9, alignItems: "center", minHeight: 40, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  devBtnText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  svcRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  svcIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  svcName: { color: CC.white, fontSize: 14.5, fontWeight: "700" },
  svcDetail: { color: CC.dim, fontSize: 12, marginTop: 1 },
  svcStatus: { fontSize: 12, fontWeight: "700" },
  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 30 },
});
