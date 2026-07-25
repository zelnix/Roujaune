import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polyline, Polygon as SvgPolygon } from "react-native-svg";
import { colors, radius, spacing } from "@/src/theme";

const WORDMARK = require("../../assets/images/auth_wordmark.png");

type Tone = "good" | "warn" | "bad" | "neutral";
const toneColor = (t: Tone) => (t === "good" ? colors.green : t === "warn" ? colors.yellow : t === "bad" ? colors.red : colors.textDim);

// ---- Header ---------------------------------------------------------------
export function LiveHeader({
  onMenu, routeName, workoutName, elapsed, progress, estFinish, live, onLive, onAudio, onSettings, audioOn,
}: {
  onMenu: () => void; routeName: string; workoutName: string; elapsed: string; progress: number;
  estFinish: string; live: boolean; onLive: () => void; onAudio: () => void; onSettings: () => void; audioOn: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View style={h.bar}>
      <Pressable onPress={onMenu} style={h.iconBtn} hitSlop={8} testID="live-menu" accessibilityLabel="Menu">
        <Ionicons name="menu" size={22} color={colors.white} />
      </Pressable>
      <Image source={WORDMARK} style={h.logo} contentFit="contain" />
      <View style={h.titleWrap}>
        <Text style={h.route} numberOfLines={1}>{routeName}</Text>
        <Text style={h.workout} numberOfLines={1}>{workoutName}</Text>
      </View>

      <View style={h.center}>
        <View style={h.stat}>
          <Text style={h.statLabel}>ELAPSED</Text>
          <Text style={h.statValue}>{elapsed}</Text>
        </View>
        <View style={h.progressWrap}>
          <View style={h.progressTop}>
            <Text style={h.progressPct}>{pct}%</Text>
          </View>
          <View style={h.track}><View style={[h.fill, { width: `${pct}%` }]} /></View>
        </View>
        <View style={h.stat}>
          <Text style={h.statLabel}>EST. FINISH</Text>
          <Text style={h.statValue}>{estFinish}</Text>
        </View>
      </View>

      <View style={h.right}>
        <Pressable onPress={onLive} style={[h.livePill, live ? h.liveOn : h.liveOff]} testID="live-pill">
          <View style={[h.dot, { backgroundColor: live ? colors.green : colors.textDim }]} />
          <Text style={[h.liveText, { color: live ? colors.green : colors.textDim }]}>{live ? "LIVE" : "DEMO"}</Text>
        </Pressable>
        <Pressable onPress={onAudio} style={h.iconBtn} hitSlop={8} testID="live-audio" accessibilityLabel="Audio">
          <Ionicons name={audioOn ? "volume-high" : "volume-mute"} size={20} color={colors.white} />
        </Pressable>
        <Pressable onPress={onSettings} style={h.iconBtn} hitSlop={8} testID="live-settings" accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={20} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

// ---- Metric card ----------------------------------------------------------
export function MetricCard({
  icon, label, value, unit, status, statusTone = "neutral", sub, accent = colors.yellow,
}: {
  icon: any; label: string; value: string; unit?: string; status?: string; statusTone?: Tone; sub?: string; accent?: string;
}) {
  return (
    <View style={m.card} testID={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <View style={m.head}>
        <Ionicons name={icon} size={16} color={accent} />
        <Text style={m.label}>{label}</Text>
        {status ? (
          <View style={[m.pill, { borderColor: toneColor(statusTone), backgroundColor: toneColor(statusTone) + "22" }]}>
            <Text style={[m.pillText, { color: toneColor(statusTone) }]}>{status}</Text>
          </View>
        ) : null}
      </View>
      <View style={m.valueRow}>
        <Text style={[m.value, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {unit ? <Text style={m.unit}>{unit}</Text> : null}
      </View>
      {sub ? <Text style={m.sub}>{sub}</Text> : null}
    </View>
  );
}

// ---- Connections panel ----------------------------------------------------
function ConnRow({ icon, label, ok, okText }: { icon: any; label: string; ok: boolean; okText: string }) {
  return (
    <View style={cn.row}>
      <View style={cn.rowIcon}><Ionicons name={icon} size={16} color={ok ? colors.green : colors.textFaint} /></View>
      <Text style={cn.rowLabel}>{label}</Text>
      <View style={cn.rowRight}>
        {ok ? <Ionicons name="checkmark-circle" size={14} color={colors.green} /> : <Ionicons name="ellipse-outline" size={13} color={colors.textFaint} />}
        <Text style={[cn.rowState, { color: ok ? colors.green : colors.textFaint }]}>{ok ? okText : "Off"}</Text>
      </View>
    </View>
  );
}
export function ConnectionsPanel({ trainerOn, wearableOn, powerOn, hrOn, cadenceOn }: { trainerOn: boolean; wearableOn: boolean; powerOn: boolean; hrOn: boolean; cadenceOn: boolean }) {
  const allOn = powerOn && hrOn && cadenceOn;
  return (
    <View style={cn.panel} testID="connections-panel">
      <View style={cn.header}><Ionicons name="hardware-chip-outline" size={15} color={colors.yellow} /><Text style={cn.title}>CONNECTIONS</Text></View>
      <Text style={cn.section}>DEVICES</Text>
      <ConnRow icon="bicycle" label="Trainer" ok={trainerOn} okText="Connected" />
      <ConnRow icon="watch-outline" label="Wearable" ok={wearableOn} okText="Connected" />
      <View style={cn.divider} />
      <Text style={cn.section}>LIVE DATA</Text>
      <ConnRow icon="flash" label="Power" ok={powerOn} okText="Active" />
      <ConnRow icon="heart" label="Heart Rate" ok={hrOn} okText="Active" />
      <ConnRow icon="sync" label="Cadence" ok={cadenceOn} okText="Active" />
      <View style={[cn.footer, { borderColor: allOn ? colors.green + "55" : colors.border, backgroundColor: allOn ? colors.green + "18" : "rgba(255,255,255,0.03)" }]}>
        <Ionicons name={allOn ? "shield-checkmark" : "information-circle-outline"} size={14} color={allOn ? colors.green : colors.textDim} />
        <Text style={[cn.footerText, { color: allOn ? colors.green : colors.textDim }]}>{allOn ? "All ride data active" : "Some data inactive"}</Text>
      </View>
    </View>
  );
}

// ---- Alberto coaching banner ----------------------------------------------
export function CoachBanner({ name, message, avatar }: { name: string; message: string; avatar: any }) {
  return (
    <View style={cb.wrap} testID="coach-banner">
      <Image source={avatar} style={cb.avatar} contentFit="cover" contentPosition="top center" />
      <View style={{ flex: 1 }}>
        <Text style={cb.name}>{name} · Live coaching</Text>
        <Text style={cb.msg} numberOfLines={2}>{message}</Text>
      </View>
      <Ionicons name="mic" size={16} color={colors.yellow} />
    </View>
  );
}

// ---- Right column info cards ----------------------------------------------
export function InfoCard({ icon, label, value, sub, accent = colors.white, tone }: { icon: any; label: string; value: string; sub?: string; accent?: string; tone?: Tone }) {
  return (
    <View style={ic.card}>
      <View style={ic.head}><Ionicons name={icon} size={14} color={tone ? toneColor(tone) : colors.yellow} /><Text style={ic.label}>{label}</Text></View>
      <Text style={[ic.value, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={ic.sub}>{sub}</Text> : null}
    </View>
  );
}

// ---- Elevation profile (mini) --------------------------------------------
export function ElevationProfile({ progress, grade }: { progress: number; grade: number }) {
  const W = 100, H = 26;
  // A simple stylised climb profile that scales with grade.
  const peak = Math.min(1, 0.35 + grade / 12);
  const pts = [`0,${H}`, `20,${H - H * peak * 0.3}`, `45,${H - H * peak * 0.6}`, `70,${H - H * peak}`, `100,${H - H * peak * 0.5}`];
  const x = Math.max(0, Math.min(1, progress)) * W;
  return (
    <View style={ep.wrap} pointerEvents="none">
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <SvgPolygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="rgba(245,179,1,0.16)" />
        <Polyline points={pts.join(" ")} fill="none" stroke={colors.yellow} strokeWidth={1.4} />
        <Polyline points={`${x},0 ${x},${H}`} stroke="#fff" strokeWidth={1} strokeDasharray="2,2" opacity={0.8} />
      </Svg>
    </View>
  );
}

// ---- Terrain card (right column) ------------------------------------------
export function TerrainCard({ grade, elevGain, distanceLeft, progress, isClimb }: { grade: number; elevGain: number; distanceLeft: number; progress: number; isClimb: boolean }) {
  return (
    <View style={tc.card} testID="terrain-card">
      <View style={tc.head}><Ionicons name="trail-sign-outline" size={14} color={colors.yellow} /><Text style={tc.title}>TERRAIN</Text></View>
      <View style={tc.stats}>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.abs(grade).toFixed(1)}%</Text><Text style={tc.statLbl}>{isClimb ? "GRADE" : "AVG GRADE"}</Text></View>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.round(elevGain)} m</Text><Text style={tc.statLbl}>ELEV GAIN</Text></View>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.max(0, distanceLeft).toFixed(1)} km</Text><Text style={tc.statLbl}>DIST LEFT</Text></View>
      </View>
      <View style={tc.profileWrap}><ElevationProfile progress={progress} grade={grade} /></View>
    </View>
  );
}

// ---- Workout card (right column, top) -------------------------------------
export function WorkoutCard({
  planName, phase, week, day, workoutName, description,
}: {
  planName: string; phase?: string; week?: string; day?: string; workoutName: string; description?: string;
}) {
  const chips = [phase, week, day].filter(Boolean) as string[];
  return (
    <View style={wc.card} testID="workout-card">
      <Text style={wc.title} numberOfLines={2}>{workoutName}</Text>
      <View style={wc.head}>
        <Ionicons name="ribbon-outline" size={13} color={colors.yellow} />
        <Text style={wc.plan} numberOfLines={1}>{planName}</Text>
      </View>
      {chips.length ? (
        <View style={wc.metaRow}>
          {chips.map((c, i) => (<View key={i} style={wc.chip}><Text style={wc.chipText}>{c}</Text></View>))}
        </View>
      ) : null}
      {description ? (
        <>
          <View style={wc.divider} />
          <Text style={wc.desc} numberOfLines={6}>{description}</Text>
        </>
      ) : null}
    </View>
  );
}

// ---- Step timeline (bottom) -----------------------------------------------
export type TimelineStep = {
  index: number; label: string; zoneLabel: string; duration: string; durationSec: number;
  watts: number; targetPct: number; rpe: number; color: string; intensity: number; desc?: string;
};
export type StepStatus = "done" | "current" | "future";

function ProfileSeg({ step, status, width, fill, onPress }: { step: TimelineStep; status: StepStatus; width: number; fill: number; onPress: () => void }) {
  const h = 40 + Math.max(0, Math.min(1, step.intensity)) * 52;
  const base = status === "future" ? "rgba(255,255,255,0.12)" : status === "done" ? colors.yellow + "44" : step.color + "33";
  const fillPct = status === "done" ? 100 : status === "current" ? Math.max(0, Math.min(1, fill)) * 100 : 0;
  const dim = status === "future";
  return (
    <Pressable onPress={onPress} testID={`step-seg-${step.index}`} style={[st.seg, { width }]}>
      <View style={[st.segBar, { height: h, backgroundColor: base, borderColor: status === "current" ? colors.yellow : "rgba(255,255,255,0.10)" }]}>
        {fillPct > 0 ? <View style={[st.segFill, { width: `${fillPct}%` }]} /> : null}
        <View style={st.segLabel} pointerEvents="none">
          <Text style={[st.segName, dim && { color: colors.textDim }]} numberOfLines={1}>{step.index + 1}. {step.label}</Text>
          {step.desc ? <Text style={[st.segDesc, dim && { color: colors.textFaint }]} numberOfLines={1}>{step.desc}</Text> : null}
          <Text style={[st.segMeta, dim && { color: colors.textFaint }]} numberOfLines={1}>{step.duration}{step.watts > 0 ? ` · ${step.watts} W` : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function StepTimeline({
  title, steps, activeIndex, remaining, stepProgress = 0, onStepPress,
}: {
  title: string; steps: TimelineStep[]; activeIndex: number; remaining?: string; stepProgress?: number; onStepPress: (index: number) => void;
}) {
  const MIN = 104;
  const total = steps.reduce((a, s) => a + Math.max(1, s.durationSec), 0) || 1;
  const [chartW, setChartW] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  // Each bar is duration-proportional but never narrower than MIN so its
  // overlaid text stays readable; if the total exceeds the width we scroll.
  const floored = steps.map((s) => Math.max(MIN, (Math.max(1, s.durationSec) / total) * (chartW || 1)));
  const sumF = floored.reduce((a, b) => a + b, 0) || 1;
  const contentW = Math.max(chartW, sumF);
  const scale = sumF > 0 ? contentW / sumF : 1;
  const widths = floored.map((w) => w * scale);
  const scrollable = contentW > chartW + 1;
  React.useEffect(() => {
    if (activeIndex < 0 || !chartW) return;
    let x = 0;
    for (let i = 0; i < activeIndex; i++) x += widths[i];
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, chartW]);
  return (
    <View style={st.wrap} testID="interval-timeline">
      <View style={st.head}>
        <Ionicons name="stats-chart" size={15} color={colors.yellow} />
        <Text style={st.title} numberOfLines={1}>{title}</Text>
        <View style={st.headRight}>
          {steps.length ? <Text style={st.step}>STEP {Math.min(activeIndex + 1, steps.length)} / {steps.length}</Text> : null}
          {remaining ? (
            <View style={st.remain}><Ionicons name="time-outline" size={13} color={colors.yellow} /><Text style={st.remainText}>{remaining} REMAINING</Text></View>
          ) : null}
        </View>
      </View>
      <View onLayout={(e) => setChartW(Math.round(e.nativeEvent.layout.width))}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} scrollEnabled={scrollable}>
          <View style={[st.chart, { width: chartW ? contentW : "100%" }]}>
            {steps.map((s, i) => (
              <ProfileSeg
                key={s.index}
                step={s}
                status={s.index < activeIndex ? "done" : s.index === activeIndex ? "current" : "future"}
                width={chartW ? widths[i] : MIN}
                fill={stepProgress}
                onPress={() => onStepPress(s.index)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ---- Step detail popup ----------------------------------------------------
const ZONE_TIP: Record<string, string> = {
  Z1: "Very easy — active recovery. Keep it light and spin the legs.",
  Z2: "Aerobic endurance. Conversational effort you can sustain for hours.",
  Z3: "Tempo. Comfortably hard — controlled breathing, steady rhythm.",
  Z4: "Threshold. Sustainably hard; hold your target and stay composed.",
  Z5: "VO2 max. Very hard intervals — commit fully, then recover well.",
  Z6: "Anaerobic. All-out efforts to sharpen top-end power.",
};
export function StepDetailModal({
  step, activeIndex, total, onClose,
}: {
  step: TimelineStep; activeIndex: number; total: number; onClose: () => void;
}) {
  const status: StepStatus = step.index < activeIndex ? "done" : step.index === activeIndex ? "current" : "future";
  const statusLabel = status === "done" ? "Completed" : status === "current" ? "In progress" : "Upcoming";
  const statusTone = status === "done" ? colors.green : status === "current" ? colors.yellow : colors.textDim;
  const stats: { label: string; value: string }[] = [
    { label: "ZONE", value: step.zoneLabel },
    { label: "DURATION", value: step.duration },
    { label: "TARGET", value: step.watts > 0 ? `${step.watts} W` : "—" },
    { label: "% FTP", value: `${Math.round(step.targetPct * 100)}%` },
    { label: "RPE", value: `${step.rpe} / 10` },
  ];
  return (
    <View style={sd.panel} testID="step-detail-modal">
      <View style={sd.head}>
        <View style={sd.badge}><Text style={sd.badgeText}>STEP {step.index + 1} / {total}</Text></View>
        <Pressable onPress={onClose} hitSlop={10} testID="step-detail-close"><Ionicons name="close" size={22} color={colors.white} /></Pressable>
      </View>
      <View style={sd.titleRow}>
        <View style={[sd.zoneDot, { backgroundColor: step.color }]} />
        <Text style={sd.title} numberOfLines={2}>{step.label}</Text>
      </View>
      <View style={[sd.statusPill, { borderColor: statusTone + "66", backgroundColor: statusTone + "1A" }]}>
        <View style={[sd.statusDot, { backgroundColor: statusTone }]} />
        <Text style={[sd.statusText, { color: statusTone }]}>{statusLabel}</Text>
      </View>
      <View style={sd.grid}>
        {stats.map((s) => (
          <View key={s.label} style={sd.stat}>
            <Text style={sd.statLabel}>{s.label}</Text>
            <Text style={sd.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
      <View style={sd.tipBox}>
        <Ionicons name="bulb-outline" size={15} color={colors.yellow} />
        <Text style={sd.tipText}>{ZONE_TIP[step.zoneLabel] ?? "Hold your target and keep a smooth, steady effort."}</Text>
      </View>
    </View>
  );
}

// ---- Bottom controls ------------------------------------------------------
export function LiveControlBar({
  paused, erg, audioOn, onAudio, onMirror, onErg, onControls, onPauseToggle, onEnd,
}: {
  paused: boolean; erg: number; audioOn: boolean; onAudio: () => void; onMirror: () => void;
  onErg: (d: number) => void; onControls: () => void; onPauseToggle: () => void; onEnd: () => void;
}) {
  return (
    <View style={bc.bar}>
      <Pressable onPress={onAudio} style={bc.round} testID="bc-audio" accessibilityLabel="Audio">
        <Ionicons name={audioOn ? "volume-high" : "volume-mute"} size={20} color={colors.white} />
        <Text style={bc.roundText}>Audio</Text>
      </Pressable>
      <Pressable onPress={onMirror} style={bc.round} testID="bc-mirror" accessibilityLabel="Mirror">
        <Ionicons name="tv-outline" size={20} color={colors.white} />
        <Text style={bc.roundText}>Mirror</Text>
      </Pressable>

      <View style={bc.erg} testID="bc-erg">
        <Text style={bc.ergLabel}>ERG INTENSITY</Text>
        <View style={bc.ergRow}>
          <Pressable onPress={() => onErg(-5)} style={bc.ergBtn} testID="bc-erg-down" hitSlop={6}><Ionicons name="remove" size={18} color={colors.white} /></Pressable>
          <Text style={bc.ergValue}>{erg}%</Text>
          <Pressable onPress={() => onErg(5)} style={bc.ergBtn} testID="bc-erg-up" hitSlop={6}><Ionicons name="add" size={18} color={colors.white} /></Pressable>
        </View>
      </View>

      <Pressable onPress={onControls} style={bc.round} testID="bc-controls" accessibilityLabel="Controls">
        <Ionicons name="options-outline" size={20} color={colors.white} />
        <Text style={bc.roundText}>Controls</Text>
      </Pressable>

      <View style={bc.spacer} />

      <Pressable onPress={onPauseToggle} style={bc.pause} testID="bc-pause">
        <Ionicons name={paused ? "play" : "pause"} size={20} color={colors.bg} />
        <Text style={bc.pauseText}>{paused ? "Resume" : "Pause"}</Text>
      </Pressable>
      <Pressable onPress={onEnd} style={bc.end} testID="bc-end">
        <Ionicons name="stop" size={18} color="#fff" />
        <Text style={bc.endText}>End Workout</Text>
      </Pressable>
    </View>
  );
}

const card = { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border } as const;

const h = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  logo: { width: 96, height: 20 },
  titleWrap: { minWidth: 120, maxWidth: 220 },
  route: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  workout: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  center: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, justifyContent: "center" },
  stat: { alignItems: "center" },
  statLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  statValue: { color: colors.white, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  progressWrap: { flex: 1, maxWidth: 320, minWidth: 120 },
  progressTop: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 4 },
  progressPct: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1 },
  liveOn: { borderColor: colors.green + "66", backgroundColor: colors.green + "18" },
  liveOff: { borderColor: colors.border, backgroundColor: colors.card },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});

const m = StyleSheet.create({
  card: { ...card, flex: 1, paddingHorizontal: 16, paddingVertical: 14, minWidth: 150 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { color: colors.textDim, fontSize: 11.5, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  value: { fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 44 },
  unit: { color: colors.textDim, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  sub: { color: colors.textDim, fontSize: 12.5, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
});

const cn = StyleSheet.create({
  panel: { ...card, padding: 14, gap: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  title: { color: colors.white, fontSize: 12.5, fontWeight: "800", letterSpacing: 1 },
  section: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginTop: 6, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6 },
  rowIcon: { width: 24, alignItems: "center" },
  rowLabel: { color: colors.white, fontSize: 13, fontWeight: "600", flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowState: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 6 },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 11, marginTop: 10 },
  footerText: { fontSize: 11.5, fontWeight: "700" },
});

const cb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12, ...card, borderColor: colors.yellow + "3A", backgroundColor: colors.yellow + "10", paddingVertical: 11, paddingHorizontal: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  name: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5 },
  msg: { color: colors.white, fontSize: 14, fontWeight: "600", lineHeight: 19, marginTop: 2 },
});

const ic = StyleSheet.create({
  card: { ...card, padding: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  value: { fontSize: 26, fontWeight: "900", marginTop: 8, fontVariant: ["tabular-nums"] },
  sub: { color: colors.textFaint, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
});

const ep = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, height: 30, paddingHorizontal: 2 },
});

const tc = StyleSheet.create({
  card: { ...card, padding: 14, paddingBottom: 24, minHeight: 100, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  stats: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 6 },
  stat: { alignItems: "flex-start" },
  statVal: { color: colors.white, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLbl: { color: colors.textFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 2 },
  profileWrap: { position: "absolute", left: 12, right: 12, bottom: 6 },
});

const st = StyleSheet.create({
  wrap: { ...card, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.white, fontSize: 13.5, fontWeight: "800", flex: 1 },
  headRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  remain: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.yellow + "18", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  remainText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 104, gap: 0 },
  seg: { height: "100%", justifyContent: "flex-end", paddingHorizontal: 1 },
  segBar: { width: "100%", borderRadius: 5, borderWidth: 1, overflow: "hidden", justifyContent: "flex-end" },
  segFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.yellow + "3A", borderRightWidth: 2, borderRightColor: colors.yellow },
  segLabel: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 5, justifyContent: "flex-end", gap: 1 },
  segName: { color: colors.white, fontSize: 10.5, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 3 },
  segDesc: { color: "rgba(244,240,233,0.82)", fontSize: 9, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 3 },
  segMeta: { color: colors.yellow, fontSize: 9.5, fontWeight: "800", fontVariant: ["tabular-nums"], textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 3 },
});

const sd = StyleSheet.create({
  panel: { width: 440, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { backgroundColor: colors.yellow + "1E", borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  badgeText: { color: colors.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  zoneDot: { width: 12, height: 12, borderRadius: 6 },
  title: { color: colors.white, fontSize: 22, fontWeight: "800", flex: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  stat: { width: "30%", minWidth: 110, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  statLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  statValue: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  tipBox: { flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: colors.yellow + "10", borderWidth: 1, borderColor: colors.yellow + "33", borderRadius: radius.md, padding: 12, marginTop: 2 },
  tipText: { color: colors.white, fontSize: 13, fontWeight: "600", lineHeight: 18, flex: 1 },
});

const wc = StyleSheet.create({
  card: { ...card, padding: 14, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  plan: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", flex: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.textDim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },
  title: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 2 },
  desc: { color: colors.textDim, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  stepsHead: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  list: { marginTop: 2 },
  listContent: { gap: 5, paddingBottom: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm },
  stepCurrent: { backgroundColor: colors.yellow + "14", borderWidth: 1, borderColor: colors.yellow + "3A" },
  stepBar: { width: 4, alignSelf: "stretch", minHeight: 26, borderRadius: 2 },
  stepName: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  stepDesc: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 1 },
  stepRight: { alignItems: "flex-end", gap: 3, minWidth: 44 },
  stepDur: { color: colors.textDim, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
});

const bc = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, ...card, backgroundColor: colors.nav, paddingHorizontal: 14, paddingVertical: 10 },
  round: { alignItems: "center", justifyContent: "center", gap: 3, minWidth: 62, height: 54, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 },
  roundText: { color: colors.textDim, fontSize: 10.5, fontWeight: "700" },
  erg: { alignItems: "center", justifyContent: "center", height: 54, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  ergLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  ergRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 3 },
  ergBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  ergValue: { color: colors.yellow, fontSize: 15, fontWeight: "800", minWidth: 44, textAlign: "center" },
  spacer: { flex: 1 },
  pause: { flexDirection: "row", alignItems: "center", gap: 8, height: 54, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: colors.yellow },
  pauseText: { color: colors.bg, fontSize: 15, fontWeight: "800" },
  end: { flexDirection: "row", alignItems: "center", gap: 8, height: 54, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: colors.red },
  endText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
