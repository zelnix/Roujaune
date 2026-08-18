import React from "react";
import { View } from "react-native";
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "@/src/theme";

type Pt = { km: number; grade: number };

/** Compact elevation profile for a scenic ride: integrates the per-km gradient
 *  into a climb curve and marks the rider's current position so hills ahead are
 *  visible at a glance. */
export function ElevationChart({
  profile, distanceKm, pct, width = 190, height = 54,
}: { profile: Pt[]; distanceKm: number; pct: number; width?: number; height?: number }) {
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
        {/* progress marker */}
        <Line x1={markX} y1={0} x2={markX} y2={height} stroke={colors.white} strokeWidth={1} strokeOpacity={0.5} />
        <Circle cx={markX} cy={markY} r={3.5} fill={colors.white} />
      </Svg>
    </View>
  );
}
