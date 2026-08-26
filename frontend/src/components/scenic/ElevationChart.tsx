import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "@/src/theme";

type Pt = { km: number; grade: number };

/** Format a km value compactly (one decimal under 10 km, whole numbers above). */
function kmLabel(km: number): string {
  if (km <= 0) return "0";
  return km < 10 ? km.toFixed(1).replace(/\.0$/, "") : String(Math.round(km));
}

/** Compact elevation profile for a scenic ride: integrates the per-km gradient
 *  into a climb curve and marks the rider's current position so hills ahead are
 *  visible at a glance. Optional km ticks below let riders gauge how far each
 *  hill is. */
export function ElevationChart({
  profile, distanceKm, pct, width = 190, height = 54, showTicks = true,
}: { profile: Pt[]; distanceKm: number; pct: number; width?: number; height?: number; showTicks?: boolean }) {
  if (!profile || profile.length < 2 || distanceKm <= 0) return null;

  const n = profile.length;
  const segKm = distanceKm / n;
  // Cumulative elevation (m) from the gradient profile.
  const elev: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (profile[i].grade / 100) * segKm * 1000;
    elev.push(acc);
  }
  const lo = Math.min(0, ...elev);
  const hi = Math.max(...elev, lo + 1);
  const pad = 3;
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (m: number) => height - pad - ((m - lo) / (hi - lo)) * (height - pad * 2);

  let d = `M ${x(0).toFixed(1)} ${y(elev[0]).toFixed(1)}`;
  for (let i = 1; i < n; i++) d += ` L ${x(i).toFixed(1)} ${y(elev[i]).toFixed(1)}`;
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;

  const clampPct = Math.max(0, Math.min(1, pct));
  const markX = clampPct * width;
  // elevation at the marker (interpolated)
  const fi = clampPct * (n - 1);
  const i0 = Math.floor(fi);
  const i1 = Math.min(n - 1, i0 + 1);
  const markY = y(elev[i0] + (elev[i1] - elev[i0]) * (fi - i0));

  // Evenly spaced distance ticks (fractions of the total distance).
  const tickFracs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.yellow} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.yellow} stopOpacity={0.04} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#elevFill)" />
        <Path d={d} stroke={colors.yellow} strokeWidth={1.5} fill="none" />
        {/* distance tick marks along the base */}
        {showTicks && tickFracs.map((f) => (
          <Line key={f} x1={f * width} y1={height - 5} x2={f * width} y2={height}
            stroke={colors.white} strokeWidth={1} strokeOpacity={0.28} />
        ))}
        {/* progress marker */}
        <Line x1={markX} y1={0} x2={markX} y2={height} stroke={colors.white} strokeWidth={1} strokeOpacity={0.5} />
        <Circle cx={markX} cy={markY} r={3.5} fill={colors.white} />
      </Svg>
      {showTicks && (
        <View style={[t.ticks, { width, pointerEvents: "none" }]}>
          {tickFracs.map((f, i) => (
            <Text key={f} style={[
              t.tick,
              i === 0 && t.tickStart,
              i === tickFracs.length - 1 && t.tickEnd,
            ]}>
              {i === tickFracs.length - 1 ? `${kmLabel(distanceKm)} km` : kmLabel(f * distanceKm)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const t = StyleSheet.create({
  ticks: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  tick: { color: colors.textDim, fontSize: 9, fontWeight: "700", flex: 1, textAlign: "center" },
  tickStart: { textAlign: "left" },
  tickEnd: { textAlign: "right" },
});
