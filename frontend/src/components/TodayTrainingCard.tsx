import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { useCalendarWeek } from "../lib/calendar";
import { getWorkout, buildSegments } from "../lib/workout-catalog";
import { SecondaryButton, SectionLabel, Touchable } from "./ui";

function TodayRow({ label, time, state, onPress, testID }: {
  label: string; time: string; state: "done" | "active" | "todo"; onPress: () => void; testID: string;
}) {
  const icon =
    state === "done" ? { name: "checkmark-circle" as const, color: colors.green }
      : state === "active" ? { name: "ellipse" as const, color: colors.yellow }
      : { name: "ellipse-outline" as const, color: colors.textFaint };
  return (
    <Touchable testID={testID} onPress={onPress} scaleTo={0.97} lift={false}>
      <View style={[styles.todayRow, state === "active" && styles.todayRowActive]}>
        <Text style={styles.todayLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.todayTime}>{time}</Text>
        <Ionicons name={icon.name} size={18} color={icon.color} style={{ marginLeft: 8 }} />
      </View>
    </Touchable>
  );
}

/** Standalone "Today's Training" card — the detailed session for the live
 * "today" (headline + workout steps + any supplementary sessions). */
export function TodayTrainingCard({ onOpenToday, onToast }: { onOpenToday?: () => void; onToast?: (m: string) => void }) {
  const { week } = useCalendarWeek();

  const today = React.useMemo(
    () => (week?.days ?? []).find((d) => d.date === week?.selected_date) ?? null,
    [week]
  );
  const todayMain = today?.cycling ?? null;

  const todaySteps = React.useMemo(() => {
    if (!todayMain?.workout_id) return null;
    const w = getWorkout(todayMain.workout_id);
    if (!w) return null;
    const segs = buildSegments(w);
    return segs.length ? segs : null;
  }, [todayMain]);

  const supplementary = React.useMemo(() => {
    const state = (s?: string): "done" | "active" | "todo" =>
      s === "completed" ? "done" : s === "today" ? "active" : "todo";
    return [today?.fb50, today?.wellness]
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s, i) => ({ key: `${s.type ?? "session"}-${s.id ?? i}`, label: s.title, time: s.duration || "—", state: state(s.status) }));
  }, [today]);

  const dayLabel = today?.day_num ? today.day_num : "";

  return (
    <View style={styles.card} testID="today-training-card">
      <View style={styles.headRow}>
        <SectionLabel color={colors.textDim}>TODAY'S TRAINING</SectionLabel>
        {dayLabel ? <Text style={styles.dayLabel}>{dayLabel}</Text> : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        {todayMain ? (
          <View style={styles.detail} testID="today-training-detail">
            <Text style={styles.detailTitle} numberOfLines={2}>{todayMain.title}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={13} color={colors.textDim} />
              <Text style={styles.detailMeta}>{todayMain.duration || "—"}</Text>
              {todayMain.zone ? (<>
                <Ionicons name="pulse" size={13} color={colors.green} style={{ marginLeft: 12 }} />
                <Text style={styles.detailMeta}>{todayMain.zone}</Text>
              </>) : null}
              {todayMain.tss ? (<>
                <Ionicons name="flash" size={13} color={colors.yellow} style={{ marginLeft: 12 }} />
                <Text style={styles.detailMeta}>{todayMain.tss}</Text>
              </>) : null}
            </View>
            {todayMain.subtitle ? <Text style={styles.detailDesc} numberOfLines={2}>{todayMain.subtitle}</Text> : null}
            {todaySteps ? (
              <View style={styles.steps} testID="today-training-steps">
                <Text style={styles.stepsLabel}>WORKOUT STEPS</Text>
                {todaySteps.map((seg, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={[styles.stepDot, { backgroundColor: seg.color }]} />
                    <Text style={styles.stepName} numberOfLines={2}>{seg.label}</Text>
                    <Text style={styles.stepMeta}>{Math.max(1, Math.round(seg.durationSec / 60))} min</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.restBox} testID="today-training-rest">
            <Ionicons name="bed-outline" size={22} color={colors.textDim} />
            <Text style={styles.restText}>Rest & recovery today — no ride scheduled.</Text>
          </View>
        )}

        {supplementary.length > 0 && (
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {supplementary.map((w) => (
              <TodayRow key={w.key} testID={`today-${w.key}`} label={w.label} time={w.time} state={w.state}
                onPress={() => onToast?.(`${w.label} selected`)} />
            ))}
          </View>
        )}
      </ScrollView>

      {onOpenToday ? (
        <SecondaryButton testID="open-today-training" label="Open Today's Training" onPress={onOpenToday} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayLabel: { color: colors.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  detail: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  detailTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 5, gap: 4 },
  detailMeta: { color: colors.textDim, fontSize: 12, fontWeight: "600", marginLeft: 3 },
  detailDesc: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  steps: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 6 },
  stepsLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepDot: { width: 7, height: 7, borderRadius: 4 },
  stepName: { color: colors.white, fontSize: 12.5, fontWeight: "600", flex: 1 },
  stepMeta: { color: colors.textDim, fontSize: 11.5, fontWeight: "700" },
  restBox: { marginTop: 8, alignItems: "center", gap: 8, padding: 16, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft },
  restText: { color: colors.textDim, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  todayRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm },
  todayRowActive: { backgroundColor: "rgba(255,255,255,0.05)" },
  todayLabel: { color: colors.white, fontSize: 13.5, fontWeight: "600", flex: 1 },
  todayTime: { color: colors.textDim, fontSize: 12.5 },
});
