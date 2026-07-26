import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { usePlan } from "../lib/plan";
import { getWorkout, buildSegments } from "../lib/workout-catalog";
import { SecondaryButton, SectionLabel } from "./ui";

const KIND_LABEL: Record<string, string> = { recovery: "Recovery", rest: "Rest", strength: "Strength", balance: "Balance", mobility: "Mobility" };

/** "Today's Training" / "Next Scheduled Workout" card — reflects the same next
 * scheduled activity (any type) as the coach hero. Title flips depending on
 * whether that activity is actually scheduled for today. */
export function TodayTrainingCard({ onOpenToday, onToast, onCalendar }: { onOpenToday?: () => void; onToast?: (m: string) => void; onCalendar?: () => void }) {
  const { plan } = usePlan();
  const next = (plan.workouts?.find((w) => !w.completed) ?? plan.workouts?.[0]) as any;

  const isRide = !next?.type || next?.type === "cycling";
  const isRest = next?.type === "rest";
  const scheduledToday = !!next?.is_today;

  const title = scheduledToday ? "TODAY'S TRAINING" : "NEXT SCHEDULED WORKOUT";
  const dayLabel = scheduledToday ? "Today" : (next?.date_label ?? "");

  const steps = React.useMemo(() => {
    if (!isRide || !next?.id) return null;
    const w = getWorkout(next.id);
    if (!w) return null;
    const segs = buildSegments(w);
    return segs.length ? segs : null;
  }, [next, isRide]);

  return (
    <View style={styles.card} testID="today-training-card">
      <View style={styles.headRow}>
        <SectionLabel color={colors.textDim}>{title}</SectionLabel>
        {dayLabel ? <Text style={styles.dayLabel}>{dayLabel.toUpperCase()}</Text> : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        {next ? (
          <View style={styles.detail} testID="today-training-detail">
            <Text style={styles.detailTitle} numberOfLines={2}>{isRest ? "Rest & Recovery" : next.title}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={13} color={colors.textDim} />
              <Text style={styles.detailMeta}>{next.duration || "—"}</Text>
              {isRide && next.zone ? (<>
                <Ionicons name="pulse" size={13} color={colors.green} style={{ marginLeft: 12 }} />
                <Text style={styles.detailMeta}>{next.zone}</Text>
              </>) : null}
              {isRide && next.tss ? (<>
                <Ionicons name="flash" size={13} color={colors.yellow} style={{ marginLeft: 12 }} />
                <Text style={styles.detailMeta}>{next.tss}</Text>
              </>) : null}
              {!isRide && next.subtitle ? (<>
                <Ionicons name={(next.icon ?? "leaf-outline") as any} size={13} color={next.color ?? colors.textDim} style={{ marginLeft: 12 }} />
                <Text style={styles.detailMeta}>{KIND_LABEL[next.type] ?? next.subtitle}</Text>
              </>) : null}
            </View>
            {steps ? (
              <View style={styles.steps} testID="today-training-steps">
                <Text style={styles.stepsLabel}>WORKOUT STEPS</Text>
                {steps.map((seg, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={[styles.stepDot, { backgroundColor: seg.color }]} />
                    <Text style={styles.stepName} numberOfLines={2}>{seg.label}</Text>
                    <Text style={styles.stepMeta}>{Math.max(1, Math.round(seg.durationSec / 60))} min</Text>
                  </View>
                ))}
              </View>
            ) : !isRide ? (
              <View style={styles.altBox}>
                <Ionicons name={(next.icon ?? "leaf-outline") as any} size={20} color={next.color ?? colors.textDim} />
                <Text style={styles.altText}>{next.subtitle ? `${next.subtitle} session` : "Supplementary session"}{dayLabel ? ` scheduled for ${dayLabel}.` : "."}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.restBox} testID="today-training-rest">
            <Ionicons name="bed-outline" size={22} color={colors.textDim} />
            <Text style={styles.restText}>No upcoming session scheduled.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.btnRow}>
        {onOpenToday ? (
          <View style={{ flex: 1 }}>
            <SecondaryButton testID="open-today-training" label={scheduledToday ? "Open Today's Training" : "Open Workout"} onPress={onOpenToday} />
          </View>
        ) : null}
        {onCalendar ? (
          <Pressable
            testID="today-view-calendar"
            onPress={onCalendar}
            accessibilityRole="button"
            accessibilityLabel="View calendar"
            style={({ hovered }: any) => [styles.calBtn, hovered && styles.calBtnHover]}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.yellow} />
            <Text style={styles.calText}>Calendar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayLabel: { color: colors.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  detail: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  detailTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 5, gap: 4, flexWrap: "wrap" },
  detailMeta: { color: colors.textDim, fontSize: 12, fontWeight: "600", marginLeft: 3 },
  steps: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 6 },
  stepsLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepDot: { width: 7, height: 7, borderRadius: 4 },
  stepName: { color: colors.white, fontSize: 12.5, fontWeight: "600", flex: 1 },
  stepMeta: { color: colors.textDim, fontSize: 11.5, fontWeight: "700" },
  altBox: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  altText: { color: colors.textDim, fontSize: 12, lineHeight: 17, flex: 1 },
  restBox: { marginTop: 8, alignItems: "center", gap: 8, padding: 16, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft },
  restText: { color: colors.textDim, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  calBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: "rgba(255,194,10,0.06)", minHeight: 42 },
  calBtnHover: { backgroundColor: "rgba(255,194,10,0.14)" },
  calText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },
});
