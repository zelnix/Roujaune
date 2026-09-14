import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, Pressable, useWindowDimensions, Modal, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { useCoach } from "@/src/lib/coach-persona";
import {
  useCalendarWeek, moveSession, requestAlbertoReview, completeSupplementary, CalendarDay, SessionType, FILTERS,
} from "@/src/lib/calendar";
import {
  CC, DateControls, RowLabel, DayHeader, FocusCell, TrainingSessionCard, FB50SessionCard,
  WellnessSessionCard, ReadinessRing, SelectedDayPanel, WeekSummaryCard, QuickActionsCard,
  CalendarTipFooter, DraggableSession, ReadinessDetail, ScheduledSessionCard,
} from "@/src/components/calendar";
import { unscheduleWorkout } from "@/src/lib/workout-prefs";
import { HeaderStatus } from "@/src/components/HeaderStatus";
import { SwapSessionSheet } from "@/src/components/SwapSessionSheet";
import { swapSession } from "@/src/lib/plan-create";

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

const shiftISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CalendarScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { width } = useWindowDimensions();
  const compact = width < 720; // phones scroll a stacked view
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/plan"));
  const params = useLocalSearchParams<{ date?: string }>();
  const [focusDate, setFocusDate] = React.useState<string | undefined>(
    typeof params.date === "string" ? params.date : undefined
  );
  const { week, setWeek, loading, reload } = useCalendarWeek(focusDate);

  // Keep focus in sync when navigated here with a new ?date=
  React.useEffect(() => {
    if (typeof params.date === "string" && params.date && params.date !== focusDate) {
      setFocusDate(params.date);
    }
  }, [params.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = React.useState(1); // Tuesday
  const [dayModalIdx, setDayModalIdx] = React.useState<number | null>(null);
  const autoOpenedFor = React.useRef<string | null>(null);

  // Focus the requested day once the week loads (falls back to the week's own
  // selected day, then Tuesday).
  React.useEffect(() => {
    const dd = week?.days ?? [];
    if (!dd.length) return;
    const target = focusDate || week?.selected_date;
    let idx = dd.findIndex((d) => d.date === target);
    if (idx < 0) idx = dd.findIndex((d) => d.date === week?.selected_date);
    setSelected(idx >= 0 ? idx : 1);
  }, [week, focusDate]);

  // Arriving via a day tap (?date=) auto-opens that day's detail once.
  React.useEffect(() => {
    const dd = week?.days ?? [];
    const p = typeof params.date === "string" ? params.date : null;
    if (!p || !dd.length || autoOpenedFor.current === p) return;
    const idx = dd.findIndex((d) => d.date === p);
    if (idx >= 0) { autoOpenedFor.current = p; setDayModalIdx(idx); }
  }, [week, params.date]);
  const [toast, setToast] = React.useState<{ id: number; text: string; undo?: () => void } | null>(null);
  const [filter, setFilter] = React.useState("All");
  const [showFilters, setShowFilters] = React.useState(false);
  const [review, setReview] = React.useState<null | { message: string; loading: boolean; confirm: () => void }>(null);
  const [readyDay, setReadyDay] = React.useState<number | null>(null);
  const [swapOpen, setSwapOpen] = React.useState(false);

  const colCenters = React.useRef<number[]>([]);
  const showToast = React.useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), []);

  const days = React.useMemo<CalendarDay[]>(() => week?.days ?? [], [week]);
  const selDay: CalendarDay | undefined = days[selected];

  const swapCyc = selDay?.cycling as any;
  const swapPlanId = typeof swapCyc?.workout_id === "string" && swapCyc.workout_id.startsWith("custom-")
    ? String(swapCyc.workout_id).split("-ride-")[0] : null;

  // Route to the workout library, pre-filtered by type and targeting a day so
  // the picked session is scheduled straight onto that date.
  const goSchedule = React.useCallback((type?: string, dateISO?: string) => {
    const p: Record<string, string> = {};
    if (type) p.type = type;
    const d = dateISO || selDay?.date;
    if (d) p.date = d;
    router.push({ pathname: "/workout-list", params: p } as any);
  }, [router, selDay]);

  const openSwap = React.useCallback(() => {
    if (swapPlanId) setSwapOpen(true);
    else goSchedule();
  }, [swapPlanId, goSchedule]);

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

  const onQuickAction = (id: string, _title: string) => {
    if (id === "reschedule") { openSwap(); return; }
    if (id === "recovery") { goSchedule("recovery"); return; }
    if (id === "fb50") { goSchedule("fb50"); return; }
    goSchedule(); // "add" → any workout onto the selected day
  };

  const onToggleSupp = React.useCallback(async (session: any, kind: string) => {
    if (!selDay) return;
    const done = await completeSupplementary(kind, session.title, selDay.date);
    if (done === null) { showToast("Couldn't update — try again"); return; }
    reload();
    showToast(done ? `${session.title} marked done` : `${session.title} un-marked`);
  }, [selDay, reload, showToast]);

  if (compact) {
    // Phones: keep tablet intent but stacked & scrollable.
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
        <StatusBar hidden />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
            <View style={styles.headerRow}>
              <Pressable testID="calendar-back" onPress={goBack} accessibilityLabel="Go back" hitSlop={10} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={CC.white} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Calendar</Text>
                <Text style={styles.subtitle}>Plan your week. Execute your day.</Text>
              </View>
            </View>
            {selDay ? <SelectedDayPanel day={selDay} onPrev={() => setSelected((s) => (s + 6) % 7)} onMenu={openSwap} onViewWorkout={() => router.push(selDay?.cycling?.workout_id || selDay?.cycling?.title ? { pathname: "/training", params: { workoutId: selDay?.cycling?.workout_id ?? "", title: selDay?.cycling?.title, duration: selDay?.cycling?.duration, zone: selDay?.cycling?.zone, tss: selDay?.cycling?.tss } } : "/training")} /> : null}
            {selDay ? <SupplementaryCompleteCard day={selDay} onToggle={onToggleSupp} /> : null}
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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* header */}
            <View style={styles.headerRow}>
              <Pressable
                testID="calendar-back"
                onPress={goBack}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={10}
                style={({ hovered }: any) => [styles.backBtn, hovered && styles.hover]}
              >
                <Ionicons name="chevron-back" size={22} color={CC.white} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Calendar</Text>
                <Text style={styles.subtitle}>Plan your week. Execute your day.</Text>
              </View>
              <HeaderStatus />
            </View>

            <DateControls
              rangeLabel={week?.range_label ?? "12 – 18 May 2025"}
              onPrev={() => week && setFocusDate(shiftISO(week.start_date, -7))}
              onNext={() => week && setFocusDate(shiftISO(week.start_date, 7))}
              onToday={() => setFocusDate(todayISO())}
              onFilters={() => setShowFilters(true)}
              onWeek={() => {}}
              onSettings={() => router.push("/settings")}
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
                    <Pressable
                      key={d.date}
                      testID={`day-head-${i}`}
                      onPress={() => {
                        setSelected(i);
                        const cyc = d.cycling;
                        const isRestRide = cyc && (cyc.status === "rest" || (!cyc.workout_id && !cyc.duration));
                        if (cyc && !isRestRide && (cyc.workout_id || cyc.title)) {
                          router.push({ pathname: "/training", params: { workoutId: cyc.workout_id ?? "", title: cyc.title, duration: cyc.duration, zone: cyc.zone, tss: cyc.tss } } as any);
                        } else {
                          setDayModalIdx(i);
                        }
                      }}
                      style={styles.col}
                    >
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
                      ) : <EmptySlot onPress={() => goSchedule(undefined, d.date)} />}
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
                      ) : <EmptySlot onPress={() => goSchedule("fb50", d.date)} />}
                    </View>
                  ))}
                </GridRow>

                {/* recovery row */}
                <GridRow icon="bicycle-outline" label={"RECOVERY"} color={CC.purple}>
                  {days.map((d, i) => (
                    <View key={d.date} style={[styles.col, i === selected && styles.colSel]}>
                      {d.wellness ? (
                        <DraggableSession onSelect={() => setSelected(i)} onDrop={onDrop("wellness", i)}>
                          <WellnessSessionCard s={d.wellness} />
                        </DraggableSession>
                      ) : <EmptySlot onPress={() => goSchedule("recovery", d.date)} />}
                    </View>
                  ))}
                </GridRow>

                {/* rider-scheduled workouts row */}
                <GridRow icon="add-circle-outline" label={"SCHEDULED\nBY YOU"} color={CC.greenyellow}>
                  {days.map((d, i) => (
                    <View key={d.date} style={[styles.col, i === selected && styles.colSel, { gap: 6 }]}>
                      {(d.scheduled ?? []).length > 0
                        ? (d.scheduled ?? []).map((w) => (
                            <ScheduledSessionCard key={w.id} w={w} onRemove={async () => { await unscheduleWorkout(w.id); reload(); showToast(`Removed ${w.title}`); }} />
                          ))
                        : <EmptySlot onPress={() => goSchedule(undefined, d.date)} />}
                    </View>
                  ))}
                </GridRow>

                {/* readiness row */}
                <GridRow icon="heart" label={"DAY\nREADINESS"} color={CC.rouge}>
                  {days.map((d, i) => (
                    <Pressable key={d.date} testID={`readiness-${i}`} onPress={() => { setSelected(i); setReadyDay(i); }} style={[styles.col, i === selected && styles.colSel]}>
                      {d.readiness ? <ReadinessRing score={d.readiness.score} status={d.readiness.status} /> : <View style={{ height: 44 }} />}
                    </Pressable>
                  ))}
                </GridRow>

                {week ? <View style={{ marginTop: 12 }}><CalendarTipFooter tip={week.tip} /></View> : null}
              </View>

              {/* right panel */}
              <View style={styles.rightCol}>
                {selDay ? <SelectedDayPanel day={selDay} onPrev={() => setSelected((s) => (s + 6) % 7)} onMenu={openSwap} onViewWorkout={() => router.push(selDay?.cycling?.workout_id || selDay?.cycling?.title ? { pathname: "/training", params: { workoutId: selDay?.cycling?.workout_id ?? "", title: selDay?.cycling?.title, duration: selDay?.cycling?.duration, zone: selDay?.cycling?.zone, tss: selDay?.cycling?.tss } } : "/training")} /> : null}
                {selDay ? <SupplementaryCompleteCard day={selDay} onToggle={onToggleSupp} /> : null}
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

        {/* day detail — the workouts scheduled for a tapped day */}
        <Modal visible={dayModalIdx !== null} transparent animationType="fade" onRequestClose={() => setDayModalIdx(null)}>
          <Pressable style={styles.modalBg} onPress={() => setDayModalIdx(null)}>
            <Pressable style={styles.daySheet} onPress={() => {}}>
              {dayModalIdx !== null && days[dayModalIdx] ? (
                <DayDetail
                  day={days[dayModalIdx]}
                  onClose={() => setDayModalIdx(null)}
                  onViewCycling={() => {
                    const cyc = days[dayModalIdx]?.cycling;
                    setDayModalIdx(null);
                    router.push(cyc?.workout_id || cyc?.title
                      ? { pathname: "/training", params: { workoutId: cyc?.workout_id ?? "", title: cyc?.title, duration: cyc?.duration, zone: cyc?.zone, tss: cyc?.tss } } as any
                      : "/training");
                  }}
                  onViewScheduled={(w) => {
                    setDayModalIdx(null);
                    router.push(w.workout_id || w.title
                      ? { pathname: "/training", params: { workoutId: w.workout_id ?? "", title: w.title, duration: w.duration, zone: w.zone, tss: w.tss } } as any
                      : "/workouts");
                  }}
                  onAdd={() => { const d = days[dayModalIdx]?.date; setDayModalIdx(null); goSchedule(undefined, d); }}
                />
              ) : null}
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

        {/* readiness detail popover */}
        <Modal visible={readyDay !== null} transparent animationType="fade" onRequestClose={() => setReadyDay(null)}>
          <Pressable style={styles.modalBg} onPress={() => setReadyDay(null)}>
            <Pressable style={styles.readySheet} onPress={() => {}}>
              {readyDay !== null && days[readyDay] ? (
                <ReadinessDetail dayLabel={`${dayName(days[readyDay].day_name).toUpperCase()}, ${days[readyDay].day_num}`} readiness={days[readyDay].readiness} />
              ) : null}
              <Pressable testID="readiness-close" onPress={() => setReadyDay(null)} style={({ hovered }: any) => [styles.readyClose, hovered && styles.hover]}>
                <Text style={styles.reviewCancelText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Toast message={toast} onUndo={() => { toast?.undo?.(); setToast(null); }} />

        <SwapSessionSheet
          visible={swapOpen}
          onClose={() => setSwapOpen(false)}
          day={swapCyc ? { day_name: selDay?.day_name, title: swapCyc.title, zone: swapCyc.zone, duration: swapCyc.duration, tss: swapCyc.tss, workout_id: swapCyc.workout_id } : null}
          coachName={persona.name}
          coachGender={persona.gender}
          planId={swapPlanId ?? undefined}
          onSwapped={(_nd, orig) => {
            reload();
            showToast("Session updated by " + persona.name, async () => {
              const wid: string | undefined = (orig as any)?.workout_id;
              const pid = wid && wid.startsWith("custom-") ? wid.split("-ride-")[0] : undefined;
              try { await swapSession({ day: { workout_id: wid }, mode: "easier", coachName: persona.name, planId: pid, override: orig as any }); reload(); showToast("Reverted to the original session"); }
              catch { showToast("Couldn't undo — please try again"); }
            });
          }}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function DayDetail({ day, onClose, onViewCycling, onViewScheduled, onAdd }: {
  day: CalendarDay;
  onClose: () => void;
  onViewCycling: () => void;
  onViewScheduled: (w: any) => void;
  onAdd: () => void;
}) {
  const isRestRide = day.cycling && (day.cycling.status === "rest" || (!day.cycling.workout_id && !day.cycling.duration));
  const scheduled = day.scheduled ?? [];
  const hasAny = !!(day.cycling || day.fb50 || day.wellness || scheduled.length);

  const StatusPill = ({ status }: { status?: string }) => {
    const label = status === "completed" ? "Completed" : status === "today" ? "Today" : status === "rest" ? "Rest" : "Planned";
    const col = status === "completed" ? CC.green : status === "today" ? CC.yellow : CC.dim;
    return <View style={[styles.ddPill, { borderColor: col }]}><Text style={[styles.ddPillText, { color: col }]}>{label}</Text></View>;
  };

  return (
    <View testID="day-detail">
      <View style={styles.ddHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ddTitle}>{dayName(day.day_name)}</Text>
          <Text style={styles.ddSub}>{day.day_num}{day.focus ? ` · ${day.focus}` : ""}</Text>
        </View>
        <Pressable testID="day-detail-close" onPress={onClose} hitSlop={8} style={styles.ddClose}>
          <Ionicons name="close" size={20} color={CC.white} />
        </Pressable>
      </View>

      {!hasAny ? (
        <View style={styles.ddEmpty}>
          <Ionicons name="bed-outline" size={26} color={CC.dim} />
          <Text style={styles.ddEmptyText}>No workouts scheduled this day.</Text>
        </View>
      ) : null}

      {day.cycling ? (
        <View style={styles.ddCard} testID="day-detail-cycling">
          <View style={styles.ddCardHead}>
            <Ionicons name={isRestRide ? "bed-outline" : "bicycle"} size={18} color={isRestRide ? CC.purple : CC.yellow} />
            <Text style={styles.ddCardTitle} numberOfLines={2}>{day.cycling.title}</Text>
            <StatusPill status={day.cycling.status} />
          </View>
          {!isRestRide ? (
            <>
              <View style={styles.ddMeta}>
                {day.cycling.duration ? <Text style={styles.ddMetaText}>{day.cycling.duration}</Text> : null}
                {day.cycling.zone ? <Text style={styles.ddMetaText}>· {day.cycling.zone}</Text> : null}
                {day.cycling.tss ? <Text style={styles.ddMetaText}>· {day.cycling.tss}</Text> : null}
              </View>
              <Pressable testID="day-detail-view" onPress={onViewCycling} style={({ hovered }: any) => [styles.ddBtn, hovered && styles.hover]}>
                <Ionicons name="play" size={15} color="#241B00" />
                <Text style={styles.ddBtnText}>View workout</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.ddRestText}>Rest & recovery — no ride today.</Text>
          )}
        </View>
      ) : null}

      {[day.fb50, day.wellness].filter(Boolean).map((s: any, i) => (
        <View key={`supp-${i}`} style={styles.ddCard} testID={`day-detail-supp-${i}`}>
          <View style={styles.ddCardHead}>
            <Ionicons name={s.type === "wellness" ? "leaf-outline" : "barbell-outline"} size={18} color={s.type === "wellness" ? CC.green : CC.amber} />
            <Text style={styles.ddCardTitle} numberOfLines={2}>{s.title}</Text>
            <StatusPill status={s.status} />
          </View>
          <View style={styles.ddMeta}>
            <Text style={styles.ddMetaText}>{s.duration || "Session"}{s.category ? ` · ${s.category}` : ""}</Text>
          </View>
        </View>
      ))}

      {scheduled.map((w) => (
        <View key={w.id} style={styles.ddCard} testID={`day-detail-scheduled-${w.id}`}>
          <View style={styles.ddCardHead}>
            <Ionicons name="add-circle-outline" size={18} color={CC.greenyellow} />
            <Text style={styles.ddCardTitle} numberOfLines={2}>{w.title}</Text>
            <StatusPill status={w.status} />
          </View>
          <View style={styles.ddMeta}>
            {w.duration ? <Text style={styles.ddMetaText}>{w.duration}</Text> : null}
            {w.zone ? <Text style={styles.ddMetaText}>· {w.zone}</Text> : null}
            {w.tss ? <Text style={styles.ddMetaText}>· {w.tss}</Text> : null}
          </View>
          <Pressable testID={`day-detail-view-sched-${w.id}`} onPress={() => onViewScheduled(w)} style={({ hovered }: any) => [styles.ddBtn, hovered && styles.hover]}>
            <Ionicons name="play" size={15} color="#241B00" />
            <Text style={styles.ddBtnText}>View workout</Text>
          </Pressable>
        </View>
      ))}

      <Pressable testID="day-detail-add" onPress={onAdd} style={({ hovered }: any) => [styles.ddAdd, hovered && styles.hover]}>
        <Ionicons name="add" size={17} color={CC.yellow} />
        <Text style={styles.ddAddText}>Add a workout to this day</Text>
      </Pressable>
    </View>
  );
}


function SupplementaryCompleteCard({ day, onToggle }: { day: CalendarDay; onToggle: (session: any, kind: string) => void }) {
  const items: { s: any; kind: string }[] = [];
  if (day.fb50) items.push({ s: day.fb50, kind: ((day.fb50 as any).category || "strength").toLowerCase() });
  if (day.wellness) items.push({ s: day.wellness, kind: "recovery" });
  if (!items.length) return null;
  return (
    <View style={styles.suppCard} testID="supplementary-complete-card">
      <Text style={styles.suppLabel}>SUPPLEMENTARY</Text>
      {items.map((it) => {
        const done = it.s.status === "completed";
        return (
          <Pressable
            key={it.kind}
            testID={`supp-toggle-${it.kind}`}
            onPress={() => onToggle(it.s, it.kind)}
            style={({ hovered }: any) => [styles.suppRow, hovered && styles.hover]}
          >
            <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={22} color={done ? CC.green : CC.dim} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.suppName, done && { color: CC.green }]} numberOfLines={1}>{it.s.title}</Text>
              <Text style={styles.suppMeta}>{it.s.duration || "Session"}{done ? " · Completed" : " · Tap to mark done"}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
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
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-start", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border },
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
  readySheet: { width: 380, maxWidth: "100%", backgroundColor: CC.cardHi, borderRadius: 18, borderWidth: 1, borderColor: CC.border, padding: 20 },
  readyClose: { marginTop: 18, borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 11, alignItems: "center", minHeight: 44, justifyContent: "center" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },

  toast: { position: "absolute", bottom: 30, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
  undoText: { color: CC.yellow, fontSize: 13, fontWeight: "800" },

  suppCard: { backgroundColor: CC.card, borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 14, padding: 14, gap: 8 },
  suppLabel: { color: CC.dim, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  suppRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderRadius: 8, minHeight: 44 },
  suppName: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
  suppMeta: { color: CC.dim, fontSize: 11.5, fontWeight: "500", marginTop: 1 },

  daySheet: { width: 460, maxWidth: "100%", backgroundColor: CC.cardHi, borderRadius: 18, borderWidth: 1, borderColor: CC.border, padding: 18, gap: 12 },
  ddHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  ddTitle: { color: CC.white, fontSize: 20, fontWeight: "800" },
  ddSub: { color: CC.dim, fontSize: 13, fontWeight: "600", marginTop: 3 },
  ddClose: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  ddEmpty: { alignItems: "center", gap: 8, paddingVertical: 22, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft },
  ddEmptyText: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  ddCard: { backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border, borderRadius: 14, padding: 14, gap: 10 },
  ddCardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  ddCardTitle: { color: CC.white, fontSize: 15, fontWeight: "800", flex: 1 },
  ddPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  ddPillText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },
  ddMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ddMetaText: { color: CC.dim, fontSize: 12.5, fontWeight: "600" },
  ddBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: CC.yellow, borderRadius: 11, paddingVertical: 11, minHeight: 44 },
  ddBtnText: { color: "#241B00", fontSize: 13.5, fontWeight: "800" },
  ddRestText: { color: CC.dim, fontSize: 13, lineHeight: 18 },
  ddAdd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: CC.border, borderRadius: 12, paddingVertical: 12, minHeight: 46 },
  ddAddText: { color: CC.yellow, fontSize: 13.5, fontWeight: "700" },
});
