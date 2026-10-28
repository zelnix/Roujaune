/**
 * RideShareCard — off-screen renderable stat card that becomes the shareable
 * PNG or JPEG for social media (Instagram Stories, X, OS share sheet).
 *
 * Designed to look good both as a standalone post and as an Instagram Story
 * sticker on top of the user's own background photo.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius, spacing } from "@/src/theme";
import Ionicons from "@react-native-vector-icons/ionicons";

export type ShareMetrics = {
  workoutName: string;
  durationLabel: string;   // "45:00"
  avgPower: number | null;
  normalizedPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  tss: number | null;
  intensityFactor: number | null;
  calories: number | null;
  distanceKm: number | null;
};

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <View style={cs.stat}>
      <Text style={cs.statLabel}>{label}</Text>
      <View style={cs.statRow}>
        <Text style={[cs.statValue, accent ? { color: accent } : undefined]}>{value}</Text>
        {unit ? <Text style={cs.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export const RideShareCard = React.forwardRef<View, { metrics: ShareMetrics }>(({ metrics: m }, ref) => {
  return (
    <View ref={ref} style={cs.card} collapsable={false}>
      {/* Header */}
      <View style={cs.header}>
        <View style={cs.brandRow}>
          <View style={cs.brandDot} />
          <Text style={cs.brandText}>ROUJAUNE</Text>
        </View>
        <Text style={cs.workoutName}>{m.workoutName}</Text>
      </View>

      {/* Primary metrics */}
      <View style={cs.grid}>
        <Stat label="DURATION" value={m.durationLabel} accent={colors.yellow} />
        {m.avgPower != null && <Stat label="AVG POWER" value={String(m.avgPower)} unit="W" accent={colors.green} />}
        {m.normalizedPower != null && <Stat label="NORM. POWER" value={String(m.normalizedPower)} unit="W" accent="#5AC8FA" />}
        {m.avgHr != null && <Stat label="AVG HR" value={String(m.avgHr)} unit="bpm" accent={colors.red} />}
        {m.avgCadence != null && <Stat label="AVG CADENCE" value={String(m.avgCadence)} unit="rpm" accent={colors.green} />}
        {m.tss != null && <Stat label="TSS" value={String(Math.round(m.tss))} accent={colors.yellow} />}
        {m.intensityFactor != null && <Stat label="IF" value={m.intensityFactor.toFixed(2)} />}
        {m.calories != null && m.calories > 0 && <Stat label="CALORIES" value={String(m.calories)} unit="kcal" accent={colors.red} />}
        {m.distanceKm != null && m.distanceKm > 0 && <Stat label="DISTANCE" value={m.distanceKm.toFixed(1)} unit="km" />}
      </View>

      {/* Footer */}
      <View style={cs.footer}>
        <Ionicons name="bicycle" size={14} color={colors.textFaint} />
        <Text style={cs.footerText}>Indoor Cycling with ERG Mode</Text>
      </View>
    </View>
  );
});

RideShareCard.displayName = "RideShareCard";

const cs = StyleSheet.create({
  card: {
    width: 640,
    height: 360,
    backgroundColor: "#0D0D0F",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: spacing.lg,
    overflow: "hidden",
  },
  header: { marginBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow },
  brandText: { color: colors.yellow, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  workoutName: { color: colors.white, fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24, flex: 1 },
  stat: {
    minWidth: 100, flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 4 },
  statRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  statValue: { color: colors.white, fontSize: 22, fontWeight: "900" },
  statUnit: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  footerText: { color: colors.textFaint, fontSize: 11, fontWeight: "600" },
});
