import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Rect, Path, Polyline, Circle, Line } from "react-native-svg";
import { colors, radius, spacing, shadow } from "../theme";
import { Touchable, SectionLabel } from "./ui";

const glyph = require("../../assets/images/logo_glyph_t.png");
const riderImg = require("../../assets/images/hero_cyclist_b2.jpg");

const ZONE = { z1: "#43C65A", z2: "#9ACD32", z3: colors.yellow, z4: "#E8631C", z5: colors.red };

/* ============================ TOP BAR ============================ */
export function BrandWordmark() {
  return (
    <View style={styles.brandRow}>
      <Image source={glyph} style={{ width: 34, height: 34 }} contentFit="contain" />
      <Text style={styles.brandText}>
        <Text style={{ color: colors.red }}>ROU</Text>
        <Text style={{ color: colors.yellow }}>JAUNE</Text>
      </Text>
    </View>
  );
}

export function WorkoutTopBar({ elapsed, connectionState, stale, onPress }: { elapsed: string; connectionState: string; stale: boolean; onPress: (m: string) => void }) {
  const conn = connectionState === "connected" && !stale
    ? { c: colors.green, label: "LIVE", icon: "wifi" as const }
    : connectionState === "connected" && stale
    ? { c: colors.yellow, label: "ESTIMATED", icon: "cellular" as const }
    : connectionState === "disconnected"
    ? { c: colors.red, label: "OFFLINE", icon: "cloud-offline" as const }
    : { c: colors.yellow, label: "RECONNECTING", icon: "sync" as const };
  return (
    <View style={styles.topBar}>
      <BrandWordmark />
      <View style={styles.topElapsed}>
        <Text style={styles.elapsedVal}>{elapsed}</Text>
        <Text style={styles.microLabel}>ELAPSED TIME</Text>
      </View>
      <View style={styles.topProgress}>
        <Text style={styles.routeName}>Alpe d&apos;Huez</Text>
        <View style={styles.progressRow}>
          <Text style={styles.progressEnd}>24.6 km</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "60%" }]} />
          </View>
          <Text style={styles.progressEnd}>16.0 km</Text>
        </View>
        <Text style={styles.progressPct}>60%</Text>
      </View>
      <View style={styles.topElapsed}>
        <Text style={styles.elapsedVal}>19:35</Text>
        <Text style={styles.microLabel}>FINISH TIME</Text>
      </View>
      <View style={styles.topIcons}>
        <Ionicons name="flame" size={18} color={colors.yellow} />
        <Text style={styles.flameText}>12</Text>
        <Touchable testID="connection-status" scaleTo={0.9} onPress={() => onPress(conn.label)}>
          <View style={[styles.connPill, { borderColor: conn.c }]}>
            <View style={[styles.connDot, { backgroundColor: conn.c }]} />
            <Ionicons name={conn.icon} size={14} color={conn.c} />
            <Text style={[styles.connText, { color: conn.c }]}>{conn.label}</Text>
          </View>
        </Touchable>
        <Touchable testID="settings-icon" scaleTo={0.9} onPress={() => onPress("Settings")}><Ionicons name="settings-outline" size={20} color={colors.white} /></Touchable>
      </View>
    </View>
  );
}

/* ============================ LIVE METRIC CARDS ============================ */
function ZoneBlocks({ active }: { active: number }) {
  const cols = ["#8D101A", "#CF1526", "#E8631C", colors.yellow, colors.green, "#43C65A", "#2FA847"];
  return (
    <View style={styles.zoneBlocks}>
      {cols.map((c, i) => (
        <View key={i} style={[styles.zoneBlock, { backgroundColor: c, opacity: i === active ? 1 : 0.4 }]}>
          {i === active && <View style={styles.zoneMarker} />}
        </View>
      ))}
    </View>
  );
}

export function PowerCard({ power, wkg }: { power: number; wkg: string }) {
  return (
    <View style={styles.metricCard} testID="power-card">
      <View style={styles.metricHead}><Ionicons name="flash" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>POWER</SectionLabel></View>
      <View style={styles.metricValRow}>
        <Text style={styles.metricBig}>{power}</Text>
        <Text style={styles.metricUnit}>W</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.metricSecondary}>{wkg} <Text style={styles.microLabel}>W/kg</Text></Text>
      </View>
      <View style={styles.metricDivider} />
      <View style={styles.tgtRow}>
        <Text style={styles.microLabel}>TARGET</Text>
        <Text style={styles.tgtVal}>251 W</Text>
      </View>
      <View style={styles.tgtRow}>
        <Text style={styles.microLabel}>ZONE</Text>
        <ZoneBlocks active={3} />
        <Text style={styles.zoneTag}>Z4</Text>
      </View>
    </View>
  );
}

export function HeartRateCard({ hr }: { hr: number }) {
  const pct = Math.min(1, Math.max(0, (hr - 90) / (178 - 90)));
  return (
    <View style={styles.metricCard} testID="heart-rate-card">
      <View style={styles.metricHead}><Ionicons name="heart" size={15} color={colors.red} /><SectionLabel color={colors.red}>HEART RATE</SectionLabel></View>
      <View style={styles.metricValRow}>
        <Text style={styles.metricBig}>{hr}</Text>
        <Text style={styles.metricUnit}>bpm</Text>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end" }}><Text style={styles.microLabel}>ZONE</Text><Text style={styles.zoneTag}>Z4</Text></View>
      </View>
      <View style={styles.hrBarWrap}>
        <LinearGradient colors={[ZONE.z1, ZONE.z2, ZONE.z3, ZONE.z4, ZONE.z5]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hrBar} />
        <View style={[styles.hrMarker, { left: `${pct * 100}%` }]} />
      </View>
      <View style={styles.tgtRow}>
        <Text style={styles.microLabel}>Max 178 bpm</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.microLabel}>Avg 148 bpm</Text>
      </View>
    </View>
  );
}

export function CadenceCard({ cadence }: { cadence: number }) {
  const bars = Array.from({ length: 22 }, (_, i) => 0.3 + Math.abs(Math.sin(i * 0.7)) * 0.7);
  const activeIdx = Math.round((cadence / 120) * bars.length);
  return (
    <View style={styles.metricCard} testID="cadence-card">
      <View style={styles.metricHead}><Ionicons name="sync" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>CADENCE</SectionLabel></View>
      <View style={styles.metricValRow}>
        <Text style={styles.metricBig}>{cadence}</Text>
        <Text style={styles.metricUnit}>rpm</Text>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end" }}><Text style={styles.microLabel}>TARGET</Text><Text style={styles.tgtVal}>90–100</Text></View>
      </View>
      <View style={styles.cadenceBars}>
        {bars.map((h, i) => (
          <View key={i} style={{ width: 5, height: 6 + h * 26, borderRadius: 2, backgroundColor: i === activeIdx ? colors.yellow : "rgba(255,255,255,0.18)" }} />
        ))}
      </View>
    </View>
  );
}

/* ============================ WORKOUT TIMELINE ============================ */
export function IntervalProfile({ width, height = 92 }: { width: number; height?: number }) {
  // blocks: [x0..x1 fraction, level 0..1, kind]
  const blocks = [
    { w: 0.1, h: 0.3, k: "warm" },
    { w: 0.14, h: 0.78, k: "th" },
    { w: 0.08, h: 0.35, k: "rec" },
    { w: 0.16, h: 0.9, k: "active" },
    { w: 0.08, h: 0.35, k: "rec" },
    { w: 0.16, h: 0.82, k: "th" },
    { w: 0.1, h: 0.35, k: "rec" },
    { w: 0.18, h: 0.5, k: "warm" },
  ];
  let x = 0;
  const colorFor = (k: string) => (k === "th" || k === "active" ? colors.red : k === "rec" ? "rgba(255,255,255,0.12)" : "#5A2A12");
  return (
    <Svg width={width} height={height}>
      {blocks.map((b, i) => {
        const bw = b.w * width;
        const bh = b.h * (height - 6);
        const rectX = x;
        x += bw;
        const active = b.k === "active";
        return (
          <React.Fragment key={i}>
            <Rect x={rectX + 1} y={height - bh} width={bw - 2} height={bh} rx={3} fill={colorFor(b.k)} opacity={active ? 1 : 0.85} />
            {active && (
              <>
                <Rect x={rectX} y={height - bh - 3} width={bw} height={bh + 3} rx={4} fill="none" stroke={colors.yellow} strokeWidth={2} />
                <Line x1={rectX + bw / 2} y1={0} x2={rectX + bw / 2} y2={height} stroke={colors.yellow} strokeWidth={1.5} />
                <Circle cx={rectX + bw / 2} cy={height - bh - 3} r={4} fill={colors.yellow} />
              </>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function WorkoutTimelineCard({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <Touchable testID="workout-timeline-card" onPress={onPress} lift={false} scaleTo={0.995}>
      <View style={styles.timelineCard}>
        <View style={styles.timelineHead}>
          <View>
            <SectionLabel color={colors.red}>WORKOUT</SectionLabel>
            <Text style={styles.timelineTitle}>Threshold Climb</Text>
          </View>
          <View style={styles.timelineStep}>
            <Text style={styles.microLabel}>STEP</Text>
            <Text style={styles.stepVal}>3 / 6</Text>
          </View>
          <Text style={styles.currentInterval}>Threshold Block 2</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.timeLeft}>3:12</Text>
            <Text style={styles.microLabel}>TIME LEFT</Text>
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          <IntervalProfile width={width - spacing.lg * 2} />
        </View>
      </View>
    </Touchable>
  );
}

/* ============================ RIDER VIEWPORT + ELEVATION ============================ */
function ElevationTerrain({ width, height = 90 }: { width: number; height?: number }) {
  const segs = [
    { w: 0.12, c: "#4A4A4A" },
    { w: 0.1, c: ZONE.z1 },
    { w: 0.12, c: ZONE.z3 },
    { w: 0.16, c: ZONE.z4 },
    { w: 0.22, c: colors.red },
    { w: 0.16, c: ZONE.z4 },
    { w: 0.12, c: "#4A4A4A" },
  ];
  const heights = [0.2, 0.35, 0.55, 0.75, 0.95, 0.7, 0.4];
  let x = 0;
  return (
    <Svg width={width} height={height}>
      {segs.map((s, i) => {
        const bw = s.w * width;
        const h = heights[i] * (height - 8);
        const rx = x;
        x += bw;
        return <Rect key={i} x={rx} y={height - h} width={bw + 1} height={h} fill={s.c} opacity={0.9} />;
      })}
      <Line x1={width * 0.55} y1={0} x2={width * 0.55} y2={height} stroke="#fff" strokeWidth={2} />
      <Circle cx={width * 0.55} cy={4} r={4} fill="#fff" />
    </Svg>
  );
}

export function RiderRouteViewport({ width, height, onPress }: { width: number; height: number; onPress: () => void }) {
  return (
    <View style={[styles.viewport, { height }]} testID="rider-route-viewport">
      <Touchable onPress={onPress} lift={false} scaleTo={0.998} style={StyleSheet.absoluteFill} containerStyle={StyleSheet.absoluteFill}>
        <Image source={riderImg} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ right: 0, top: "42%" }} accessibilityLabel="Rider climbing Alpe d'Huez" />
      </Touchable>
      <View style={[styles.elevOverlay, { pointerEvents: "none" }]}>
        <ElevationTerrain width={width - 4} />
        <View style={styles.vsBadge}>
          <Ionicons name="trending-up" size={12} color={colors.green} />
          <Text style={styles.vsText}>+12% vs last workout</Text>
        </View>
      </View>
    </View>
  );
}

/* ============================ RIGHT COLUMN ============================ */
export function ClimbCard() {
  return (
    <View style={styles.sideCard} testID="climb-card">
      <View style={styles.metricHead}><MaterialCommunityIcons name="terrain" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>CLIMB</SectionLabel></View>
      <View style={styles.gradeRow}><Text style={styles.gradeVal}>7.8</Text><Text style={styles.gradePct}>%</Text><Text style={styles.gradeLabel}>GRADE</Text></View>
      <View style={styles.climbStat}><Text style={styles.climbStatVal}>1,567 m</Text><Text style={styles.microLabel}>TO SUMMIT</Text></View>
      <View style={styles.climbStat}><Text style={styles.climbStatVal}>10.2 km</Text><Text style={styles.microLabel}>CLIMB REMAINING</Text></View>
      <ClimbMini width={250} />
      <View style={styles.climbAxis}><Text style={styles.microLabel}>0</Text><Text style={styles.microLabel}>8.0</Text><Text style={styles.microLabel}>16.0</Text></View>
    </View>
  );
}

function ClimbMini({ width, height = 64 }: { width: number; height?: number }) {
  const pts = [0.15, 0.2, 0.28, 0.32, 0.4, 0.5, 0.58, 0.7, 0.82, 0.95];
  const stepX = width / (pts.length - 1);
  const coords = pts.map((v, i) => [i * stepX, height - 6 - v * (height - 12)]);
  const cur = 7;
  return (
    <Svg width={width} height={height} style={{ marginTop: 8 }}>
      <Polyline points={coords.slice(0, cur + 1).map((c) => c.join(",")).join(" ")} fill="none" stroke={colors.yellow} strokeWidth={2.5} />
      <Polyline points={coords.slice(cur).map((c) => c.join(",")).join(" ")} fill="none" stroke={colors.red} strokeWidth={2.5} />
      <Circle cx={coords[cur][0]} cy={coords[cur][1]} r={4} fill="#fff" />
    </Svg>
  );
}

export function RouteMapCard() {
  return (
    <View style={styles.sideCard} testID="route-map-card">
      <View style={styles.metricHead}><Ionicons name="location" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>ROUTE</SectionLabel></View>
      <Text style={styles.routeMapTitle}>Alpe d&apos;Huez</Text>
      <View style={styles.mapWrap}>
        <Svg width="100%" height="100%" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
          <Path d="M40 185 C90 175 60 150 100 145 C140 140 90 120 120 110 C155 98 110 80 150 70 C185 62 150 45 175 35 C195 27 205 22 210 15" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={3} strokeLinecap="round" />
          <Path d="M40 185 C90 175 60 150 100 145 C140 140 90 120 120 110" fill="none" stroke={colors.yellow} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={40} cy={185} r={6} fill={colors.red} />
          <Circle cx={120} cy={110} r={5} fill="#fff" />
          <Rect x={205} y={8} width={12} height={12} fill="#fff" />
        </Svg>
      </View>
    </View>
  );
}

function WGrid({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <View style={styles.wCell}>
      <Text style={styles.microLabel}>{label}</Text>
      <Text style={styles.wVal}>{value}</Text>
      {sub && <Text style={[styles.wSub, subColor ? { color: subColor } : null]}>{sub}</Text>}
    </View>
  );
}

export function WearableDataCard() {
  return (
    <View style={styles.sideCard} testID="wearable-card">
      <View style={styles.metricHead}><MaterialCommunityIcons name="watch-variant" size={15} color={colors.white} /><SectionLabel color={colors.white}>FROM YOUR WEARABLE</SectionLabel></View>
      <View style={styles.wGridRow}>
        <WGrid label="HRV" value="42" sub="Good" subColor={colors.greenText} />
        <WGrid label="STRESS" value="36" sub="Low" subColor={colors.greenText} />
        <WGrid label="RESPIRATION" value="14" sub="brpm" />
      </View>
      <View style={styles.wDivider} />
      <View style={styles.wGridRow}>
        <WGrid label="BODY TEMP" value="36.7" sub="°C" />
        <WGrid label="BATTERY" value="92" sub="%" />
        <WGrid label="VO2 MAX" value="52" sub="ml/kg/min" />
      </View>
    </View>
  );
}

/* ============================ SUMMARY STRIP ============================ */
function SumMetric({ icon, iconColor, value, unit, label, sub }: { icon: React.ReactNode; iconColor: string; value: string; unit?: string; label: string; sub: string }) {
  return (
    <View style={styles.sumCell}>
      <View style={styles.metricHead}>{icon}<SectionLabel color={colors.textDim}>{label}</SectionLabel></View>
      <Text style={styles.sumVal}>{value}<Text style={styles.sumUnit}> {unit}</Text></Text>
      <Text style={styles.microLabel}>{sub}</Text>
    </View>
  );
}

export function RideSummaryStrip({ speed }: { speed: string }) {
  const zones = [
    { z: "Z1", t: "02:15", c: ZONE.z1, w: 0.3 },
    { z: "Z2", t: "05:30", c: ZONE.z2, w: 0.65 },
    { z: "Z3", t: "08:45", c: ZONE.z3, w: 1 },
    { z: "Z4", t: "06:20", c: ZONE.z4, w: 0.75 },
    { z: "Z5", t: "01:45", c: ZONE.z5, w: 0.25 },
  ];
  return (
    <View style={styles.summaryStrip} testID="ride-summary-strip">
      <SumMetric icon={<Ionicons name="speedometer-outline" size={14} color={colors.yellow} />} iconColor={colors.yellow} value={speed} unit="km/h" label="SPEED" sub="Avg 24.6" />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="map-marker-distance" size={14} color={colors.yellow} />} iconColor={colors.yellow} value="23.7" unit="km" label="DISTANCE" sub="16.0 km to go" />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="terrain" size={14} color={colors.yellow} />} iconColor={colors.yellow} value="1,050" unit="m" label="ELEVATION" sub="Gain 1,050 m" />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="speedometer" size={14} color={colors.red} />} iconColor={colors.red} value="48" unit="TSS" label="TSS" sub="92 TSS (Total)" />
      <View style={styles.sumDiv} />
      <SumMetric icon={<Ionicons name="flame" size={14} color={colors.red} />} iconColor={colors.red} value="512" unit="kcal" label="CALORIES" sub="622 kcal (Total)" />
      <View style={styles.sumDiv} />
      <SumMetric icon={<Ionicons name="thermometer-outline" size={14} color={colors.yellow} />} iconColor={colors.yellow} value="18" unit="°C" label="TEMP" sub="Feels like 18°C" />
      <View style={styles.sumDiv} />
      <View style={styles.zoneCell}>
        <SectionLabel color={colors.textDim}>TIME IN ZONES</SectionLabel>
        <View style={{ marginTop: 4, gap: 3 }}>
          {zones.map((z) => (
            <View key={z.z} style={styles.zoneLine}>
              <Text style={styles.zoneLbl}>{z.z}</Text>
              <View style={styles.zoneBarTrack}><View style={{ height: 5, borderRadius: 3, backgroundColor: z.c, width: `${z.w * 100}%` }} /></View>
              <Text style={styles.zoneTime}>{z.t}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ============================ CONTROL BAR ============================ */
function CircleBtn({ icon, onPress, testID }: { icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; testID: string }) {
  return (
    <Touchable testID={testID} onPress={onPress} scaleTo={0.9}>
      <View style={styles.circleBtn}><Ionicons name={icon} size={20} color={colors.white} /></View>
    </Touchable>
  );
}

export function TrainerControlBar({ paused, erg, onPauseToggle, onErg, onEnd, onControls, onMenu }: {
  paused: boolean; erg: number; onPauseToggle: () => void; onErg: (d: number) => void; onEnd: () => void; onControls: () => void; onMenu: () => void;
}) {
  return (
    <View style={styles.controlBar} testID="trainer-control-bar">
      <Touchable testID="menu-button" onPress={onMenu} scaleTo={0.9}><Ionicons name="ellipsis-horizontal" size={22} color={colors.white} /></Touchable>
      <View style={styles.ergMode}>
        <Text style={styles.microLabel}>ERG MODE</Text>
        <Text style={styles.ergOn}>On</Text>
      </View>
      <View style={styles.ergControl}>
        <CircleBtn icon="remove" onPress={() => onErg(-5)} testID="erg-minus" />
        <View style={{ alignItems: "center" }}>
          <Text style={styles.ergVal}>{erg}%</Text>
          <Text style={styles.microLabel}>ERG INTENSITY</Text>
        </View>
        <CircleBtn icon="add" onPress={() => onErg(5)} testID="erg-plus" />
      </View>
      <Touchable testID="controls-button" onPress={onControls} scaleTo={0.95}>
        <View style={styles.controlsBtn}><Ionicons name="options-outline" size={18} color={colors.white} /><Text style={styles.controlsText}>CONTROLS</Text></View>
      </Touchable>
      <View style={{ flex: 1 }} />
      <Touchable testID="pause-button" onPress={onPauseToggle} scaleTo={0.96} style={shadow.glow}>
        <View style={styles.pauseBtn}>
          <Ionicons name={paused ? "play" : "pause"} size={18} color="#1a1300" />
          <Text style={styles.pauseText}>{paused ? "RESUME" : "PAUSE"}</Text>
        </View>
      </Touchable>
      <Touchable testID="end-workout-button" onPress={onEnd} scaleTo={0.96}>
        <View style={styles.endBtn}>
          <Ionicons name="stop" size={18} color="#fff" />
          <Text style={styles.endText}>END WORKOUT</Text>
        </View>
      </Touchable>
    </View>
  );
}

/* ============================ ALBERTO LIVE CUE ============================ */
export function AlbertoLiveCue({ message }: { message: string }) {
  return (
    <View testID="alberto-cue" style={[styles.cue, { pointerEvents: "none" }]}>
      <MaterialCommunityIcons name="account-voice" size={16} color={colors.gold} />
      <Text style={styles.cueText}>{message}</Text>
    </View>
  );
}

/* ============================ NEXT-UP PREVIEW + SAFETY ============================ */
export function NextUpStrip({ next }: { next: { label: string; time: string; target: string; rpe: string } }) {
  return (
    <View style={styles.nextUp} testID="next-up-strip">
      <View style={styles.nextUpLead}>
        <Ionicons name="play-skip-forward" size={13} color={colors.yellow} />
        <Text style={styles.nextUpLabel}>NEXT UP</Text>
      </View>
      <Text style={styles.nextUpName} numberOfLines={1}>{next.label}</Text>
      <View style={styles.nextUpTag}><Ionicons name="time-outline" size={12} color={colors.textDim} /><Text style={styles.nextUpTagText}>{next.time}</Text></View>
      <View style={styles.nextUpTag}><Ionicons name="flash" size={12} color={colors.textDim} /><Text style={styles.nextUpTagText}>{next.target}</Text></View>
      <View style={styles.nextUpTag}><MaterialCommunityIcons name="gauge" size={13} color={colors.textDim} /><Text style={styles.nextUpTagText}>{next.rpe}</Text></View>
    </View>
  );
}

export function SafetyNote() {
  return (
    <View style={styles.safety} testID="safety-note">
      <Ionicons name="shield-checkmark-outline" size={13} color={colors.textDim} />
      <Text style={styles.safetyText}>Use this screen only when your device is positioned safely. Do not hold or operate your device while cycling outdoors.</Text>
    </View>
  );
}

const mh = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 };
const styles = StyleSheet.create({
  /* top bar */
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 10, ...shadow.card },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontSize: 24, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  topElapsed: { alignItems: "flex-start" },
  elapsedVal: { color: colors.white, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
  microLabel: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  topProgress: { flex: 1 },
  routeName: { color: colors.white, fontSize: 14, fontWeight: "700", textAlign: "center" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  progressEnd: { color: colors.textDim, fontSize: 11.5 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  progressPct: { color: colors.yellow, fontSize: 10.5, fontWeight: "700", textAlign: "center", marginTop: 2 },
  topIcons: { flexDirection: "row", alignItems: "center", gap: 12 },
  flameText: { color: colors.white, fontWeight: "800", fontSize: 14, marginLeft: -6 },
  connPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  /* metric cards */
  metricCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  metricHead: mh,
  metricValRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  metricBig: { color: colors.white, fontSize: 46, fontWeight: "900", lineHeight: 48 },
  metricUnit: { color: colors.textDim, fontSize: 15, fontWeight: "700", marginLeft: 4, marginBottom: 6 },
  metricSecondary: { color: colors.white, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  metricDivider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 10 },
  tgtRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  tgtVal: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  zoneTag: { color: colors.red, fontSize: 16, fontWeight: "900" },
  zoneBlocks: { flexDirection: "row", gap: 2, flex: 1 },
  zoneBlock: { flex: 1, height: 12, borderRadius: 2, alignItems: "center", justifyContent: "center" },
  zoneMarker: { width: 3, height: 16, backgroundColor: "#fff", borderRadius: 2 },
  hrBarWrap: { marginTop: 12, marginBottom: 4 },
  hrBar: { height: 10, borderRadius: 5 },
  hrMarker: { position: "absolute", top: -2, width: 4, height: 14, backgroundColor: "#fff", borderRadius: 2, marginLeft: -2 },
  cadenceBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 14, height: 34 },

  /* timeline */
  timelineCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  timelineHead: { flexDirection: "row", alignItems: "center" },
  timelineTitle: { color: colors.white, fontSize: 24, fontWeight: "800", fontStyle: "italic", marginTop: 4 },
  timelineStep: { alignItems: "center", marginLeft: spacing.xl },
  stepVal: { color: colors.white, fontSize: 18, fontWeight: "800" },
  currentInterval: { color: colors.white, fontSize: 15, fontWeight: "600", marginLeft: spacing.md, flex: 1 },
  timeLeft: { color: colors.white, fontSize: 22, fontWeight: "800" },

  /* viewport */
  viewport: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "#000", justifyContent: "flex-end" },
  elevOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  vsBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  vsText: { color: colors.greenText, fontSize: 11, fontWeight: "700" },

  /* side cards */
  sideCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  gradeRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 6 },
  gradeVal: { color: colors.white, fontSize: 34, fontWeight: "900" },
  gradePct: { color: colors.white, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  gradeLabel: { color: colors.textDim, fontSize: 11, fontWeight: "700", marginBottom: 6, marginLeft: 4 },
  climbStat: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  climbStatVal: { color: colors.white, fontSize: 17, fontWeight: "800" },
  climbAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  routeMapTitle: { color: colors.white, fontSize: 18, fontWeight: "800", marginTop: 6 },
  mapWrap: { height: 200, marginTop: 8, borderRadius: radius.md, backgroundColor: "#0C0E0D", borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  wGridRow: { flexDirection: "row", marginTop: 10 },
  wCell: { flex: 1 },
  wVal: { color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 2 },
  wSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  wDivider: { height: 1, backgroundColor: colors.borderSoft, marginTop: 12 },

  /* summary */
  summaryStrip: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, ...shadow.card },
  sumCell: { flex: 1, paddingHorizontal: 8, justifyContent: "center" },
  sumVal: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 4 },
  sumUnit: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  sumDiv: { width: 1, backgroundColor: colors.borderSoft, marginVertical: 4 },
  zoneCell: { flex: 1.3, paddingHorizontal: 8 },
  zoneLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  zoneLbl: { color: colors.textDim, fontSize: 10, fontWeight: "700", width: 16 },
  zoneBarTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  zoneTime: { color: colors.white, fontSize: 10.5, fontWeight: "600", width: 34, textAlign: "right" },

  /* control bar */
  controlBar: { flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 12, ...shadow.card },
  ergMode: { alignItems: "center" },
  ergOn: { color: colors.green, fontSize: 15, fontWeight: "800" },
  ergControl: { flexDirection: "row", alignItems: "center", gap: 14 },
  ergVal: { color: colors.white, fontSize: 20, fontWeight: "800" },
  circleBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  controlsBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  controlsText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  pauseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingHorizontal: 32, height: 52 },
  pauseText: { color: "#1a1300", fontSize: 16, fontWeight: "900" },
  endBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingHorizontal: 28, height: 52 },
  endText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  /* cue */
  cue: { position: "absolute", top: 10, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(12,10,9,0.9)", borderWidth: 1, borderColor: "rgba(233,180,76,0.4)", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  cueText: { color: colors.white, fontSize: 13, fontWeight: "600" },

  /* next-up + safety */
  nextUp: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10 },
  nextUpLead: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextUpLabel: { color: colors.yellow, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8 },
  nextUpName: { color: colors.white, fontSize: 14, fontWeight: "700", flex: 1 },
  nextUpTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  nextUpTagText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  safety: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 2 },
  safetyText: { color: colors.textFaint, fontSize: 11, flex: 1, lineHeight: 15 },
});
