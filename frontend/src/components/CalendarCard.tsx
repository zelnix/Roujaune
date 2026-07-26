import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { colors, radius, spacing } from "../theme";
import { todayPlan } from "../data";
import { useCalendarWeek } from "../lib/calendar";
import { getWorkout, buildSegments } from "../lib/workout-catalog";
import { ActivityDots, SecondaryButton, SectionLabel, Touchable } from "./ui";

const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function buildGrid(month: dayjs.Dayjs) {
  const start = month.startOf("month");
  const firstWeekday = (start.day() + 6) % 7; // 0 = Monday
  const gridStart = start.subtract(firstWeekday, "day");
  const weeks = Math.ceil((firstWeekday + start.daysInMonth()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => gridStart.add(i, "day"));
}

function TodayRow({ label, time, state, active, onPress, testID }: {
  label: string;
  time: string;
  state: "done" | "active" | "todo";
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  const icon =
    state === "done"
      ? { name: "checkmark-circle" as const, color: colors.green }
      : state === "active"
      ? { name: "ellipse" as const, color: colors.yellow }
      : { name: "ellipse-outline" as const, color: colors.textFaint };
  return (
    <Touchable testID={testID} onPress={onPress} scaleTo={0.97} lift={false}>
      <View style={[styles.todayRow, active && styles.todayRowActive]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.todayLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={styles.todayTime}>{time}</Text>
        <Ionicons name={icon.name} size={18} color={icon.color} style={{ marginLeft: 8 }} />
      </View>
    </Touchable>
  );
}

export function CalendarCard({ onToast, onOpenCalendar, onOpenToday, scope = "today" }: { onToast: (m: string) => void; onOpenCalendar?: () => void; onOpenToday?: () => void; scope?: "today" | "week" }) {
  const { week } = useCalendarWeek();
  const [month, setMonth] = React.useState(dayjs("2025-05-13").startOf("month"));
  const [selected, setSelected] = React.useState(13);
  const grid = buildGrid(month);

  // Sync the visible month + selected day to the live "today" from the backend.
  React.useEffect(() => {
    if (!week?.selected_date) return;
    const d = dayjs(week.selected_date);
    setSelected(d.date());
    setMonth(d.startOf("month"));
  }, [week?.selected_date]);

  // Activity dots derived from each day's main (cycling) session status.
  const dotByDate = React.useMemo(() => {
    const m: Record<string, string[]> = {};
    (week?.days ?? []).forEach((d) => {
      const c = d.cycling;
      if (!c || c.status === "rest") return;
      m[d.date] = [c.status === "completed" ? "green" : c.status === "today" ? "yellow" : "red"];
    });
    return m;
  }, [week]);

  // Today's plan rows = the real sessions scheduled for the live "today".
  const planRows = React.useMemo(() => {
    const state = (s?: string): "done" | "active" | "todo" =>
      s === "completed" ? "done" : s === "today" ? "active" : "todo";
    const days = week?.days ?? [];

    if (scope === "week") {
      // One row per day using that day's primary session (ride → strength →
      // recovery), so rest, recovery and strength/balance days are all shown.
      return days
        .map((d) => {
          const c = d.cycling;
          const s = c ?? d.fb50 ?? d.wellness;
          if (!s) return null;
          const day = d.day_name ? d.day_name.charAt(0) + d.day_name.slice(1).toLowerCase() : "";
          const rest = c?.status === "rest";
          return {
            key: d.date,
            label: `${day} · ${rest ? "Rest Day" : s.title}`,
            time: rest ? "Rest" : s.duration || "—",
            state: state(rest ? "rest" : s.status),
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r);
    }

    const today = days.find((d) => d.date === week?.selected_date);
    if (!today) return todayPlan;
    return [today.cycling, today.fb50, today.wellness]
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s, i) => ({ key: `${s.type ?? "session"}-${s.id ?? i}`, label: s.title, time: s.duration || "—", state: state(s.status) }));
  }, [week, scope]);

  // Today's main cycling session — the "full detail" headline of Today's Training.
  const todayMain = React.useMemo(() => {
    if (scope === "week") return null;
    const today = (week?.days ?? []).find((d) => d.date === week?.selected_date);
    return today?.cycling ?? null;
  }, [week, scope]);

  // Textual step-by-step breakdown of today's ride (Warm-up → efforts → Cool-down).
  const todaySteps = React.useMemo(() => {
    if (scope === "week" || !todayMain?.workout_id) return null;
    const w = getWorkout(todayMain.workout_id);
    if (!w) return null;
    const segs = buildSegments(w);
    return segs.length ? segs : null;
  }, [todayMain, scope]);

  return (
    <View style={styles.card} testID="calendar-card">
      {/* calendar */}
      <View style={styles.calSide}>
        <SectionLabel color={colors.textDim}>CALENDAR</SectionLabel>
        <View style={styles.monthRow}>
          <Text style={styles.month}>{month.format("MMMM YYYY")}</Text>
          <View style={styles.arrows}>
            <Touchable testID="cal-prev" scaleTo={0.85} lift={false} onPress={() => setMonth((m) => m.subtract(1, "month"))}>
              <Ionicons name="chevron-back" size={18} color={colors.textDim} />
            </Touchable>
            <Touchable testID="cal-next" scaleTo={0.85} lift={false} onPress={() => setMonth((m) => m.add(1, "month"))}>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Touchable>
          </View>
        </View>

        <View style={styles.weekRow}>
          {WEEK.map((d) => (
            <Text key={d} style={styles.weekDay}>{d}</Text>
          ))}
        </View>

        <View>
          {Array.from({ length: Math.ceil(grid.length / 7) }, (_, r) => grid.slice(r * 7, r * 7 + 7)).map((wk, r) => (
            <View key={r} style={styles.weekGrid}>
              {wk.map((d, i) => {
                const inMonth = d.month() === month.month();
                const num = d.date();
                const isSel = inMonth && num === selected;
                const dots = inMonth ? dotByDate[d.format("YYYY-MM-DD")] : undefined;
                return (
                  <Touchable
                    key={i}
                    testID={`day-${d.format("YYYY-MM-DD")}`}
                    scaleTo={0.85}
                    lift={false}
                    onPress={() => inMonth && setSelected(num)}
                    containerStyle={styles.dayCell}
                  >
                    <View style={[styles.dayInner, isSel && styles.daySelected]}>
                      <Text style={[styles.dayText, !inMonth && styles.dayFaint, isSel && styles.daySelectedText]}>
                        {num}
                      </Text>
                    </View>
                    {dots ? <ActivityDots dots={dots} /> : <View style={{ height: 7 }} />}
                  </Touchable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <SecondaryButton
          testID="view-calendar-button"
          label="View Full Calendar"
          onPress={() => (onOpenCalendar ? onOpenCalendar() : onToast("Opening full calendar"))}
        />
      </View>

      <View style={styles.vDivider} />

      {/* plan list (today or this week) */}
      <View style={styles.planSide}>
        <SectionLabel color={colors.textDim}>{scope === "week" ? "THIS WEEK'S PLAN" : "TODAY'S TRAINING"}</SectionLabel>

        {scope !== "week" && todayMain && (
          <View style={styles.todayDetail} testID="today-training-detail">
            <Text style={styles.todayDetailTitle} numberOfLines={1}>{todayMain.title}</Text>
            <View style={styles.todayMetaRow}>
              <Ionicons name="time-outline" size={13} color={colors.textDim} />
              <Text style={styles.todayDetailMeta}>{todayMain.duration || "—"}</Text>
              {todayMain.zone ? (
                <>
                  <Ionicons name="pulse" size={13} color={colors.green} style={{ marginLeft: 12 }} />
                  <Text style={styles.todayDetailMeta}>{todayMain.zone}</Text>
                </>
              ) : null}
              {todayMain.tss ? (
                <>
                  <Ionicons name="flash" size={13} color={colors.yellow} style={{ marginLeft: 12 }} />
                  <Text style={styles.todayDetailMeta}>{todayMain.tss}</Text>
                </>
              ) : null}
            </View>
            {todayMain.subtitle ? <Text style={styles.todayDetailDesc} numberOfLines={2}>{todayMain.subtitle}</Text> : null}
            {todaySteps ? (
              <View style={styles.todaySteps} testID="today-training-steps">
                <Text style={styles.todayStepsLabel}>WORKOUT STEPS</Text>
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
        )}

        <View style={{ marginTop: spacing.sm, gap: 6 }}>
          {planRows.map((w) => (
            <TodayRow
              key={w.key}
              testID={`today-${w.key}`}
              label={w.label}
              time={w.time}
              state={w.state}
              active={w.state === "active"}
              onPress={() => onToast(`${w.label} selected`)}
            />
          ))}
        </View>

        {scope !== "week" && onOpenToday && (
          <>
            <View style={{ flex: 1 }} />
            <SecondaryButton testID="open-today-training" label="Open Today's Training" onPress={onOpenToday} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  calSide: { flex: 1.25 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  month: { color: colors.white, fontSize: 16, fontWeight: "800" },
  arrows: { flexDirection: "row", gap: 12 },
  weekRow: { flexDirection: "row", marginTop: spacing.sm },
  weekDay: { flex: 1, textAlign: "center", color: colors.textFaint, fontSize: 9.5, fontWeight: "700" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  weekGrid: { flexDirection: "row", marginTop: 4 },
  dayCell: { flex: 1, alignItems: "center", paddingVertical: 2 },
  dayInner: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.red },
  dayText: { color: colors.white, fontSize: 12.5, fontWeight: "600" },
  dayFaint: { color: colors.textFaint },
  daySelectedText: { color: "#fff", fontWeight: "800" },
  vDivider: { width: 1, backgroundColor: colors.borderSoft, marginHorizontal: spacing.md },
  planSide: { flex: 1 },
  todayDetail: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  todayDetailTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  todayMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 5, gap: 4 },
  todayDetailMeta: { color: colors.textDim, fontSize: 12, fontWeight: "600", marginLeft: 3 },
  todayDetailDesc: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  todaySteps: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 6 },
  todayStepsLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepDot: { width: 7, height: 7, borderRadius: 4 },
  stepName: { color: colors.white, fontSize: 12.5, fontWeight: "600", flex: 1 },
  stepMeta: { color: colors.textDim, fontSize: 11.5, fontWeight: "700" },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  todayRowActive: { backgroundColor: "rgba(255,255,255,0.05)" },
  todayLabel: { color: colors.white, fontSize: 13.5, fontWeight: "600" },
  todayTime: { color: colors.textDim, fontSize: 12.5 },
});
