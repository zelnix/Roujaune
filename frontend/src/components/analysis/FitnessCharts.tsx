import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { Path, Polyline, Line, Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { PmcPoint, PowerRecord } from "@/src/lib/analysis";

const FITNESS = "#3FB68B";   // CTL
const FATIGUE = "#F2792E";   // ATL
const FORM_POS = "#5B8DEF";  // fresh
const FORM_NEG = "#F2392E";  // fatigued

/** Performance Management Chart: Fitness (CTL) area + Fatigue (ATL) line, with a
 *  Form (TSB) strip below (blue = fresh, red = fatigued). */
export function PmcChart({ series }: { series: PmcPoint[] }) {
  const [w, setW] = React.useState(320);
  const H = 170, FH = 46, padT = 10, padB = 18, padL = 4, padR = 4;
  const n = series.length;
  const geom = React.useMemo(() => {
    if (n < 2) return null;
    const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
    const maxLoad = Math.max(1, ...series.map((s) => Math.max(s.ctl, s.atl))) * 1.1;
    const x = (i: number) => padL + (i / (n - 1)) * cw;
    const y = (v: number) => padT + ch - (v / maxLoad) * ch;
    const ctlTop = series.map((s, i) => `${x(i).toFixed(1)},${y(s.ctl).toFixed(1)}`).join(" ");
    const ctlArea = `M${padL},${padT + ch} L${ctlTop} L${padL + cw},${padT + ch} Z`;
    const atlLine = series.map((s, i) => `${x(i).toFixed(1)},${y(s.atl).toFixed(1)}`).join(" ");
    const tsbAbs = Math.max(1, ...series.map((s) => Math.abs(s.tsb)));
    return { cw, ch, x, y, ctlArea, atlLine, tsbAbs };
  }, [series, w, n]);

  if (!geom) return <Text style={s.empty}>Not enough ride history yet — finish or upload a few rides to see your fitness trend.</Text>;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Defs>
          <SvgGrad id="ctlFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FITNESS} stopOpacity="0.4" />
            <Stop offset="1" stopColor={FITNESS} stopOpacity="0.05" />
          </SvgGrad>
        </Defs>
        <Path d={geom.ctlArea} fill="url(#ctlFill)" stroke={FITNESS} strokeWidth={2} />
        <Polyline points={geom.atlLine} fill="none" stroke={FATIGUE} strokeWidth={1.8} strokeDasharray="1 0" />
      </Svg>

      {/* Form strip */}
      <View style={{ marginTop: 6 }}>
        <Text style={s.stripLabel}>FORM (TSB)</Text>
        <Svg width={w} height={FH}>
          <Line x1={padL} y1={FH / 2} x2={w - padR} y2={FH / 2} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          {series.map((sp, i) => {
            const bx = padL + (i / (n - 1)) * (w - padL - padR);
            const h = (Math.abs(sp.tsb) / geom.tsbAbs) * (FH / 2 - 3);
            const up = sp.tsb >= 0;
            return <Rect key={i} x={bx - 0.8} y={up ? FH / 2 - h : FH / 2} width={1.6} height={Math.max(0.5, h)} fill={up ? FORM_POS : FORM_NEG} opacity={0.85} />;
          })}
        </Svg>
      </View>

      <View style={s.legend}>
        <Leg c={FITNESS} label="Fitness (CTL)" />
        <Leg c={FATIGUE} label="Fatigue (ATL)" />
        <Leg c={FORM_POS} label="Form +" />
        <Leg c={FORM_NEG} label="Form −" />
      </View>
    </View>
  );
}

function Leg({ c, label }: { c: string; label: string }) {
  return <View style={s.legItem}><View style={[s.dot, { backgroundColor: c }]} /><Text style={s.legText}>{label}</Text></View>;
}

/** Big Fitness/Fatigue/Form summary cards. */
export function PmcSummary({ fitness, fatigue, form, state, ramp, weeklyTss }: {
  fitness: number; fatigue: number; form: number; state: string; ramp: number; weeklyTss: number;
}) {
  const formColor = form > 5 ? FORM_POS : form < -10 ? FORM_NEG : colors.yellow;
  return (
    <View>
      <View style={s.cards}>
        <Big label="FITNESS" sub="CTL" value={Math.round(fitness)} c={FITNESS} />
        <Big label="FATIGUE" sub="ATL" value={Math.round(fatigue)} c={FATIGUE} />
        <Big label="FORM" sub="TSB" value={Math.round(form)} c={formColor} signed />
      </View>
      <View style={s.stateRow}>
        <View style={[s.pill, { backgroundColor: formColor + "22", borderColor: formColor + "55" }]}>
          <Text style={[s.pillText, { color: formColor }]}>{state}</Text>
        </View>
        <Text style={s.metaText}>Ramp {ramp >= 0 ? "+" : ""}{ramp}/wk · {weeklyTss} TSS this week</Text>
      </View>
    </View>
  );
}

function Big({ label, sub, value, c, signed }: { label: string; sub: string; value: number; c: string; signed?: boolean }) {
  return (
    <View style={s.big}>
      <Text style={s.bigLabel}>{label}</Text>
      <Text style={[s.bigVal, { color: c }]}>{signed && value > 0 ? "+" : ""}{value}</Text>
      <Text style={s.bigSub}>{sub}</Text>
    </View>
  );
}

/** All-time best power grid (5s / 1m / 5m / 20m). */
export function RecordsGrid({ records, hasData }: { records: PowerRecord[]; hasData: boolean }) {
  const router = useRouter();
  if (!hasData) {
    return <Text style={s.empty}>No power records yet. Upload a ride with power data and your bests for 5s, 1min, 5min & 20min will appear here.</Text>;
  }
  return (
    <View style={s.recGrid}>
      {records.map((r) => (
        <Pressable key={r.secs} style={s.rec} disabled={!r.activity_id} onPress={() => r.activity_id && router.push(`/activity/${r.activity_id}`)} testID={`record-${r.secs}`}>
          <View style={s.recTop}>
            <Ionicons name="flash" size={14} color={colors.yellow} />
            <Text style={s.recDur}>{r.label}</Text>
          </View>
          <Text style={s.recW}>{r.watts != null ? `${r.watts}` : "—"}<Text style={s.recUnit}> W</Text></Text>
          {r.name ? <Text style={s.recWhen} numberOfLines={1}>{r.name}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  empty: { color: colors.textDim, fontSize: 13.5, lineHeight: 20 },
  stripLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },
  cards: { flexDirection: "row", gap: 10 },
  big: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, alignItems: "center" },
  bigLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  bigVal: { fontSize: 30, fontWeight: "900", marginVertical: 2 },
  bigSub: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700" },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" },
  pill: { borderRadius: 999, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
  pillText: { fontSize: 13, fontWeight: "800" },
  metaText: { color: colors.textDim, fontSize: 12.5, fontWeight: "600" },
  recGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rec: { flexGrow: 1, flexBasis: "22%", minWidth: 120, backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.28)", borderRadius: radius.lg, padding: 14 },
  recTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  recDur: { color: colors.textDim, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4 },
  recW: { color: colors.white, fontSize: 24, fontWeight: "900", marginTop: 6 },
  recUnit: { color: colors.textFaint, fontSize: 13, fontWeight: "700" },
  recWhen: { color: colors.textFaint, fontSize: 11, marginTop: 4, fontWeight: "600" },
});
