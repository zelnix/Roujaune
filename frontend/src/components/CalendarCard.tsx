import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { colors, radius, spacing } from "../theme";
import { todayPlan } from "../data";
import { useCalendarWeek } from "../lib/calendar";
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

export function CalendarCard({ onToast, onOpenCalendar, scope = "today" }: { onToast: (m: string) => void; onOpenCalendar?: () => void; scope?: "today" | "week" }) {
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
                    style={styles.dayCell}
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
        <SectionLabel color={colors.textDim}>{scope === "week" ? "THIS WEEK'S PLAN" : "TODAY'S PLAN"}</SectionLabel>
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
