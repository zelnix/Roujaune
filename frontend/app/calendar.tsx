import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, Pressable, useWindowDimensions, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { useCoach } from "@/src/lib/coach-persona";
import { markPlanSeen } from "@/src/lib/plan-badge";
import {
  useCalendarWeek, moveSession, requestAlbertoReview, CalendarDay, SessionType, FILTERS,
} from "@/src/lib/calendar";
import { TrainingPlanSidebar, TopStatus } from "@/src/components/plan";
import {
  CC, DateControls, RowLabel, DayHeader, FocusCell, TrainingSessionCard, FB50SessionCard,
  WellnessSessionCard, ReadinessRing, SelectedDayPanel, WeekSummaryCard, QuickActionsCard,
  CalendarTipFooter, SyncStatusCard, DraggableSession,
} from "@/src/components/calendar";

const LABEL_W = 66;

function Toast({ message, onUndo }: { message: { id: number; text: string; undo?: () => void } | null; onUndo?: () => void }) {
  const op = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(message.undo ? 3200 : 1600),
      Animated.timing(op, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [message, op]);
  if (!message) return null;
  return (
    <Animated.View style={[styles.toast, { opacity: op }]}>
      <Text style={styles.toastText}>{message.text}</Text>
      {message.undo ? (
        <Pressable testID="undo-move" onPress={onUndo} hitSlop={8}><Text style={styles.undoText}>Undo</Text></Pressable>
      ) : null}
    </Animated.View>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { width } = useWindowDimensions();
  const compact = width < 720; // phones scroll a stacked view
  const { week, setWeek, loading } = useCalendarWeek();

  const [selected, setSelected] = React.useState(1); // Tuesday
  const [toast, setToast] = React.useState<{ id: number; text: string; undo?: () => void } | null>(null);
  const [filter, setFilter] = React.useState("All");
  const [showFilters, setShowFilters] = React.useState(false);
  const [review, setReview] = React.useState<null | { message: string; loading: boolean; confirm: () => void }>(null);

  const colCenters = React.useRef<number[]>([]);
  const showToast = React.useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), []);

  const onSelectNav = (key: string) => {
    if (key === "calendar") return;
    if (key === "home") { router.replace("/"); return; }
    if (key === "training") { markPlanSeen(); router.push("/plan"); return; }
    if (key === "workouts") { router.push("/workout"); return; }
    showToast(`${key.charAt(0).toUpperCase() + key.slice(1)} — coming soon`);
  };

  const days = week?.days ?? [];
  const selDay: CalendarDay | undefined = days[selected];

  const measureCol = (i: number) => (e: any) => {
    const { x, width: w } = e.nativeEvent.layout;
    colCenters.current[i] = x + w / 2;
  };

  const resolveTarget = (source: number, dx: number) => {
    const centers = colCenters.current;
    if (!centers[source]) return source;
    const targetX = centers[source] + dx;
    let best = source; let bestD = Infinity;
    centers.forEach((c, i) => { const d = Math.abs(c - targetX); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };

  const performMove = React.useCallback(async (type: SessionType, from: number, to: number) => {
    if (!week) return;
    const updated = await moveSession({ week_start: week.start_date, session_type: type, from_date: days[from].date, to_date: days[to].date });
    if (updated) {
      setWeek(updated);
      showToast(`${dayName(days[to].day_name)} — session moved`, async () => {
        const reverted = await moveSession({ week_start: week.start_date, session_type: type, from_date: days[to].date, to_date: days[from].date });
        if (reverted) setWeek(reverted);
      });
    }
  }, [week, days, setWeek, showToast]);

  const onDrop = React.useCallback((type: SessionType, source: number) => (dx: number) => {
    const to = resolveTarget(source, dx);
    if (to === source || !week) return;
    const sess = days[source][type];
    const dst = days[to];
    if (!sess) return;
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setReview({ message: "", loading: true, confirm: () => {} });
    requestAlbertoReview({
      session_title: sess.title, session_type: type,
      from_day: dayName(days[source].day_name), to_day: dayName(dst.day_name),
      to_focus: dst.focus, to_existing: dst[type]?.title ?? "",
      coach_name: persona.name, coach_gender: persona.gender,
    }).then((message) => {
      setReview({ message, loading: false, confirm: () => { setReview(null); performMove(type, source, to); } });
    });
  }, [week, days, persona, performMove]);

  const onQuickAction = (id: string, title: string) => showToast(title);

  if (compact) {
    // Phones: keep tablet intent but stacked & scrollable.
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
        <StatusBar hidden />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.subtitle}>Plan your week. Execute your day.</Text>
            {selDay ? <SelectedDayPanel day={selDay} onPrev={() => setSelected((s) => (s + 6) % 7)} onMenu={() => showToast("Session options")} onViewWorkout={() => router.push("/workout")} /> : null}
            {week ? <WeekSummaryCard summary={week.summary} /> : null}
            <QuickActionsCard onAction={onQuickAction} />
            {week ? <CalendarTipFooter tip={week.tip} /> : null}
          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: CC.bg }} edges={["top", "bottom", "left"]}>
        <View style={styles.canvas}>
          <TrainingPlanSidebar active="calendar" onSelect={onSelectNav} persona={persona} onMessage={() => showToast(`Message ${persona.name}`)} sync={<SyncStatusCard />} />

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Calendar</Text>
                <Text style={styles.subtitle}>Plan your week. Execute your day.</Text>
              </View>
              <TopStatus persona={persona} onPress={showToast} />
            </View>

            <DateControls
              rangeLabel={week?.range_label ?? "12 – 18 May 2025"}
              onPrev={() => showToast("Previous week")}
              onNext={() => showToast("Next week")}
              onToday={() => { setSelected(1); showToast("Jumped to this week"); }}
              onFilters={() => setShowFilters(true)}
              onWeek={() => showToast("View: Week")}
              onSettings={() => showToast("Calendar settings")}
            />
            {filter !== "All" ? (
              <Pressable testID="active-filter" onPress={() => setFilter("All")} style={styles.filterChip}>
                <Text style={styles.filterChipText}>Filter: {filter}</Text>
                <Ionicons name="close" size={13} color={CC.white} />
              </Pressable>
            ) : null}

            {/* main: grid + right panel */}
            <View style={styles.mainRow}>
              <View style={styles.gridWrap}>
                {/* header row */}
                <View style={styles.gridRow}>
                  <View style={{ width: LABEL_W }} />
                  {days.map((d, i) => (
                    <Pressable key={d.date} testID={`day-head-${i}`} onPress={() => setSelected(i)} style={styles.col}>
                      <DayHeader day={d} selected={i === selected} />
                    </Pressable>
                  ))}
                </View>

                {/* focus row */}
                <GridRow icon="disc-outline" label="FOCUS" color={CC.yellow}>
                  {days.map((d, i) => <View key={d.date} style={[styles.col, i === selected && styles.colSel]}><FocusCell text={d.focus} /></View>)}
                </GridRow>

                {/* training row (draggable) */}
                <GridRow icon="bicycle" label="TRAINING" color={CC.yellow}>
                  {days.map((d, i) => (
                    <View key={d.date} style={[styles.col, i === selected && styles.colSel]} onLayout={measureCol(i)}>
                      {d.cycling ? (
                        <DraggableSession enabled={d.cycling.status !== "rest"} onSelect={() => setSelected(i)} onDrop={onDrop("cycling", i)}>
                          <TrainingSessionCard s={d.cycling} selected={i === selected} />
                        </DraggableSession>
                      ) : <EmptySlot onPress={() => showToast("Add session")} />}
                    </View>
                  ))}
                </GridRow>

                {/* fb50 row */}
                <GridRow icon="barbell-outline" label={"STRENGTH\n& MOBILITY"} color={CC.yellow}>
                  {days.map((d, i) => (
                    <View key={d.date} style={[styles.col, i === selected && styles.colSel]}>
                      {d.fb50 ? (
                        <DraggableSession onSelect={() => setSelected(i)} onDrop={onDrop("fb50", i)}>
                          <FB50SessionCard s={d.fb50} />
                        </DraggableSession>
                      ) : <EmptySlot onPress={() => showToast("Plan FB50 session")} />}
                    </View>
                  ))}
                </GridRow>

                {/* wellness row */}
                <GridRow icon="flower-outline" label={"RECOVERY &\nWELLNESS"} color={CC.purple}>
                  {days.map((d, i) => (
                    <View key={d.date} style={[styles.col, i === selected && styles.colSel]}>
                      {d.wellness ? (
                        <DraggableSession onSelect={() => setSelected(i)} onDrop={onDrop("wellness", i)}>
                          <WellnessSessionCard s={d.wellness} />
                        </DraggableSession>
                      ) : <EmptySlot onPress={() => showToast("Add recovery activity")} />}
                    </View>
                  ))}
                </GridRow>

                {/* readiness row */}
                <GridRow icon="heart" label={"DAY\nREADINESS"} color={CC.rouge}>
                  {days.map((d, i) => (
                    <Pressable key={d.date} testID={`readiness-${i}`} onPress={() => setSelected(i)} style={[styles.col, i === selected && styles.colSel]}>
                      <ReadinessRing score={d.readiness.score} status={d.readiness.status} />
                    </Pressable>
                  ))}
                </GridRow>

                {week ? <View style={{ marginTop: 12 }}><CalendarTipFooter tip={week.tip} /></View> : null}
              </View>

              {/* right panel */}
              <View style={styles.rightCol}>
                {selDay ? <SelectedDayPanel day={selDay} onPrev={() => setSelected((s) => (s + 6) % 7)} onMenu={() => showToast("Session options")} onViewWorkout={() => router.push("/workout")} /> : null}
                {week ? <WeekSummaryCard summary={week.summary} /> : null}
                <QuickActionsCard onAction={onQuickAction} />
              </View>
            </View>

            {loading && !week ? <Text style={styles.loading}>Loading your week…</Text> : null}
          </ScrollView>
        </View>

        {/* filters modal */}
        <Modal visible={showFilters} transparent animationType="fade" onRequestClose={() => setShowFilters(false)}>
          <Pressable style={styles.modalBg} onPress={() => setShowFilters(false)}>
            <Pressable style={styles.filterSheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>Filter sessions</Text>
              {FILTERS.map((f) => (
                <Pressable key={f} testID={`filter-${f}`} onPress={() => { setFilter(f); setShowFilters(false); showToast(`Filter: ${f}`); }}
                  style={({ hovered }: any) => [styles.filterRow, hovered && { backgroundColor: "rgba(255,255,255,0.05)" }]}>
                  <Text style={[styles.filterRowText, filter === f && { color: CC.yellow, fontWeight: "800" }]}>{f}</Text>
                  {filter === f ? <Ionicons name="checkmark" size={16} color={CC.yellow} /> : null}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Alberto review dialog */}
        <Modal visible={!!review} transparent animationType="fade" onRequestClose={() => setReview(null)}>
          <Pressable style={styles.modalBg} onPress={() => !review?.loading && setReview(null)}>
            <Pressable style={styles.reviewSheet} onPress={() => {}}>
              <View style={styles.reviewHead}>
                <Ionicons name="chatbubble-ellipses" size={18} color={CC.rouge} />
                <Text style={styles.reviewTitle}>{persona.name} is reviewing your change</Text>
              </View>
              <Text style={styles.reviewMsg}>{review?.loading ? "Checking recovery spacing and load…" : review?.message}</Text>
              <View style={styles.reviewBtns}>
                <Pressable testID="review-cancel" onPress={() => setReview(null)} disabled={review?.loading} style={({ hovered }: any) => [styles.reviewCancel, hovered && styles.hover]}>
                  <Text style={styles.reviewCancelText}>Cancel</Text>
                </Pressable>
                <Pressable testID="review-confirm" onPress={() => review?.confirm()} disabled={review?.loading} style={[styles.reviewConfirm, review?.loading && { opacity: 0.5 }]}>
                  <Text style={styles.reviewConfirmText}>Confirm move</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Toast message={toast} onUndo={() => { toast?.undo?.(); setToast(null); }} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function GridRow({ icon, label, color, children }: { icon: any; label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.gridRow}>
      <View style={{ width: LABEL_W }}><RowLabel icon={icon} label={label} color={color} /></View>
      {children}
    </View>
  );
}

function EmptySlot({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="Add session" style={({ hovered }: any) => [styles.empty, hovered && { borderColor: CC.border }]}>
      <Ionicons name="add" size={18} color={CC.dim} />
    </Pressable>
  );
}

const dayName = (abbr: string) => (
  { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" } as Record<string, string>
)[abbr] ?? abbr;

const styles = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: CC.bg },
  content: { paddingHorizontal: 20, paddingVertical: 16, gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  title: { color: CC.white, fontSize: 30, fontWeight: "800" },
  subtitle: { color: CC.dim, fontSize: 13, marginTop: 4 },

  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(201,23,39,0.14)", borderWidth: 1, borderColor: "rgba(201,23,39,0.4)", borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, marginTop: 6 },
  filterChipText: { color: CC.white, fontSize: 12, fontWeight: "700" },

  mainRow: { flexDirection: "row", gap: 16, marginTop: 8, alignItems: "flex-start" },
  gridWrap: { flex: 1 },
  gridRow: { flexDirection: "row", gap: 8, borderBottomWidth: 1, borderBottomColor: CC.borderSoft, paddingVertical: 4 },
  col: { flex: 1, paddingHorizontal: 1 },
  colSel: { backgroundColor: "rgba(201,23,39,0.05)", borderRadius: 8 },

  rightCol: { width: 300, gap: 14 },

  empty: { minHeight: 60, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: CC.borderSoft, alignItems: "center", justifyContent: "center", marginVertical: 8 },

  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 20 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  filterSheet: { width: 320, backgroundColor: CC.cardHi, borderRadius: 18, borderWidth: 1, borderColor: CC.border, padding: 16 },
  sheetTitle: { color: CC.white, fontSize: 16, fontWeight: "800", marginBottom: 10 },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, minHeight: 44 },
  filterRowText: { color: CC.white, fontSize: 14, fontWeight: "600" },

  reviewSheet: { width: 420, maxWidth: "100%", backgroundColor: CC.cardHi, borderRadius: 18, borderWidth: 1, borderColor: CC.border, padding: 20 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
  reviewTitle: { color: CC.white, fontSize: 15, fontWeight: "800" },
  reviewMsg: { color: CC.white, fontSize: 14, lineHeight: 21, minHeight: 42 },
  reviewBtns: { flexDirection: "row", gap: 12, marginTop: 18, justifyContent: "flex-end" },
  reviewCancel: { borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  reviewCancelText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  reviewConfirm: { backgroundColor: CC.rouge, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  reviewConfirmText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },

  toast: { position: "absolute", bottom: 30, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
  undoText: { color: CC.yellow, fontSize: 13, fontWeight: "800" },
});
