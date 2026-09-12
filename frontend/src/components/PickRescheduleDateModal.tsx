import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors as C, radius } from "../theme";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function buildMonthGrid(viewMonth: Date): (Date | null)[] {
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  const firstIdx = (new Date(y, m, 1).getDay() + 6) % 7; // 0=Mon … 6=Sun
  const total = daysInMonth(y, m);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstIdx; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function chunk7<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 7) out.push(arr.slice(i, i + 7));
  return out;
}
const WEEKDAY_HEAD = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Full month calendar for picking exactly which day to move a missed ride to
 * — riders previously only got a single coach-suggested day with no choice. */
export function PickRescheduleDateModal({
  visible, onClose, onConfirm, suggestedDate, title,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (dateISO: string) => void;
  suggestedDate?: string;
  title?: string;
}) {
  const today = React.useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, [visible]);
  const initial = React.useMemo(() => {
    if (suggestedDate) { const d = new Date(`${suggestedDate}T00:00:00`); if (!isNaN(d.getTime())) return d; }
    return addDays(today, 1);
  }, [suggestedDate, today]);
  const [sel, setSel] = React.useState<Date>(initial);
  const [viewMonth, setViewMonth] = React.useState<Date>(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  React.useEffect(() => {
    if (!visible) return;
    setSel(initial);
    setViewMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
  }, [visible, initial]);

  const selIso = iso(sel);
  const label = sel.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const canGoPrevMonth = viewMonth > curMonthStart;
  const grid = React.useMemo(() => chunk7(buildMonthGrid(viewMonth)), [viewMonth]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={s.title}>Reschedule{title ? ` “${title}”` : ""}</Text>
            <Pressable testID="reschedule-close" onPress={onClose} hitSlop={8}><Ionicons name="close" size={20} color={C.white} /></Pressable>
          </View>
          <Text style={s.sub}>Pick any free day — your plan adjusts around it.</Text>

          <View style={s.selectedRow}>
            <Ionicons name="calendar" size={15} color={C.yellow} />
            <Text style={s.dateLabel} testID="reschedule-label" numberOfLines={1}>{label}</Text>
          </View>

          <View style={s.monthNav}>
            <Pressable testID="reschedule-month-prev" disabled={!canGoPrevMonth} onPress={() => setViewMonth((d) => addMonths(d, -1))} style={[s.monthBtn, !canGoPrevMonth && { opacity: 0.3 }]}>
              <Ionicons name="chevron-back" size={18} color={C.white} />
            </Pressable>
            <Text style={s.monthLabel} testID="reschedule-month-label">{monthLabel}</Text>
            <Pressable testID="reschedule-month-next" onPress={() => setViewMonth((d) => addMonths(d, 1))} style={s.monthBtn}>
              <Ionicons name="chevron-forward" size={18} color={C.white} />
            </Pressable>
          </View>

          <View style={s.weekHead}>
            {WEEKDAY_HEAD.map((w) => <Text key={w} style={s.weekHeadText}>{w}</Text>)}
          </View>

          <View style={s.grid}>
            {grid.map((row, ri) => (
              <View key={ri} style={s.gridRow}>
                {row.map((d, ci) => {
                  if (!d) return <View key={ci} style={s.dayCell} />;
                  const dIso = iso(d);
                  const active = dIso === selIso;
                  const isToday = dIso === iso(today);
                  const past = d < today;
                  return (
                    <Pressable
                      key={ci}
                      testID={`reschedule-day-${dIso}`}
                      disabled={past}
                      onPress={() => setSel(d)}
                      style={[s.dayCell, past && { opacity: 0.3 }, active && s.dayActive]}
                    >
                      <Text style={[s.dayText, active && s.dayTextActive]}>{d.getDate()}</Text>
                      {isToday && !active ? <View style={s.todayDot} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable testID="reschedule-confirm" onPress={() => onConfirm(selIso)} style={s.confirm}>
            <Ionicons name="checkmark-circle" size={16} color="#04210F" />
            <Text style={s.confirmText}>Move to {sel.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: 420, maxWidth: "100%", backgroundColor: "#1B1B1B", borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: C.white, fontSize: 17, fontWeight: "800", flex: 1, marginRight: 8 },
  sub: { color: C.textDim, fontSize: 12.5, lineHeight: 18 },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,194,10,0.08)", borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,194,10,0.25)", paddingVertical: 10, paddingHorizontal: 12 },
  dateLabel: { color: C.white, fontSize: 14, fontWeight: "800", flex: 1 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  monthLabel: { color: C.white, fontSize: 15, fontWeight: "800" },
  weekHead: { flexDirection: "row", justifyContent: "space-between" },
  weekHeadText: { color: C.textDim, fontSize: 10.5, fontWeight: "700", width: 40, textAlign: "center" },
  grid: { gap: 4 },
  gridRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { width: 40, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  dayActive: { backgroundColor: C.yellow },
  dayText: { color: C.white, fontSize: 13.5, fontWeight: "600" },
  dayTextActive: { color: "#241B00", fontWeight: "800" },
  todayDot: { position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: C.yellow },
  confirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.yellow, borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  confirmText: { color: "#241B00", fontSize: 14.5, fontWeight: "800" },
});
