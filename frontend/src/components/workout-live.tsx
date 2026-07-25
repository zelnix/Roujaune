import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
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

// ---- Interval timeline (bottom) -------------------------------------------
export function IntervalTimeline({
  title, profile, activeIndex, remaining, step, next,
}: {
  title: string; profile?: number[]; activeIndex?: number; remaining?: string; step?: string;
  next?: { label: string; time: string; target: string; rpe: string };
}) {
  const bars = profile && profile.length ? profile : [0.5, 0.7, 0.9, 0.7, 0.5];
  const n = bars.length;
  const activeBar = typeof activeIndex === "number" ? Math.round((activeIndex / Math.max(1, n)) * n) : -1;
  return (
    <View style={tl.wrap} testID="interval-timeline">
      <View style={tl.main}>
        <View style={tl.head}>
          <Text style={tl.title} numberOfLines={1}>{title}</Text>
          {step ? <Text style={tl.step}>STEP {step}</Text> : null}
          {remaining ? (
            <View style={tl.remain}><Ionicons name="time-outline" size={13} color={colors.yellow} /><Text style={tl.remainText}>{remaining} REMAINING</Text></View>
          ) : null}
        </View>
        <View style={tl.bars}>
          {bars.map((b, i) => (
            <View key={i} style={[tl.bar, { height: 8 + Math.max(0, Math.min(1, b)) * 26 }, i === activeBar && tl.barActive, i < activeBar && tl.barDone]} />
          ))}
        </View>
      </View>
      {next ? (
        <View style={tl.next}>
          <Text style={tl.nextLabel}>NEXT UP</Text>
          <Text style={tl.nextName} numberOfLines={1}>{next.label}</Text>
          <View style={tl.nextRow}>
            <Text style={tl.nextMeta}>{next.time}</Text>
            <Text style={tl.nextDot}>·</Text>
            <Text style={[tl.nextMeta, { color: colors.yellow }]}>{next.target}</Text>
          </View>
        </View>
      ) : null}
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
  pillText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  value: { fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 44 },
  unit: { color: colors.textDim, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  sub: { color: colors.textFaint, fontSize: 11, fontWeight: "700", marginTop: 4, letterSpacing: 0.5 },
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

const tl = StyleSheet.create({
  wrap: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  main: { ...card, flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.white, fontSize: 13.5, fontWeight: "800", flex: 1 },
  step: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  remain: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.yellow + "18", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  remainText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 34, marginTop: 10 },
  bar: { flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 3 },
  barActive: { backgroundColor: colors.yellow },
  barDone: { backgroundColor: colors.yellow + "66" },
  next: { ...card, width: 168, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center" },
  nextLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  nextName: { color: colors.white, fontSize: 14, fontWeight: "800", marginTop: 4 },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  nextMeta: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  nextDot: { color: colors.textFaint, fontSize: 12 },
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
