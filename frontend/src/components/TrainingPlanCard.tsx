import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../theme";
import { trainingPlan } from "../data";
import { usePlan } from "../lib/plan";
import { CircularProgress, ClimbBars, SecondaryButton, SectionLabel } from "./ui";

export function TrainingPlanCard({ onPress }: { onPress: () => void }) {
  const { plan } = usePlan();
  const router = useRouter();
  if ((plan as any).no_plan) {
    return (
      <LinearGradient testID="training-plan-card" colors={["#101211", "#0A0B0A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <SectionLabel color={colors.red}>TRAINING PLAN</SectionLabel>
        <Text style={styles.title}>Ride your way</Text>
        <Text style={[styles.week, { marginTop: 6 }]}>No plan needed — browse workouts and pick whatever you feel like. Want structure? Choose a plan anytime.</Text>
        <SecondaryButton testID="browse-workouts-button" label="Browse workouts" tone="red" onPress={() => router.push("/workouts")} style={{ marginTop: spacing.md }} />
        <SecondaryButton testID="choose-plan-button" label="Choose a plan" tone="outline" onPress={onPress} style={{ marginTop: spacing.sm }} />
      </LinearGradient>
    );
  }
  // Upcoming = any planned day (ride, recovery, rest, strength…) not yet done —
  // the card shows the rider's full next schedule, not only the rides.
  const upcoming = plan.workouts.filter((w) => !w.completed);
  const next = upcoming[0] ?? plan.workouts[0];
  const more = upcoming.slice(1, 5);
  const title = plan.title ?? trainingPlan.title;
  // Prefix the phase with its number, e.g. "Phase 1 · Build · Weeks 1–4".
  const activePhase = plan.phases?.find((p) => p.active) ?? plan.phases?.[0];
  const week = activePhase
    ? `Phase ${activePhase.number} · ${activePhase.name} · ${activePhase.weeks}`
    : plan.phase ? `${plan.phase.name} · ${plan.phase.weeks}` : trainingPlan.week;
  const progress = (plan.progressPct ?? trainingPlan.progress * 100) / 100;
  const bars = next?.profile?.length ? next.profile : trainingPlan.bars;

  const isRide = (w?: any) => !w?.type || w.type === "cycling";
  const SHORT_LABEL: Record<string, string> = { recovery: "Recovery", rest: "Rest", strength: "Strength", balance: "Balance", mobility: "Mobility" };
  const metaOf = (w?: any) => [w?.duration, isRide(w) ? w?.tss : SHORT_LABEL[w?.type] ?? w?.subtitle].filter(Boolean).join(" · ");
  const nextIsRide = isRide(next);

  return (
    <LinearGradient
      testID="training-plan-card"
      colors={["#3A0E12", "#1A0809"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <SectionLabel color={colors.red}>TRAINING PLAN</SectionLabel>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.week}>{week}</Text>
        </View>
        <CircularProgress progress={progress} color={colors.yellow} size={56} stroke={5} />
      </View>

      <View style={styles.divider} />

      <SectionLabel color={colors.red}>{more.length ? "NEXT WORKOUTS" : "NEXT WORKOUT"}</SectionLabel>
      <View style={styles.workoutRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.workout}>{next?.title ?? trainingPlan.nextWorkout}</Text>
          <View style={styles.metaRow}>
            {nextIsRide ? (
              <>
                <Ionicons name="time-outline" size={13} color={colors.textDim} />
                <Text style={styles.meta}>{next?.duration ?? trainingPlan.duration}</Text>
                <Ionicons name="flash" size={13} color={colors.yellow} style={{ marginLeft: 10 }} />
                <Text style={styles.meta}>{next?.tss ?? trainingPlan.tss}</Text>
              </>
            ) : (
              <>
                <Ionicons name={(next?.icon ?? "leaf-outline") as any} size={13} color={next?.color ?? colors.textDim} />
                <Text style={styles.meta}>{[next?.duration, next?.subtitle].filter(Boolean).join(" · ")}</Text>
              </>
            )}
          </View>
        </View>
        {nextIsRide ? (
          <ClimbBars data={bars} color={colors.redBright} width={80} height={42} />
        ) : (
          <View style={[styles.typeBadge, { borderColor: next?.color ?? colors.border }]}>
            <Ionicons name={(next?.icon ?? "leaf-outline") as any} size={22} color={next?.color ?? colors.textDim} />
          </View>
        )}
      </View>

      {more.map((w, idx) => (
        <View key={`${w.id ?? "wk"}-${idx}`} style={styles.upNextRow}>
          <View style={[styles.upNextDot, { backgroundColor: w.color }]} />
          <Text style={styles.upNextTitle} numberOfLines={1}>{w.title}</Text>
          <Text style={styles.upNextMeta} numberOfLines={1}>{metaOf(w)}</Text>
        </View>
      ))}

      <SecondaryButton testID="view-plan-button" label="View Plan" tone="red" onPress={onPress} style={{ marginTop: spacing.sm }} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(224,30,43,0.3)",
    padding: spacing.md,
  },
  topRow: { flexDirection: "row", alignItems: "center" },
  title: { color: colors.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  week: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  workoutRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  typeBadge: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  workout: { color: colors.white, fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  meta: { color: colors.textDim, fontSize: 12, marginLeft: 4 },
  upNextRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  upNextDot: { width: 7, height: 7, borderRadius: 4 },
  upNextTitle: { color: colors.white, fontSize: 13, fontWeight: "600", flex: 1 },
  upNextMeta: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },
});
