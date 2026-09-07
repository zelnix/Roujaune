import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../theme";
import { useCoach } from "../lib/coach-persona";
import { usePlanBadge, markPlanSeen } from "../lib/plan-badge";

/** A dismissible nudge shown on the home screen after a completed ride, when the
 * coach has just refreshed the plan (and its adaptation reasoning). Tapping it
 * opens the Training Plan; the X dismisses it. */
export function PlanUpdatedNudge() {
  const router = useRouter();
  const coach = useCoach();
  const updated = usePlanBadge();
  if (!updated) return null;

  const open = () => { markPlanSeen(); router.push("/plan"); };
  const dismiss = () => { markPlanSeen(); };

  return (
    <Pressable
      testID="plan-updated-nudge"
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${coach.name} updated your plan. View training plan.`}
      style={({ hovered }: any) => [styles.wrap, hovered && styles.wrapHover]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="sparkles" size={16} color="#241B00" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{coach.name} updated your plan</Text>
        <Text style={styles.sub}>Fresh guidance based on your last ride — tap to see what changed.</Text>
      </View>
      <View style={styles.viewBtn}>
        <Text style={styles.viewText}>View</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.yellow} />
      </View>
      <Pressable testID="plan-updated-nudge-dismiss" onPress={dismiss} hitSlop={10} style={styles.close} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={colors.textDim} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14 },
  wrapHover: { backgroundColor: "rgba(255,194,10,0.13)" },
  iconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  title: { color: colors.white, fontSize: 14, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)" },
  viewText: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
  close: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
});
