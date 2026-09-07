import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors, radius, spacing } from "../theme";
import { BenchmarkNudge } from "../lib/benchmark/api";

/**
 * "Time to re-benchmark" nudge for Home. Shown when the deterministic benchmark
 * gate flips to Required for the rider's current plan (e.g. after reporting an
 * injury / return to training / equipment change, or a stale/absent FTP).
 * Works on every platform (no native build required).
 */
export function RebenchmarkNudgeBanner({ nudge }: { nudge: BenchmarkNudge }) {
  const router = useRouter();
  const reason = (nudge.reason || "").trim();
  const sub = reason
    ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`
    : "A fresh benchmark keeps your training targets accurate.";

  return (
    <Pressable
      testID="rebenchmark-nudge-banner"
      onPress={() => router.push("/benchmark")}
      accessibilityRole="button"
      accessibilityLabel={`Time to re-benchmark. ${sub}. Start a benchmark.`}
      style={({ hovered }: any) => [styles.wrap, hovered && styles.wrapHover]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="fitness" size={20} color={colors.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>Time to re-benchmark</Text>
        <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Start</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.yellow} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255,194,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,194,10,0.5)",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  wrapHover: { borderColor: "rgba(255,194,10,0.8)" },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.yellow, borderColor: colors.yellow, borderWidth: 1,
  },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  cta: { flexDirection: "row", alignItems: "center", gap: 2 },
  ctaText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
});
