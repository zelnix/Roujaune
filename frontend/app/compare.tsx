import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Svg, { Polyline, Line, Path } from "react-native-svg";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchActivities, fetchActivity, RideListItem, RideDetail } from "@/src/lib/activities";
import { fetchSegmentCompare, SegmentCompare, MatchedSegment } from "@/src/lib/analysis";

const A_COL = colors.yellow;
const B_COL = "#3FB68B";
const hms = (s?: number) => { if (!s) return "—"; const m = Math.floor(s / 60); return `${m}m`; };
const mmss = (s?: number | null) => { if (s == null) return "—"; const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };

function progressSeries(d: RideDetail): { frac: number; power: number }[] {
  const s = d.samples.filter((x) => x.power != null);
  if (!s.length) return [];
  const useDist = s.some((x) => x.dist != null);
  const maxV = useDist ? Math.max(...s.map((x) => x.dist || 0)) : Math.max(...s.map((x) => x.t || 0));
  if (!maxV) return [];
  return s.map((x) => ({ frac: (useDist ? (x.dist || 0) : (x.t || 0)) / maxV, power: x.power! }));
}

function OverlayChart({ a, b }: { a: RideDetail; b: RideDetail }) {
  const [w, setW] = React.useState(320);
  const H = 200, padT = 10, padB = 22, padL = 6, padR = 6;
  const sa = React.useMemo(() => progressSeries(a), [a]);
  const sb = React.useMemo(() => progressSeries(b), [b]);
  if (!sa.length && !sb.length) return <Text style={s.dim}>These rides have no power data to compare.</Text>;
  const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
  const maxP = Math.max(1, ...sa.map((p) => p.power), ...sb.map((p) => p.power)) * 1.05;
  const line = (arr: { frac: number; power: number }[]) =>
    arr.map((p) => `${(padL + p.frac * cw).toFixed(1)},${(padT + ch - (p.power / maxP) * ch).toFixed(1)}`).join(" ");
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        {[0.25, 0.5, 0.75].map((g) => (
          <Line key={g} x1={padL} y1={padT + ch * g} x2={padL + cw} y2={padT + ch * g} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
        {sa.length ? <Polyline points={line(sa)} fill="none" stroke={A_COL} strokeWidth={2} /> : null}
        {sb.length ? <Polyline points={line(sb)} fill="none" stroke={B_COL} strokeWidth={2} strokeOpacity={0.9} /> : null}
      </Svg>
      <Text style={s.axis}>Power (W) across the ride — start → finish</Text>
    </View>
  );
}

function DeltaRow({ label, av, bv, unit, better = "high" }: { label: string; av?: number; bv?: number; unit: string; better?: "high" | "low" }) {
  if (av == null && bv == null) return null;
  const delta = (av != null && bv != null) ? bv - av : null;
  const good = delta == null ? null : (better === "high" ? delta > 0 : delta < 0);
  return (
    <View style={s.dRow}>
      <Text style={s.dLabel}>{label}</Text>
      <Text style={[s.dVal, { color: A_COL }]}>{av != null ? Math.round(av) : "—"}</Text>
      <Text style={[s.dVal, { color: B_COL }]}>{bv != null ? Math.round(bv) : "—"}</Text>
      <Text style={[s.dDelta, good == null ? { color: colors.textFaint } : good ? { color: "#3FB68B" } : { color: colors.red }]}>
        {delta == null ? "" : `${delta > 0 ? "+" : ""}${Math.round(delta)}${unit}`}
      </Text>
    </View>
  );
}

function ClimbChart({ seg }: { seg: MatchedSegment }) {
  const [w, setW] = React.useState(320);
  const H = 200, padT = 10, padB = 22, padL = 6, padR = 6;
  const sa = seg.a.series, sb = seg.b.series;
  const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
  const speeds = [...sa, ...sb].map((p) => p.speed).filter((x): x is number => x != null);
  const maxSpd = Math.max(1, ...speeds) * 1.1;
  const eles = sa.map((p) => p.ele);
  const eMin = Math.min(...eles), eMax = Math.max(...eles);
  const eRange = (eMax - eMin) || 1;
  const xf = (f: number) => padL + f * cw;
  const ys = (v: number) => padT + ch - (v / maxSpd) * ch;
  const ye = (v: number) => padT + ch - ((v - eMin) / eRange) * ch;
  const eleTop = sa.map((p) => `${xf(p.f).toFixed(1)},${ye(p.ele).toFixed(1)}`).join(" ");
  const eleArea = `M${padL},${padT + ch} L${eleTop} L${(padL + cw).toFixed(1)},${padT + ch} Z`;
  const spLine = (arr: typeof sa) => arr.filter((p) => p.speed != null).map((p) => `${xf(p.f).toFixed(1)},${ys(p.speed as number).toFixed(1)}`).join(" ");
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Path d={eleArea} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        {spLine(sa) ? <Polyline points={spLine(sa)} fill="none" stroke={A_COL} strokeWidth={2.2} /> : null}
        {spLine(sb) ? <Polyline points={spLine(sb)} fill="none" stroke={B_COL} strokeWidth={2.2} /> : null}
      </Svg>
      <Text style={s.axis}>Speed up the climb (grey = elevation) · base → summit</Text>
    </View>
  );
}

function SegRow({ label, av, bv, unit }: { label: string; av?: number | null; bv?: number | null; unit: string }) {
  return (
    <View style={s.dRow}>
      <Text style={s.dLabel}>{label}</Text>
      <Text style={[s.dVal, { color: A_COL }]}>{av != null ? av : "—"}{av != null ? unit : ""}</Text>
      <Text style={[s.dVal, { color: B_COL }]}>{bv != null ? bv : "—"}{bv != null ? unit : ""}</Text>
    </View>
  );
}

function SegmentView({ data }: { data: SegmentCompare }) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { setIdx(0); }, [data]);
  if (!data.matched) {
    const msg = data.reason === "no_gps"
      ? "These rides don't have GPS data, so there's no climb to line up. Segment Compare needs two outdoor rides with a GPS track."
      : "No matching GPS climb was found between these two rides. Pick two rides that both went up the same hill.";
    return <Text style={s.dim}>{msg}</Text>;
  }
  const seg = data.segments[idx];
  const faster = seg.faster;
  const absd = Math.abs(seg.delta_s);
  const bannerColor = faster === "tie" ? colors.textDim : faster === "a" ? A_COL : B_COL;
  const bannerText = faster === "tie"
    ? "Dead even — same time up this climb"
    : `${faster === "a" ? data.a_name : data.b_name} was ${mmss(absd)} faster up this climb`;
  return (
    <View style={{ gap: 14 }}>
      {data.segments.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {data.segments.map((sg, i) => (
            <Pressable key={i} onPress={() => setIdx(i)} style={[s.segChip, i === idx && s.segChipOn]} testID={`seg-chip-${i}`}>
              <Ionicons name="trending-up" size={13} color={i === idx ? colors.bg : colors.textDim} />
              <Text style={[s.segChipT, i === idx && { color: colors.bg }]}>{Math.round(sg.gain_m)}m · {(sg.length_m / 1000).toFixed(1)}km</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[s.banner, { borderColor: bannerColor + "66", backgroundColor: bannerColor + "18" }]} testID="segment-banner">
        <Ionicons name="flag" size={18} color={bannerColor} />
        <Text style={[s.bannerText, { color: bannerColor }]}>{bannerText}</Text>
      </View>

      <View style={s.legend}>
        <Legend c={A_COL} label={data.a_name} />
        <Legend c={B_COL} label={data.b_name} />
      </View>
      <ClimbChart seg={seg} />

      <View>
        <View style={s.dHead}>
          <Text style={[s.dLabel, { color: colors.textFaint }]}>CLIMB · {Math.round(seg.gain_m)}m @ {seg.grad_pct}%</Text>
          <Text style={[s.dVal, { color: A_COL }]}>A</Text>
          <Text style={[s.dVal, { color: B_COL }]}>B</Text>
        </View>
        <View style={s.dRow}>
          <Text style={s.dLabel}>Time up climb</Text>
          <Text style={[s.dVal, { color: A_COL }]}>{mmss(seg.a.time_s)}</Text>
          <Text style={[s.dVal, { color: B_COL }]}>{mmss(seg.b.time_s)}</Text>
        </View>
        <SegRow label="Avg speed" av={seg.a.avg_speed_kmh} bv={seg.b.avg_speed_kmh} unit="" />
        <Text style={s.hint}>Both rides aligned base-to-summit on the same GPS climb.</Text>
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const [items, setItems] = React.useState<RideListItem[]>([]);
  const [sel, setSel] = React.useState<string[]>([]);
  const [a, setA] = React.useState<RideDetail | null>(null);
  const [b, setB] = React.useState<RideDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"ride" | "climb">("ride");
  const [seg, setSeg] = React.useState<SegmentCompare | null>(null);
  const [segLoading, setSegLoading] = React.useState(false);

  React.useEffect(() => { fetchActivities().then(setItems); }, []);

  const toggle = (id: string) => {
    setSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]);
  };

  React.useEffect(() => {
    if (sel.length === 2) {
      setLoading(true);
      Promise.all([fetchActivity(sel[0]), fetchActivity(sel[1])]).then(([x, y]) => { setA(x); setB(y); setLoading(false); });
    } else { setA(null); setB(null); }
  }, [sel]);

  // Segment (climb) comparison — fetched only in climb mode with two rides.
  React.useEffect(() => {
    if (mode === "climb" && sel.length === 2) {
      setSegLoading(true);
      fetchSegmentCompare(sel[0], sel[1]).then((r) => { setSeg(r); setSegLoading(false); });
    } else { setSeg(null); }
  }, [mode, sel]);

  return (
    <AppScaffold active="activities" title="Compare rides" subtitle="Overlay two rides to see if you're getting faster.">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
        <Card>
          <Text style={s.h}>Pick two rides {sel.length ? `(${sel.length}/2)` : ""}</Text>
          <View style={{ gap: 8 }}>
            {items.slice(0, 12).map((it) => {
              const on = sel.includes(it.cycling_activity_id || it.id);
              const rid = it.cycling_activity_id || it.id;
              const which = sel.indexOf(rid);
              return (
                <Pressable key={it.id} style={[s.pick, on && s.pickOn]} onPress={() => toggle(rid)} testID={`pick-${it.id}`}>
                  <View style={[s.check, on && { backgroundColor: which === 0 ? A_COL : B_COL, borderColor: which === 0 ? A_COL : B_COL }]}>
                    {on && <Text style={s.checkT}>{which === 0 ? "A" : "B"}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickName} numberOfLines={1}>{it.name}</Text>
                    <Text style={s.pickSub}>{it.indoor_outdoor} · {it.distance_km != null ? `${it.distance_km} km · ` : ""}{hms(it.duration_sec)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {sel.length === 2 && (
          <View style={s.modeRow}>
            <Pressable onPress={() => setMode("ride")} style={[s.modeBtn, mode === "ride" && s.modeBtnOn]} testID="mode-ride">
              <Ionicons name="pulse" size={14} color={mode === "ride" ? colors.bg : colors.textDim} />
              <Text style={[s.modeText, mode === "ride" && { color: colors.bg }]}>Whole ride</Text>
            </Pressable>
            <Pressable onPress={() => setMode("climb")} style={[s.modeBtn, mode === "climb" && s.modeBtnOn]} testID="mode-climb">
              <Ionicons name="trending-up" size={14} color={mode === "climb" ? colors.bg : colors.textDim} />
              <Text style={[s.modeText, mode === "climb" && { color: colors.bg }]}>Same climb</Text>
            </Pressable>
          </View>
        )}

        {(loading || segLoading) && <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>}

        {mode === "climb" && sel.length === 2 && !segLoading && seg && (
          <Card testID="segment-compare">
            <Text style={s.h}>Same climb, hill-for-hill</Text>
            <SegmentView data={seg} />
          </Card>
        )}

        {mode === "ride" && a && b && !loading && (
          <>
            <Card>
              <View style={s.legend}>
                <Legend c={A_COL} label={a.name} />
                <Legend c={B_COL} label={b.name} />
              </View>
              <OverlayChart a={a} b={b} />
            </Card>
            <Card>
              <View style={s.dHead}>
                <Text style={[s.dLabel, { color: colors.textFaint }]}>METRIC</Text>
                <Text style={[s.dVal, { color: A_COL }]}>A</Text>
                <Text style={[s.dVal, { color: B_COL }]}>B</Text>
                <Text style={[s.dDelta, { color: colors.textFaint }]}>Δ</Text>
              </View>
              <DeltaRow label="Avg power" av={a.avg_power} bv={b.avg_power} unit="W" />
              <DeltaRow label="Norm. power" av={a.np} bv={b.np} unit="W" />
              <DeltaRow label="Avg HR" av={a.avg_hr} bv={b.avg_hr} unit="bpm" better="low" />
              <DeltaRow label="Distance (km)" av={a.distance_km} bv={b.distance_km} unit="km" />
              <DeltaRow label="Moving time (min)" av={a.duration_sec ? a.duration_sec / 60 : undefined} bv={b.duration_sec ? b.duration_sec / 60 : undefined} unit="m" better="low" />
              <DeltaRow label="TSS" av={a.tss} bv={b.tss} unit="" />
              <Text style={s.hint}>Δ compares B against A. Green = improvement.</Text>
            </Card>
          </>
        )}
      </ScrollView>
    </AppScaffold>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return <View style={s.legItem}><View style={[s.dot, { backgroundColor: c }]} /><Text style={s.legText} numberOfLines={1}>{label}</Text></View>;
}

const s = StyleSheet.create({
  h: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  dim: { color: colors.textDim, fontSize: 13 },
  center: { paddingVertical: 30, alignItems: "center" },
  pick: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 56 },
  pickOn: { borderColor: colors.yellow, backgroundColor: "rgba(255,194,10,0.06)" },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkT: { color: colors.bg, fontSize: 12, fontWeight: "900" },
  pickName: { color: colors.white, fontSize: 14.5, fontWeight: "800" },
  pickSub: { color: colors.textFaint, fontSize: 12, marginTop: 2, fontWeight: "600", textTransform: "capitalize" },
  legend: { flexDirection: "row", gap: 16, marginBottom: 10 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legText: { color: colors.textDim, fontSize: 12.5, fontWeight: "700", flex: 1 },
  axis: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
  dHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  dLabel: { flex: 1, color: colors.white, fontSize: 13, fontWeight: "700" },
  dVal: { width: 60, textAlign: "right", fontSize: 14, fontWeight: "800" },
  dDelta: { width: 70, textAlign: "right", fontSize: 13, fontWeight: "800" },
  hint: { color: colors.textFaint, fontSize: 11.5, marginTop: 10 },
  modeRow: { flexDirection: "row", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.pill, padding: 4 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: radius.pill },
  modeBtnOn: { backgroundColor: colors.yellow },
  modeText: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  bannerText: { fontSize: 14.5, fontWeight: "800", flex: 1 },
  segChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  segChipOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  segChipT: { color: colors.textDim, fontSize: 12.5, fontWeight: "800" },
});
