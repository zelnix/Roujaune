import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";
import Svg, {
  Rect, Path, Polyline, Circle, Line, Defs, LinearGradient as SvgGradient, Stop,
} from "react-native-svg";
import { colors, radius, spacing, shadow, textShadow } from "../theme";
import { Touchable, SectionLabel } from "./ui";
import { summaryContent as C, SummaryStats, IntervalScore, fmtDuration } from "../lib/summary";
import { useCoach } from "../lib/coach-persona";
import { useRouter } from "expo-router";
import { pushRideToStrava, stravaRideStatus } from "../lib/ridesync";

const glyph = require("../../assets/images/logo_glyph_t.png");
const heroImg = require("../../assets/images/hero_cyclist_b2.jpg");

const ZONE_COLORS = ["#43C65A", "#9ACD32", colors.yellow, "#E8631C", colors.red];

/* ======================= HEADER ======================= */
export function SummaryHeader({ brandWidth, phone = false, onToast }: { brandWidth: number; phone?: boolean; onToast: (m: string) => void }) {
  return (
    <View style={styles.headerRow} testID="summary-header">
      <View style={[styles.brandCol, { width: brandWidth }]}>
        <View style={styles.brandRow}>
          <Image source={glyph} style={{ width: phone ? 26 : 30, height: phone ? 26 : 30 }} contentFit="contain" />
          {!phone && (
            <Text style={styles.brandText}>
              <Text style={{ color: colors.red }}>ROU</Text>
              <Text style={{ color: colors.yellow }}>JAUNE</Text>
            </Text>
          )}
        </View>
        {!phone && <Text style={styles.brandTagline}>Your strongest ride is your own.</Text>}
      </View>

      <View style={styles.titleCol}>
        <View style={styles.titleRow}>
          <Sparkle x={-6} y={2} />
          <Text style={[styles.title, phone && { fontSize: 24 }]}>Workout Summary</Text>
          <View style={[styles.titleCheck, phone && { width: 22, height: 22, borderRadius: 11 }]}>
            <Ionicons name="checkmark" size={phone ? 14 : 17} color={colors.yellow} />
          </View>
          <Sparkle x={8} y={-4} />
        </View>
        <Text style={[styles.subtitle, phone && { fontSize: 11 }]}>{C.title}  •  {C.date}</Text>
      </View>

      <View style={styles.statusCol}>
        <Text style={styles.clock}>19:42</Text>
        <Touchable testID="header-flame" scaleTo={0.9} onPress={() => onToast("12 day streak 🔥")}>
          <View style={styles.flamePill}>
            <Ionicons name="flame" size={15} color={colors.yellow} />
            <Text style={styles.flameText}>12</Text>
          </View>
        </Touchable>
        <Ionicons name="wifi" size={18} color={colors.white} />
      </View>
    </View>
  );
}

function Sparkle({ x, y }: { x: number; y: number }) {
  return (
    <View style={{ transform: [{ translateX: x }, { translateY: y }] }}>
      <Ionicons name="sparkles" size={14} color={colors.yellow} style={{ opacity: 0.85 }} />
    </View>
  );
}

/* ======================= SIDEBAR ======================= */
const SIDE_ITEMS = [
  { key: "overview", label: "Overview", icon: "home" as const },
  { key: "calendar", label: "Calendar", icon: "calendar-outline" as const },
  { key: "workouts", label: "Workouts", icon: "fitness-outline" as const },
  { key: "routes", label: "Routes", icon: "map-outline" as const },
  { key: "progress", label: "Progress", icon: "stats-chart-outline" as const },
  { key: "connections", label: "Connections", icon: "git-network-outline" as const },
  { key: "settings", label: "Settings", icon: "settings-outline" as const },
];

export function SummarySidebar({ active, onSelect, width, iconOnly = false }: { active: string; onSelect: (k: string) => void; width: number; iconOnly?: boolean }) {
  const persona = useCoach();
  return (
    <View style={[styles.sidebar, { width }, iconOnly && { paddingHorizontal: 6 }]} testID="summary-sidebar">
      <View style={{ gap: 4 }}>
        {SIDE_ITEMS.map((it) => {
          const on = active === it.key;
          const rowStyle = [styles.sideRow, iconOnly && styles.sideRowIcon];
          return (
            <Touchable key={it.key} testID={`side-${it.key}`} onPress={() => onSelect(it.key)} scaleTo={0.96} lift={false}>
              {on ? (
                <LinearGradient
                  colors={["rgba(224,30,43,0.95)", "rgba(110,17,22,0.85)"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[rowStyle, styles.sideRowActive, shadow.glow]}
                >
                  <Ionicons name={it.icon} size={19} color="#fff" />
                  {!iconOnly && <Text style={[styles.sideLabel, { color: "#fff", fontWeight: "700" }]}>{it.label}</Text>}
                </LinearGradient>
              ) : (
                <View style={rowStyle}>
                  <Ionicons name={it.icon} size={19} color={colors.textDim} />
                  {!iconOnly && <Text style={styles.sideLabel}>{it.label}</Text>}
                </View>
              )}
            </Touchable>
          );
        })}
      </View>

      <View style={styles.sideCoach}>
        <View style={[styles.coachAvatarWrap, iconOnly && { width: 40, height: 40 }]}>
          <Image source={persona.image} style={[styles.coachAvatar, iconOnly && { width: 40, height: 40, borderRadius: 20 }]} contentFit="cover" contentPosition="top center" />
          <View style={styles.coachDot} />
        </View>
        {!iconOnly && <Text style={styles.coachName}>{persona.name}</Text>}
        {!iconOnly && <Text style={styles.coachRole}>Coach</Text>}
      </View>
    </View>
  );
}

/* ======================= HERO SUMMARY ======================= */
export function HeroSummaryCard({ compact = false, recap, recapLoading = false, onChat }: { compact?: boolean; recap?: string; recapLoading?: boolean; onChat?: () => void }) {
  const persona = useCoach();
  const recapText = recap ?? C.recap;
  return (
    <View style={styles.hero} testID="hero-summary-card">
      <View style={[styles.heroImgWrap, compact && { minHeight: 130 }]}>
        <Image source={heroImg} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: "30%" }} accessibilityLabel="Rider climbing" />
        <LinearGradient colors={["transparent", "rgba(5,5,5,0.35)"]} style={StyleSheet.absoluteFill} />
        <Text style={[styles.heroCallout, compact && { fontSize: 18, lineHeight: 18 }]}>{C.callout}</Text>
      </View>

      <View style={[styles.heroBody, compact && { padding: spacing.md }]}>
        <Text style={[styles.heroHeadline, compact && { fontSize: 22 }]}>{C.headline}</Text>
        <Text style={[styles.heroSub, compact && { fontSize: 17 }]}>{C.subhead}</Text>

        <View style={[styles.recapCard, compact && { marginTop: 10, padding: 10 }]}>
          <Image source={persona.image} style={[styles.recapAvatar, compact && { width: 40, height: 40, borderRadius: 20 }]} contentFit="cover" contentPosition="top center" />
          <View style={{ flex: 1 }}>
            <View style={styles.recapTitleRow}>
              <Text style={styles.recapTitle}>{`${persona.name}'s recap`}</Text>
              {recapLoading && <ActivityIndicator size="small" color={colors.yellow} />}
            </View>
            <Text style={styles.recapText} numberOfLines={compact ? 3 : undefined}>{recapLoading ? `${persona.name} is reviewing your ride…` : recapText}</Text>
            {onChat ? (
              <Pressable testID="summary-chat-coach" onPress={onChat} accessibilityRole="button" accessibilityLabel={`Talk to ${persona.name} about this ride`}
                style={({ hovered }: any) => [styles.recapChatBtn, hovered && styles.recapChatBtnHover]}>
                <Ionicons name="chatbubble-ellipses" size={14} color={colors.yellow} />
                <Text style={styles.recapChatText}>Talk to {persona.name} about this ride</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.yellow} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/* ======================= METRICS GRID ======================= */
type Cell = { icon: React.ReactNode; label: string; value: string; unit?: string };
function MetricCell({ icon, label, value, unit, last, compact }: Cell & { last?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.mCell, !last && styles.mCellDiv, compact && { paddingHorizontal: spacing.sm }]}>
      <View style={styles.mHead}>{icon}<Text style={styles.mLabel}>{label}</Text></View>
      <Text style={[styles.mValue, compact && { fontSize: 19 }]}>{value}<Text style={styles.mUnit}>{unit ? ` ${unit}` : ""}</Text></Text>
    </View>
  );
}

export function MetricsGrid({ stats, compact = false, routeName }: { stats: SummaryStats; compact?: boolean; routeName?: string }) {
  const y = colors.yellow, r = colors.red, w = colors.white;
  const row1: Cell[] = [
    { icon: <Ionicons name="time-outline" size={14} color={w} />, label: "DURATION", value: fmtDuration(stats.duration_sec) },
    { icon: <MaterialCommunityIcons name="map-marker-distance" size={14} color={y} />, label: "DISTANCE", value: String(stats.distance_km), unit: "km" },
    { icon: <MaterialCommunityIcons name="terrain" size={14} color={y} />, label: "ELEVATION GAIN", value: stats.elevation_m.toLocaleString(), unit: "m" },
    { icon: <Ionicons name="flash" size={14} color={y} />, label: "AVG POWER", value: String(stats.avg_power), unit: "W" },
    { icon: <Ionicons name="flash" size={14} color={y} />, label: "NORM. POWER", value: String(stats.norm_power), unit: "W" },
  ];
  const row2: Cell[] = [
    { icon: <MaterialCommunityIcons name="rotate-right" size={14} color={w} />, label: "AVG CADENCE", value: String(stats.avg_cadence), unit: "rpm" },
    { icon: <Ionicons name="heart" size={14} color={r} />, label: "AVG HEART RATE", value: String(stats.avg_hr), unit: "bpm" },
    { icon: <Ionicons name="flame" size={14} color={r} />, label: "CALORIES", value: stats.calories.toLocaleString(), unit: "kcal" },
    { icon: <MaterialCommunityIcons name="speedometer" size={14} color={r} />, label: "TSS TRAINING LOAD", value: String(stats.tss), unit: "TSS" },
    { icon: <Ionicons name="location" size={14} color={y} />, label: "ROUTE", value: routeName ?? C.route.name },
  ];
  return (
    <View style={styles.metricsCard} testID="metrics-grid">
      <View style={styles.mRow}>{row1.map((c, i) => <MetricCell key={c.label} {...c} last={i === row1.length - 1} compact={compact} />)}</View>
      <View style={styles.mRowDiv} />
      <View style={styles.mRow}>{row2.map((c, i) => <MetricCell key={c.label} {...c} last={i === row2.length - 1} compact={compact} />)}</View>
    </View>
  );
}

/* ======================= COMPLIANCE ======================= */
function Ring({ size, stroke, pct, color, big, small }: { size: number; stroke: number; pct: number; color: string; big: string; small: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </Svg>
      <Text style={styles.ringBig}>{big}</Text>
      <Text style={styles.ringSmall}>{small}</Text>
    </View>
  );
}

function ComplianceCol({ label, value, unit, pct, color }: { label: string; value: string; unit?: string; pct: number; color: string }) {
  return (
    <View style={styles.compCol}>
      <Text style={styles.compLabel}>{label}</Text>
      <Text style={[styles.compValue, { color }]}>{value}<Text style={styles.compUnit}>{unit ? ` ${unit}` : "%"}</Text></Text>
      <View style={styles.compTrack}><View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: color }} /></View>
    </View>
  );
}

export function ComplianceCard({ stats, compact = false }: { stats: SummaryStats; compact?: boolean }) {
  const g = colors.green, y = colors.yellow;
  const cm = stats.compliance;
  return (
    <View style={[styles.complianceCard, compact && { padding: spacing.md, gap: spacing.sm }]} testID="compliance-card">
      <Ring size={compact ? 96 : 128} stroke={compact ? 9 : 11} pct={cm.overall} color={g} big={`${cm.overall}%`} small={"OVERALL\nCOMPLIANCE"} />
      <View style={styles.compDiv} />
      <ComplianceCol label={"TARGET POWER\nCOMPLIANCE"} value={String(cm.power)} pct={cm.power} color={g} />
      <ComplianceCol label={"CADENCE\nCOMPLIANCE"} value={String(cm.cadence)} pct={cm.cadence} color={g} />
      <ComplianceCol label={"TIME IN ZONE 4"} value={String(cm.zone4_min)} unit="min" pct={72} color={y} />
      <ComplianceCol label={"WORKOUT\nCOMPLETED"} value={String(cm.completed)} pct={cm.completed} color={g} />
    </View>
  );
}

/* ======================= INTERVAL TARGETS ======================= */
function compColor(pct: number | null) {
  if (pct == null) return colors.textDim;
  if (pct >= 80) return colors.green;
  if (pct >= 50) return colors.yellow;
  return colors.red;
}

function segMins(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 1 ? `${m} min` : `${sec}s`;
}

export function IntervalTargetsCard({ intervals, overall, hasData, compact = false }: { intervals: IntervalScore[]; overall: number | null; hasData: boolean; compact?: boolean }) {
  // Show only real efforts (skip zero-length rest blocks) to keep it focused.
  const rows = intervals.filter((i) => i.durationSec > 0 && i.targetW > 0);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.intervalCard, compact && { padding: spacing.md }]} testID="interval-targets-card">
      <View style={styles.intervalHead}>
        <View style={styles.mHead}>
          <Ionicons name="flag" size={14} color={colors.yellow} />
          <Text style={styles.chartTitle}>INTERVAL TARGETS</Text>
        </View>
        {overall != null && (
          <View style={styles.accuracyPill}>
            <Text style={[styles.accuracyVal, { color: compColor(overall) }]}>{overall}%</Text>
            <Text style={styles.accuracyLbl}>TARGET ACCURACY</Text>
          </View>
        )}
      </View>
      <Text style={styles.intervalSub}>
        {hasData ? "Your power vs each segment's target" : "Planned targets for this session — ride it to score your accuracy"}
      </Text>
      <View style={styles.intervalCols}>
        <Text style={[styles.icLbl, { flex: 1 }]}>SEGMENT</Text>
        <Text style={[styles.icLbl, styles.icNum]}>TARGET</Text>
        <Text style={[styles.icLbl, styles.icNum]}>YOURS</Text>
        <Text style={[styles.icLbl, styles.icBarCol]}>ACCURACY</Text>
      </View>
      <View style={{ gap: 6, marginTop: 6 }}>
        {rows.map((it, i) => {
          const c = compColor(it.compliance);
          return (
            <View key={`${it.label}-${i}`} style={styles.icRow}>
              <View style={[styles.icDot, { backgroundColor: it.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.icName} numberOfLines={1}>{it.label}</Text>
                <Text style={styles.icMeta}>{it.zoneLabel} · {segMins(it.durationSec)}</Text>
              </View>
              <Text style={[styles.icTarget, styles.icNum]}>{it.targetW} W</Text>
              <Text style={[styles.icActual, styles.icNum, { color: it.avgW == null ? colors.textFaint : c }]}>{it.avgW == null ? "—" : `${it.avgW} W`}</Text>
              <View style={styles.icBarCol}>
                {it.compliance == null ? (
                  <Text style={styles.icPending}>—</Text>
                ) : (
                  <View style={styles.icBarWrap}>
                    <View style={styles.icBarTrack}><View style={{ width: `${Math.min(100, it.compliance)}%`, height: 6, borderRadius: 3, backgroundColor: c }} /></View>
                    <Text style={[styles.icPct, { color: c }]}>{it.compliance}%</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ======================= CHARTS ======================= */
function PowerBarsChart({ stats, width }: { stats: SummaryStats; width: number }) {
  const H = 150, padL = 34, padR = 6, padT = 10, padB = 24;
  const cw = width - padL - padR, ch = H - padT - padB;
  const maxA = stats.power_max_axis;
  const yFor = (v: number) => padT + ch * (1 - v / maxA);
  const n = stats.power_curve.length;
  const gap = 8;
  const bw = (cw - gap * (n - 1)) / n;
  const baseline = padT + ch;

  const areaPts = stats.power_curve.map((v, i) => `${padL + i * (bw + gap) + bw / 2},${yFor(v)}`);
  const areaPath = `M${padL},${baseline} L${areaPts.join(" L")} L${padL + cw},${baseline} Z`;
  const targetY = yFor(stats.power_target);
  const yLabels = [400, 300, 200, 100];
  const xLabels = ["0:00", "15:00", "30:00", "45:00", "60:00"];

  return (
    <View style={styles.chartCard} testID="power-chart">
      <View style={styles.chartHead}>
        <View style={styles.mHead}><Ionicons name="flash" size={14} color={colors.yellow} /><Text style={styles.chartTitle}>POWER</Text></View>
        <Text style={styles.chartAvg}>Avg {stats.avg_power} W</Text>
      </View>
      <Svg width={width} height={H}>
        <Defs>
          <SvgGradient id="pwrArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.yellow} stopOpacity={0.42} />
            <Stop offset="1" stopColor={colors.yellow} stopOpacity={0.04} />
          </SvgGradient>
        </Defs>
        {yLabels.map((v) => (
          <React.Fragment key={v}>
            <Line x1={padL} y1={yFor(v)} x2={padL + cw} y2={yFor(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <SvgText x={padL - 8} y={yFor(v)} />
          </React.Fragment>
        ))}
        <Path d={areaPath} fill="url(#pwrArea)" />
        {stats.power_curve.map((v, i) => {
          const x = padL + i * (bw + gap);
          const top = yFor(v);
          return <Rect key={i} x={x} y={top} width={bw} height={baseline - top} rx={2} fill={colors.red} opacity={0.92} />;
        })}
        <Line x1={padL} y1={targetY} x2={padL + cw} y2={targetY} stroke="#fff" strokeWidth={1.5} strokeDasharray="5,4" opacity={0.85} />
      </Svg>
      <View style={[styles.yAxis, { height: H, pointerEvents: "none" }]}>
        {yLabels.map((v) => <Text key={v} style={[styles.axisLabel, { top: yFor(v) - 6 }]}>{v}</Text>)}
      </View>
      <View style={styles.xAxis}>{xLabels.map((l) => <Text key={l} style={styles.axisLabel}>{l}</Text>)}</View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={styles.dashLegend} /><Text style={styles.legendText}>Target Power</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.red }]} /><Text style={styles.legendText}>Actual Power</Text></View>
      </View>
    </View>
  );
}

// tiny helper to avoid importing SvgText everywhere (labels rendered as RN Text overlay)
function SvgText(_: { x: number; y: number }) { return null; }

function HRLineChart({ stats, width }: { stats: SummaryStats; width: number }) {
  const H = 150, padL = 34, padR = 6, padT = 10, padB = 24;
  const cw = width - padL - padR, ch = H - padT - padB;
  const maxA = stats.hr_max_axis, minA = 60;
  const yFor = (v: number) => padT + ch * (1 - (v - minA) / (maxA - minA));
  const n = stats.hr_curve.length;
  const stepX = n > 1 ? cw / (n - 1) : cw;
  const pts = stats.hr_curve.map((v, i) => [padL + i * stepX, yFor(v)]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const baseline = padT + ch;
  const areaPath = `M${padL},${baseline} L${pts.map((p) => p.join(",")).join(" L")} L${padL + (n - 1) * stepX},${baseline} Z`;
  const yLabels = [180, 150, 120, 90, 60];
  const xLabels = ["0:00", "15:00", "30:00", "45:00", "60:00"];

  return (
    <View style={styles.chartCard} testID="hr-chart">
      <View style={styles.chartHead}>
        <View style={styles.mHead}><Ionicons name="heart" size={14} color={colors.red} /><Text style={styles.chartTitle}>HEART RATE</Text></View>
        <Text style={styles.chartAvg}>Avg {stats.avg_hr} bpm</Text>
      </View>
      <Svg width={width} height={H}>
        <Defs>
          <SvgGradient id="hrArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.red} stopOpacity={0.38} />
            <Stop offset="1" stopColor={colors.red} stopOpacity={0.03} />
          </SvgGradient>
        </Defs>
        {yLabels.map((v) => (
          <Line key={v} x1={padL} y1={yFor(v)} x2={padL + cw} y2={yFor(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
        <Path d={areaPath} fill="url(#hrArea)" />
        <Polyline points={line} fill="none" stroke={colors.red} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={[styles.yAxis, { height: H, pointerEvents: "none" }]}>
        {yLabels.map((v) => <Text key={v} style={[styles.axisLabel, { top: yFor(v) - 6 }]}>{v}</Text>)}
      </View>
      <View style={styles.xAxis}>{xLabels.map((l) => <Text key={l} style={styles.axisLabel}>{l}</Text>)}</View>
    </View>
  );
}

function TimeInZonesPanel({ stats, full = false }: { stats: SummaryStats; full?: boolean }) {
  return (
    <View style={[styles.zonesCard, full && { width: "100%" }]} testID="zones-panel">
      <Text style={styles.zonesTitle}>TIME IN ZONES</Text>
      <View style={{ gap: 7, marginTop: 8 }}>
        {stats.zones.map((z, i) => {
          const hot = i >= 3;
          return (
            <View key={z.z} style={styles.zRow}>
              <Text style={[styles.zLbl, hot && { color: colors.red }]}>{z.z}</Text>
              <View style={styles.zTrack}><View style={{ width: `${z.w * 100}%`, height: 8, borderRadius: 4, backgroundColor: ZONE_COLORS[i] }} /></View>
              <Text style={styles.zTime}>{z.time}</Text>
              <Text style={styles.zPct}>{z.pct}%</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.zTotalRow}>
        <Text style={styles.zTotalLbl}>Total</Text>
        <Text style={styles.zTotalVal}>{fmtHms(stats.duration_sec)}</Text>
        <Text style={styles.zTotalPct}>100%</Text>
      </View>
    </View>
  );
}

function fmtHms(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ChartsRow({ stats, width, vertical = false }: { stats: SummaryStats; width: number; vertical?: boolean }) {
  if (vertical) {
    const w = Math.max(220, width - spacing.md * 2);
    return (
      <View style={styles.chartsCol} testID="charts-row">
        <PowerBarsChart stats={stats} width={w} />
        <HRLineChart stats={stats} width={w} />
        <TimeInZonesPanel stats={stats} full />
      </View>
    );
  }
  const zonesW = 220;
  const chartW = Math.max(220, (width - zonesW - spacing.md * 2) / 2);
  return (
    <View style={styles.chartsRow} testID="charts-row">
      <PowerBarsChart stats={stats} width={chartW} />
      <HRLineChart stats={stats} width={chartW} />
      <TimeInZonesPanel stats={stats} />
    </View>
  );
}

/* ======================= SYNC & EXPORT ======================= */
const SYNC_ICON: Record<string, { icon: React.ReactNode }> = {
  strava: { icon: <MaterialCommunityIcons name="bike-fast" size={18} color="#FC4C02" /> },
  apple: { icon: <Ionicons name="heart" size={18} color="#FF2D55" /> },
  wellness: { icon: <MaterialCommunityIcons name="flower-tulip" size={18} color="#B983FF" /> },
};

/** Push this indoor ride up to Strava. Reflects auto-upload state: once the
 *  ride is on Strava the button reads "Synced to Strava". */
export function StravaPushButton({ rideId, coachSummary, onToast }: { rideId?: string | null; coachSummary?: string; onToast: (m: string) => void }) {
  const router = useRouter();
  const [state, setState] = React.useState<{ connected: boolean; can_write: boolean; synced: boolean; pending: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState<string>("");
  // Seed the editable note from the coach summary once it arrives.
  React.useEffect(() => { if (coachSummary && !note) setNote(coachSummary); }, [coachSummary]);

  const refresh = React.useCallback(async () => {
    if (!rideId) return;
    try { setState(await stravaRideStatus(rideId)); } catch { /* offline */ }
  }, [rideId]);

  React.useEffect(() => {
    refresh();
    // Auto-push runs server-side on save — re-check shortly to catch it.
    const t = setTimeout(refresh, 3000);
    return () => clearTimeout(t);
  }, [refresh]);

  if (!rideId || !state || !state.connected) return null;  // hide unless Strava is linked

  const synced = state.synced;
  const pending = state.pending && !synced;
  const needsReauth = state.connected && !state.can_write;

  const onPress = async () => {
    if (synced || busy) return;
    if (needsReauth) { router.push("/connections" as any); onToast("Reconnect Strava to allow uploads"); return; }
    setBusy(true);
    try {
      const r: any = await pushRideToStrava(rideId, (note || coachSummary || "").trim() || undefined);
      if (r?.reauth_required) { onToast("Reconnect Strava to allow uploads"); router.push("/connections" as any); }
      else if (r?.ok) { setState((s) => ({ ...(s as any), synced: true })); onToast(r.already ? "Already on Strava" : (r.with_graph ? "Uploaded to Strava with graph" : "Sent to Strava")); }
    } catch { onToast("Strava upload failed — try again"); }
    finally { setBusy(false); }
  };

  const label = synced ? "Synced to Strava" : pending ? "Uploading to Strava…" : needsReauth ? "Reconnect Strava to upload" : "Send to Strava";
  const icon: any = synced ? "checkmark-circle" : pending ? "cloud-upload-outline" : "logo-buffer";
  const tint = synced ? colors.green : colors.yellow;

  return (
    <View style={{ gap: 8 }}>
      <Pressable testID="strava-push" onPress={onPress} disabled={synced || busy || pending}
        style={[styles.stravaBtn, { borderColor: tint }, (synced || pending) && { opacity: 0.85 }]}
        accessibilityRole="button" accessibilityLabel={label}>
        {busy || pending ? <ActivityIndicator size="small" color={tint} /> : <Ionicons name={icon} size={18} color={tint} />}
        <Text style={[styles.stravaBtnText, { color: tint }]}>{label}</Text>
      </Pressable>
      {!synced && !needsReauth && (
        <Pressable onPress={() => setEditing((v) => !v)} style={styles.stravaEditToggle} testID="strava-edit-note">
          <Ionicons name={editing ? "chevron-up" : "create-outline"} size={14} color={colors.textDim} />
          <Text style={styles.stravaEditText}>{editing ? "Hide note" : "Edit note sent to Strava"}</Text>
        </Pressable>
      )}
      {editing && !synced && (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note for your Strava activity…"
          placeholderTextColor={colors.textFaint}
          multiline
          style={styles.stravaNote}
          testID="strava-note-input"
        />
      )}
    </View>
  );
}

export function SyncExportRow({ onToast, compact = false }: { onToast: (m: string) => void; compact?: boolean }) {
  const router = useRouter();
  return (
    <View style={[styles.syncCard, compact && styles.syncCardWrap]} testID="sync-export-row">
      <View style={styles.syncLabelWrap}>
        <Ionicons name="code-slash" size={15} color={colors.textDim} />
        <Text style={styles.syncLabel}>SYNC & EXPORT</Text>
      </View>
      {C.sync.map((s) => (
        <Touchable key={s.key} testID={`sync-${s.key}`} onPress={() => router.push("/connections" as any)} scaleTo={0.96} lift={false} containerStyle={compact ? { minWidth: "44%", flexGrow: 1 } : { flex: 1 }}>
          <View style={styles.syncItem}>
            {SYNC_ICON[s.key].icon}
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.syncName} numberOfLines={1}>{s.label}</Text>
              <View style={styles.syncStatusRow}>
                <View style={styles.syncDot} />
                <Text style={styles.syncStatus}>{s.status}</Text>
              </View>
            </View>
          </View>
        </Touchable>
      ))}
      <View style={styles.syncAll}>
        <Ionicons name="checkmark-circle" size={18} color={colors.green} />
        <View><Text style={styles.syncAllTop}>All synced</Text><Text style={styles.syncAllBot}>Just now</Text></View>
      </View>
    </View>
  );
}

/* ======================= RIGHT COLUMN ======================= */
export function RouteSummaryCard({ route }: { route?: { name: string; place: string; distance: string; elevation: string; tag: string } }) {
  const name = route?.name ?? C.route.name;
  const stat = route ? `${route.distance}  •  ${route.elevation} climb` : C.route.stat;
  const place = route?.place;
  return (
    <View style={styles.rightCard} testID="route-summary-card">
      <View style={styles.mHead}><MaterialCommunityIcons name="terrain" size={14} color={colors.yellow} /><Text style={styles.rightHeadLabel}>ROUTE SUMMARY</Text></View>
      <Text style={styles.routeName}>{name}</Text>
      <Text style={styles.routeStat}>{place ? `${place}  ·  ${stat}` : stat}</Text>
      <View style={styles.routeCompleted}>
        <Ionicons name="checkmark-circle" size={14} color={colors.green} />
        <Text style={styles.routeCompletedText}>{C.route.status}</Text>
      </View>
      <RouteElevationMap />
      <View style={styles.routeAxis}>
        <Text style={styles.axisLabel}>{C.route.low}</Text>
        <Text style={styles.axisLabel}>{C.route.high}</Text>
      </View>
      <View style={styles.savedRow}>
        <Ionicons name="checkmark-circle-outline" size={15} color={colors.green} />
        <Text style={styles.savedText}>{C.route.saved}</Text>
      </View>
    </View>
  );
}

function RouteElevationMap() {
  const W = 300, H = 130;
  return (
    <View style={styles.mapWrap}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="terr" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.yellow} stopOpacity={0.5} />
            <Stop offset="1" stopColor="#3a2a08" stopOpacity={0.15} />
          </SvgGradient>
        </Defs>
        {/* elevation silhouette rising to the right */}
        <Path
          d={`M0 ${H} L0 118 C60 112 90 96 130 86 C175 74 200 60 235 44 C260 32 285 20 ${W} 10 L${W} ${H} Z`}
          fill="url(#terr)"
        />
        {/* climbing route line */}
        <Path
          d={`M18 118 C70 108 90 96 130 84 C175 70 200 56 238 40 C262 30 280 22 292 14`}
          fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"
        />
        <Circle cx={130} cy={84} r={6} fill={colors.red} stroke="#fff" strokeWidth={1.5} />
      </Svg>
      <View style={styles.flagBadge}><MaterialCommunityIcons name="flag-checkered" size={14} color="#fff" /></View>
    </View>
  );
}

export function AchievementsCard() {
  return (
    <View style={styles.rightCard} testID="achievements-card">
      <View style={styles.mHead}><Ionicons name="trophy" size={14} color={colors.yellow} /><Text style={styles.rightHeadLabel}>ACHIEVEMENTS</Text></View>
      <View style={{ gap: 12, marginTop: 10 }}>
        {C.achievements.map((a, i) => (
          <View key={i} style={styles.achRow}>
            {a.badge ? (
              <LinearGradient colors={[colors.red, "#6E1116"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.achBadge}>
                <MaterialCommunityIcons name="run-fast" size={18} color="#fff" />
              </LinearGradient>
            ) : (
              <View style={styles.achIcon}><MaterialCommunityIcons name={a.icon === "trending-up" ? "chart-line-variant" : "fire"} size={18} color={a.color} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.achTitle}>{a.title}</Text>
              <Text style={styles.achDetail}>{a.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function RecoveryCard({ score }: { score: number }) {
  const rec = C.recovery;
  return (
    <View style={styles.rightCard} testID="recovery-card">
      <View style={styles.mHead}><Ionicons name="leaf" size={14} color={colors.green} /><Text style={styles.rightHeadLabel}>RECOVERY & NEXT STEPS</Text></View>
      <View style={styles.recoveryTop}>
        <Ring size={76} stroke={8} pct={score} color={colors.green} big={`${score}%`} small={"RECOVERY\nSCORE"} />
        <View style={{ flex: 1 }}>
          <Text style={styles.recRecoTitle}>{rec.recTitle}</Text>
          <Text style={styles.recRecoText}>{rec.rec}</Text>
        </View>
      </View>
      <View style={{ marginTop: 6 }}>
        {rec.items.map((it, i) => (
          <View key={i} style={styles.recItem}>
            <View style={styles.recItemIcon}><Ionicons name={it.icon as any} size={15} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recItemLabel}>{it.label}</Text>
            </View>
            <Text style={styles.recItemVal}>{it.value}</Text>
            {it.chevron && <Ionicons name="chevron-forward" size={15} color={colors.textDim} style={{ marginLeft: 4 }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ======================= BOTTOM ACTION BAR ======================= */
export function BottomActionBar({ onView, onSave, onShare, saved = false, compact = false }: { onView: () => void; onSave: () => void; onShare: () => void; saved?: boolean; compact?: boolean }) {
  const btn = [styles.actBtn, compact && { height: 46 }];
  const txt = [styles.actText, compact && { fontSize: 12 }];
  return (
    <View style={styles.actionBar} testID="bottom-action-bar">
      {saved ? (
        <View style={[btn, styles.savedPill, { flex: 1.1 }]} testID="workout-saved-pill">
          <Ionicons name="checkmark-circle" size={compact ? 16 : 18} color={colors.green} />
          <Text style={[txt, { color: colors.green }]} numberOfLines={1}>WORKOUT SAVED</Text>
        </View>
      ) : null}
      <Touchable testID="action-view" onPress={onView} scaleTo={0.97} style={{ flex: 1.2 }} containerStyle={{ flex: 1.2 }}>
        <View style={[btn, { backgroundColor: colors.yellow }]}>
          <MaterialCommunityIcons name="chart-line" size={compact ? 16 : 18} color="#1a1300" />
          <Text style={[txt, { color: "#1a1300" }]} numberOfLines={1}>{compact ? "ANALYSIS" : "VIEW FULL ANALYSIS"}</Text>
        </View>
      </Touchable>
      <Touchable testID="action-save" onPress={onSave} scaleTo={0.97} style={{ flex: 1.5 }} containerStyle={{ flex: 1.5 }}>
        <View style={[btn, { backgroundColor: colors.green, borderWidth: 0 }, shadow.glow]}>
          <Ionicons name={saved ? "exit-outline" : "save"} size={compact ? 18 : 20} color="#0b1a10" />
          <Text style={[txt, { color: "#0b1a10", fontWeight: "900" }]} numberOfLines={1}>{saved ? "EXIT" : "SAVE & EXIT"}</Text>
        </View>
      </Touchable>
      <Touchable testID="action-share" onPress={onShare} scaleTo={0.97} style={{ flex: 1 }} containerStyle={{ flex: 1 }}>
        <View style={[btn, { backgroundColor: colors.red }]}>
          <Ionicons name="share-social" size={compact ? 16 : 18} color="#fff" />
          <Text style={txt} numberOfLines={1}>SHARE RIDE</Text>
        </View>
      </Touchable>
    </View>
  );
}

const mHead = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 };
const cardBase = { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card };

const styles = StyleSheet.create({
  /* header */
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingBottom: spacing.sm },
  brandCol: { justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontSize: 20, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  brandTagline: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  titleCol: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.white, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  titleCheck: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  subtitle: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: 4 },
  statusCol: { flexDirection: "row", alignItems: "center", gap: 14 },
  clock: { color: colors.white, fontSize: 18, fontWeight: "700" },
  flamePill: { flexDirection: "row", alignItems: "center", gap: 4 },
  flameText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  /* sidebar */
  sidebar: { ...cardBase, paddingVertical: spacing.md, paddingHorizontal: 10, justifyContent: "space-between" },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: radius.md },
  sideRowIcon: { justifyContent: "center", gap: 0, paddingHorizontal: 0, paddingVertical: 12 },
  sideRowActive: { borderWidth: 1, borderColor: "rgba(224,30,43,0.5)" },
  sideLabel: { color: colors.textDim, fontSize: 13.5, fontWeight: "600" },
  sideCoach: { alignItems: "center", paddingTop: spacing.md },
  coachAvatarWrap: { width: 52, height: 52 },
  coachAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.border },
  coachDot: { position: "absolute", top: 2, right: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.card },
  coachName: { color: colors.white, fontSize: 14, fontWeight: "700", marginTop: 6 },
  coachRole: { color: colors.textDim, fontSize: 11 },

  /* hero */
  hero: { ...cardBase, flexDirection: "row", overflow: "hidden", padding: 0 },
  heroImgWrap: { width: "42%", minHeight: 200, backgroundColor: "#000", justifyContent: "flex-end" },
  heroCallout: { position: "absolute", left: 14, bottom: 12, color: colors.yellow, fontSize: 26, fontWeight: "900", fontStyle: "italic", lineHeight: 26, ...textShadow("rgba(0,0,0,0.7)", 6), transform: [{ rotate: "-4deg" }] },
  heroBody: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  heroHeadline: { color: colors.white, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  heroSub: { color: colors.white, fontSize: 27, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  recapCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 12, marginTop: 16 },
  recapAvatar: { width: 52, height: 52, borderRadius: 26 },
  recapTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  recapTitle: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  recapText: { color: colors.textDim, fontSize: 13, marginTop: 3, lineHeight: 18 },
  recapChatBtn: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", marginTop: 10, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "rgba(255,194,10,0.08)" },
  recapChatBtnHover: { backgroundColor: "rgba(255,194,10,0.16)" },
  recapChatText: { color: colors.yellow, fontSize: 12, fontWeight: "700" },

  /* metrics */
  metricsCard: { ...cardBase, paddingVertical: spacing.md },
  mRow: { flexDirection: "row" },
  mRowDiv: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 12, marginHorizontal: spacing.md },
  mCell: { flex: 1, paddingHorizontal: spacing.md },
  mCellDiv: { borderRightWidth: 1, borderRightColor: colors.borderSoft },
  mHead,
  mLabel: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  mValue: { color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 5 },
  mUnit: { color: colors.textDim, fontSize: 13, fontWeight: "700" },

  /* compliance */
  complianceCard: { ...cardBase, flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  compDiv: { width: 1, alignSelf: "stretch", backgroundColor: colors.borderSoft, marginHorizontal: 4 },
  ringBig: { color: colors.white, fontSize: 26, fontWeight: "900" },
  ringSmall: { color: colors.textDim, fontSize: 8.5, fontWeight: "700", textAlign: "center", letterSpacing: 0.4, marginTop: 1 },
  compCol: { flex: 1 },
  compLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, minHeight: 26 },
  compValue: { fontSize: 30, fontWeight: "900", marginTop: 6 },
  compUnit: { fontSize: 15, fontWeight: "800" },
  compTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10, overflow: "hidden" },

  /* interval targets */
  intervalCard: { ...cardBase, padding: spacing.lg, gap: 2 },
  intervalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  intervalSub: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  accuracyPill: { alignItems: "flex-end" },
  accuracyVal: { fontSize: 22, fontWeight: "900" },
  accuracyLbl: { color: colors.textDim, fontSize: 8.5, fontWeight: "700", letterSpacing: 0.4 },
  intervalCols: { flexDirection: "row", alignItems: "center", marginTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  icLbl: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  icNum: { width: 62, textAlign: "right" },
  icBarCol: { width: 118, textAlign: "right", alignItems: "flex-end" },
  icRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  icDot: { width: 9, height: 9, borderRadius: 3 },
  icName: { color: colors.white, fontSize: 13, fontWeight: "700" },
  icMeta: { color: colors.textDim, fontSize: 10.5, marginTop: 1 },
  icTarget: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  icActual: { fontSize: 13, fontWeight: "800" },
  icBarWrap: { flexDirection: "row", alignItems: "center", gap: 7, width: 118, justifyContent: "flex-end" },
  icBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  icPct: { fontSize: 12, fontWeight: "800", width: 38, textAlign: "right" },
  icPending: { color: colors.textFaint, fontSize: 13, fontWeight: "700" },

  /* charts */
  chartsRow: { flexDirection: "row", gap: spacing.md },
  chartsCol: { flexDirection: "column", gap: spacing.md },
  chartCard: { ...cardBase, flex: 1, padding: spacing.md, paddingBottom: spacing.sm },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  chartTitle: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  chartAvg: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  yAxis: { position: "absolute", left: spacing.md, top: 36, width: 30 },
  axisLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "600" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 30, marginTop: -18 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dashLegend: { width: 14, height: 0, borderTopWidth: 1.5, borderColor: "#fff", borderStyle: "dashed" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.textDim, fontSize: 10.5 },

  /* zones */
  zonesCard: { ...cardBase, width: 220, padding: spacing.md },
  zonesTitle: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  zRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  zLbl: { color: colors.textDim, fontSize: 11, fontWeight: "700", width: 18 },
  zTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  zTime: { color: colors.white, fontSize: 11, fontWeight: "600", width: 48, textAlign: "right" },
  zPct: { color: colors.textDim, fontSize: 11, fontWeight: "600", width: 30, textAlign: "right" },
  zTotalRow: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  zTotalLbl: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", flex: 1 },
  zTotalVal: { color: colors.white, fontSize: 11.5, fontWeight: "700", width: 60, textAlign: "right" },
  zTotalPct: { color: colors.white, fontSize: 11.5, fontWeight: "700", width: 34, textAlign: "right" },

  /* sync */
  syncCard: { ...cardBase, flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: spacing.md, gap: spacing.md },
  stravaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: "rgba(245,179,1,0.06)" },
  stravaBtnText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  stravaEditToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingVertical: 2 },
  stravaEditText: { color: colors.textDim, fontSize: 12.5, fontWeight: "700" },
  stravaNote: { minHeight: 66, color: colors.white, fontSize: 13.5, lineHeight: 19, backgroundColor: colors.cardElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, textAlignVertical: "top" },
  syncCardWrap: { flexWrap: "wrap", rowGap: spacing.sm },
  syncLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: spacing.md, borderRightWidth: 1, borderRightColor: colors.borderSoft },
  syncLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  syncItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncName: { color: colors.white, fontSize: 12, fontWeight: "700" },
  syncStatusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  syncStatus: { color: colors.greenText, fontSize: 11, fontWeight: "600" },
  syncAll: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
  syncAllTop: { color: colors.white, fontSize: 11.5, fontWeight: "700" },
  syncAllBot: { color: colors.textDim, fontSize: 10.5 },

  /* right column */
  rightCard: { ...cardBase, padding: spacing.md },
  rightHeadLabel: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  routeName: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 8 },
  routeStat: { color: colors.textDim, fontSize: 12.5, marginTop: 3 },
  routeCompleted: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  routeCompletedText: { color: colors.greenText, fontSize: 12, fontWeight: "700" },
  mapWrap: { height: 130, marginTop: 10, borderRadius: radius.md, backgroundColor: "#0C0E0D", borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  flagBadge: { position: "absolute", top: 8, right: 8 },
  routeAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  savedText: { color: colors.textDim, fontSize: 12 },

  achRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  achBadge: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  achIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  achTitle: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  achDetail: { color: colors.textDim, fontSize: 11.5, marginTop: 2 },

  recoveryTop: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  recRecoTitle: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  recRecoText: { color: colors.white, fontSize: 14, fontWeight: "600", marginTop: 3, lineHeight: 19 },
  recItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  recItemIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  recItemLabel: { color: colors.white, fontSize: 12.5, fontWeight: "600" },
  recItemVal: { color: colors.textDim, fontSize: 11.5, fontWeight: "500", textAlign: "right" },

  /* action bar */
  actionBar: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, height: 54, borderRadius: radius.md },
  actDark: { backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border },
  savedPill: { backgroundColor: colors.green + "1A", borderWidth: 1, borderColor: colors.green + "55" },
  actText: { color: colors.white, fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
});
