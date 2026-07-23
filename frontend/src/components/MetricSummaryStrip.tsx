import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { ReadinessScale } from "./ui";
import { useRiderSeason } from "../lib/rider-profile";
import { useSettings } from "../lib/settings";

function fmtHours(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}

/** Weekly training summary — real aggregates for the last 7 days (rides, time,
 * distance, elevation) plus current FTP and readiness. */
export function MetricSummaryStrip() {
  const season = useRiderSeason(7);
  const { settings } = useSettings();

  const cells = [
    { key: "rides", label: "WEEKLY RIDES", icon: "bicycle" as const, iconColor: colors.red, value: season ? `${season.rides}` : "—", status: "This week" },
    { key: "time", label: "TRAINING TIME", icon: "time-outline" as const, iconColor: colors.green, value: season ? fmtHours(season.hours) : "—", status: "This week" },
    { key: "distance", label: "DISTANCE", icon: "navigate" as const, iconColor: "#40A9C6", value: season ? `${season.distance_km.toLocaleString()} km` : "—", status: "This week" },
    { key: "elevation", label: "ELEVATION", icon: "trending-up" as const, iconColor: colors.green, value: season ? `${season.elevation_m.toLocaleString()} m` : "—", status: "Gained this week" },
    { key: "ftp", label: "FTP", icon: "flash" as const, iconColor: colors.yellow, value: `${settings.ftp} W`, status: "Current" },
    { key: "readiness", label: "READINESS", icon: "heart-outline" as const, iconColor: colors.red, value: "82%", status: "Good to go", scale: true },
  ];

  return (
    <View style={styles.strip} testID="metric-summary-strip">
      {cells.map((m, i) => (
        <View key={m.key} style={styles.cell}>
          {i > 0 && <View style={styles.divider} />}
          <Ionicons name={m.icon} size={24} color={m.iconColor} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{m.label}</Text>
            <Text style={styles.value}>{m.value}</Text>
            <Text style={styles.status}>{m.status}</Text>
          </View>
          {m.scale && <ReadinessScale />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cell: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm },
  divider: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: colors.borderSoft,
  },
  label: { color: colors.textDim, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.6 },
  value: { color: colors.white, fontSize: 19, fontWeight: "800", marginTop: 2 },
  status: { color: colors.greenText, fontSize: 11, fontWeight: "600", marginTop: 1 },
});
