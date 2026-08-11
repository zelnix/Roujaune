import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchClimbDetail, ClimbDetail } from "@/src/lib/analysis";

const mmss = (s?: number | null) => { if (s == null) return "—"; const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };
const dstr = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

const PALETTE = ["#FFC20A", "#3FB68B", "#5B8DEF", "#F2792E", "#C879FF", "#E05B7A"];

function AttemptChart({ detail }: { detail: ClimbDetail }) {
  const [w, setW] = React.useState(320);
  const H = 220, padT = 10, padB = 22, padL = 6, padR = 6;
  const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
  const prof = detail.profile || [];
  const maxD = prof.length ? prof[prof.length - 1].d || 1 : 1;
  const eles = prof.map((p) => p.ele || 0);
  const eMin = Math.min(...eles), eMax = Math.max(...eles), eRange = (eMax - eMin) || 1;
  const speeds = (detail.attempts || []).flatMap((a) => a.series.map((p) => p.speed)).filter((x): x is number => x != null);
  const maxSpd = Math.max(1, ...speeds) * 1.1;
  const xf = (d: number) => padL + (d / maxD) * cw;
  const ye = (v: number) => padT + ch - ((v - eMin) / eRange) * ch;
  const ys = (v: number) => padT + ch - (v / maxSpd) * ch;
  const eleTop = prof.map((p) => `${xf(p.d).toFixed(1)},${ye(p.ele || 0).toFixed(1)}`).join(" ");
  const eleArea = `M${padL},${padT + ch} L${eleTop} L${(padL + cw).toFixed(1)},${padT + ch} Z`;
  const line = (a: ClimbDetail["attempts"][number]) =>
    a.series.filter((p) => p.speed != null).map((p) => `${xf(p.d).toFixed(1)},${ys(p.speed as number).toFixed(1)}`).join(" ");
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Path d={eleArea} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        {(detail.attempts || []).map((a, i) => {
          const pts = line(a);
          return pts ? <Polyline key={i} points={pts} fill="none" stroke={a.pr ? colors.yellow : PALETTE[(i % (PALETTE.length - 1)) + 1]} strokeWidth={a.pr ? 2.6 : 1.8} strokeOpacity={a.pr ? 1 : 0.85} /> : null;
        })}
      </Svg>
      <Text style={s.axis}>Speed up the climb (grey = elevation) · base → summit</Text>
    </View>
  );
}

export default function ClimbDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = React.useState<ClimbDetail | null>(null);

  React.useEffect(() => { if (id) fetchClimbDetail(String(id)).then(setDetail); }, [id]);

  return (
    <AppScaffold active="fitness" title="Climb Detail" subtitle="Elevation profile with every attempt overlaid.">
      {!detail ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : !detail.found ? (
        <Card><Text style={s.empty}>This climb is no longer available.</Text>
          <Pressable onPress={() => router.back()} style={s.backBtn}><Text style={s.backT}>Go back</Text></Pressable>
        </Card>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
          <Card>
            <Text style={s.name}>{detail.name}</Text>
            <Text style={s.meta}>{Math.round(detail.gain_m || 0)} m · {((detail.length_m || 0) / 1000).toFixed(1)} km · {detail.grad_pct}% avg · {detail.count} attempts</Text>
          </Card>
          <Card>
            <Text style={s.h}>Attempts overlaid</Text>
            <View style={s.legend}>
              {(detail.attempts || []).map((a, i) => (
                <View key={i} style={s.legItem}>
                  <View style={[s.dot, { backgroundColor: a.pr ? colors.yellow : PALETTE[(i % (PALETTE.length - 1)) + 1] }]} />
                  <Text style={s.legText}>{a.pr ? "PB " : ""}{mmss(a.time_s)}</Text>
                </View>
              ))}
            </View>
            <AttemptChart detail={detail} />
          </Card>
          {(detail.splits && detail.splits.length > 0) && (
            <Card>
              <Text style={s.h}>Split times <Text style={s.hDim}>who was fastest where</Text></Text>
              {detail.recent_split_prs && detail.recent_split_prs.length > 0 && (
                <View style={s.prBox} testID="split-pr-highlight">
                  <Ionicons name="flame" size={16} color="#F2792E" />
                  <Text style={s.prText}>
                    Your latest ride was fastest through {detail.recent_split_prs.length} split{detail.recent_split_prs.length === 1 ? "" : "s"} ({detail.recent_split_prs.map((p) => `#${p.index}`).join(", ")}) — fresh split PR{detail.recent_split_prs.length === 1 ? "" : "s"} even without the overall PB.
                  </Text>
                </View>
              )}
              <View style={s.splitHeadRow}>
                <Text style={[s.splitCell, s.splitLabelCell, { color: colors.textFaint }]}>SEGMENT</Text>
                {(detail.attempts || []).map((a, i) => (
                  <Text key={i} style={[s.splitCell, { color: a.pr ? colors.yellow : colors.textDim }]} numberOfLines={1}>{a.pr ? "PB" : `#${i + 1}`}</Text>
                ))}
              </View>
              {detail.splits.map((sp) => {
                const isPr = (detail.recent_split_prs || []).some((p) => p.index === sp.index);
                return (
                <View key={sp.index} style={s.splitRow}>
                  <View style={s.splitLabelCell}>
                    <View style={s.splitNameRow}>
                      <Text style={s.splitName}>Split {sp.index}</Text>
                      {isPr ? <Ionicons name="flame" size={12} color="#F2792E" /> : null}
                    </View>
                    <Text style={s.splitDist}>{(sp.from_d / 1000).toFixed(1)}–{(sp.to_d / 1000).toFixed(1)} km</Text>
                  </View>
                  {(detail.attempts || []).map((a, i) => {
                    const t = sp.times[a.activity_id];
                    const fastest = sp.fastest === a.activity_id;
                    return (
                      <View key={i} style={[s.splitCellBox, fastest && s.splitFastest]}>
                        <Text style={[s.splitTime, fastest && { color: "#241B00" }]}>{mmss(t)}</Text>
                        {fastest ? <Ionicons name="flash" size={10} color="#241B00" /> : null}
                      </View>
                    );
                  })}
                </View>
                );
              })}
              <Text style={s.splitHint}>Each attempt's time through equal-distance segments. ⚡ = fastest.</Text>
            </Card>
          )}
          <Card>
            <Text style={s.h}>Every attempt</Text>
            {(detail.attempts || []).map((a, i) => (
              <Pressable key={a.activity_id + i} onPress={() => router.push(`/activity/${a.activity_id}`)} style={s.row} testID={`detail-attempt-${i}`}>
                <View style={[s.rank, a.pr && s.rankPr]}>
                  {a.pr ? <Ionicons name="trophy" size={14} color="#241B00" /> : <Text style={s.rankT}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{a.pr ? "Personal best" : `Attempt ${i + 1}`}</Text>
                  <Text style={s.rowSub}>{dstr(a.date)}{a.avg_speed_kmh ? ` · ${a.avg_speed_kmh} km/h` : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.time, a.pr && { color: colors.yellow }]}>{mmss(a.time_s)}</Text>
                  {!a.pr && a.gap_s != null && a.gap_s > 0 ? <Text style={s.gap}>+{mmss(a.gap_s)}</Text> : null}
                </View>
              </Pressable>
            ))}
          </Card>
        </ScrollView>
      )}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  empty: { color: colors.textDim, fontSize: 14 },
  backBtn: { marginTop: 12, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 16 },
  backT: { color: colors.white, fontSize: 13, fontWeight: "700" },
  name: { color: colors.white, fontSize: 20, fontWeight: "900" },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 4, fontWeight: "600" },
  h: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  axis: { color: colors.textFaint, fontSize: 11, marginTop: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legText: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  rankPr: { backgroundColor: colors.yellow },
  rankT: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  rowName: { color: colors.white, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  time: { color: colors.white, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  gap: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", marginTop: 1 },
  hDim: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  splitHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  splitCell: { flex: 1, fontSize: 11.5, fontWeight: "800", textAlign: "center" },
  splitLabelCell: { flex: 1.4 },
  splitName: { color: colors.white, fontSize: 13, fontWeight: "800" },
  splitNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  prBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(242,121,46,0.1)", borderWidth: 1, borderColor: "rgba(242,121,46,0.4)", borderRadius: radius.md, padding: 12, marginBottom: 12 },
  prText: { color: "#F2A277", fontSize: 12.5, lineHeight: 18, flex: 1, fontWeight: "600" },
  splitDist: { color: colors.textFaint, fontSize: 11, marginTop: 1, fontWeight: "600" },
  splitCellBox: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 5, borderRadius: 8 },
  splitFastest: { backgroundColor: colors.yellow },
  splitTime: { color: colors.white, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  splitHint: { color: colors.textFaint, fontSize: 11, marginTop: 10, lineHeight: 16 },
});
