// ─────────────────────────────────────────────────────────────────────────
// WP-E: Benchmark trends on the Progress screen. Personal history over time
// for FTP, W/kg, 5-min, 1-min, sprint power, aerobic efficiency, cadence and
// recovery — with time-range filters. Prioritises personal progress.
// ─────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { CC } from "@/src/components/calendar";
import { Card, SectionTitle } from "@/src/components/app-scaffold";
import { useBenchmarkTrends } from "@/src/lib/benchmark/api";

const RANGES: { key: string; label: string }[] = [
  { key: "4w", label: "4 Weeks" }, { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" }, { key: "12m", label: "12 Months" }, { key: "all", label: "All Time" },
];
const METRIC_ORDER = ["ftp", "ftpWkg", "p5", "p1", "peak", "decoupling", "preferred_cadence", "hrr"];

function Sparkline({ points, unit }: { points: { date: string; value: number }[]; unit: string }) {
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals), min = Math.min(...vals), span = Math.max(1, max - min);
  const latest = vals[vals.length - 1];
  const delta = vals.length > 1 ? latest - vals[0] : 0;
  return (
    <View>
      <View style={s.mHead}>
        <Text style={s.mNow}>{latest} <Text style={s.mUnit}>{unit}</Text></Text>
        {vals.length > 1 && <Text style={[s.mDelta, { color: delta >= 0 ? "#7FD98A" : "#FF7A66" }]}>{delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 10) / 10)}</Text>}
      </View>
      <View style={s.bars}>
        {points.map((p, i) => (
          <View key={`${p.date}-${i}`} style={s.col}>
            <View style={[s.bar, { height: Math.max(6, 12 + ((p.value - min) / span) * 46) }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BenchmarkTrendsCard() {
  const [range, setRange] = React.useState("3m");
  const { trends, loading } = useBenchmarkTrends(range);
  const keys = METRIC_ORDER.filter((k) => (trends.series[k] || []).length > 0);

  return (
    <Card testID="benchmark-trends">
      <SectionTitle label="BENCHMARK TRENDS" color={CC.rouge} />
      <View style={s.rangeRow}>
        {RANGES.map((r) => {
          const on = range === r.key;
          return (
            <Pressable key={r.key} testID={`bmt-range-${r.key}`} onPress={() => setRange(r.key)} style={[s.range, on && s.rangeOn]}>
              <Text style={[s.rangeText, on && s.rangeTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
      ) : keys.length === 0 ? (
        <View style={s.empty} testID="bmt-empty">
          <Ionicons name="analytics-outline" size={22} color={CC.dim} />
          <Text style={s.emptyText}>Your benchmark trends will appear here as you complete and accept benchmarks.</Text>
        </View>
      ) : (
        <View style={s.grid}>
          {keys.map((k) => (
            <View key={k} style={s.metric}>
              <Text style={s.mLabel}>{trends.labels[k]}</Text>
              <Sparkline points={trends.series[k]} unit={trends.units[k]} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  range: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.03)" },
  rangeOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  rangeText: { color: CC.dim, fontSize: 12, fontWeight: "700" },
  rangeTextOn: { color: "#fff" },
  center: { paddingVertical: 24, alignItems: "center" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyText: { color: CC.dim, fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 360 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flexGrow: 1, minWidth: 200, borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 12 },
  mLabel: { color: CC.dim, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.3, marginBottom: 6 },
  mHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  mNow: { color: CC.white, fontSize: 18, fontWeight: "900" },
  mUnit: { color: CC.dim, fontSize: 12, fontWeight: "700" },
  mDelta: { fontSize: 12, fontWeight: "800" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 62, marginTop: 8 },
  col: { flex: 1, alignItems: "center" },
  bar: { width: "80%", maxWidth: 20, borderRadius: 4, backgroundColor: CC.rouge },
});
