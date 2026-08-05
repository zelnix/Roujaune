import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchActivity, RideDetail } from "@/src/lib/activities";
import { SyncedGraph, RouteMapSvg, PowerCurve, ZoneBars } from "@/src/components/analysis/RideAnalysis";

const hms = (s?: number) => {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = React.useState<RideDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchActivity(String(id)).then((d) => { if (alive) { setDetail(d); setLoading(false); if (d?.samples?.length) setCursor(Math.floor(d.samples.length / 2)); } });
    return () => { alive = false; };
  }, [id]);

  const metrics = React.useMemo(() => {
    if (!detail) return [];
    const m: { label: string; value: string; c?: string }[] = [];
    if (detail.distance_km != null) m.push({ label: "DISTANCE", value: `${detail.distance_km} km` });
    m.push({ label: "MOVING TIME", value: hms(detail.duration_sec) });
    if (detail.elevation_gain_m != null) m.push({ label: "ELEV GAIN", value: `${Math.round(detail.elevation_gain_m)} m` });
    if (detail.avg_power != null) m.push({ label: "AVG POWER", value: `${Math.round(detail.avg_power)} W`, c: colors.yellow });
    if (detail.np != null) m.push({ label: "NORM. POWER", value: `${Math.round(detail.np)} W`, c: colors.yellow });
    if (detail.if != null) m.push({ label: "INTENSITY (IF)", value: detail.if.toFixed(2) });
    if (detail.tss != null) m.push({ label: "TSS", value: String(Math.round(detail.tss)), c: colors.red });
    if (detail.avg_hr != null) m.push({ label: "AVG HR", value: `${detail.avg_hr} bpm`, c: colors.red });
    if (detail.max_hr != null) m.push({ label: "MAX HR", value: `${detail.max_hr} bpm` });
    if (detail.avg_cadence != null) m.push({ label: "AVG CADENCE", value: `${detail.avg_cadence} rpm` });
    if (detail.max_power != null) m.push({ label: "MAX POWER", value: `${Math.round(detail.max_power)} W` });
    if (detail.calories != null) m.push({ label: "ENERGY", value: `${Math.round(detail.calories)} kJ` });
    if (detail.avg_speed != null) m.push({ label: "AVG SPEED", value: `${(detail.avg_speed * 3.6).toFixed(1)} km/h` });
    return m;
  }, [detail]);

  return (
    <AppScaffold active="activities" title={detail?.name || "Ride analysis"} subtitle={detail ? `${detail.indoor_outdoor === "outdoor" ? "Outdoor" : "Indoor"} ride · ${detail.source}` : "Loading…"}>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : !detail ? (
        <Card><Text style={s.dim}>This ride could not be found.</Text></Card>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
          <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Back to rides">
            <Ionicons name="chevron-back" size={18} color={colors.textDim} /><Text style={s.backText}>All rides</Text>
          </Pressable>

          {/* Metrics */}
          <Card>
            <View style={s.grid}>
              {metrics.map((m) => (
                <View key={m.label} style={s.cell}>
                  <Text style={s.cellLabel}>{m.label}</Text>
                  <Text style={[s.cellVal, m.c ? { color: m.c } : null]}>{m.value}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Route map */}
          {detail.has_gps && detail.samples.length > 1 && (
            <Card>
              <Text style={s.h}>Route</Text>
              <RouteMapSvg samples={detail.samples} cursor={cursor} />
            </Card>
          )}

          {/* Synced graph */}
          {detail.samples.length > 1 && (detail.has_power || detail.has_hr || detail.samples.some((x) => x.ele != null)) && (
            <Card>
              <Text style={s.h}>Elevation · Power · Heart rate</Text>
              <SyncedGraph samples={detail.samples} ftp={detail.ftp_used} cursor={cursor} onScrub={setCursor} />
            </Card>
          )}

          {/* Power curve */}
          {detail.power_curve && detail.power_curve.length > 1 && (
            <Card>
              <Text style={s.h}>Power curve <Text style={s.hDim}>best average W</Text></Text>
              <PowerCurve curve={detail.power_curve} />
            </Card>
          )}

          {/* Zones */}
          {detail.time_in_power_zones && (
            <Card>
              <Text style={s.h}>Time in power zones <Text style={s.hDim}>FTP {detail.ftp_used} W</Text></Text>
              <ZoneBars seconds={detail.time_in_power_zones} kind="power" />
            </Card>
          )}
          {detail.time_in_hr_zones && (
            <Card>
              <Text style={s.h}>Time in heart-rate zones</Text>
              <ZoneBars seconds={detail.time_in_hr_zones} kind="hr" />
            </Card>
          )}

          {!detail.has_power && !detail.has_gps && (
            <Card><Text style={s.dim}>This ride has summary metrics only. Upload a .fit / .gpx / .tcx file to see the route map and synced power/elevation graph.</Text></Card>
          )}
        </ScrollView>
      )}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  dim: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backText: { color: colors.textDim, fontSize: 13.5, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "25%", paddingVertical: 8, minWidth: 110 },
  cellLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  cellVal: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 3 },
  h: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  hDim: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
});
