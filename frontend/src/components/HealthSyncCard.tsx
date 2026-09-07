import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useHealthSync } from "@/src/lib/health";
import { relTime } from "@/src/lib/ridesync";

/**
 * Health Sync — bidirectional Apple Health (iOS) / Health Connect (Android)
 * syncing. Health Connect is the OS hub that Samsung Health & Google Fit read
 * through, so one connection covers both. Native only; on web / Expo Go it
 * shows a "needs the app build" notice.
 */
export function HealthSyncCard({ showToast }: { showToast: (m: string) => void }) {
  const h = useHealthSync();

  React.useEffect(() => {
    if (h.message) { showToast(h.message); h.clearMessage(); }
  }, [h.message]); // eslint-disable-line react-hooks/exhaustive-deps

  const iosDetail = "Push your Roujaune rides to Apple Health and import outdoor rides back in.";
  const androidDetail = "Push your Roujaune rides to Google Health (Health Connect — covers Samsung Health & Google Fit) and import rides back in.";
  const blurb = Platform.OS === "android" ? androidDetail : Platform.OS === "ios" ? iosDetail
    : "Sync your rides with Apple Health (iOS) and Google Health (Health Connect, Android — covers Samsung Health & Google Fit).";

  return (
    <Card testID="health-sync">
      <SectionTitle label="HEALTH SYNC" color={CC.rouge} />
      <Text style={s.blurb}>{blurb}</Text>

      <View testID="health-provider" style={s.card}>
        <View style={s.head}>
          <View style={[s.icon, { borderColor: h.linked ? "rgba(85,200,80,0.4)" : CC.borderSoft }]}>
            <Ionicons name={h.platform === "apple_health" ? "logo-apple" : "fitness"} size={18} color={h.linked ? CC.green : CC.dim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{h.label}</Text>
            <Text style={s.sub}>{h.platform === "apple_health" ? "Apple Health · iOS" : h.platform === "health_connect" ? "Samsung Health · Google Fit" : "iOS & Android"}</Text>
          </View>
          {h.available && h.linked ? (
            <View style={[s.chip, { borderColor: CC.green }]}>
              <View style={[s.chipDot, { backgroundColor: CC.green }]} />
              <Text style={[s.chipText, { color: CC.green }]}>Connected</Text>
            </View>
          ) : null}
        </View>

        {!h.available ? (
          <Text style={s.meta}>
            <Ionicons name="phone-portrait-outline" size={12} color={CC.dim} /> Available in an installed iOS/Android build with your permission.
          </Text>
        ) : !h.linked ? (
          <View style={{ marginTop: 12 }}>
            {h.blocked ? (
              <>
                <Text style={[s.meta, { color: CC.orange, marginTop: 0 }]}>Access was turned off. Enable {h.label} for Roujaune in Settings.</Text>
                <Pressable testID="health-open-settings" onPress={h.openSettings} style={[s.btn, s.btnGhost, { marginTop: 12, alignSelf: "flex-start" }]}>
                  <Ionicons name="settings-outline" size={14} color={CC.white} />
                  <Text style={s.btnText}>Open Settings</Text>
                </Pressable>
              </>
            ) : (
              <Pressable testID="health-connect" disabled={h.busy === "connect"} onPress={h.connect} style={[s.btn, s.btnPrimary, { alignSelf: "flex-start" }]}>
                {h.busy === "connect" ? <ActivityIndicator size="small" color="#04210F" /> : <Ionicons name="link" size={14} color="#04210F" />}
                <Text style={[s.btnText, { color: "#04210F" }]}>Connect {h.label}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <Text style={s.meta}>Last synced {relTime(h.lastSync)}</Text>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Auto-push completed rides</Text>
                <Text style={s.toggleHint}>Send every finished ride to {h.label} automatically</Text>
              </View>
              <Toggle testID="health-autopush" on={h.autoPush} onToggle={() => h.setAutoPush(!h.autoPush)} />
            </View>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Import outdoor rides</Text>
                <Text style={s.toggleHint}>Pull in rides recorded by other apps or devices</Text>
              </View>
              <Toggle testID="health-import" on={h.importEnabled} onToggle={() => h.setImportEnabled(!h.importEnabled)} />
            </View>
            <View style={s.actionRow}>
              <Pressable testID="health-sync-now" disabled={!!h.busy} onPress={h.syncNow} style={[s.btn, s.btnPrimary]}>
                {h.busy === "sync" ? <ActivityIndicator size="small" color="#04210F" /> : <Ionicons name="sync" size={14} color="#04210F" />}
                <Text style={[s.btnText, { color: "#04210F" }]}>Sync now</Text>
              </Pressable>
              <Pressable testID="health-disconnect" disabled={!!h.busy} onPress={h.disconnect} style={[s.btn, s.btnGhost]}>
                <Text style={s.btnText}>Disconnect</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  blurb: { color: CC.dim, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  card: { backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 16, marginTop: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  name: { color: CC.white, fontSize: 15, fontWeight: "800" },
  sub: { color: CC.dim, fontSize: 12, marginTop: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 11.5, fontWeight: "800" },
  meta: { color: CC.dim, fontSize: 12, marginTop: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 },
  toggleLabel: { color: CC.white, fontSize: 13, fontWeight: "600" },
  toggleHint: { color: CC.dim, fontSize: 11.5, marginTop: 2 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40 },
  btnPrimary: { backgroundColor: CC.yellow },
  btnGhost: { borderWidth: 1, borderColor: CC.border },
  btnText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
});
