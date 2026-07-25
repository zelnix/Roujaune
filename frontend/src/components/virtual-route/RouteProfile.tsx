import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Rect, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "@/src/theme";
import type { VRoute } from "@/src/lib/vroutes";

/**
 * Compact elevation profile for a virtual route. Integrates the route's
 * gradient points into a height curve, shades steep (hard) sections red, and
 * draws a live marker at the rider's current progress so climbs are visible
 * before they arrive.
 */
export function RouteProfile({ vroute, progress = 0, height = 40 }: { vroute: VRoute; progress?: number; height?: number }) {
  const [w, setW] = React.useState(0);

  const gradAt = React.useCallback((d: number) => {
    const pts = vroute.points;
    if (d <= pts[0].km) return pts[0].gradient;
    for (let i = 1; i < pts.length; i++) {
      if (d <= pts[i].km) {
        const a = pts[i - 1], b = pts[i];
        const t = (d - a.km) / Math.max(0.0001, b.km - a.km);
        return a.gradient + (b.gradient - a.gradient) * t;
      }
    }
    return pts[pts.length - 1].gradient;
  }, [vroute]);

  const { elevs, N } = React.useMemo(() => {
    const n = 72;
    const total = vroute.distanceKm;
    const e: number[] = [];
    let acc = 0;
    let prev = 0;
    for (let i = 0; i <= n; i++) {
      const d = (total * i) / n;
      if (i > 0) acc += (gradAt(d) / 100) * (d - prev) * 1000;
      e.push(acc);
      prev = d;
    }
    return { elevs: e, N: n };
  }, [vroute, gradAt]);

  if (w <= 0) return <View style={[styles.wrap, { height }]} onLayout={(ev) => setW(ev.nativeEvent.layout.width)} />;

  const min = Math.min(...elevs), max = Math.max(...elevs);
  const span = Math.max(1, max - min);
  const pad = 4;
  const usable = height - pad * 2;
  const xAt = (i: number) => (i / N) * w;
  const yAt = (v: number) => pad + (1 - (v - min) / span) * usable;

  let d = `M 0 ${height} `;
  elevs.forEach((v, i) => { d += `L ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; });
  d += `L ${w} ${height} Z`;

  // Steep-section ticks along the baseline (gradient >= 6%).
  const total = vroute.distanceKm;
  const steep: { x: number; wd: number; g: number }[] = [];
  for (let i = 0; i < N; i++) {
    const g = gradAt((total * (i + 0.5)) / N);
    if (g >= 6) steep.push({ x: xAt(i), wd: xAt(i + 1) - xAt(i) + 0.5, g });
  }

  const markerX = Math.max(0, Math.min(w, progress * w));

  return (
    <View style={[styles.wrap, { height }]} onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.yellow} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.yellow} stopOpacity={0.06} />
          </LinearGradient>
        </Defs>
        <Path d={d} fill="url(#elev)" stroke={colors.yellow} strokeWidth={1.2} strokeOpacity={0.9} />
        {steep.map((s, i) => (
          <Rect key={i} x={s.x} y={height - 3} width={s.wd} height={3} fill={s.g >= 8 ? colors.red : "#F5A623"} />
        ))}
        {/* progress marker */}
        <Line x1={markerX} y1={0} x2={markerX} y2={height} stroke={colors.white} strokeWidth={1.5} />
        <Rect x={markerX - 3} y={0} width={6} height={4} fill={colors.white} rx={1} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" },
});
