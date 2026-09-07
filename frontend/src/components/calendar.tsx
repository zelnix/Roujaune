import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IoniconName } from "@/src/lib/icon-types";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Rect, Circle } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import { CoachPersona, useCoach } from "../lib/coach-persona";
import { CalendarDay, CalendarSession, ZoneBar, STATUS_LABEL, Readiness, ScheduledWorkout } from "../lib/calendar";
/* palette (extends the plan palette with recovery hues) */
export const CC = {
  bg: "#050606", nav: "#080909", card: "#101211", cardHi: "#151716",
  deepRouge: "#86121B", rouge: "#C91727", yellow: "#FFC20A",
  white: "#F3F1EA", dim: "#A7A8A5", green: "#55C850",
  purple: "#A65AE2", blue: "#40A9C6", amber: "#F0A500", orange: "#E8631C",
  greenyellow: "#9BD84B",
  border: "rgba(255,255,255,0.11)", borderSoft: "rgba(255,255,255,0.06)",
};

const COLOR: Record<string, string> = {
  green: CC.green, rouge: CC.rouge, blue: CC.blue, amber: CC.amber,
  purple: CC.purple, yellow: CC.yellow, orange: CC.orange, greenyellow: CC.greenyellow,
};
export const colorOf = (k?: string) => COLOR[k ?? "green"] ?? CC.green;

/* ── status indicator (colour + shape, never colour-only) ───────────────── */
export function SessionStatusIndicator({ status }: { status: string }) {
  const label = STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? "Planned";
  if (status === "completed") {
    return <View style={cs.statDone} accessibilityLabel={label}><Ionicons name="checkmark" size={11} color="#04210F" /></View>;
  }
  if (status === "today" || status === "scheduled") {
    return <View style={cs.statScheduled} accessibilityLabel={label} />;
  }
  if (status === "rescheduled") {
    return <View style={cs.statMoved} accessibilityLabel={label}><Ionicons name="swap-horizontal" size={9} color={CC.dim} /></View>;
  }
  return <View style={cs.statTodo} accessibilityLabel={label} />;
}

/* ── draggable wrapper (long-press to pick up, tap to select) ───────────── */
export function DraggableSession({
  children, onSelect, onDrop, enabled = true,
}: {
  children: React.ReactNode; onSelect: () => void;
  onDrop: (dx: number, dy: number) => void; enabled?: boolean;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragging = useSharedValue(0);

  const tap = Gesture.Tap().maxDuration(250).onEnd(() => { runOnJS(onSelect)(); });
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(240)
    .onStart(() => { dragging.value = 1; })
    .onUpdate((e) => { tx.value = e.translationX; ty.value = e.translationY; })
    .onEnd((e) => {
      runOnJS(onDrop)(e.translationX, e.translationY);
      tx.value = withSpring(0); ty.value = withSpring(0); dragging.value = 0;
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: dragging.value ? 1.05 : 1 }],
    zIndex: dragging.value ? 50 : 1,
    opacity: dragging.value ? 0.94 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}

/* ── row label ──────────────────────────────────────────────────────────── */
export function RowLabel({ icon, label, color }: { icon: IoniconName; label: string; color: string }) {
  return (
    <View style={cs.rowLabel}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[cs.rowLabelText, { color }]}>{label}</Text>
    </View>
  );
}

/* ── day column header ──────────────────────────────────────────────────── */
export function DayHeader({ day, selected }: { day: CalendarDay; selected: boolean }) {
  if (selected) {
    return (
      <View style={cs.dayHeadSel} accessibilityLabel={`${day.day_name} ${day.day_num}, selected`}>
        <View style={cs.dayBadge}>
          <Text style={cs.dayBadgeName}>{day.day_name}</Text>
          <Text style={cs.dayBadgeNum}>{day.day_num.replace(" MAY", "")}</Text>
        </View>
        <Text style={cs.dayHeadNum}>{day.day_num}</Text>
      </View>
    );
  }
  return (
    <View style={cs.dayHead} accessibilityLabel={`${day.day_name} ${day.day_num}`}>
      <Text style={cs.dayName}>{day.day_name}</Text>
      <Text style={cs.dayNum}>{day.day_num}</Text>
    </View>
  );
}

/* ── focus cell ─────────────────────────────────────────────────────────── */
export function FocusCell({ text }: { text: string }) {
  return <View style={cs.focusCell}><Text style={cs.focusText}>{text}</Text></View>;
}

/* ── cycling session card ───────────────────────────────────────────────── */
export function TrainingSessionCard({ s, selected }: { s: CalendarSession; selected?: boolean }) {
  const col = colorOf(s.color);
  const rest = s.status === "rest";
  return (
    <View style={[cs.card, { borderColor: col }, selected && cs.cardSel]} testID={`training-${s.id}`}>
      {selected && <View style={[cs.cardGlow, { borderColor: CC.yellow, pointerEvents: "none" }]} />}
      <View style={cs.cardHead}>
        <Ionicons name={rest ? "bed-outline" : "bicycle"} size={15} color={col} />
      </View>
      <Text style={cs.cardTitle} numberOfLines={2}>{s.title}</Text>
      {rest ? (
        <Text style={cs.cardSub}>{s.subtitle}</Text>
      ) : (
        <>
          <Text style={cs.cardMeta}>{s.duration}</Text>
          <Text style={cs.cardMeta}>{s.zone}</Text>
          <Text style={cs.cardMeta}>{s.tss}</Text>
        </>
      )}
      <View style={cs.cardStatus}><SessionStatusIndicator status={s.status} /></View>
    </View>
  );
}

/* ── FB50 card ──────────────────────────────────────────────────────────── */
export function FB50SessionCard({ s }: { s: CalendarSession }) {
  const recovery = s.category === "Recovery";
  const col = recovery ? CC.blue : CC.purple;
  return (
    <View style={[cs.card, { borderColor: col }]} testID={`fb50-${s.id}`}>
      <View style={cs.cardHead}>
        <Ionicons name={recovery ? "walk-outline" : "barbell-outline"} size={15} color={col} />
        {!recovery && <Text style={[cs.fb50Tag, { color: col }]}>FB50</Text>}
      </View>
      <Text style={cs.cardTitle} numberOfLines={2}>{s.title}</Text>
      <Text style={cs.cardMeta}>{s.duration}</Text>
      <View style={cs.cardStatus}><SessionStatusIndicator status={s.status} /></View>
    </View>
  );
}

/* ── wellness card ──────────────────────────────────────────────────────── */
export function WellnessSessionCard({ s }: { s: CalendarSession }) {
  const col = s.checkin ? CC.blue : CC.purple;
  return (
    <View style={[cs.card, { borderColor: col }]} testID={`wellness-${s.id}`}>
      <View style={cs.cardHead}>
        <Ionicons name={s.checkin ? "sync-circle-outline" : "flower-outline"} size={15} color={col} />
      </View>
      {s.brand ? <Text style={cs.wellBrand} numberOfLines={1}>{s.brand}</Text> : null}
      <Text style={cs.cardTitle} numberOfLines={2}>{s.title}</Text>
      <Text style={cs.cardMeta}>{s.duration}</Text>
      <View style={cs.cardStatus}><SessionStatusIndicator status={s.status} /></View>
    </View>
  );
}

/** A rider-scheduled catalog workout shown on its calendar day. */
export function ScheduledSessionCard({ w, onRemove }: { w: ScheduledWorkout; onRemove?: () => void }) {
  const col = w.color && w.color.startsWith("#") ? w.color : CC.yellow;
  return (
    <View style={[cs.card, { borderColor: col }]} testID={`scheduled-${w.id}`}>
      <View style={cs.cardHead}>
        <Ionicons name="bicycle" size={15} color={col} />
        {onRemove ? (
          <Pressable testID={`scheduled-remove-${w.id}`} onPress={onRemove} hitSlop={8}>
            <Ionicons name="close" size={13} color={CC.dim} />
          </Pressable>
        ) : null}
      </View>
      <Text style={cs.cardTitle} numberOfLines={2}>{w.title}</Text>
      <Text style={cs.cardMeta} numberOfLines={1}>{[w.duration, w.tss].filter(Boolean).join(" · ")}</Text>
      <View style={cs.cardStatus}><SessionStatusIndicator status="scheduled" /></View>
    </View>
  );
}


/* ── readiness ring ─────────────────────────────────────────────────────── */
export function ReadinessRing({ score, status }: { score: number; status: string }) {
  const ringCol = status === "Moderate" ? (score < 66 ? CC.yellow : CC.greenyellow) : CC.green;
  const size = 58; const stroke = 5; const r = (size - stroke) / 2; const c = size / 2;
  const circ = 2 * Math.PI * r; const dash = (score / 100) * circ;
  return (
    <View style={cs.readyCell}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
        accessibilityLabel={`Readiness ${score}, ${status}`}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={c} cy={c} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
          <Circle cx={c} cy={c} r={r} stroke={ringCol} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
        </Svg>
        <View style={cs.readyInner}>
          <Text style={cs.readyScore}>{score}</Text>
          <Text style={cs.readyStatus}>{status}</Text>
        </View>
      </View>
      {status === "Moderate" && <Text style={[cs.readyMod, { color: ringCol }]}>Moderate</Text>}
    </View>
  );
}

/* ── readiness detail (popover content) ─────────────────────────────────── */
export function ReadinessDetail({ dayLabel, readiness }: { dayLabel: string; readiness: Readiness }) {
  const ringCol = readiness.status === "Moderate" ? (readiness.score < 66 ? CC.yellow : CC.greenyellow) : CC.green;
  const barCol = (v: number) => (v >= 75 ? CC.green : v >= 60 ? CC.greenyellow : v >= 45 ? CC.yellow : CC.orange);
  return (
    <View testID="readiness-detail">
      <Text style={cs.rdDay}>{dayLabel}</Text>
      <View style={cs.rdTop}>
        <View style={[cs.rdScoreRing, { borderColor: ringCol }]}>
          <Text style={cs.rdScore}>{readiness.score}</Text>
          <Text style={[cs.rdStatus, { color: ringCol }]}>{readiness.status}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cs.rdHeading}>Daily Readiness</Text>
          <Text style={cs.rdSource}>
            <Ionicons name="watch-outline" size={11} color={CC.dim} /> {readiness.source ?? "Wearable"}
          </Text>
        </View>
      </View>
      <View style={cs.rdMetrics}>
        {(readiness.metrics ?? []).map((m) => (
          <View key={m.key} style={cs.rdRow}>
            <Text style={cs.rdLabel}>{m.label}</Text>
            <View style={cs.rdTrack}><View style={[cs.rdFill, { width: `${m.value}%`, backgroundColor: barCol(m.value) }]} /></View>
            <Text style={cs.rdValue}>{m.display}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── selected day panel ─────────────────────────────────────────────────── */
function IntervalProfile({ bars, color }: { bars: number[]; color: string }) {
  const w = 260; const h = 44; const n = bars.length; const gap = 2;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} accessibilityLabel="Interval profile">
      {bars.map((b, i) => (
        <Rect key={i} x={i * (bw + gap)} y={h - b * h} width={bw} height={b * h} rx={1.5} fill={color} opacity={0.9} />
      ))}
    </Svg>
  );
}

export function SelectedDayPanel({ day, onPrev, onMenu, onViewWorkout }: {
  day: CalendarDay; onPrev: () => void; onMenu: () => void; onViewWorkout: () => void;
}) {
  const s = day.cycling;
  const col = colorOf(s?.color);
  const dateLabel = `${dayFull(day.day_name)}, ${day.day_num.replace(" MAY", " MAY")}`;
  return (
    <View style={cs.panel} testID="selected-day-panel">
      <View style={cs.panelHead}>
        <Text style={cs.panelDate}>{dateLabel}</Text>
        <View style={cs.panelHeadBtns}>
          <Pressable testID="panel-prev" onPress={onPrev} hitSlop={8} style={({ hovered }: any) => hovered && { opacity: 0.7 }}>
            <Ionicons name="chevron-back" size={18} color={CC.dim} />
          </Pressable>
          <Pressable testID="panel-menu" onPress={onMenu} hitSlop={8} style={({ hovered }: any) => hovered && { opacity: 0.7 }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={CC.dim} />
          </Pressable>
        </View>
      </View>

      {s ? (
        <>
          <View style={cs.panelTitleRow}>
            <Ionicons name={s.status === "rest" ? "bed-outline" : "bicycle"} size={20} color={col} />
            <Text style={cs.panelTitle}>{s.title}</Text>
          </View>
          <View style={cs.metricGrid}>
            <Metric v={s.duration || "—"} l="Duration" />
            <Metric v={s.target_power ? `${s.target_power} W` : "—"} l="Target Power" />
            <Metric v={s.zone || "—"} l="Target Zone" />
            <Metric v={s.tss || "—"} l="Training Load" />
          </View>
          {s.profile ? <View style={cs.panelChart}><IntervalProfile bars={s.profile} color={col} /></View> : null}
          <Pressable testID="view-workout" onPress={onViewWorkout} accessibilityRole="button" accessibilityLabel="View Workout"
            style={({ hovered, pressed }: any) => [cs.viewBtn, hovered && cs.viewBtnHover, pressed && { opacity: 0.7 }]}>
            <Text style={cs.viewBtnText}>View Workout</Text>
          </Pressable>
          <View style={cs.panelStatusRow}>
            <SessionStatusIndicator status={s.status} />
            <Text style={cs.panelStatusText}>{STATUS_LABEL[s.status]}</Text>
          </View>
        </>
      ) : (
        <Text style={cs.cardMeta}>No cycling session scheduled.</Text>
      )}
    </View>
  );
}

function Metric({ v, l }: { v: string; l: string }) {
  return (
    <View style={cs.metric}>
      <Text style={cs.metricV}>{v}</Text>
      <Text style={cs.metricL}>{l}</Text>
    </View>
  );
}

/* ── week summary + zones ───────────────────────────────────────────────── */
export function TimeInZonesBars({ zones }: { zones: ZoneBar[] }) {
  return (
    <View style={cs.zonesWrap}>
      {zones.map((z) => (
        <View key={z.z} style={cs.zoneRow}>
          <Text style={[cs.zoneLabel, { color: z.z === "Z5" ? CC.rouge : CC.white }]}>{z.z}</Text>
          <Text style={cs.zonePct}>{z.pct}%</Text>
          <View style={cs.zoneTrack}>
            <View style={[cs.zoneFill, { width: `${z.pct * 2}%`, backgroundColor: colorOf(z.color) }]} />
          </View>
          <Text style={cs.zoneTime}>{z.time}</Text>
        </View>
      ))}
    </View>
  );
}

export function WeekSummaryCard({ summary }: { summary: { workouts_completed: number; workouts_planned: number; duration: string; tss: string; zones: ZoneBar[] } }) {
  return (
    <View style={cs.sideCard} testID="week-summary">
      <Text style={cs.sideLabelY}>WEEK SUMMARY</Text>
      <View style={cs.summaryTop}>
        <SummaryStat v={`${summary.workouts_completed} / ${summary.workouts_planned}`} l="Workouts" />
        <SummaryStat v={summary.duration} l="Duration" />
        <SummaryStat v={summary.tss} l="TSS" />
      </View>
      <TimeInZonesBars zones={summary.zones} />
    </View>
  );
}

function SummaryStat({ v, l }: { v: string; l: string }) {
  return <View style={cs.sumStat}><Text style={cs.sumV}>{v}</Text><Text style={cs.sumL}>{l}</Text></View>;
}

/* ── quick actions ──────────────────────────────────────────────────────── */
const QUICK = [
  { id: "reschedule", title: "Reschedule Workout", icon: "calendar-outline", color: CC.white },
  { id: "add", title: "Add Workout", icon: "add-circle-outline", color: CC.yellow },
  { id: "recovery", title: "Add Recovery Activity", icon: "flower-outline", color: CC.purple },
  { id: "fb50", title: "Plan FB50 Session", icon: "barbell-outline", color: CC.blue },
] as const;

export function QuickActionsCard({ onAction }: { onAction: (id: string, title: string) => void }) {
  return (
    <View style={cs.sideCard} testID="quick-actions">
      <Text style={cs.sideLabelR}>QUICK ACTIONS</Text>
      {QUICK.map((q, i) => (
        <Pressable key={q.id} testID={`qa-${q.id}`} onPress={() => onAction(q.id, q.title)}
          accessibilityRole="button" accessibilityLabel={q.title}
          style={({ hovered, pressed }: any) => [cs.qaRow, i < QUICK.length - 1 && cs.qaDivider, hovered && { backgroundColor: "rgba(255,255,255,0.04)" }, pressed && { opacity: 0.7 }]}>
          <Ionicons name={q.icon as any} size={18} color={q.color} />
          <Text style={cs.qaText}>{q.title}</Text>
          <Ionicons name="chevron-forward" size={15} color={CC.dim} />
        </Pressable>
      ))}
    </View>
  );
}

/* ── coach tip footer ───────────────────────────────────────────────────── */
export function CalendarTipFooter({ tip }: { tip: string }) {
  const coach = useCoach();
  return (
    <View style={cs.tip} testID="calendar-tip">
      <Ionicons name="star" size={16} color={CC.yellow} />
      <Text style={cs.tipLabel}>{coach.name}&apos;s Tip</Text>
      <Text style={cs.tipText} numberOfLines={2}>{tip}</Text>
      <Text style={cs.signature}>{coach.name}</Text>
    </View>
  );
}

/* ── date + view controls ───────────────────────────────────────────────── */
export function DateControls({
  rangeLabel, onPrev, onNext, onToday, onFilters, onWeek, onSettings,
}: {
  rangeLabel: string; onPrev: () => void; onNext: () => void; onToday: () => void;
  onFilters: () => void; onWeek: () => void; onSettings: () => void;
}) {
  return (
    <View style={cs.controls}>
      <View style={cs.controlsLeft}>
        <CtrlBtn testID="prev-week" icon="chevron-back" onPress={onPrev} label="Previous week" />
        <Pressable testID="date-range" onPress={onToday} style={({ hovered }: any) => [cs.rangeBox, hovered && cs.hover]}
          accessibilityLabel={`Week of ${rangeLabel}`}>
          <Text style={cs.rangeText}>{rangeLabel}</Text>
          <Ionicons name="calendar-clear-outline" size={15} color={CC.dim} />
        </Pressable>
        <CtrlBtn testID="next-week" icon="chevron-forward" onPress={onNext} label="Next week" />
        <Pressable testID="today-btn" onPress={onToday} style={({ hovered }: any) => [cs.todayBtn, hovered && cs.hover]}>
          <Text style={cs.todayText}>Today</Text>
        </Pressable>
      </View>
      <View style={cs.controlsRight}>
        <Pressable testID="filters-btn" onPress={onFilters} style={({ hovered }: any) => [cs.pillBtn, hovered && cs.hover]}>
          <Ionicons name="filter-outline" size={15} color={CC.dim} />
          <Text style={cs.pillText}>Filters</Text>
        </Pressable>
        <Pressable testID="week-dd" onPress={onWeek} style={({ hovered }: any) => [cs.pillBtn, hovered && cs.hover]}>
          <Text style={cs.pillText}>Week</Text>
          <Ionicons name="chevron-down" size={14} color={CC.dim} />
        </Pressable>
        <CtrlBtn testID="settings-btn" icon="settings-outline" onPress={onSettings} label="Calendar settings" />
      </View>
    </View>
  );
}

function CtrlBtn({ icon, onPress, testID, label }: { icon: IoniconName; onPress: () => void; testID: string; label: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ hovered }: any) => [cs.iconBtn, hovered && cs.hover]}>
      <Ionicons name={icon} size={17} color={CC.dim} />
    </Pressable>
  );
}

/* ── sync status card (sidebar bottom) ──────────────────────────────────── */
export function SyncStatusCard() {
  return (
    <View style={cs.syncCard}>
      <View style={cs.syncTop}>
        <Ionicons name="checkmark-circle" size={15} color={CC.green} />
        <Text style={cs.syncLabel}>SYNC STATUS</Text>
      </View>
      <Text style={cs.syncMain}>All synced</Text>
      <Text style={cs.syncSub}>Just now</Text>
    </View>
  );
}

const dayFull = (abbr: string) => (
  { MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY", THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY", SUN: "SUNDAY" } as Record<string, string>
)[abbr] ?? abbr;

/* placeholder to satisfy expo-image/gradient tree-shake (kept for parity) */
export const _kept = { Image, LinearGradient, CoachPersona: null as unknown as CoachPersona };

/* ── styles ─────────────────────────────────────────────────────────────── */
const cs = StyleSheet.create({
  rowLabel: { alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8 },
  rowLabelText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textAlign: "center", lineHeight: 13 },

  dayHead: { alignItems: "center", paddingVertical: 12, gap: 2 },
  dayName: { color: CC.white, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5 },
  dayNum: { color: CC.dim, fontSize: 11 },
  dayHeadSel: { alignItems: "center", paddingVertical: 8, gap: 3 },
  dayBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: CC.rouge, alignItems: "center", justifyContent: "center" },
  dayBadgeName: { color: "#fff", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4 },
  dayBadgeNum: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: -1 },
  dayHeadNum: { color: CC.white, fontSize: 10.5, fontWeight: "600" },

  focusCell: { alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 6 },
  focusText: { color: CC.white, fontSize: 12.5, fontWeight: "600", textAlign: "center", lineHeight: 16 },

  card: { backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1.5, padding: 10, minHeight: 118, justifyContent: "flex-start" },
  cardSel: { backgroundColor: "rgba(201,23,39,0.06)" },
  cardGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 12, borderWidth: 1.5, opacity: 0.5 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fb50Tag: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },
  cardTitle: { color: CC.white, fontSize: 12.5, fontWeight: "700", marginTop: 6, lineHeight: 15 },
  cardSub: { color: CC.dim, fontSize: 11, marginTop: 3 },
  cardMeta: { color: CC.dim, fontSize: 11, marginTop: 3 },
  wellBrand: { color: CC.dim, fontSize: 9.5, marginTop: 5, fontWeight: "600" },
  cardStatus: { position: "absolute", right: 8, bottom: 8 },

  statDone: { width: 18, height: 18, borderRadius: 9, backgroundColor: CC.green, alignItems: "center", justifyContent: "center" },
  statScheduled: { width: 15, height: 15, borderRadius: 8, backgroundColor: CC.yellow },
  statMoved: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CC.dim, alignItems: "center", justifyContent: "center" },
  statTodo: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.28)" },

  readyCell: { alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 2 },
  readyInner: { position: "absolute", alignItems: "center" },
  readyScore: { color: CC.white, fontSize: 15, fontWeight: "800" },
  readyStatus: { color: CC.dim, fontSize: 8.5, marginTop: -1 },
  readyMod: { fontSize: 9, fontWeight: "700", marginTop: 1 },

  // readiness detail
  rdDay: { color: CC.rouge, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginBottom: 12 },
  rdTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  rdScoreRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  rdScore: { color: CC.white, fontSize: 20, fontWeight: "800" },
  rdStatus: { fontSize: 9, fontWeight: "700", marginTop: -2 },
  rdHeading: { color: CC.white, fontSize: 16, fontWeight: "800" },
  rdSource: { color: CC.dim, fontSize: 11.5, marginTop: 3 },
  rdMetrics: { gap: 12 },
  rdRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rdLabel: { color: CC.white, fontSize: 12.5, fontWeight: "600", width: 68 },
  rdTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  rdFill: { height: 7, borderRadius: 4 },
  rdValue: { color: CC.dim, fontSize: 11.5, fontWeight: "600", width: 62, textAlign: "right" },

  // selected day panel
  panel: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 15 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelDate: { color: CC.rouge, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  panelHeadBtns: { flexDirection: "row", gap: 12 },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  panelTitle: { color: CC.white, fontSize: 18, fontWeight: "800" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  metric: { width: "50%", marginBottom: 14 },
  metricV: { color: CC.white, fontSize: 18, fontWeight: "800" },
  metricL: { color: CC.dim, fontSize: 11, marginTop: 1 },
  panelChart: { marginBottom: 12 },
  viewBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)", minHeight: 44, justifyContent: "center" },
  viewBtnHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  viewBtnText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  panelStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  panelStatusText: { color: CC.dim, fontSize: 12, fontWeight: "600" },

  // side cards
  sideCard: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 15 },
  sideLabelY: { color: CC.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 12 },
  sideLabelR: { color: CC.rouge, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6 },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  sumStat: { alignItems: "flex-start" },
  sumV: { color: CC.white, fontSize: 19, fontWeight: "800" },
  sumL: { color: CC.dim, fontSize: 10.5, marginTop: 1 },

  zonesWrap: { gap: 8 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoneLabel: { fontSize: 11, fontWeight: "800", width: 22 },
  zonePct: { color: CC.dim, fontSize: 10.5, width: 30 },
  zoneTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  zoneFill: { height: 6, borderRadius: 3 },
  zoneTime: { color: CC.dim, fontSize: 10, width: 58, textAlign: "right" },

  qaRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8, minHeight: 46 },
  qaDivider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  qaText: { color: CC.white, fontSize: 13, fontWeight: "600", flex: 1 },

  tip: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: "rgba(240,165,0,0.18)", paddingVertical: 13, paddingHorizontal: 18 },
  tipLabel: { color: CC.yellow, fontSize: 13.5, fontWeight: "800" },
  tipText: { color: CC.white, fontSize: 13, flex: 1 },
  signature: { color: CC.yellow, fontSize: 20, fontStyle: "italic", fontWeight: "600" },

  // controls
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 },
  controlsLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  controlsRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: CC.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  rangeBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 42 },
  rangeText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  todayBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 18, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 42, justifyContent: "center" },
  todayText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  pillBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: CC.border, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 42 },
  pillText: { color: CC.white, fontSize: 13, fontWeight: "600" },

  // sync card
  syncCard: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 12, marginTop: 10 },
  syncTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  syncLabel: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  syncMain: { color: CC.white, fontSize: 13, fontWeight: "700", marginTop: 6 },
  syncSub: { color: CC.dim, fontSize: 11, marginTop: 1 },
});
