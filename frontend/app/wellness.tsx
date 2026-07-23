import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, useApiData, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC, colorOf, ReadinessRing } from "@/src/components/calendar";

type Wellness = {
  headline: string; subhead: string;
  readiness: { score: number; status: string; source: string };
  vitals: { key: string; label: string; value: string; sub: string; pct: number; icon: string; color: string }[];
  sleep_week: number[];
  companion: { title: string; duration: string; tag: string; done: boolean }[];
  fb50: { completed: number; planned: number; streak: number; next: string; next_duration: string };
};

function SleepChart({ data }: { data: number[] }) {
  const w = 320, h = 90, max = 10, n = data.length, gap = 10;
  const bw = (w - gap * (n - 1)) / n;
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <Svg width="100%" height={h + 18} viewBox={`0 0 ${w} ${h + 18}`} accessibilityLabel="Sleep hours this week">
      {data.map((v, i) => {
        const bh = (v / max) * h; const x = i * (bw + gap);
        const good = v >= 7;
        return <Rect key={i} x={x} y={h - bh} width={bw} height={bh} rx={4} fill={good ? CC.purple : CC.amber} opacity={0.9} />;
      })}
      {days.map((dn, i) => (
        <Rect key={"lbl" + i} x={i * (bw + gap)} y={h + 6} width={bw} height={0.001} />
      ))}
    </Svg>
  );
}

export default function WellnessScreen() {
  const { data } = useApiData<Wellness>("/api/wellness");
  const d = data;
  return (
    <AppScaffold active="wellness" title="Wellness" subtitle="Recovery, sleep and your peaceful companion.">
      {d ? (
        <>
          <View style={s.row}>
            <Card testID="wellness-hero" style={[s.hero, { flex: 1 }]}>
              <ReadinessRing score={d.readiness.score} status={d.readiness.status} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={s.headline}>{d.headline}</Text>
                <Text style={s.subhead}>{d.subhead}</Text>
                <Text style={s.source}><Ionicons name="watch-outline" size={12} color={CC.dim} /> Synced from {d.readiness.source}</Text>
              </View>
            </Card>
            <Card testID="fb50-summary" style={s.fb50}>
              <SectionTitle label="FB50 STRENGTH" color={CC.purple} />
              <Text style={s.fb50Big}>{d.fb50.completed}<Text style={s.fb50Small}> / {d.fb50.planned}</Text></Text>
              <Text style={s.fb50Sub}>sessions this plan</Text>
              <View style={s.fb50Streak}><Ionicons name="flame" size={14} color={CC.yellow} /><Text style={s.fb50StreakText}>{d.fb50.streak}-week streak</Text></View>
              <View style={s.fb50Next}>
                <Text style={s.fb50NextLabel}>Up next</Text>
                <Text style={s.fb50NextTitle}>{d.fb50.next} · {d.fb50.next_duration}</Text>
              </View>
            </Card>
          </View>

          <Card testID="vitals">
            <SectionTitle label="RECOVERY VITALS" />
            <View style={s.vitals}>
              {d.vitals.map((v) => (
                <View key={v.key} style={s.vital}>
                  <View style={s.vitalHead}>
                    <Ionicons name={v.icon as any} size={16} color={colorOf(v.color)} />
                    <Text style={s.vitalLabel}>{v.label}</Text>
                  </View>
                  <Text style={s.vitalValue}>{v.value}</Text>
                  <Text style={s.vitalSub}>{v.sub}</Text>
                  <View style={s.vitalTrack}><View style={[s.vitalFill, { width: `${v.pct}%`, backgroundColor: colorOf(v.color) }]} /></View>
                </View>
              ))}
            </View>
          </Card>

          <View style={s.row}>
            <Card style={{ flex: 1 }} testID="sleep-week">
              <SectionTitle label="SLEEP THIS WEEK" color={CC.purple} />
              <SleepChart data={d.sleep_week} />
              <Text style={s.avg}>Avg {(d.sleep_week.reduce((a, b) => a + b, 0) / d.sleep_week.length).toFixed(1)}h · target 7–9h</Text>
            </Card>
            <Card style={{ flex: 1.2 }} testID="companion">
              <SectionTitle label="MY PEACEFUL COMPANION" color={CC.purple} />
              {d.companion.map((c, i) => (
                <Pressable key={c.title} testID={`companion-${i}`} style={({ hovered }: any) => [s.compRow, i < d.companion.length - 1 && s.divider, hovered && { backgroundColor: "rgba(255,255,255,0.03)" }]}>
                  <View style={[s.compIcon, c.done && { backgroundColor: CC.green }]}>
                    <Ionicons name={c.done ? "checkmark" : "flower-outline"} size={15} color={c.done ? "#04210F" : CC.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.compTitle}>{c.title}</Text>
                    <Text style={s.compTag}>{c.tag} · {c.duration}</Text>
                  </View>
                  <Ionicons name={c.done ? "checkmark-circle" : "play-circle-outline"} size={22} color={c.done ? CC.green : CC.white} />
                </Pressable>
              ))}
            </Card>
          </View>
        </>
      ) : <Text style={s.loading}>Loading wellness…</Text>}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  hero: { flexDirection: "row", alignItems: "center" },
  headline: { color: CC.white, fontSize: 24, fontWeight: "800" },
  subhead: { color: CC.dim, fontSize: 14, marginTop: 4 },
  source: { color: CC.dim, fontSize: 12, marginTop: 10 },
  fb50: { width: 260 },
  fb50Big: { color: CC.white, fontSize: 34, fontWeight: "900", marginTop: 4 },
  fb50Small: { color: CC.dim, fontSize: 20, fontWeight: "700" },
  fb50Sub: { color: CC.dim, fontSize: 12 },
  fb50Streak: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  fb50StreakText: { color: CC.yellow, fontSize: 12.5, fontWeight: "700" },
  fb50Next: { marginTop: 14, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 10 },
  fb50NextLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4 },
  fb50NextTitle: { color: CC.white, fontSize: 13.5, fontWeight: "700", marginTop: 3 },
  vitals: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  vital: { flex: 1, minWidth: 180, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 14 },
  vitalHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  vitalLabel: { color: CC.dim, fontSize: 12, fontWeight: "600" },
  vitalValue: { color: CC.white, fontSize: 22, fontWeight: "800", marginTop: 8 },
  vitalSub: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  vitalTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 },
  vitalFill: { height: 6, borderRadius: 3 },
  avg: { color: CC.dim, fontSize: 12, marginTop: 6 },
  compRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  compIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(166,90,226,0.15)", alignItems: "center", justifyContent: "center" },
  compTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  compTag: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 30 },
});
