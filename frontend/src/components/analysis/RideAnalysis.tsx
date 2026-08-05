import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Polyline, Line, Circle, Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { colors, radius } from "@/src/theme";
import { RideSample } from "@/src/lib/activities";

const POWER_ZONE_LABELS = ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO₂", "Z6 Anaerobic", "Z7 Neuro"];
const POWER_ZONE_COLORS = ["#5B8DEF", "#3FB68B", "#8ED11E", "#F5B301", "#F2792E", "#F2392E", "#B4179A"];
const HR_ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** Interactive elevation + power + HR graph. Drag anywhere to scrub; the marker
 *  is reported via onScrub so the map dot stays in sync. */
export function SyncedGraph({ samples, ftp, onScrub, cursor }: {
  samples: RideSample[]; ftp: number; onScrub: (i: number) => void; cursor: number;
}) {
  const [w, setW] = React.useState(320);
  const H = 200, padT = 14, padB = 22, padL = 6, padR = 6;
  const n = samples.length;
  const cw = Math.max(1, w - padL - padR);
  const ch = H - padT - padB;

  const { eleArea, powerPts, hrPts, hasHr, hasPower, maxP, minEle, maxEle } = React.useMemo(() => {
    const eles = samples.map((s) => s.ele).filter((v): v is number => v != null);
    const minE = eles.length ? Math.min(...eles) : 0;
    const maxE = eles.length ? Math.max(...eles) : 1;
    const powers = samples.map((s) => s.power).filter((v): v is number => v != null);
    const hrs = samples.map((s) => s.hr).filter((v): v is number => v != null);
    const mP = Math.max(ftp * 1.2, powers.length ? Math.max(...powers) : 1);
    const minH = hrs.length ? Math.min(...hrs) - 5 : 0;
    const maxH = hrs.length ? Math.max(...hrs) + 5 : 1;
    const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * cw);
    const yE = (v: number) => padT + ch - ((v - minE) / Math.max(1, maxE - minE)) * ch;
    const yP = (v: number) => padT + ch - (v / mP) * ch;
    const yH = (v: number) => padT + ch - ((v - minH) / Math.max(1, maxH - minH)) * ch;
    let area = "";
    if (eles.length) {
      const top = samples.map((s, i) => `${x(i)},${yE(s.ele ?? minE)}`).join(" ");
      area = `M${padL},${padT + ch} L${top} L${padL + cw},${padT + ch} Z`;
    }
    const pPts = powers.length ? samples.map((s, i) => `${x(i)},${yP(s.power ?? 0)}`).join(" ") : "";
    const hPts = hrs.length ? samples.map((s, i) => `${x(i)},${yH(s.hr ?? minH)}`).join(" ") : "";
    return { eleArea: area, powerPts: pPts, hrPts: hPts, hasHr: hrs.length > 0, hasPower: powers.length > 0, maxP: mP, minEle: minE, maxEle: maxE };
  }, [samples, w, ftp, n, cw, ch]);

  const idx = Math.max(0, Math.min(n - 1, cursor));
  const cx = padL + (n <= 1 ? 0 : (idx / (n - 1)) * cw);
  const cur = samples[idx] || {};

  const handle = (locX: number) => {
    const frac = Math.max(0, Math.min(1, (locX - padL) / cw));
    onScrub(Math.round(frac * (n - 1)));
  };

  return (
    <View>
      {/* readout */}
      <View style={s.readout}>
        <Read label="TIME" value={mmss(cur.t ?? 0)} />
        {cur.dist != null && <Read label="DIST" value={`${(cur.dist / 1000).toFixed(2)} km`} />}
        {cur.ele != null && <Read label="ELEV" value={`${Math.round(cur.ele)} m`} c="#B7C2CE" />}
        {cur.power != null && <Read label="POWER" value={`${Math.round(cur.power)} W`} c={colors.yellow} />}
        {cur.hr != null && <Read label="HR" value={`${cur.hr} bpm`} c={colors.red} />}
        {cur.cad != null && <Read label="CAD" value={`${cur.cad}`} c="#8ED11E" />}
      </View>

      <View
        style={{ height: H }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handle(e.nativeEvent.locationX)}
        onResponderMove={(e) => handle(e.nativeEvent.locationX)}
      >
        <Svg width={w} height={H}>
          <Defs>
            <SvgGrad id="eleFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3A4653" stopOpacity="0.6" />
              <Stop offset="1" stopColor="#3A4653" stopOpacity="0.08" />
            </SvgGrad>
          </Defs>
          {eleArea ? <Path d={eleArea} fill="url(#eleFill)" /> : null}
          {hasHr ? <Polyline points={hrPts} fill="none" stroke={colors.red} strokeWidth={1.4} strokeOpacity={0.85} /> : null}
          {hasPower ? <Polyline points={powerPts} fill="none" stroke={colors.yellow} strokeWidth={1.8} /> : null}
          {/* scrubber */}
          <Line x1={cx} y1={padT} x2={cx} y2={padT + ch} stroke="#fff" strokeWidth={1} strokeOpacity={0.7} />
          {hasPower && cur.power != null ? <Circle cx={cx} cy={padT + ch - (cur.power / maxP) * ch} r={4} fill={colors.yellow} /> : null}
        </Svg>
      </View>

      <View style={s.legend}>
        {hasPower && <Legend c={colors.yellow} label="Power" />}
        {hasHr && <Legend c={colors.red} label="Heart rate" />}
        <Legend c="#5A6672" label="Elevation" />
        <View style={{ flex: 1 }} />
        <Text style={s.legendHint}>Drag to scrub</Text>
      </View>
    </View>
  );
}

function Read({ label, value, c }: { label: string; value: string; c?: string }) {
  return (
    <View style={s.read}>
      <Text style={s.readLabel}>{label}</Text>
      <Text style={[s.readVal, c ? { color: c } : null]}>{value}</Text>
    </View>
  );
}
function Legend({ c, label }: { c: string; label: string }) {
  return <View style={s.legendItem}><View style={[s.dot, { backgroundColor: c }]} /><Text style={s.legendText}>{label}</Text></View>;
}

/** GPS route drawn as an SVG polyline with a synced position dot. */
export function RouteMapSvg({ samples, cursor, height = 220 }: { samples: RideSample[]; cursor: number; height?: number }) {
  const [w, setW] = React.useState(320);
  const pts = React.useMemo(() => samples.filter((s) => s.lat != null && s.lng != null), [samples]);
  const geom = React.useMemo(() => {
    if (pts.length < 2) return null;
    const lats = pts.map((p) => p.lat!), lngs = pts.map((p) => p.lng!);
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
    const pad = 16;
    const bw = w - pad * 2, bh = height - pad * 2;
    // keep aspect ratio (lng scaled by cos(lat))
    const latMid = (minLa + maxLa) / 2;
    const spanLa = Math.max(1e-6, maxLa - minLa);
    const spanLo = Math.max(1e-6, (maxLo - minLo) * Math.cos((latMid * Math.PI) / 180));
    const scale = Math.min(bw / spanLo, bh / spanLa);
    const ox = pad + (bw - spanLo * scale) / 2;
    const oy = pad + (bh - spanLa * scale) / 2;
    const proj = (la: number, lo: number) => ({
      x: ox + ((lo - minLo) * Math.cos((latMid * Math.PI) / 180)) * scale,
      y: oy + (maxLa - la) * scale,
    });
    const poly = pts.map((p) => { const q = proj(p.lat!, p.lng!); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ");
    return { poly, proj, first: proj(pts[0].lat!, pts[0].lng!), last: proj(pts[pts.length - 1].lat!, pts[pts.length - 1].lng!) };
  }, [pts, w, height]);

  // map cursor (over all samples) onto the gps-only point list
  const curPt = React.useMemo(() => {
    if (!geom || !pts.length) return null;
    const frac = samples.length > 1 ? cursor / (samples.length - 1) : 0;
    const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round(frac * (pts.length - 1))))];
    return geom.proj(p.lat!, p.lng!);
  }, [geom, cursor, samples.length, pts]);

  if (!geom) return null;
  return (
    <View style={s.mapWrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        <Rect x={0} y={0} width={w} height={height} rx={14} fill="#0E1512" />
        <Polyline points={geom.poly} fill="none" stroke={colors.yellow} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.9} />
        <Circle cx={geom.first.x} cy={geom.first.y} r={5} fill="#3FB68B" />
        <Circle cx={geom.last.x} cy={geom.last.y} r={5} fill={colors.red} />
        {curPt && <Circle cx={curPt.x} cy={curPt.y} r={6} fill="#fff" stroke={colors.yellow} strokeWidth={2} />}
      </Svg>
    </View>
  );
}

/** Best-average power for a set of durations (Strava-style power curve). */
export function PowerCurve({ curve }: { curve: { secs: number; watts: number }[] }) {
  const [w, setW] = React.useState(320);
  const H = 130, padT = 10, padB = 22, padL = 30, padR = 8;
  if (!curve?.length) return null;
  const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
  const maxW = Math.max(...curve.map((c) => c.watts));
  const x = (i: number) => padL + (curve.length <= 1 ? 0 : (i / (curve.length - 1)) * cw);
  const y = (v: number) => padT + ch - (v / maxW) * ch;
  const line = curve.map((c, i) => `${x(i)},${y(c.watts)}`).join(" ");
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Polyline points={`${padL},${padT + ch} ${line} ${padL + cw},${padT + ch}`} fill="none" stroke={colors.yellow} strokeWidth={2} />
        {curve.map((c, i) => <Circle key={c.secs} cx={x(i)} cy={y(c.watts)} r={2.5} fill={colors.yellow} />)}
        {[maxW, Math.round(maxW / 2)].map((v) => (
          <Rect key={v} x={0} y={y(v) - 5} width={0} height={0} />
        ))}
      </Svg>
      <View style={s.curveAxis}>
        {curve.map((c) => <Text key={c.secs} style={s.curveTick}>{c.secs < 60 ? `${c.secs}s` : `${Math.round(c.secs / 60)}m`}</Text>)}
      </View>
    </View>
  );
}

/** Time-in-zone stacked bar. */
export function ZoneBars({ seconds, kind }: { seconds: number[]; kind: "power" | "hr" }) {
  const labels = kind === "power" ? POWER_ZONE_LABELS : HR_ZONE_LABELS;
  const cols = kind === "power" ? POWER_ZONE_COLORS : ["#5B8DEF", "#3FB68B", "#F5B301", "#F2792E", "#F2392E"];
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={{ gap: 8 }}>
      <View style={s.zoneStack}>
        {seconds.map((sec, i) => sec > 0 ? (
          <View key={i} style={{ width: `${(sec / total) * 100}%`, backgroundColor: cols[i] }} />
        ) : null)}
      </View>
      <View style={s.zoneLegend}>
        {seconds.map((sec, i) => sec > 0 ? (
          <View key={i} style={s.zoneItem}>
            <View style={[s.dot, { backgroundColor: cols[i] }]} />
            <Text style={s.zoneText}>{labels[i]} · {hms(sec)}</Text>
          </View>
        ) : null)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  readout: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 8, minHeight: 34 },
  read: { minWidth: 52 },
  readLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8 },
  readVal: { color: colors.white, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 1 },
  legend: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },
  legendHint: { color: colors.textFaint, fontSize: 11, fontStyle: "italic" },
  mapWrap: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,194,10,0.22)" },
  curveAxis: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 30, paddingRight: 8, marginTop: 2 },
  curveTick: { color: colors.textFaint, fontSize: 10, fontWeight: "700" },
  zoneStack: { flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  zoneLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  zoneItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  zoneText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },
});
