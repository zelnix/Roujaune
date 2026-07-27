import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../theme";
import { useRiderSeason } from "../lib/rider-profile";
import { useSettings } from "../lib/settings";
import { usePlan } from "../lib/plan";
import { useTodayReadiness, readinessTone } from "../lib/checkin";

function fmtHours(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

type EnergyRollup = { today_kcal: number; week_kcal: number; week_rides: number; streak_days: number };

/** Cumulative ride energy (today + this week) and current day-streak. */
function useEnergyRollup(): EnergyRollup {
  const [data, setData] = React.useState<EnergyRollup>({ today_kcal: 0, week_kcal: 0, week_rides: 0, streak_days: 0 });
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/stats/energy`);
        if (res.ok && alive) setData(await res.json());
      } catch { /* keep zeros */ }
    })();
    return () => { alive = false; };
  }, []);
  return data;
}

/** Weekly training summary — real aggregates for the last 7 days (rides, time,
 * distance, elevation) plus current FTP and today's live readiness. */
export function MetricSummaryStrip() {
  const season = useRiderSeason(7);
  const { settings } = useSettings();
  const { plan } = usePlan();
  const { readiness } = useTodayReadiness();
  const energy = useEnergyRollup();
  const router = useRouter();
  const t = plan.weekTargets;

  const rTone = readinessTone(readiness.available ? readiness.score : undefined, readiness.safetyOverride);
  const readinessValue = readiness.available && !readiness.safetyOverride ? `${readiness.score}%` : readiness.safetyOverride ? "!" : "—";

  const energyStatus = energy.streak_days > 0
    ? `${energy.streak_days}-day streak`
    : energy.today_kcal > 0 ? `${energy.today_kcal.toLocaleString()} kcal today` : "Start your streak";

  const cells = [
    { key: "rides", label: "WEEKLY RIDES", icon: "bicycle" as const, iconColor: colors.red, value: season ? `${season.rides}` : "0", status: `of ${t.rides} planned` },
    { key: "time", label: "TRAINING TIME", icon: "time-outline" as const, iconColor: colors.green, value: season ? fmtHours(season.hours) : "0h 0m", status: `of ${t.duration} planned` },
    { key: "distance", label: "DISTANCE", icon: "navigate" as const, iconColor: "#40A9C6", value: season ? `${season.distance_km.toLocaleString()} km` : "0 km", status: `of ${t.distance_km.toLocaleString()} km planned` },
    { key: "elevation", label: "ELEVATION", icon: "trending-up" as const, iconColor: colors.green, value: season ? `${season.elevation_m.toLocaleString()} m` : "0 m", status: `of ${t.elevation_m.toLocaleString()} m planned` },
    { key: "energy", label: "WEEKLY ENERGY", icon: "flame" as const, iconColor: colors.yellow, value: `${energy.week_kcal.toLocaleString()} kcal`, status: energyStatus },
    { key: "supp", label: "SUPPLEMENTARY", icon: "barbell" as const, iconColor: "#B98CFF", value: `${season?.supplementary ?? 0}`, status: `of ${t.supplementary ?? 0} planned` },
    { key: "ftp", label: "FTP", icon: "flash" as const, iconColor: colors.yellow, value: `${settings.ftp} W`, status: "Current" },
  ];

  return (
    <View style={styles.strip} testID="metric-summary-strip">
      {cells.map((m, i) => (
        <View key={m.key} style={styles.cell}>
          {i > 0 && <View style={styles.divider} />}
          <Ionicons name={m.icon} size={24} color={m.iconColor} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.label}>{m.label}</Text>
            <Text numberOfLines={1} style={styles.value}>{m.value}</Text>
            <Text numberOfLines={1} style={styles.status}>{m.status}</Text>
          </View>
        </View>
      ))}
      {/* Live readiness — tap to open the daily check-in */}
      <Pressable testID="readiness-cell" onPress={() => router.push("/checkin")} style={styles.cell} accessibilityRole="button" accessibilityLabel="Open daily check-in">
        <View style={styles.divider} />
        <Ionicons name="heart-outline" size={24} color={rTone.color} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.label}>READINESS</Text>
          <Text numberOfLines={1} style={styles.value}>{readinessValue}</Text>
          <Text numberOfLines={1} style={[styles.status, { color: rTone.color }]}>{readiness.available ? rTone.label : "Tap to check in"}</Text>
        </View>
      </Pressable>
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
