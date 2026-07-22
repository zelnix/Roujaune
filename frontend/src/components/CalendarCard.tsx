import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { colors, radius, spacing } from "../theme";
import { calendarDots, todayPlan } from "../data";
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
          <Text style={styles.todayLabel}>{label}</Text>
        </View>
        <Text style={styles.todayTime}>{time}</Text>
        <Ionicons name={icon.name} size={18} color={icon.color} style={{ marginLeft: 8 }} />
      </View>
    </Touchable>
  );
}

export function CalendarCard({ onToast }: { onToast: (m: string) => void }) {
  const [month, setMonth] = React.useState(dayjs("2025-05-01"));
  const [selected, setSelected] = React.useState(12);
  const [activeWorkout, setActiveWorkout] = React.useState("climb");
  const grid = buildGrid(month);
  const isMay2025 = month.year() === 2025 && month.month() === 4;

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

        <View style={styles.daysGrid}>
          {grid.map((d, i) => {
            const inMonth = d.month() === month.month();
            const num = d.date();
            const isSel = inMonth && num === selected;
            const dots = isMay2025 && inMonth ? calendarDots[num] : undefined;
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
      </View>

      <View style={styles.vDivider} />

      {/* today's plan */}
      <View style={styles.planSide}>
        <SectionLabel color={colors.textDim}>TODAY&apos;S PLAN</SectionLabel>
        <View style={{ marginTop: spacing.sm, gap: 6 }}>
          {todayPlan.map((w) => (
            <TodayRow
              key={w.key}
              testID={`today-${w.key}`}
              label={w.label}
              time={w.time}
              state={w.state}
              active={activeWorkout === w.key}
              onPress={() => {
                setActiveWorkout(w.key);
                onToast(`${w.label} selected`);
              }}
            />
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <SecondaryButton
          testID="view-calendar-button"
          label="View Full Calendar"
          onPress={() => onToast("Opening full calendar")}
        />
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
  calSide: { flex: 1.4 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  month: { color: colors.white, fontSize: 16, fontWeight: "800" },
  arrows: { flexDirection: "row", gap: 12 },
  weekRow: { flexDirection: "row", marginTop: spacing.sm },
  weekDay: { flex: 1, textAlign: "center", color: colors.textFaint, fontSize: 9.5, fontWeight: "700" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  dayCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
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
