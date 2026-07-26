import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest, CATEGORY_META } from "@/src/lib/benchmark/catalog";
import { BenchmarkLibrary } from "@/src/components/benchmark/BenchmarkLibrary";
import { useBenchmarkResults, useBenchmarkProfile, useBenchmarkZones, useBenchmarkRecommendation, setBenchmarkResultDecision } from "@/src/lib/benchmark/api";
import type { BenchmarkProfile } from "@/src/lib/benchmark/types";

const HISTORY_RANGES = ["4 Weeks", "3 Months", "6 Months", "12 Months", "All Time"];
const RANGE_DAYS: Record<string, number> = { "4 Weeks": 28, "3 Months": 92, "6 Months": 183, "12 Months": 366, "All Time": 0 };

const DECISION_META: Record<string, { label: string; color: string }> = {
  accepted: { label: "Accepted", color: "#7FD98A" },
  pending: { label: "Review", color: "#FFC20A" },
  excluded: { label: "Excluded", color: "#8A8F98" },
};

type Stat = { key: keyof BenchmarkProfile; label: string; unit?: string; format?: (v: any) => string };
const PROFILE_STATS: Stat[] = [
  { key: "ftp", label: "FTP", unit: "W" },
  { key: "ftpWkg", label: "FTP watts / kg", unit: "W/kg" },
  { key: "fiveMinPower", label: "Five-minute power", unit: "W" },
  { key: "oneMinPower", label: "One-minute power", unit: "W" },
  { key: "sprintPower", label: "Sprint power", unit: "W" },
  { key: "aerobicEfficiency", label: "Aerobic efficiency" },
  { key: "preferredCadence", label: "Preferred cadence", unit: "rpm" },
  { key: "recoveryResponse", label: "Recovery response", unit: "bpm" },
  { key: "lastBenchmarkDate", label: "Last benchmark", format: (v: string) => new Date(v).toLocaleDateString() },
];

export default function BenchmarkLandingScreen() {
  const router = useRouter();
  const { results, loading: resultsLoading, reload: reloadResults } = useBenchmarkResults();
  const { profile, loading: profileLoading, reload: reloadProfile } = useBenchmarkProfile();
  const { ftp: zoneFtp, zones, loading: zonesLoading, reload: reloadZones } = useBenchmarkZones();
  const { rec: recommendation } = useBenchmarkRecommendation();
  const [range, setRange] = React.useState("3 Months");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const recId = recommendation?.primary?.testId || "ramp";
  const rec = getBenchmarkTest(recId) || getBenchmarkTest("ramp")!;
  const recCat = CATEGORY_META[rec.category];
  const recReasons = recommendation?.primary?.reasons || [];
  const recApproved = recommendation?.status === "approved";

  const decide = async (id: string, decision: "accepted" | "excluded") => {
    setBusyId(id);
    await setBenchmarkResultDecision(id, decision);
    await Promise.all([reloadResults(), reloadProfile(), reloadZones()]);
    setBusyId(null);
  };

  // FTP-bearing results within the selected range, oldest → newest (for the trend).
  const ftpHistory = React.useMemo(() => {
    const days = RANGE_DAYS[range] ?? 0;
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    return results
      .filter((r) => r.decision !== "excluded" && (r.primaryMetric?.key === "ftp"))
      .filter((r) => !cutoff || new Date(r.createdAt).getTime() >= cutoff)
      .slice().reverse();
  }, [results, range]);

  return (
    <AppScaffold
      active="benchmark"
      title="Benchmark Workouts"
      subtitle="Test Your Fitness • Track Your Progress"
    >
      <Card>
        <Text style={s.lead}>
          Discover where your cycling fitness is today, track how it changes over time, and help Alberto or Adriana
          personalise every part of your training.
        </Text>
      </Card>

      {/* ── Current Benchmark Profile ── */}
      <Card testID="bm-profile">
        <SectionTitle label="CURRENT BENCHMARK PROFILE" color={CC.rouge} />
        {profileLoading ? (
          <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
        ) : (
          <View style={s.statGrid}>
            {PROFILE_STATS.map((st) => {
              const raw = profile[st.key];
              const has = raw !== null && raw !== undefined;
              const value = has ? (st.format ? st.format(raw) : `${raw}${st.unit ? ` ${st.unit}` : ""}`) : "Not yet tested";
              return (
                <View key={st.key} style={s.stat} accessibilityLabel={`${st.label}: ${value}`}>
                  <Text style={s.statLabel}>{st.label}</Text>
                  <Text style={[s.statValue, !has && s.statEmpty]} numberOfLines={1}>{value}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* ── Recommended Next Benchmark ── */}
      <Card testID="bm-recommended">
        <SectionTitle label="RECOMMENDED NEXT BENCHMARK" />
        <View style={s.recHead}>
          <View style={[s.recIcon, { backgroundColor: `${recCat.color}22` }]}>
            <Ionicons name={rec.icon} size={24} color={recCat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={[s.chip, { borderColor: `${recCat.color}66`, alignSelf: "flex-start" }]}>
              <Text style={[s.chipText, { color: recCat.color }]}>{recCat.label}</Text>
            </View>
            <Text style={s.recName} accessibilityRole="header">{rec.name}</Text>
          </View>
        </View>
        <Text style={s.recDesc}>{rec.description}</Text>
        <View style={s.recFacts}>
          <RecFact icon="time-outline" label="Duration" value={`~${rec.durationMin} min`} />
          <RecFact icon="barbell-outline" label="Intensity" value={rec.difficulty} />
          <RecFact icon="hardware-chip-outline" label="Equipment" value={rec.requiredEquipment.length > 0 ? "Trainer + power" : "None"} />
        </View>
        <View style={s.whyBox}>
          <Text style={s.whyLabel}>{recApproved ? "YOUR CURRENT BENCHMARK IS STILL SUITABLE" : "WHY THIS TEST"}</Text>
          <Text style={s.whyText}>
            {recApproved
              ? "Alberto or Adriana has reviewed your recent training and your existing benchmarks can personalise your plan. Retest when you're ready."
              : recReasons.length > 0
                ? `Recommended because ${recReasons.join(", ")}. ${rec.purpose}`
                : rec.whoFor}
          </Text>
        </View>
        <View style={s.recActions}>
          <Pressable testID="rec-view" onPress={() => router.push(`/benchmark/${rec.id}`)} accessibilityRole="button" accessibilityLabel="View the recommended test" style={s.btnGhost}>
            <Text style={s.btnGhostText}>View Test</Text>
          </Pressable>
          <Pressable testID="rec-schedule" onPress={() => setNotice("Scheduling arrives with the training-calendar integration.")} accessibilityRole="button" accessibilityLabel="Schedule the recommended test" style={s.btnGhost}>
            <Text style={s.btnGhostText}>Schedule Test</Text>
          </Pressable>
          <Pressable testID="rec-start" onPress={() => router.push(`/benchmark/setup/${rec.id}`)} accessibilityRole="button" accessibilityLabel="Start the recommended test" style={s.btnPrimary}>
            <Ionicons name="play" size={15} color="#fff" />
            <Text style={s.btnPrimaryText}>Start Test</Text>
          </Pressable>
        </View>
        {notice && (
          <View style={s.notice}><Ionicons name="information-circle-outline" size={15} color={CC.dim} /><Text style={s.noticeText}>{notice}</Text></View>
        )}
      </Card>

      {/* ── Recent Results ── */}
      <Card testID="bm-recent">
        <SectionTitle label="RECENT RESULTS" />
        {resultsLoading ? (
          <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
        ) : results.length === 0 ? (
          <View style={s.empty} testID="bm-recent-empty">
            <View style={s.emptyIcon}><Ionicons name="ribbon-outline" size={24} color={CC.dim} /></View>
            <Text style={s.emptyText}>Complete your first benchmark to begin tracking your cycling fitness.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {results.slice(0, 6).map((r) => {
              const dm = DECISION_META[r.decision] ?? DECISION_META.pending;
              const pm = r.primaryMetric;
              return (
                <View key={r.id} style={s.resultRow} testID={`result-${r.id}`}>
                  <View style={s.resultTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultTitle}>{getBenchmarkTest(r.testId)?.name ?? r.testId}</Text>
                      <Text style={s.resultMeta}>
                        {new Date(r.createdAt).toLocaleDateString()}
                        {typeof r.confidence === "number" ? ` · ${Math.round(r.confidence)}% confidence` : ""}
                        {r.isDevData ? " · simulated" : ""}
                      </Text>
                    </View>
                    {pm && <Text style={s.resultValue}>{pm.value} {pm.unit}</Text>}
                    <View style={[s.decChip, { borderColor: `${dm.color}66` }]}><Text style={[s.decChipText, { color: dm.color }]}>{dm.label}</Text></View>
                  </View>
                  {r.decision === "pending" && (
                    <View style={s.decActions}>
                      <Pressable testID={`accept-${r.id}`} disabled={busyId === r.id} onPress={() => decide(r.id, "accepted")} style={[s.decBtn, s.decAccept]}>
                        <Text style={s.decAcceptText}>{busyId === r.id ? "…" : "Accept"}</Text>
                      </Pressable>
                      <Pressable testID={`exclude-${r.id}`} disabled={busyId === r.id} onPress={() => decide(r.id, "excluded")} style={[s.decBtn, s.decExclude]}>
                        <Text style={s.decExcludeText}>Exclude</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* ── Training Zones (derived from current FTP) ── */}
      <Card testID="bm-zones">
        <SectionTitle label="TRAINING ZONES" color={CC.rouge} />
        {zonesLoading ? (
          <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
        ) : zones.length === 0 ? (
          <View style={s.empty} testID="bm-zones-empty">
            <View style={s.emptyIcon}><Ionicons name="layers-outline" size={24} color={CC.dim} /></View>
            <Text style={s.emptyText}>Set your FTP — accept an FTP benchmark — to generate your personalised power zones.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={s.zonesSub}>Based on an FTP of {zoneFtp} W.</Text>
            {zones.map((z) => (
              <View key={z.key} style={s.zoneRow}>
                <Text style={s.zoneKey}>{z.key}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.zoneName}>{z.name}</Text>
                  <Text style={s.zonePct}>{z.lowPct}%{z.highPct ? `–${z.highPct}%` : "+"} FTP</Text>
                </View>
                <Text style={s.zoneW}>{z.lowW}{z.highW ? `–${z.highW}` : "+"} W</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* ── Benchmark History ── */}
      <Card testID="bm-history">
        <SectionTitle label="BENCHMARK HISTORY" />
        <View style={s.rangeRow}>
          {HISTORY_RANGES.map((r) => {
            const on = range === r;
            return (
              <Pressable key={r} testID={`hist-range-${r.replace(/\s/g, "")}`} onPress={() => setRange(r)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.range, on && s.rangeOn]}>
                <Text style={[s.rangeText, on && s.rangeTextOn]}>{r}</Text>
              </Pressable>
            );
          })}
        </View>
        {ftpHistory.length >= 1 ? (
          <FtpTrend points={ftpHistory.map((r) => ({ v: r.primaryMetric!.value, at: r.createdAt }))} />
        ) : (
          <View style={s.chartPlaceholder} accessibilityLabel="Benchmark trend chart, no data yet">
            <Ionicons name="analytics-outline" size={26} color={CC.dim} />
            <Text style={s.chartText}>Your FTP trend for the last {range.toLowerCase()} will appear here once you&apos;ve logged FTP benchmarks.</Text>
          </View>
        )}
      </Card>

      {/* ── Benchmark Test Library (Part 3) ── */}
      <Card testID="bm-library">
        <SectionTitle label="BENCHMARK TEST LIBRARY" color={CC.rouge} />
        <Text style={s.libIntro}>Choose a benchmark to see what it measures and how it runs.</Text>
        <BenchmarkLibrary />
      </Card>
    </AppScaffold>
  );
}

function RecFact({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.recFact}>
      <Ionicons name={icon} size={15} color={CC.rouge} />
      <View>
        <Text style={s.recFactLabel}>{label}</Text>
        <Text style={s.recFactValue}>{value}</Text>
      </View>
    </View>
  );
}

/** Lightweight FTP trend — View-based bars (no SVG dependency). */
function FtpTrend({ points }: { points: { v: number; at: string }[] }) {
  const vals = points.map((p) => p.v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = Math.max(1, max - min);
  const latest = vals[vals.length - 1];
  const delta = vals.length > 1 ? latest - vals[0] : 0;
  return (
    <View testID="ftp-trend">
      <View style={s.trendHead}>
        <Text style={s.trendNow}>{latest} W <Text style={s.trendNowSub}>current FTP</Text></Text>
        {vals.length > 1 && (
          <Text style={[s.trendDelta, { color: delta >= 0 ? "#7FD98A" : "#FF7A66" }]}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} W
          </Text>
        )}
      </View>
      <View style={s.trendBars}>
        {points.map((p, i) => {
          const h = 24 + ((p.v - min) / span) * 72;
          return (
            <View key={`${p.at}-${i}`} style={s.trendCol}>
              <Text style={s.trendVal}>{p.v}</Text>
              <View style={[s.trendBar, { height: Math.max(6, h) }]} />
              <Text style={s.trendDate}>{new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  lead: { color: CC.dim, fontSize: 14, lineHeight: 21 },

  center: { paddingVertical: 22, alignItems: "center" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { flexGrow: 1, flexBasis: 150, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 12, gap: 4 },
  statLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4 },
  statValue: { color: CC.white, fontSize: 17, fontWeight: "800" },
  statEmpty: { color: CC.dim, fontSize: 13, fontWeight: "600", fontStyle: "italic" },

  recHead: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  recIcon: { width: 52, height: 52, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  recName: { color: CC.white, fontSize: 19, fontWeight: "800", marginTop: 6 },
  recDesc: { color: CC.dim, fontSize: 13.5, lineHeight: 20 },
  recFacts: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  recFact: { flexDirection: "row", alignItems: "center", gap: 8, flexGrow: 1, flexBasis: 150 },
  recFactLabel: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  recFactValue: { color: CC.white, fontSize: 13, fontWeight: "700" },
  whyBox: { backgroundColor: "rgba(201,23,39,0.06)", borderWidth: 1, borderColor: "rgba(201,23,39,0.2)", borderRadius: 12, padding: 12, gap: 4 },
  whyLabel: { color: CC.rouge, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  whyText: { color: CC.white, fontSize: 12.5, lineHeight: 18 },
  recActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  btnGhost: { flexGrow: 1, flexBasis: 120, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 12, minHeight: 46, backgroundColor: "rgba(255,255,255,0.03)" },
  btnGhostText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  btnPrimary: { flexGrow: 1, flexBasis: 120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: CC.rouge, borderRadius: 11, paddingVertical: 12, minHeight: 46 },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  noticeText: { color: CC.dim, fontSize: 12.5, flex: 1, lineHeight: 17 },

  empty: { alignItems: "center", paddingVertical: 18, gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  emptyText: { color: CC.dim, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 440 },
  resultRow: { borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 12, gap: 10 },
  resultTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  resultMeta: { color: CC.dim, fontSize: 11.5, marginTop: 2 },
  resultValue: { color: CC.white, fontSize: 14, fontWeight: "800" },
  decChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  decChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  decActions: { flexDirection: "row", gap: 8 },
  decBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 10, minHeight: 42, borderWidth: 1 },
  decAccept: { backgroundColor: "rgba(127,217,138,0.12)", borderColor: "rgba(127,217,138,0.4)" },
  decAcceptText: { color: "#7FD98A", fontSize: 13, fontWeight: "800" },
  decExclude: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: CC.border },
  decExcludeText: { color: CC.dim, fontSize: 13, fontWeight: "700" },

  zonesSub: { color: CC.dim, fontSize: 12.5, marginBottom: 2 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 10, padding: 11 },
  zoneKey: { color: CC.rouge, fontSize: 13, fontWeight: "900", width: 30 },
  zoneName: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
  zonePct: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  zoneW: { color: CC.white, fontSize: 13, fontWeight: "800" },

  trendHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  trendNow: { color: CC.white, fontSize: 20, fontWeight: "900" },
  trendNowSub: { color: CC.dim, fontSize: 12, fontWeight: "700" },
  trendDelta: { fontSize: 13, fontWeight: "800" },
  trendBars: { flexDirection: "row", alignItems: "flex-end", gap: 10, minHeight: 130, paddingTop: 6 },
  trendCol: { flex: 1, alignItems: "center", gap: 4 },
  trendVal: { color: CC.dim, fontSize: 10.5, fontWeight: "700" },
  trendBar: { width: "70%", maxWidth: 34, borderRadius: 6, backgroundColor: CC.rouge },
  trendDate: { color: CC.dim, fontSize: 9.5 },

  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  range: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  rangeOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  rangeText: { color: CC.dim, fontSize: 12, fontWeight: "700" },
  rangeTextOn: { color: "#fff" },
  chartPlaceholder: { borderWidth: 1, borderColor: CC.borderSoft, borderStyle: "dashed", borderRadius: 12, padding: 24, alignItems: "center", gap: 10, minHeight: 150, justifyContent: "center" },
  chartText: { color: CC.dim, fontSize: 12.5, textAlign: "center", lineHeight: 18, maxWidth: 420 },

  libIntro: { color: CC.dim, fontSize: 13, lineHeight: 19, marginBottom: 4 },
});
