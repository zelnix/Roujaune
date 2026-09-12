import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import { spacing, colors } from "../theme";
import { useAuth } from "../lib/auth-context";
import { usePlanBadge } from "../lib/plan-badge";
import { useBenchmarkWeek, useBenchmarkPlanReview, useBenchmarkNudge } from "../lib/benchmark/api";
import { useMissedWorkouts, useFtpTestReminder } from "../lib/home-notices";
import { PlanUpdatedNudge } from "./PlanUpdatedNudge";
import { BenchmarkReminderBanner } from "./BenchmarkReminderBanner";
import { RebenchmarkNudgeBanner } from "./RebenchmarkNudgeBanner";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { MissedWorkoutBanner } from "./MissedWorkoutBanner";
import { FtpTestReminderBanner } from "./FtpTestReminderBanner";
import { MilestoneNudgeBanner, useMilestoneNudge } from "./MilestoneNudgeBanner";
import { PremiumExpiryBanner, usePremiumExpiry } from "./PremiumExpiryBanner";

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
 * Priority: premium expiring > verify email > re-benchmark required > FTP test today > missed workouts > benchmark due > plan updated.
 */
export function HomeNotificationArea() {
  const [expanded, setExpanded] = React.useState(false);
  const { user } = useAuth();
  const planUpdated = usePlanBadge();
  const missed = useMissedWorkouts();
  const ftpTest = useFtpTestReminder();
  const { week } = useBenchmarkWeek();
  const { review } = useBenchmarkPlanReview();
  const { nudge } = useBenchmarkNudge();
  const milestoneNudge = useMilestoneNudge();
  const premiumExpiry = usePremiumExpiry();

  const verifyActive = !!user && user.provider === "password" && !user.email_verified;
  const upcomingTests = (week.active ? (week.days || []) : [])
    .filter((d) => d.kind === "test" && d.status === "scheduled" && daysUntil(d.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const hasTest = upcomingTests.length > 0;
  const hasReview = review.hasProposal && typeof review.next === "number";
  const benchmarkActive = hasTest || hasReview;
  const missedActive = missed.count > 0;

  // Pick exactly one benchmark notice: a today/tomorrow test wins (time-sensitive),
  // otherwise the FTP review, otherwise the next scheduled test.
  const testSoon = hasTest && daysUntil(upcomingTests[0].date) <= 1;
  const benchmarkOnly: "review" | "test" =
    testSoon ? "test" : hasReview ? "review" : "test";

  const items: { key: string; node: React.ReactNode }[] = [];
  if (premiumExpiry.show) items.push({ key: "premium-expiry", node: <PremiumExpiryBanner /> });
  if (verifyActive) items.push({ key: "verify", node: <VerifyEmailBanner /> });
  if (nudge.required) items.push({ key: "rebenchmark", node: <RebenchmarkNudgeBanner nudge={nudge} /> });
  if (ftpTest.available) items.push({ key: "ftp-test", node: <FtpTestReminderBanner reminder={ftpTest} /> });
  if (missedActive) items.push({ key: "missed", node: <MissedWorkoutBanner data={missed} /> });
  if (benchmarkActive) items.push({ key: "benchmark", node: <BenchmarkReminderBanner only={benchmarkOnly} /> });
  if (planUpdated) items.push({ key: "plan", node: <PlanUpdatedNudge /> });
  if (milestoneNudge.show) items.push({ key: "milestone", node: <MilestoneNudgeBanner nudge={milestoneNudge} /> });

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
