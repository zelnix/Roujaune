import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Rect, Path, Circle, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { CoachPersona, useCoach } from "../lib/coach-persona";
import { usePlanBadge } from "../lib/plan-badge";

/* ── palette additions (French/Italian cycling heritage) ─────────────────── */
export const C = {
  bg: "#050606", nav: "#080909", card: "#101211", cardHi: "#151716",
  deepRouge: "#86121B", rouge: "#C91727", yellow: "#FFC20A",
  white: "#F3F1EA", dim: "#A7A8A5", green: "#55C850", amber: "#F0A500",
  orange: "#E8631C", border: "rgba(255,255,255,0.11)", borderSoft: "rgba(255,255,255,0.06)",
};

const heroImg = require("../../assets/images/hero_cyclist_b2.jpg");

/* ── mock data (matches the reference exactly) ───────────────────────────── */
export type PlanGoal = { id: string; title: string; description: string; status: "complete" | "incomplete" };
export type PlanPhase = { id: string; number: number; name: string; weeks: string; pct: number; active?: boolean; points: number[] };
export type KeyWorkout = { id: string; title: string; icon: keyof typeof Ionicons.glyphMap; duration: string; zone: string; tss: string; footer: string; color: string; profile: number[] };

export const PLAN = {
  title: "Build & Climb",
  label: "BUILD & CLIMB",
  description: "A 12-week plan to build sustainable power, climbing strength and endurance so you can conquer long climbs with confidence.",
  durationWeeks: "12 Weeks",
  avgDays: "5 Days/Week",
  phase: { name: "Build Phase", weeks: "Weeks 1–4", description: "Build your aerobic base and muscular endurance while introducing sustained threshold work." },
  goals: [
    { id: "g1", title: "Improved Climbing Strength", description: "Stronger on long climbs", status: "complete" },
    { id: "g2", title: "Raise FTP", description: "Increase sustainable power", status: "complete" },
    { id: "g3", title: "Build Endurance", description: "Ride longer with confidence", status: "complete" },
    { id: "g4", title: "Consistent Training", description: "Stay on track all season", status: "incomplete" },
  ] as PlanGoal[],
  phases: [
    { id: "p1", number: 1, name: "Build", weeks: "Weeks 1–4", pct: 75, active: true, points: [0.15, 0.3, 0.42, 0.55, 0.68, 0.82, 0.75, 0.95] },
    { id: "p2", number: 2, name: "Build More", weeks: "Weeks 5–8", pct: 0, points: [0.1, 0.25, 0.2, 0.4, 0.35, 0.55, 0.5, 0.7] },
    { id: "p3", number: 3, name: "Climb", weeks: "Weeks 9–12", pct: 0, points: [0.2, 0.3, 0.45, 0.4, 0.6, 0.72, 0.68, 0.9] },
    { id: "p4", number: 4, name: "Peak & Perform", weeks: "Week 13", pct: 0, points: [0.3, 0.4, 0.35, 0.5, 0.62, 0.55, 0.7, 0.6] },
  ] as PlanPhase[],
  weeklyLoad: [180, 240, 300, 210, 320, 380, 430, 300, 420, 500, 560, 380, 260],
  youAreHere: 4,
  workouts: [
    { id: "w1", title: "Threshold Climb", icon: "bicycle", duration: "1h 00m", zone: "Z4", tss: "92 TSS", footer: "Week 3 • Tue", color: C.rouge, profile: [0.5, 0.7, 0.6, 0.85, 0.7, 0.95, 0.75, 0.9, 0.65, 0.88, 0.7, 0.5] },
    { id: "w2", title: "Sweet Spot", icon: "bicycle", duration: "1h 20m", zone: "Z3", tss: "75 TSS", footer: "Week 3 • Thu", color: C.amber, profile: [0.4, 0.55, 0.7, 0.72, 0.68, 0.75, 0.7, 0.74, 0.66, 0.72, 0.6, 0.45] },
    { id: "w3", title: "Endurance Ride", icon: "bicycle", duration: "1h 45m", zone: "Z2", tss: "70 TSS", footer: "Week 3 • Fri", color: C.green, profile: [0.45, 0.5, 0.55, 0.52, 0.58, 0.55, 0.6, 0.56, 0.58, 0.54, 0.5, 0.46] },
    { id: "w4", title: "Long Ride", icon: "bicycle", duration: "3h 00m", zone: "Z2", tss: "120 TSS", footer: "Week 4 • Sat", color: C.green, profile: [0.4, 0.45, 0.48, 0.5, 0.52, 0.5, 0.53, 0.5, 0.52, 0.49, 0.47, 0.44] },
  ] as KeyWorkout[],
  adaptation: "Great consistency and strong threshold work. I've slightly increased your time in Zone 4 and added more endurance volume to build your climbing engine.",
  adaptationStatus: "Plan is adapting as you improve",
  progressPct: 25,
  progress: { weeks: "3 / 12", workouts: "15", time: "10.2 h", tss: "1,420", ctl: "+8.4", atl: "92", tsb: "+6" },
  tip: "Consistency compounds. Focus on the process this phase and the results will come.",
};

export const PLAN_TABS = ["Overview", "Phases", "Key Workouts", "Load & Progress", "Adaptations"];
export const PLAN_OPTIONS = ["Build & Climb", "Base Endurance", "FTP Booster", "Gran Fondo Prep"];

/** Full plan shape (matches the FastAPI /api/plan response after normalisation). */
export type TrainingPlan = typeof PLAN;

const PlanCtx = React.createContext<TrainingPlan>(PLAN);
export const PlanProvider = PlanCtx.Provider;
const useP = () => React.useContext(PlanCtx);

/* ── small building blocks ──────────────────────────────────────────────── */
export function SecondaryButton({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: any) => [s.secBtn, hovered && s.secBtnHover, pressed && { opacity: 0.7 }]}
    >
      <Text style={s.secBtnText}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={C.white} />
    </Pressable>
  );
}

export function StatusCheck({ done }: { done: boolean }) {
  return done ? (
    <View style={s.checkDone} accessibilityLabel="Completed">
      <Ionicons name="checkmark" size={14} color="#04210F" />
    </View>
  ) : (
    <View style={s.checkTodo} accessibilityLabel="Not complete" />
  );
}

function Signature({ size = 20, name = "Alberto" }: { size?: number; name?: string }) {
  return <Text style={[s.signature, { fontSize: size }]}>{name}</Text>;
}

/* ── charts ─────────────────────────────────────────────────────────────── */
function areaPath(pts: number[], w: number, h: number, pad = 2) {
  const n = pts.length; const step = w / (n - 1);
  const y = (p: number) => pad + (1 - p) * (h - pad * 2);
  let line = `M0 ${y(pts[0])}`;
  pts.forEach((p, i) => { if (i > 0) line += ` L${(i * step).toFixed(1)} ${y(p).toFixed(1)}`; });
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

export const MiniArea = React.memo(function MiniArea({ points, active, width = 118, height = 62 }: { points: number[]; active?: boolean; width?: number; height?: number }) {
  const col = active ? C.yellow : "#5A5C5A";
  const { line, area } = areaPath(points, width, height);
  const id = React.useId();
  return (
    <Svg width={width} height={height} accessibilityLabel={active ? "Rising training load, current phase" : "Projected training load"}>
      <Defs>
        <SvgGrad id={`ga${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={col} stopOpacity={active ? 0.5 : 0.28} />
          <Stop offset="1" stopColor={col} stopOpacity="0.02" />
        </SvgGrad>
      </Defs>
      <Path d={area} fill={`url(#ga${id})`} />
      <Path d={line} stroke={col} strokeWidth={active ? 2.4 : 1.6} fill="none" />
    </Svg>
  );
});

export const WorkoutProfile = React.memo(function WorkoutProfile({ bars, color, width = 150, height = 46 }: { bars: number[]; color: string; width?: number; height?: number }) {
  const n = bars.length; const gap = 2; const bw = (width - gap * (n - 1)) / n;
  return (
    <Svg width={width} height={height} accessibilityLabel="Workout intensity profile">
      {bars.map((b, i) => (
        <Rect key={i} x={i * (bw + gap)} y={height - b * height} width={bw} height={b * height} rx={1.5} fill={color} opacity={0.85} />
      ))}
    </Svg>
  );
});

export const WeeklyLoadChart = React.memo(function WeeklyLoadChart({ values, hereWeek, width = 400, height = 150 }: { values: number[]; hereWeek: number; width?: number; height?: number }) {
  const max = 600; const padL = 26; const padB = 18; const padT = 14;
  const chartW = width - padL; const chartH = height - padB - padT;
  const n = values.length; const gap = 6; const bw = (chartW - gap * (n - 1)) / n;
  const colorFor = (i: number) => (i < 4 ? C.yellow : i < 8 ? C.orange : i < 12 ? C.rouge : "#4A4C4A");
  const yTicks = [0, 200, 400, 600];
  const hereX = padL + (hereWeek - 1) * (bw + gap) + bw / 2;
  return (
    <Svg width={width} height={height} accessibilityLabel="Weekly training load in TSS across the 13-week plan. You are at week 4.">
      {yTicks.map((t) => {
        const y = padT + (1 - t / max) * chartH;
        return (
          <React.Fragment key={t}>
            <Line x1={padL} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <SvgText x={padL - 6} y={y + 3} fontSize={9} fill={C.dim} textAnchor="end">{t}</SvgText>
          </React.Fragment>
        );
      })}
      {values.map((v, i) => {
        const bh = (v / max) * chartH; const x = padL + i * (bw + gap); const y = padT + chartH - bh;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={bw} height={bh} rx={2} fill={colorFor(i)} opacity={0.92} />
            <SvgText x={x + bw / 2} y={height - 5} fontSize={8.5} fill={C.dim} textAnchor="middle">{i + 1}</SvgText>
          </React.Fragment>
        );
      })}
      <Line x1={hereX} y1={padT - 8} x2={hereX} y2={padT + chartH} stroke={C.yellow} strokeWidth={1.5} strokeDasharray="3 3" />
      <SvgText x={hereX} y={padT - 11} fontSize={9} fill={C.yellow} fontWeight="bold" textAnchor="middle">You are here</SvgText>
    </Svg>
  );
});

export const ProgressRing = React.memo(function ProgressRing({ pct, size = 66 }: { pct: number; size?: number }) {
  const stroke = 7; const r = (size - stroke) / 2; const cx = size / 2; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`Plan ${pct} percent complete`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={cx} cy={cx} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
        <Circle cx={cx} cy={cx} r={r} stroke={C.yellow} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
      </Svg>
      <Text style={s.ringText}>{pct}%</Text>
    </View>
  );
});

/* ── sidebar ────────────────────────────────────────────────────────────── */
const NAV = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "training", label: "Training Plan", icon: "clipboard-outline" },
  { key: "calendar", label: "Calendar", icon: "calendar-outline" },
  { key: "workouts", label: "Workouts", icon: "fitness-outline" },
  { key: "routes", label: "Virtual Routes", icon: "git-network-outline" },
  { key: "progress", label: "Progress", icon: "stats-chart-outline" },
  { key: "wellness", label: "Wellness", icon: "heart-outline" },
  { key: "community", label: "Community", icon: "people-outline" },
  { key: "connections", label: "Connections", icon: "link-outline" },
  { key: "settings", label: "Settings", icon: "settings-outline" },
] as const;

export function TrainingPlanSidebar({ active, onSelect, persona, onMessage, sync }: { active: string; onSelect: (k: string) => void; persona: CoachPersona; onMessage: () => void; sync?: React.ReactNode }) {
  const planBadge = usePlanBadge();
  return (
    <View style={s.sidebar} testID="training-plan-sidebar">
      <View style={s.brand}>
        <View style={s.brandTop}>
          <View style={s.logoBadge}><Ionicons name="bicycle" size={22} color={C.yellow} /></View>
          <Text style={s.wordmark}><Text style={{ color: C.rouge }}>ROU</Text><Text style={{ color: C.yellow }}>JAUNE</Text></Text>
        </View>
        <Text style={s.tagline}>Your strongest ride is your own.</Text>
      </View>

      <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={s.navList} showsVerticalScrollIndicator={false}>
        {NAV.map((n) => {
          const on = active === n.key;
          const showBadge = n.key === "training" && planBadge && !on;
          return (
            <Pressable key={n.key} testID={`nav-${n.key}`} onPress={() => onSelect(n.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={showBadge ? `${n.label}, plan updated after your last ride` : n.label}
              style={({ hovered }: any) => [s.navRow, hovered && !on && s.navRowHover]}>
              {on && <LinearGradient colors={[C.rouge, C.deepRouge]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />}
              {on && <View style={s.navIndicator} />}
              <Ionicons name={n.icon as any} size={20} color={on ? "#fff" : C.dim} />
              <Text style={[s.navLabel, on && { color: "#fff", fontWeight: "700" }]} numberOfLines={1}>{n.label}</Text>
              {showBadge ? <View style={s.navBadge} accessibilityLabel="Plan updated" /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.coachCard}>
        <View style={s.coachRow}>
          <View>
            <Image source={persona.image} style={s.coachAvatar} contentFit="cover" contentPosition="top center" />
            <View style={s.onlineDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.coachName}>{persona.name}</Text>
            <Text style={s.coachRole}>Your Companion Coach</Text>
            <Signature size={17} name={persona.signature} />
          </View>
        </View>
        <Pressable testID="message-coach" onPress={onMessage} accessibilityRole="button" accessibilityLabel={`Message ${persona.name}`}
          style={({ pressed }) => [s.msgBtn, pressed && { opacity: 0.7 }]}>
          <Text style={s.msgBtnText}>Message {persona.name}</Text>
        </Pressable>
      </View>
      {sync}
    </View>
  );
}

/* ── header / tabs / selector ───────────────────────────────────────────── */
export function PlanHeader() {
  const persona = useCoach();
  return (
    <View>
      <Text style={s.pageTitle} accessibilityRole="header">Your Training Plan</Text>
      <Text style={s.pageSub}>A structured plan. Built for your goals. Adapted by {persona.name}.</Text>
    </View>
  );
}

export function TopStatus({ persona, onPress, minimal }: { persona: CoachPersona; onPress: (m: string) => void; minimal?: boolean }) {
  return (
    <View style={s.statusRow}>
      {!minimal && (
        <>
          <Pressable testID="flame" onPress={() => onPress("12 day streak 🔥")} style={s.statusPill} hitSlop={8}>
            <Ionicons name="flame" size={18} color={C.yellow} />
            <Text style={s.statusCount}>12</Text>
          </Pressable>
          <Pressable testID="bell" onPress={() => onPress("You have 3 notifications")} style={s.statusPill} hitSlop={8}>
            <Ionicons name="notifications-outline" size={20} color={C.white} />
            <View style={s.badge}><Text style={s.badgeText}>3</Text></View>
          </Pressable>
        </>
      )}
      <Pressable testID="profile" onPress={() => onPress("Profile")} style={s.profileWrap} hitSlop={6}>
        <Image source={persona.image} style={s.profileImg} contentFit="cover" contentPosition="top center" />
        <Ionicons name="chevron-down" size={16} color={C.dim} />
      </Pressable>
    </View>
  );
}

export function PlanSelector({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <Pressable testID="plan-selector" onPress={onPress} accessibilityRole="button" accessibilityLabel={`Plan ${value}. Change plan.`}
      style={({ hovered }: any) => [s.selector, hovered && s.secBtnHover]}>
      <Text style={s.selectorLabel}>Plan</Text>
      <Text style={s.selectorValue}>{value}</Text>
      <Ionicons name="chevron-down" size={16} color={C.dim} />
    </Pressable>
  );
}

export function PlanTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {PLAN_TABS.map((t) => {
        const on = active === t;
        return (
          <Pressable key={t} testID={`tab-${t}`} onPress={() => onChange(t)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ hovered }: any) => [s.tab, hovered && !on && { opacity: 0.85 }]}>
            <Text style={[s.tabText, on && s.tabTextOn]}>{t}</Text>
            {on && <View style={s.tabUnderline} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── hero + goals ───────────────────────────────────────────────────────── */
export function PlanHeroCard() {
  const PLAN = useP();
  return (
    <View style={[s.card, s.hero]} testID="plan-hero">
      <View style={s.heroLeft}>
        <Text style={s.heroLabel}>{PLAN.label}</Text>
        <Text style={s.heroTitle}>{PLAN.title}</Text>
        <Text style={s.heroDesc}>{PLAN.description}</Text>
        <View style={s.heroMeta}>
          <View style={s.metaItem}>
            <Ionicons name="calendar-clear-outline" size={18} color={C.yellow} />
            <View><Text style={s.metaValue}>{PLAN.durationWeeks}</Text><Text style={s.metaLabel}>Duration</Text></View>
          </View>
          <View style={s.metaItem}>
            <Ionicons name="bicycle-outline" size={18} color={C.yellow} />
            <View><Text style={s.metaValue}>{PLAN.avgDays}</Text><Text style={s.metaLabel}>Average</Text></View>
          </View>
        </View>
      </View>
      <View style={s.heroImgWrap}>
        <Image source={heroImg} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} accessibilityLabel="A Roujaune rider climbing a winding alpine road" />
        <LinearGradient colors={["rgba(16,18,17,0.95)", "rgba(16,18,17,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 0.55, y: 0.5 }} style={StyleSheet.absoluteFill as any} />
      </View>
    </View>
  );
}

export function PlanGoalsCard({ onEdit }: { onEdit: () => void }) {
  const PLAN = useP();
  return (
    <View style={[s.card, s.goalsCard]} testID="plan-goals">
      <View style={s.cardHead}>
        <Ionicons name="disc-outline" size={16} color={C.rouge} />
        <Text style={[s.cardHeadText, { color: C.rouge }]}>PLAN GOALS</Text>
      </View>
      <View style={{ flex: 1 }}>
        {PLAN.goals.map((g, i) => (
          <View key={g.id} style={[s.goalRow, i < PLAN.goals.length - 1 && s.rowDivider]}>
            <View style={s.goalIcon}><Ionicons name={g.status === "complete" ? "trending-up" : "bicycle"} size={16} color={C.dim} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.goalTitle}>{g.title}</Text>
              <Text style={s.goalDesc}>{g.description}</Text>
            </View>
            <StatusCheck done={g.status === "complete"} />
          </View>
        ))}
      </View>
      <SecondaryButton label="Edit Goals" onPress={onEdit} testID="edit-goals" />
    </View>
  );
}

/* ── phase roadmap ──────────────────────────────────────────────────────── */
export function PhaseCard({ phase, onPress }: { phase: PlanPhase; onPress: () => void }) {
  const active = !!phase.active;
  return (
    <Pressable testID={`phase-${phase.id}`} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${phase.name}, ${phase.weeks}, ${phase.pct}% complete`}
      style={({ hovered, pressed }: any) => [s.phaseCard, hovered && s.phaseCardHover, pressed && { opacity: 0.85 }]}>
      <View style={s.phaseTop}>
        <View style={[s.phaseBadge, active && { backgroundColor: C.yellow, borderColor: C.yellow }]}>
          {phase.number === 4
            ? <Ionicons name="flag" size={13} color={active ? "#241B00" : C.dim} />
            : <Text style={[s.phaseBadgeText, active && { color: "#241B00" }]}>{phase.number}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.phaseName, active && { color: C.white }]} numberOfLines={1}>{phase.name}</Text>
          <Text style={s.phaseWeeks}>{phase.weeks}</Text>
        </View>
      </View>
      <MiniArea points={phase.points} active={active} />
      <Text style={[s.phasePct, active ? { color: C.yellow } : { color: C.dim }]}>{phase.pct}%</Text>
    </Pressable>
  );
}

export function CurrentPhaseRoadmap({ onPhase }: { onPhase: (p: PlanPhase) => void }) {
  const PLAN = useP();
  return (
    <View style={[s.card, s.roadmap]} testID="phase-roadmap">
      <View style={s.roadmapLeft}>
        <Text style={s.roadLabel}>CURRENT PHASE</Text>
        <Text style={s.roadTitle}>{PLAN.phase.name}</Text>
        <Text style={s.roadWeeks}>{PLAN.phase.weeks}</Text>
        <Text style={s.roadDesc}>{PLAN.phase.description}</Text>
        <View style={s.phaseBar}><View style={s.phaseBarFill} /><View style={s.phaseBarDot} /></View>
      </View>
      <View style={s.phaseGrid}>
        {PLAN.phases.map((p) => <PhaseCard key={p.id} phase={p} onPress={() => onPhase(p)} />)}
      </View>
    </View>
  );
}

/* ── weekly load ────────────────────────────────────────────────────────── */
export function WeeklyLoadCard({ onFilter, width = 430 }: { onFilter: () => void; width?: number }) {
  const PLAN = useP();
  const chartW = Math.max(300, width - 44);
  const legend = [["Build", C.yellow], ["Build More", C.orange], ["Climb", C.rouge], ["Peak", "#4A4C4A"]] as const;
  return (
    <View style={[s.card, { flex: 1 }]} testID="weekly-load">
      <View style={s.cardHeadRow}>
        <View style={s.cardHead}><Text style={[s.cardHeadText, { color: C.yellow }]}>WEEKLY LOAD OVERVIEW <Text style={{ color: C.dim }}>(TSS)</Text></Text></View>
        <Pressable testID="load-filter" onPress={onFilter} style={({ hovered }: any) => [s.miniSelect, hovered && s.secBtnHover]}>
          <Text style={s.miniSelectText}>This Plan</Text>
          <Ionicons name="chevron-down" size={13} color={C.dim} />
        </Pressable>
      </View>
      <WeeklyLoadChart values={PLAN.weeklyLoad} hereWeek={PLAN.youAreHere} width={chartW} height={150} />
      <View style={s.legend}>
        {legend.map(([lbl, col]) => (
          <View key={lbl} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: col }]} /><Text style={s.legendText}>{lbl}</Text></View>
        ))}
      </View>
    </View>
  );
}

/* ── key workouts ───────────────────────────────────────────────────────── */
export function KeyWorkoutCard({ w, onPress }: { w: KeyWorkout; onPress: () => void }) {
  return (
    <Pressable testID={`workout-${w.id}`} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${w.title}, ${w.duration}, zone ${w.zone}, ${w.tss}, ${w.footer}`}
      style={({ hovered, pressed }: any) => [s.woCard, hovered && s.phaseCardHover, pressed && { opacity: 0.85 }]}>
      <View style={s.woHead}>
        <Ionicons name={w.icon} size={16} color={w.color} />
        <Text style={s.woTitle} numberOfLines={1}>{w.title}</Text>
      </View>
      <Text style={s.woDuration}>{w.duration}</Text>
      <View style={s.woProfile}><WorkoutProfile bars={w.profile} color={w.color} /></View>
      <View style={s.woTags}>
        <View style={[s.zoneTag, { borderColor: w.color }]}><Text style={[s.zoneTagText, { color: w.color }]}>{w.zone}</Text></View>
        <Text style={s.tssText}>{w.tss}</Text>
      </View>
      <View style={s.woFooterDivider} />
      <Text style={s.woFooter}>{w.footer}</Text>
    </Pressable>
  );
}

export function KeyWorkoutsCard({ onView, onWorkout, onNext }: { onView: () => void; onWorkout: (w: KeyWorkout) => void; onNext: () => void }) {
  const PLAN = useP();
  return (
    <View style={[s.card, { flex: 1 }]} testID="key-workouts">
      <View style={s.cardHeadRow}>
        <View style={s.cardHead}><Text style={[s.cardHeadText, { color: C.yellow }]}>KEY WORKOUTS THIS PHASE</Text></View>
        <Pressable testID="view-all-workouts" onPress={onView} hitSlop={6} style={({ hovered }: any) => [s.linkRow, hovered && { opacity: 0.8 }]}>
          <Text style={s.link}>View All</Text><Ionicons name="chevron-forward" size={13} color={C.white} />
        </Pressable>
      </View>
      <View style={s.woRow}>
        {PLAN.workouts.map((w) => (
          <View key={w.id} style={{ flex: 1 }}><KeyWorkoutCard w={w} onPress={() => onWorkout(w)} /></View>
        ))}
        <Pressable testID="workouts-next" onPress={onNext} style={({ hovered }: any) => [s.nextBtn, hovered && s.secBtnHover]} accessibilityLabel="More workouts">
          <Ionicons name="chevron-forward" size={18} color={C.white} />
        </Pressable>
      </View>
    </View>
  );
}

/* ── adaptations ────────────────────────────────────────────────────────── */
export function AlbertoAdaptationsCard({ persona, onViewAll, width = 430, text, loading, onRefresh }: { persona: CoachPersona; onViewAll: () => void; width?: number; text?: string | null; loading?: boolean; onRefresh?: () => void }) {
  const PLAN = useP();
  const body = text || PLAN.adaptation;
  return (
    <View style={[s.card, { flex: 1 }]} testID="adaptations">
      <View style={s.cardHeadRow}>
        <View style={s.cardHead}><Text style={[s.cardHeadText, { color: C.rouge }]}>{persona.name.toUpperCase()}&apos;S ADAPTATIONS</Text></View>
        <View style={s.linkRow}>
          {loading ? <Text style={s.lastUpdated}>Thinking…</Text> : <Text style={s.lastUpdated}>Last updated Today</Text>}
          {onRefresh ? (
            <Pressable testID="refresh-adaptation" onPress={onRefresh} hitSlop={8} disabled={loading}
              accessibilityRole="button" accessibilityLabel="Regenerate adaptation"
              style={({ hovered }: any) => [{ marginLeft: 8 }, hovered && { opacity: 0.7 }]}>
              <Ionicons name="refresh" size={15} color={loading ? C.dim : C.white} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={s.adaptRow}>
        <Image source={persona.image} style={s.adaptAvatar} contentFit="cover" contentPosition="top center" />
        <Text style={[s.adaptText, loading && !text && { opacity: 0.5 }]}>{body}</Text>
      </View>
      <View style={s.adaptFooter}>
        <View style={s.statusChip}>
          <Ionicons name="checkmark-circle" size={15} color={C.green} />
          <Text style={s.statusChipText}>{PLAN.adaptationStatus}</Text>
        </View>
        <SecondaryButton label="View All Adaptations" onPress={onViewAll} testID="view-adaptations" />
      </View>
    </View>
  );
}

/* ── adaptive per-zone targets ──────────────────────────────────────────── */
const ZONE_COL: Record<string, string> = { Z2: "#40A9C6", Z3: C.green, Z4: C.yellow, Z5: C.orange, Z6: C.rouge };

function ExecSpark({ recent, color, width = 84, height = 26 }: { recent: number[]; color: string; width?: number; height?: number }) {
  // Plot recent actual/target ratios around the 1.0 (on-target) baseline.
  const lo = 0.85, hi = 1.15;
  const yFor = (r: number) => {
    const clamped = Math.max(lo, Math.min(hi, r));
    return height - ((clamped - lo) / (hi - lo)) * height;
  };
  const baseY = yFor(1);
  if (recent.length < 2) {
    return (
      <Svg width={width} height={height}>
        <Line x1={0} y1={baseY} x2={width} y2={baseY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="3,3" />
      </Svg>
    );
  }
  const stepX = width / (recent.length - 1);
  const pts = recent.map((r, i) => `${i * stepX},${yFor(r)}`);
  const last = recent[recent.length - 1];
  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={baseY} x2={width} y2={baseY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="3,3" />
      <Path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={(recent.length - 1) * stepX} cy={yFor(last)} r={2.6} fill={color} />
    </Svg>
  );
}

export function AdaptiveTargetsCard({ targets, loading = false, width }: { targets: { zone: string; bias: number; recent: number[] }[]; loading?: boolean; width?: number }) {
  const active = targets.filter((t) => Math.abs(t.bias) > 0.0001 || t.recent.length > 0);
  return (
    <View style={[s.card, width ? { width } : { flex: 1 }]} testID="adaptive-targets">
      <View style={s.cardHeadRow}>
        <View style={s.cardHead}>
          <Ionicons name="options-outline" size={15} color={C.yellow} />
          <Text style={[s.cardHeadText, { color: C.yellow }]}>ADAPTIVE TARGETS</Text>
        </View>
        <Text style={s.lastUpdated}>Auto-tuned from your rides</Text>
      </View>

      {active.length === 0 ? (
        <View style={s.atEmpty}>
          <Ionicons name="sparkles-outline" size={20} color={C.dim} />
          <Text style={s.atEmptyText}>
            {loading ? "Loading your targets…" : "Ride a few sessions and your companion coach will fine-tune each zone's power target to how you actually perform."}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginTop: 4 }}>
          {targets.map((t) => {
            const col = ZONE_COL[t.zone] ?? C.dim;
            const pct = Math.round(t.bias * 100);
            const biasColor = t.bias > 0 ? C.green : t.bias < 0 ? C.amber : C.dim;
            const biasText = t.bias > 0 ? `+${pct}%` : t.bias < 0 ? `${pct}%` : "On base";
            return (
              <View key={t.zone} style={s.atRow}>
                <View style={[s.atZoneChip, { borderColor: col }]}>
                  <Text style={[s.atZoneText, { color: col }]}>{t.zone}</Text>
                </View>
                <ExecSpark recent={t.recent} color={col} />
                <View style={{ flex: 1 }} />
                <Text style={[s.atBias, { color: biasColor }]}>{biasText}</Text>
              </View>
            );
          })}
          <Text style={s.atHint}>Overshoot a zone repeatedly and its target rises; fade and it eases — capped at ±8%.</Text>
        </View>
      )}
    </View>
  );
}

/* ── progress strip + tip ───────────────────────────────────────────────── */
function Metric({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={s.metricCol}>
      <Text style={[s.metricValue, color && { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

export function PlanProgressStrip({ onProgress }: { onProgress: () => void }) {
  const PLAN = useP();
  const p = PLAN.progress;
  return (
    <View style={[s.card, s.strip]} testID="plan-progress">
      <View style={s.stripLabelWrap}><Text style={s.stripLabel}>PLAN{"\n"}PROGRESS</Text></View>
      <ProgressRing pct={PLAN.progressPct} />
      <View style={s.sep} />
      <Metric value={p.weeks} label="Weeks Completed" />
      <Metric value={p.workouts} label="Workouts Completed" />
      <Metric value={p.time} label="Time Completed" />
      <Metric value={p.tss} label="TSS Completed" />
      <View style={s.sep} />
      <View style={s.metricCol}>
        <View style={s.trendRow}><Text style={s.trendLabel}>FITNESS TREND</Text><Ionicons name="information-circle-outline" size={12} color={C.dim} /></View>
        <Text style={[s.trendValue, { color: C.green }]}>{p.ctl}</Text><Text style={s.metricLabel}>CTL</Text>
      </View>
      <View style={s.metricCol}>
        <Text style={s.trendLabel}>FATIGUE</Text>
        <Text style={[s.trendValue, { color: C.amber }]}>{p.atl}</Text><Text style={s.metricLabel}>ATL</Text>
      </View>
      <View style={s.metricCol}>
        <Text style={s.trendLabel}>FORM</Text>
        <Text style={[s.trendValue, { color: C.green }]}>{p.tsb}</Text><Text style={s.metricLabel}>TSB</Text>
      </View>
      <View style={{ flex: 1 }} />
      <SecondaryButton label="View Progress" onPress={onProgress} testID="view-progress" />
    </View>
  );
}

export function AlbertoTipFooter() {
  const PLAN = useP();
  const persona = useCoach();
  return (
    <View style={s.tip} testID="alberto-tip">
      <Ionicons name="star" size={17} color={C.yellow} />
      <Text style={s.tipLabel}>{persona.name}&apos;s Tip</Text>
      <Text style={s.tipText} numberOfLines={2}>{PLAN.tip}</Text>
      <Signature size={22} name={persona.signature} />
    </View>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  // sidebar
  sidebar: { width: 236, backgroundColor: C.nav, borderRightWidth: 1, borderRightColor: C.border, paddingVertical: 18, paddingHorizontal: 14 },
  brand: { paddingHorizontal: 4, marginBottom: 18 },
  brandTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(201,23,39,0.16)", borderWidth: 1, borderColor: "rgba(201,23,39,0.4)", alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 21, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  tagline: { color: C.dim, fontSize: 10.5, marginTop: 8, marginLeft: 2 },
  navList: { gap: 3, paddingBottom: 8 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", minHeight: 44 },
  navRowHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  navIndicator: { position: "absolute", left: 0, top: 9, bottom: 9, width: 3.5, backgroundColor: C.yellow, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  navBadge: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.rouge, borderWidth: 1.5, borderColor: C.nav },
  navLabel: { color: C.dim, fontSize: 13.5, fontWeight: "600" },
  coachCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10 },
  coachRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  coachAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)" },
  onlineDot: { position: "absolute", right: 0, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: C.green, borderWidth: 2, borderColor: C.card },
  coachName: { color: C.white, fontSize: 15, fontWeight: "800" },
  coachRole: { color: C.dim, fontSize: 11 },
  signature: { color: C.gold, fontStyle: "italic", fontWeight: "600", fontFamily: undefined, marginTop: 1 },
  msgBtn: { marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.03)", paddingVertical: 9, alignItems: "center", minHeight: 40, justifyContent: "center" },
  msgBtnText: { color: C.white, fontSize: 12.5, fontWeight: "700" },

  // header
  pageTitle: { color: C.white, fontSize: 30, fontWeight: "800" },
  pageSub: { color: C.dim, fontSize: 13, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusCount: { color: C.white, fontSize: 15, fontWeight: "800" },
  badge: { position: "absolute", right: -6, top: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.rouge, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 9.5, fontWeight: "800" },
  profileWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  profileImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.08)" },

  selector: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, minWidth: 230, minHeight: 44 },
  selectorLabel: { color: C.dim, fontSize: 13 },
  selectorValue: { color: C.white, fontSize: 14, fontWeight: "700", flex: 1 },

  tabs: { flexDirection: "row", gap: 26, marginTop: 14, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  tab: { paddingBottom: 10 },
  tabText: { color: C.dim, fontSize: 14, fontWeight: "600" },
  tabTextOn: { color: C.white, fontWeight: "800" },
  tabUnderline: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2.5, backgroundColor: C.rouge, borderRadius: 2 },

  // cards
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  cardHeadText: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },
  cardHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  link: { color: C.white, fontSize: 12.5, fontWeight: "700" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 3 },

  // hero
  hero: { flexDirection: "row", padding: 0, overflow: "hidden", minHeight: 250 },
  heroLeft: { width: 300, padding: 20, justifyContent: "center" },
  heroLabel: { color: C.rouge, fontSize: 11.5, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { color: C.white, fontSize: 30, fontWeight: "800", fontStyle: "italic", marginTop: 6 },
  heroDesc: { color: C.dim, fontSize: 13.5, lineHeight: 20, marginTop: 12 },
  heroMeta: { flexDirection: "row", gap: 28, marginTop: 22 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaValue: { color: C.white, fontSize: 14, fontWeight: "800" },
  metaLabel: { color: C.dim, fontSize: 11 },
  heroImgWrap: { flex: 1, backgroundColor: "#0A0C0B" },

  // goals
  goalsCard: { width: 330 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  goalIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  goalTitle: { color: C.white, fontSize: 13.5, fontWeight: "700" },
  goalDesc: { color: C.dim, fontSize: 11.5, marginTop: 1 },
  checkDone: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  checkTodo: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)" },

  // roadmap
  roadmap: { flexDirection: "row", gap: 16, flex: 1 },
  roadmapLeft: { width: 210 },
  roadLabel: { color: C.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  roadTitle: { color: C.white, fontSize: 22, fontWeight: "800", marginTop: 6 },
  roadWeeks: { color: C.dim, fontSize: 12.5, marginTop: 2 },
  roadDesc: { color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  phaseBar: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 18, justifyContent: "center" },
  phaseBarFill: { position: "absolute", left: 0, width: "22%", height: 5, borderRadius: 3, backgroundColor: C.yellow },
  phaseBarDot: { position: "absolute", left: "22%", width: 11, height: 11, borderRadius: 6, backgroundColor: C.yellow, borderWidth: 2, borderColor: C.card },
  phaseGrid: { flex: 1, flexDirection: "row", gap: 10 },
  phaseCard: { flex: 1, borderRadius: 12, padding: 10, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.borderSoft },
  phaseCardHover: { borderColor: C.border, backgroundColor: "rgba(255,255,255,0.05)" },
  phaseTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  phaseBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  phaseBadgeText: { color: C.dim, fontSize: 11, fontWeight: "800" },
  phaseName: { color: C.dim, fontSize: 12.5, fontWeight: "700" },
  phaseWeeks: { color: C.dim, fontSize: 10.5 },
  phasePct: { fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 2 },

  // weekly load
  miniSelect: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.03)" },
  miniSelectText: { color: C.white, fontSize: 11.5, fontWeight: "600" },
  legend: { flexDirection: "row", gap: 16, marginTop: 6, justifyContent: "center", flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: C.dim, fontSize: 11 },

  // workouts
  woRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  woCard: { backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: C.borderSoft, padding: 11 },
  woHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  woTitle: { color: C.white, fontSize: 13.5, fontWeight: "700", flex: 1 },
  woDuration: { color: C.dim, fontSize: 12, marginTop: 3 },
  woProfile: { marginTop: 10, marginBottom: 8 },
  woTags: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoneTag: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  zoneTagText: { fontSize: 10.5, fontWeight: "800" },
  tssText: { color: C.dim, fontSize: 11.5, fontWeight: "600" },
  woFooterDivider: { height: 1, backgroundColor: C.borderSoft, marginVertical: 8 },
  woFooter: { color: C.dim, fontSize: 11 },
  nextBtn: { width: 34, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },

  // adaptations
  lastUpdated: { color: C.dim, fontSize: 11 },
  adaptRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  adaptAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)" },
  adaptText: { flex: 1, color: C.white, fontSize: 13, lineHeight: 19 },
  atRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  atZoneChip: { minWidth: 34, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  atZoneText: { fontSize: 12, fontWeight: "900" },
  atBias: { fontSize: 15, fontWeight: "900" },
  atHint: { color: C.dim, fontSize: 11, lineHeight: 15, marginTop: 6 },
  atEmpty: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  atEmptyText: { flex: 1, color: C.dim, fontSize: 12.5, lineHeight: 18 },
  adaptFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 10, flexWrap: "wrap" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(85,200,80,0.10)", borderWidth: 1, borderColor: "rgba(85,200,80,0.35)", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  statusChipText: { color: C.green, fontSize: 12, fontWeight: "700" },

  // progress strip
  strip: { flexDirection: "row", alignItems: "center", gap: 20, paddingVertical: 14 },
  stripLabelWrap: { width: 88 },
  stripLabel: { color: C.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, lineHeight: 15 },
  ringText: { position: "absolute", color: C.white, fontSize: 15, fontWeight: "800" },
  sep: { width: 1, alignSelf: "stretch", backgroundColor: C.border, marginVertical: 4 },
  metricCol: { alignItems: "flex-start", minWidth: 66 },
  metricValue: { color: C.white, fontSize: 19, fontWeight: "800" },
  metricLabel: { color: C.dim, fontSize: 10.5, marginTop: 2 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  trendLabel: { color: C.dim, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.4 },
  trendValue: { fontSize: 22, fontWeight: "800", marginTop: 2 },

  // tip
  tip: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: "rgba(240,165,0,0.18)", paddingVertical: 13, paddingHorizontal: 18 },
  tipLabel: { color: C.yellow, fontSize: 14, fontWeight: "800" },
  tipText: { color: C.white, fontSize: 13.5, flex: 1 },

  // secondary button
  secBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 40 },
  secBtnHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  secBtnText: { color: C.white, fontSize: 12.5, fontWeight: "700" },
});
