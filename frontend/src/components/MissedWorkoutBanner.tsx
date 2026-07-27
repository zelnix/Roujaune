import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, spacing } from "../theme";
import { MissedWorkouts } from "../lib/home-notices";

/** Safe missed-workout notice. Guidance never encourages stacking or unsafe
 * catch-up — it points the rider to today's ride / the adjusted plan. */
export function MissedWorkoutBanner({ data }: { data: MissedWorkouts }) {
  const router = useRouter();
  if (!data || data.count <= 0) return null;
  return (
    <Pressable
      testID="missed-workout-banner"
      onPress={() => router.push("/plan")}
      accessibilityRole="button"
      accessibilityLabel={`${data.count} missed workout${data.count > 1 ? "s" : ""}. View your adjusted plan.`}
      style={styles.card}
    >
      <View style={styles.icon}><Ionicons name="calendar-outline" size={18} color={colors.yellow} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {data.count} missed {data.count > 1 ? "rides" : "ride"} — you&apos;re still on track
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {data.guidance || "No need to make these up — pick up today's ride as planned."}
        </Text>
      </View>
      <Text style={styles.view}>Plan</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "rgba(255,194,10,0.08)", borderColor: "rgba(255,194,10,0.30)",
    borderWidth: 1, borderRadius: radius.lg, padding: spacing.md,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.14)" },
  title: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  sub: { color: colors.textDim, fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  view: { color: colors.yellow, fontSize: 12.5, fontWeight: "800", paddingHorizontal: 6 },
});
