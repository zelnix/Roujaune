// ─────────────────────────────────────────────────────────────────────────
// WP-D: Benchmark Week — optional guided 7-day schedule. Riders can start,
// reschedule, replace, skip or cancel. Maximal tests are spaced by the server
// (consecutive maximal days are rejected). Days also overlay the Training
// Calendar via the calendar-week endpoint.
// ─────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest } from "@/src/lib/benchmark/catalog";
import {
  useBenchmarkWeek, startBenchmarkWeek, patchBenchmarkWeekDay, cancelBenchmarkWeek,
  type BenchmarkWeekDay,
} from "@/src/lib/benchmark/api";

const KIND_META: Record<string, { icon: any; color: string }> = {
  test: { icon: "flag", color: CC.rouge },
  recovery: { icon: "leaf-outline", color: "#55C850" },
  rest: { icon: "bed-outline", color: "#8A6FE0" },
};
const REPLACE_POOL_POWER = ["ramp", "five_min_aerobic", "one_min_power", "sprint_power", "cadence_control", "aerobic_efficiency", "recovery_response"];
const REPLACE_POOL_NOPOWER = ["cadence_control", "aerobic_efficiency", "recovery_response"];

function dayName(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }
  catch { return dateStr; }
}

export default function BenchmarkWeekCard({ hasPower = true, onNotice }: { hasPower?: boolean; onNotice?: (m: string) => void }) {
  const router = useRouter();
  const { week, setWeek, loading, reload } = useBenchmarkWeek();
  const [busy, setBusy] = React.useState(false);

  const start = async () => {
    setBusy(true);
    const w = await startBenchmarkWeek();
    if (w) setWeek(w); else onNotice?.("Could not start Benchmark Week.");
    setBusy(false);
  };
  const cancel = async () => {
    setBusy(true);
    if (await cancelBenchmarkWeek()) { setWeek({ active: false, days: [] }); onNotice?.("Benchmark Week cancelled."); }
    setBusy(false);
  };
  const patch = async (index: number, payload: Record<string, unknown>) => {
    setBusy(true);
    const r = await patchBenchmarkWeekDay(index, payload);
    if (r.ok && r.week) setWeek(r.week); else onNotice?.(r.error || "Update failed");
    setBusy(false);
  };
  const skip = (d: BenchmarkWeekDay) => patch(d.index, { status: d.status === "skipped" ? "scheduled" : "skipped" });
  const reschedule = (d: BenchmarkWeekDay) => {
    const next = new Date(d.date); next.setDate(next.getDate() + 1);
    patch(d.index, { date: next.toISOString().slice(0, 10) });
  };
  const replace = (d: BenchmarkWeekDay) => {
    const pool = hasPower ? REPLACE_POOL_POWER : REPLACE_POOL_NOPOWER;
    const cur = pool.indexOf(d.testId || "");
    const nextId = pool[(cur + 1) % pool.length];
    patch(d.index, { testId: nextId });
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>;

  if (!week.active) {
    return (
      <View style={s.intro} testID="bm-week-intro">
        <Text style={s.introText}>
          A guided seven-day plan to benchmark your fitness — Alberto and Adriana space the hard efforts and add recovery so each result reflects your true form.
        </Text>
        <Pressable testID="bm-week-start" onPress={start} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="calendar" size={16} color="#fff" /><Text style={s.primaryText}>Start Benchmark Week</Text></>}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }} testID="bm-week-active">
      {week.days.map((d) => {
        const meta = KIND_META[d.kind] ?? KIND_META.recovery;
        const test = d.testId ? getBenchmarkTest(d.testId) : undefined;
        const skipped = d.status === "skipped";
        return (
          <View key={d.index} style={[s.dayRow, skipped && { opacity: 0.5 }]} testID={`bm-week-day-${d.index}`}>
            <View style={[s.dayIcon, { backgroundColor: `${meta.color}22` }]}>
              <Ionicons name={meta.icon} size={16} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dayLabel}>{test?.name ?? d.label}{skipped ? " · skipped" : ""}</Text>
              <Text style={s.dayDate}>Day {d.index + 1} · {dayName(d.date)}</Text>
            </View>
            {d.kind === "test" && !skipped && (
              <View style={s.dayActions}>
                <Pressable testID={`bm-week-startday-${d.index}`} onPress={() => router.push(`/benchmark/setup/${d.testId}` as any)} style={s.miniPrimary}><Text style={s.miniPrimaryText}>Start</Text></Pressable>
                <Pressable testID={`bm-week-replace-${d.index}`} onPress={() => replace(d)} style={s.miniBtn}><Ionicons name="swap-horizontal" size={15} color={CC.dim} /></Pressable>
                <Pressable testID={`bm-week-reschedule-${d.index}`} onPress={() => reschedule(d)} style={s.miniBtn}><Ionicons name="calendar-outline" size={15} color={CC.dim} /></Pressable>
              </View>
            )}
            {d.kind === "test" && (
              <Pressable testID={`bm-week-skip-${d.index}`} onPress={() => skip(d)} style={s.miniBtn}>
                <Ionicons name={skipped ? "arrow-undo" : "play-skip-forward"} size={15} color={CC.dim} />
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={s.footer}>
        <Pressable testID="bm-week-cancel" onPress={cancel} disabled={busy} style={s.cancelBtn}><Text style={s.cancelText}>Cancel Benchmark Week</Text></Pressable>
        <Pressable testID="bm-week-refresh" onPress={reload} style={s.miniBtn}><Ionicons name="refresh" size={15} color={CC.dim} /></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 20, alignItems: "center" },
  intro: { gap: 12 },
  introText: { color: CC.dim, fontSize: 13.5, lineHeight: 20 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 13, minHeight: 48 },
  primaryText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 11 },
  dayIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  dayLabel: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
  dayDate: { color: CC.dim, fontSize: 11.5, marginTop: 2 },
  dayActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniPrimary: { backgroundColor: CC.rouge, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: "center" },
  miniPrimaryText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },
  miniBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: CC.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 11, minHeight: 44 },
  cancelText: { color: CC.dim, fontSize: 13, fontWeight: "700" },
});
