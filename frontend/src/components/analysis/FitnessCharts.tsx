import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { Path, Polyline, Line, Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { PmcPoint, PowerRecord, WeeklyDigest } from "@/src/lib/analysis";

const FITNESS = "#3FB68B";   // CTL
const FATIGUE = "#F2792E";   // ATL
const FORM_POS = "#5B8DEF";  // fresh
const FORM_NEG = "#F2392E";  // fatigued

/** Performance Management Chart: Fitness (CTL) area + Fatigue (ATL) line, with a
 *  Form (TSB) strip below. A dashed continuation projects the next ~2 weeks. */
export function PmcChart({ series, forecast = [] }: { series: PmcPoint[]; forecast?: PmcPoint[] }) {
  const [w, setW] = React.useState(320);
  const H = 170, FH = 46, padT = 10, padB = 18, padL = 4, padR = 4;
  const all = React.useMemo(() => [...series, ...forecast], [series, forecast]);
  const n = all.length;
  const nH = series.length;
  const geom = React.useMemo(() => {
    if (n < 2 || nH < 2) return null;
    const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
    const maxLoad = Math.max(1, ...all.map((s) => Math.max(s.ctl, s.atl))) * 1.1;
    const x = (i: number) => padL + (i / (n - 1)) * cw;
    const y = (v: number) => padT + ch - (v / maxLoad) * ch;
    const histTop = series.map((s, i) => `${x(i).toFixed(1)},${y(s.ctl).toFixed(1)}`).join(" ");
    const ctlArea = `M${padL},${padT + ch} L${histTop} L${x(nH - 1).toFixed(1)},${padT + ch} Z`;
    const atlLine = series.map((s, i) => `${x(i).toFixed(1)},${y(s.atl).toFixed(1)}`).join(" ");
    let fcLine = "";
    if (forecast.length) {
      fcLine = `${x(nH - 1).toFixed(1)},${y(series[nH - 1].ctl).toFixed(1)} ` +
        forecast.map((s, i) => `${x(nH + i).toFixed(1)},${y(s.ctl).toFixed(1)}`).join(" ");
    }
    const tsbAbs = Math.max(1, ...all.map((s) => Math.abs(s.tsb)));
    return { cw, ch, x, y, ctlArea, atlLine, fcLine, todayX: x(nH - 1), tsbAbs };
  }, [all, series, forecast, w, n, nH]);

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
        {geom.fcLine ? (
          <>
            <Line x1={geom.todayX} y1={padT} x2={geom.todayX} y2={padT + geom.ch} stroke="rgba(255,255,255,0.28)" strokeWidth={1} strokeDasharray="3 3" />
            <Polyline points={geom.fcLine} fill="none" stroke={FITNESS} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.85} />
          </>
        ) : null}
      </Svg>

      {/* Form strip */}
      <View style={{ marginTop: 6 }}>
        <Text style={s.stripLabel}>FORM (TSB){forecast.length ? "  ·  dashed = projected" : ""}</Text>
        <Svg width={w} height={FH}>
          <Line x1={padL} y1={FH / 2} x2={w - padR} y2={FH / 2} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          {all.map((sp, i) => {
            const bx = padL + (i / (n - 1)) * (w - padL - padR);
            const h = (Math.abs(sp.tsb) / geom.tsbAbs) * (FH / 2 - 3);
            const up = sp.tsb >= 0;
            const proj = i >= nH;
            return <Rect key={i} x={bx - 0.8} y={up ? FH / 2 - h : FH / 2} width={1.6} height={Math.max(0.5, h)} fill={up ? FORM_POS : FORM_NEG} opacity={proj ? 0.4 : 0.85} />;
          })}
        </Svg>
      </View>

      <View style={s.legend}>
        <Leg c={FITNESS} label="Fitness (CTL)" />
        <Leg c={FATIGUE} label="Fatigue (ATL)" />
        <Leg c={FORM_POS} label="Form +" />
        <Leg c={FORM_NEG} label="Form −" />
        {forecast.length ? <Leg c={FITNESS} label="Projected" dashed /> : null}
      </View>
    </View>
  );
}

function Leg({ c, label, dashed }: { c: string; label: string; dashed?: boolean }) {
  return (
    <View style={s.legItem}>
      {dashed
        ? <View style={[s.dashDot, { borderColor: c }]} />
        : <View style={[s.dot, { backgroundColor: c }]} />}
      <Text style={s.legText}>{label}</Text>
    </View>
  );
}

/** Form Forecast summary — where the rider's fitness/form is heading. */
export function ForecastSummary({ fitness, form, state, dailyTss, weeks = 2 }: {
  fitness: number; form: number; state: string; dailyTss: number; weeks?: number;
}) {
  const formColor = form > 5 ? FORM_POS : form < -10 ? FORM_NEG : colors.yellow;
  return (
    <View style={s.fcCard}>
      <View style={s.fcHead}>
        <Ionicons name="trending-up" size={16} color={FITNESS} />
        <Text style={s.fcTitle}>In {weeks} weeks</Text>
        <View style={[s.pill, { backgroundColor: formColor + "22", borderColor: formColor + "55" }]}>
          <Text style={[s.pillText, { color: formColor }]}>{state}</Text>
        </View>
      </View>
      <View style={s.fcRow}>
        <View style={s.fcStat}>
          <Text style={s.fcVal}>{Math.round(fitness)}</Text>
          <Text style={s.fcLabel}>Projected fitness</Text>
        </View>
        <View style={s.fcStat}>
          <Text style={[s.fcVal, { color: formColor }]}>{form > 0 ? "+" : ""}{Math.round(form)}</Text>
          <Text style={s.fcLabel}>Projected form</Text>
        </View>
      </View>
      <Text style={s.fcNote}>Assuming you keep your recent training rhythm (~{Math.round(dailyTss)} TSS/day). Ride more to build fitness; ease off and Form climbs toward fresh.</Text>
    </View>
  );
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

/** Weekly Digest — this week's TSS, hours, rides, distance (vs last week) plus
 *  any new all-time power records set this week. */
export function WeeklyDigestCard({ digest }: { digest: WeeklyDigest }) {
  const router = useRouter();
  const tw = digest.this_week, d = digest.deltas;
  const deltaChip = (v: number, unit: string, betterHigh = true) => {
    if (!v) return <Text style={[s.wdDelta, { color: colors.textFaint }]}>±0 vs last wk</Text>;
    const good = betterHigh ? v > 0 : v < 0;
    return <Text style={[s.wdDelta, { color: good ? FITNESS : colors.textDim }]}>{v > 0 ? "+" : ""}{v}{unit} vs last wk</Text>;
  };
  return (
    <View>
      <View style={s.wd}>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.tss}</Text>
          <Text style={s.wdLabel}>TSS</Text>
          {deltaChip(d.tss, "")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.hours}<Text style={s.wdUnit}> h</Text></Text>
          <Text style={s.wdLabel}>TRAINING TIME</Text>
          {deltaChip(d.hours, "h")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.rides}</Text>
          <Text style={s.wdLabel}>RIDES</Text>
          {deltaChip(d.rides, "")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.distance_km}<Text style={s.wdUnit}> km</Text></Text>
          <Text style={s.wdLabel}>DISTANCE</Text>
          {deltaChip(d.distance_km, "km")}
        </View>
      </View>

      <View style={s.wdRecordsHead}>
        <Ionicons name="trophy" size={15} color={colors.yellow} />
        <Text style={s.wdRecordsTitle}>New power records</Text>
      </View>
      {digest.new_records.length === 0 ? (
        <Text style={s.wdEmpty}>
          {digest.has_activity
            ? "No new records this week — but every ride builds your base. Keep pushing!"
            : "No rides logged this week yet. Ride to set fresh power records."}
        </Text>
      ) : (
        digest.new_records.map((r) => (
          <Pressable key={r.secs} style={s.wdRecord} disabled={!r.activity_id}
            onPress={() => r.activity_id && router.push(`/activity/${r.activity_id}`)} testID={`digest-record-${r.secs}`}>
            <View style={s.wdRecordBadge}><Ionicons name="flash" size={15} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.wdRecordLabel}>{r.label} best</Text>
              <Text style={s.wdRecordSub} numberOfLines={1}>{r.prev != null ? `Beat your old ${r.prev} W · ` : "First record · "}{r.name}</Text>
            </View>
            <Text style={s.wdRecordW}>{r.watts} W</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  empty: { color: colors.textDim, fontSize: 13.5, lineHeight: 20 },
  stripLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dashDot: { width: 12, height: 0, borderTopWidth: 2, borderStyle: "dashed" },
  legText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },

  fcCard: { backgroundColor: "rgba(63,182,139,0.07)", borderWidth: 1, borderColor: "rgba(63,182,139,0.28)", borderRadius: radius.lg, padding: 14, marginTop: 12 },
  fcHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  fcTitle: { color: colors.white, fontSize: 14, fontWeight: "800", flex: 1 },
  fcRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  fcStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, padding: 12, alignItems: "center" },
  fcVal: { color: FITNESS, fontSize: 26, fontWeight: "900" },
  fcLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700", marginTop: 2, letterSpacing: 0.3 },
  fcNote: { color: colors.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 10 },

  wd: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  wdTile: { flexGrow: 1, flexBasis: "22%", minWidth: 110, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  wdVal: { color: colors.white, fontSize: 24, fontWeight: "900" },
  wdUnit: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  wdLabel: { color: colors.textDim, fontSize: 11, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
  wdDelta: { fontSize: 11.5, fontWeight: "800", marginTop: 6 },
  wdRecordsHead: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 8 },
  wdRecordsTitle: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  wdRecord: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  wdRecordBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,194,10,0.14)", alignItems: "center", justifyContent: "center" },
  wdRecordLabel: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  wdRecordSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  wdRecordW: { color: colors.yellow, fontSize: 16, fontWeight: "900" },
  wdEmpty: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
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
