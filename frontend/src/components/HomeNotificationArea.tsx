import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import { spacing, colors } from "../theme";
import { useAuth } from "../lib/auth-context";
import { usePlanBadge } from "../lib/plan-badge";
import { useBenchmarkWeek, useBenchmarkPlanReview } from "../lib/benchmark/api";
import { useMissedWorkouts } from "../lib/home-notices";
import { PlanUpdatedNudge } from "./PlanUpdatedNudge";
import { BenchmarkReminderBanner } from "./BenchmarkReminderBanner";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { MissedWorkoutBanner } from "./MissedWorkoutBanner";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

/**
 * One prioritised notification area for Home. Replaces the previously stacked
 * banners: it shows only the single highest-priority notice, with a "+N more"
 * control to reveal the rest — keeping today's workout above the fold.
 * Priority: verify email > missed workouts > benchmark due > plan updated.
 */
export function HomeNotificationArea() {
  const [expanded, setExpanded] = React.useState(false);
  const { user } = useAuth();
  const planUpdated = usePlanBadge();
  const missed = useMissedWorkouts();
  const { week } = useBenchmarkWeek();
  const { review } = useBenchmarkPlanReview();

  const verifyActive = !!user && user.provider === "password" && !user.email_verified;
  const benchmarkActive =
    (week.active && (week.days || []).some((d) => d.kind === "test" && d.status === "scheduled" && daysUntil(d.date) >= 0)) ||
    (review.hasProposal && typeof review.next === "number");
  const missedActive = missed.count > 0;

  const items: { key: string; node: React.ReactNode }[] = [];
  if (verifyActive) items.push({ key: "verify", node: <VerifyEmailBanner /> });
  if (missedActive) items.push({ key: "missed", node: <MissedWorkoutBanner data={missed} /> });
  if (benchmarkActive) items.push({ key: "benchmark", node: <BenchmarkReminderBanner /> });
  if (planUpdated) items.push({ key: "plan", node: <PlanUpdatedNudge /> });

  if (items.length === 0) return null;
  const extra = items.length - 1;

  return (
    <View testID="home-notifications" style={{ gap: spacing.sm }}>
      {items[0].node}
      {extra > 0 && !expanded && (
        <Pressable testID="notif-more" onPress={() => setExpanded(true)} style={styles.more} accessibilityRole="button" accessibilityLabel={`Show ${extra} more notification${extra > 1 ? "s" : ""}`}>
          <Text style={styles.moreText}>+{extra} more {extra > 1 ? "updates" : "update"}</Text>
        </Pressable>
      )}
      {expanded && items.slice(1).map((it) => <View key={it.key}>{it.node}</View>)}
      {expanded && extra > 0 && (
        <Pressable testID="notif-less" onPress={() => setExpanded(false)} style={styles.more} accessibilityRole="button" accessibilityLabel="Show fewer notifications">
          <Text style={styles.moreText}>Show less</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  more: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 4 },
  moreText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
});
