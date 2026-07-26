import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Svg, { Path, Line, Circle, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, useApiData, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC, colorOf } from "@/src/components/calendar";
import { useProgressTimeline, RANGE_OPTIONS, TimelineRange } from "@/src/lib/progress-timeline";

type Progress = {
  headline: string; subhead: string;
  fitness: { ctl: number; atl: number; tsb: number; ctl_delta: string; form_label: string };
  trend: { ctl: number[]; atl: number[]; labels: string[] };
  metrics: { label: string; value: string; delta: string; up: boolean }[];
  records: { label: string; value: string; when: string }[];
  recent: { title: string; date: string; tss: number; distance: string; color: string }[];
};

function line(pts: number[], w: number, h: number, max: number) {
  const step = w / (pts.length - 1);
  const y = (p: number) => h - (p / max) * h;
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
}

function TrendChart({ ctl, atl }: { ctl: number[]; atl: number[] }) {
  const w = 560, h = 170, max = 110;
  return (
    <Svg width="100%" height={h + 6} viewBox={`0 0 ${w} ${h + 6}`} accessibilityLabel="Fitness (CTL) and fatigue (ATL) trend">
      <Defs>
        <SvgGrad id="ctlg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CC.yellow} stopOpacity="0.35" />
          <Stop offset="1" stopColor={CC.yellow} stopOpacity="0.02" />
        </SvgGrad>
      </Defs>
      {[0, 55, 110].map((t) => (
        <Line key={t} x1={0} y1={h - (t / max) * h} x2={w} y2={h - (t / max) * h} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      <Path d={`${line(ctl, w, h, max)} L${w} ${h} L0 ${h} Z`} fill="url(#ctlg)" />
      <Path d={line(ctl, w, h, max)} stroke={CC.yellow} strokeWidth={2.6} fill="none" />
      <Path d={line(atl, w, h, max)} stroke={CC.orange} strokeWidth={2} fill="none" strokeDasharray="5 4" />
      {ctl.map((p, i) => i === ctl.length - 1 ? <Circle key={i} cx={(w / (ctl.length - 1)) * i} cy={h - (p / max) * h} r={4} fill={CC.yellow} /> : null)}
    </Svg>
  );
}

function TLStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.tlStat}>
      <Text style={s.tlStatValue}>{value}</Text>
      <Text style={s.tlStatLabel}>{label}</Text>
    </View>
  );
}

function TimelineCard() {
  const [range, setRange] = React.useState<TimelineRange>("3m");
  const [offset, setOffset] = React.useState(0);
  const { data } = useProgressTimeline(range, offset);
  // Reset to the current window whenever the range changes.
  React.useEffect(() => { setOffset(0); }, [range]);

  const buckets = data?.buckets ?? [];
  const maxTss = Math.max(1, ...buckets.map((b) => b.tss));
  const sm = data?.summary;
  const hasData = (sm?.rides ?? 0) > 0;
  const delta = sm?.tss_delta_pct ?? 0;

  return (
    <Card testID="progress-timeline" style={{ marginBottom: 16 }}>
      <View style={s.tlHead}>
        <View style={{ flex: 1 }}>
          <SectionTitle label="TRAINING TIMELINE" color={CC.yellow} />
          <Text style={s.tlWindow}>{data?.window_label ?? "…"}</Text>
        </View>
        <View style={s.tlNav}>
          <Pressable onPress={() => setOffset((o) => o + 1)} testID="tl-prev" hitSlop={8}
            style={({ hovered }: any) => [s.tlNavBtn, hovered && s.tlNavHover]} accessibilityLabel="Earlier period">
            <Ionicons name="chevron-back" size={20} color={CC.white} />
          </Pressable>
          <Pressable onPress={() => setOffset((o) => Math.max(0, o - 1))} disabled={!data?.has_next} testID="tl-next" hitSlop={8}
            style={({ hovered }: any) => [s.tlNavBtn, hovered && s.tlNavHover, !data?.has_next && { opacity: 0.35 }]} accessibilityLabel="Later period">
            <Ionicons name="chevron-forward" size={20} color={CC.white} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tlChips}>
        {RANGE_OPTIONS.map((o) => {
          const activeChip = range === o.key;
          return (
            <Pressable key={o.key} onPress={() => setRange(o.key)} testID={`tl-range-${o.key}`}
              style={[s.tlChip, activeChip && s.tlChipActive]}>
              <Text style={[s.tlChipText, activeChip && s.tlChipTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.tlChart}>
        {buckets.map((b, i) => (
          <View key={i} style={s.tlBarCol}>
            <View style={s.tlBarArea}>
              <View style={[s.tlBar, { height: `${Math.max(b.tss > 0 ? 6 : 0, (b.tss / maxTss) * 100)}%` }]} />
            </View>
            <Text style={s.tlBarLabel} numberOfLines={1}>{b.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.tlAxis}>Training load (TSS) per period</Text>

      {hasData ? (
        <View style={s.tlStats}>
          <TLStat label="RIDES" value={sm!.rides} />
          <TLStat label="TIME" value={`${sm!.hours}h`} />
          <TLStat label="TSS" value={sm!.tss} />
          <TLStat label="DISTANCE" value={`${sm!.distance_km} km`} />
          <TLStat label="ELEV" value={`${sm!.elevation_m} m`} />
          <View style={s.tlStat}>
            <View style={s.tlDeltaRow}>
              <Ionicons name={delta >= 0 ? "arrow-up" : "arrow-down"} size={12} color={delta >= 0 ? CC.green : CC.rouge} />
              <Text style={[s.tlStatValue, { color: delta >= 0 ? CC.green : CC.rouge }]}>{Math.abs(delta)}%</Text>
            </View>
            <Text style={s.tlStatLabel}>VS PREV</Text>
          </View>
        </View>
      ) : (
        <View style={s.tlEmpty}>
          <Ionicons name="bicycle-outline" size={22} color={CC.dim} />
          <Text style={s.tlEmptyText}>No rides logged in this period. Complete a ride to see your training load here.</Text>
        </View>
      )}
    </Card>
  );
}

export default function ProgressScreen() {
  const { data } = useApiData<Progress>("/api/progress");
  const d = data;
  return (
    <AppScaffold active="progress" title="Progress" subtitle="Your fitness, form and personal records.">
      <TimelineCard />
      {d ? (
        <>
          <Card testID="progress-hero" style={s.hero}>
            <View style={{ flex: 1 }}>
              <Text style={s.headline}>{d.headline}</Text>
              <Text style={s.subhead}>{d.subhead}</Text>
            </View>
            <View style={s.formPill}><Text style={s.formLabel}>FORM</Text><Text style={s.formVal}>{d.fitness.form_label}</Text></View>
          </Card>

          <View style={s.row}>
            <Card testID="fitness-trend" style={{ flex: 1 }}>
              <SectionTitle label="FITNESS TREND" />
              <View style={s.fitStats}>
                <FitStat label="Fitness (CTL)" value={String(d.fitness.ctl)} delta={d.fitness.ctl_delta} color={CC.yellow} />
                <FitStat label="Fatigue (ATL)" value={String(d.fitness.atl)} color={CC.orange} />
                <FitStat label="Form (TSB)" value={`+${d.fitness.tsb}`} color={CC.green} />
              </View>
              <TrendChart ctl={d.trend.ctl} atl={d.trend.atl} />
              <View style={s.legend}>
                <Legend color={CC.yellow} label="CTL — Fitness" />
                <Legend color={CC.orange} label="ATL — Fatigue" />
              </View>
            </Card>
            <View style={s.metricsCol}>
              {d.metrics.map((m) => (
                <Card key={m.label} style={s.metricTile}>
                  <Text style={s.metricLabel}>{m.label}</Text>
                  <Text style={s.metricValue}>{m.value}</Text>
                  <View style={s.deltaRow}>
                    <Ionicons name={m.up ? "arrow-up" : "arrow-down"} size={12} color={m.up ? CC.green : CC.rouge} />
                    <Text style={[s.delta, { color: m.up ? CC.green : CC.rouge }]}>{m.delta}</Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>

          <View style={s.row}>
            <Card style={{ flex: 1 }} testID="power-records">
              <SectionTitle label="POWER RECORDS" color={CC.rouge} />
              {d.records.map((r, i) => (
                <View key={r.label} style={[s.recRow, i < d.records.length - 1 && s.divider]}>
                  <View style={s.recBadge}><Text style={s.recBadgeText}>{r.label}</Text></View>
                  <Text style={s.recValue}>{r.value}</Text>
                  <Text style={s.recWhen}>{r.when}</Text>
                </View>
              ))}
            </Card>
            <Card style={{ flex: 1 }} testID="recent-activities">
              <SectionTitle label="RECENT ACTIVITIES" />
              {d.recent.map((a, i) => (
                <View key={a.title + i} style={[s.actRow, i < d.recent.length - 1 && s.divider]}>
                  <View style={[s.actDot, { backgroundColor: colorOf(a.color) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.actTitle}>{a.title}</Text>
                    <Text style={s.actDate}>{a.date} · {a.distance}</Text>
                  </View>
                  <Text style={s.actTss}>{a.tss} TSS</Text>
                </View>
              ))}
            </Card>
          </View>
        </>
      ) : <Text style={s.loading}>Loading your progress…</Text>}
    </AppScaffold>
  );
}

function FitStat({ label, value, delta, color }: { label: string; value: string; delta?: string; color: string }) {
  return (
    <View style={s.fitStat}>
      <Text style={s.fitLabel}>{label}</Text>
      <Text style={[s.fitValue, { color }]}>{value}</Text>
      {delta ? <Text style={s.fitDelta}>{delta} this block</Text> : null}
    </View>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: color }]} /><Text style={s.legendText}>{label}</Text></View>;
}

const s = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  headline: { color: CC.white, fontSize: 24, fontWeight: "800" },
  subhead: { color: CC.dim, fontSize: 14, marginTop: 5 },
  formPill: { alignItems: "center", borderWidth: 1, borderColor: "rgba(85,200,80,0.35)", backgroundColor: "rgba(85,200,80,0.10)", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 18 },
  formLabel: { color: CC.dim, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  formVal: { color: CC.green, fontSize: 18, fontWeight: "800", marginTop: 2 },
  row: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  fitStats: { flexDirection: "row", gap: 26, marginBottom: 10 },
  fitStat: {},
  fitLabel: { color: CC.dim, fontSize: 11 },
  fitValue: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  fitDelta: { color: CC.dim, fontSize: 10.5, marginTop: 1 },
  legend: { flexDirection: "row", gap: 20, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: CC.dim, fontSize: 11.5 },
  metricsCol: { width: 300, flexDirection: "row", flexWrap: "wrap", gap: 12, alignContent: "flex-start" },
  metricTile: { width: 144, padding: 14 },
  metricLabel: { color: CC.dim, fontSize: 11.5 },
  metricValue: { color: CC.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  delta: { fontSize: 12, fontWeight: "700" },
  recRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  recBadge: { width: 54, alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, paddingVertical: 4 },
  recBadgeText: { color: CC.dim, fontSize: 11.5, fontWeight: "700" },
  recValue: { flex: 1, color: CC.white, fontSize: 15, fontWeight: "800" },
  recWhen: { color: CC.dim, fontSize: 11 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  actDot: { width: 10, height: 10, borderRadius: 5 },
  actTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  actDate: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  actTss: { color: CC.yellow, fontSize: 12.5, fontWeight: "700" },
  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 30 },
  tlHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tlWindow: { color: CC.white, fontSize: 15, fontWeight: "800", marginTop: 4 },
  tlNav: { flexDirection: "row", gap: 8 },
  tlNavBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: CC.border, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  tlNavHover: { backgroundColor: "rgba(255,255,255,0.09)" },
  tlChips: { flexDirection: "row", gap: 8, paddingVertical: 12 },
  tlChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: CC.border, backgroundColor: "rgba(255,255,255,0.03)" },
  tlChipActive: { backgroundColor: CC.yellow, borderColor: CC.yellow },
  tlChipText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  tlChipTextActive: { color: "#1a1300", fontWeight: "800" },
  tlChart: { flexDirection: "row", alignItems: "flex-end", height: 150, gap: 4, marginTop: 6 },
  tlBarCol: { flex: 1, alignItems: "center" },
  tlBarArea: { height: 126, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  tlBar: { width: "66%", minHeight: 2, borderRadius: 4, backgroundColor: CC.yellow },
  tlBarLabel: { color: CC.dim, fontSize: 8.5, fontWeight: "600", marginTop: 5 },
  tlAxis: { color: CC.dim, fontSize: 11, marginTop: 8, textAlign: "center" },
  tlStats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  tlStat: { flexGrow: 1, minWidth: 84, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  tlStatValue: { color: CC.white, fontSize: 18, fontWeight: "900" },
  tlStatLabel: { color: CC.dim, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 2 },
  tlDeltaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  tlEmpty: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 14, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft },
  tlEmptyText: { color: CC.dim, fontSize: 12.5, flex: 1, lineHeight: 18 },
});
