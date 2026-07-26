import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { useBenchmarkWeek, BenchmarkWeekDay } from "../lib/benchmark/api";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const target = new Date(y, (m || 1) - 1, d || 1).getTime();
  return Math.round((target - todayStart()) / DAY_MS);
}

function whenLabel(iso: string): string {
  const delta = daysUntil(iso);
  if (delta <= 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta < 7) {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { weekday: "long" });
  }
  return `in ${delta} days`;
}

/**
 * In-app benchmark reminder — surfaces the next upcoming scheduled benchmark
 * test on the Today screen so riders see it even before push is live. Works on
 * every platform (no native build required). Tapping opens the Benchmark hub.
 */
export function BenchmarkReminderBanner() {
  const router = useRouter();
  const { week, loading } = useBenchmarkWeek();

  const next = React.useMemo<BenchmarkWeekDay | null>(() => {
    if (!week.active) return null;
    const upcoming = (week.days || [])
      .filter((d) => d.kind === "test" && d.status === "scheduled" && daysUntil(d.date) >= 0)
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
    return upcoming[0] ?? null;
  }, [week]);

  if (loading || !next) return null;

  const delta = daysUntil(next.date);
  const soon = delta <= 1; // today / tomorrow → stronger accent

  return (
    <Pressable
      testID="benchmark-reminder-banner"
      onPress={() => router.push("/benchmark")}
      accessibilityRole="button"
      accessibilityLabel={`Benchmark test ${whenLabel(next.date)}: ${next.label}`}
      style={({ hovered }: any) => [styles.wrap, soon && styles.wrapSoon, hovered && styles.wrapHover]}
    >
      <View style={[styles.iconWrap, soon && styles.iconWrapSoon]}>
        <Ionicons name="stopwatch-outline" size={20} color={soon ? colors.bg : colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          Benchmark test {whenLabel(next.date)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>{next.label}</Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>View</Text>
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  wrapSoon: { borderColor: "rgba(255,194,10,0.5)", backgroundColor: "rgba(255,194,10,0.08)" },
  wrapHover: { borderColor: "rgba(255,194,10,0.7)" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,194,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,194,10,0.3)",
  },
  iconWrapSoon: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  cta: { flexDirection: "row", alignItems: "center", gap: 2 },
  ctaText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
});
