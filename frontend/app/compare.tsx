import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Svg, { Polyline, Line } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchActivities, fetchActivity, RideListItem, RideDetail } from "@/src/lib/activities";

const A_COL = colors.yellow;
const B_COL = "#3FB68B";
const hms = (s?: number) => { if (!s) return "—"; const m = Math.floor(s / 60); return `${m}m`; };

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

export default function CompareScreen() {
  const [items, setItems] = React.useState<RideListItem[]>([]);
  const [sel, setSel] = React.useState<string[]>([]);
  const [a, setA] = React.useState<RideDetail | null>(null);
  const [b, setB] = React.useState<RideDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

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

        {loading && <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>}

        {a && b && !loading && (
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
});
