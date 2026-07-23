import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Rect, Path, Polyline, Circle, Line } from "react-native-svg";
import { colors, radius, spacing, shadow } from "../theme";
import { Touchable, SectionLabel } from "./ui";
import { posterFor } from "../lib/youtube";
import { CoachId, COACHES } from "../lib/coach-persona";
import type { RouteOption } from "../data";
import type { Settings } from "../lib/settings";

const glyph = require("../../assets/images/logo_glyph_t.png");
const wordmark = require("../../assets/images/wordmark_t.png");
const riderImg = require("../../assets/images/hero_cyclist_b2.jpg");

const ZONE = { z1: "#43C65A", z2: "#9ACD32", z3: colors.yellow, z4: "#E8631C", z5: colors.red };

/* ============================ TOP BAR ============================ */
export function BrandWordmark() {
  return (
    <View style={styles.brandRow}>
      <Image source={glyph} style={{ width: 34, height: 34 }} contentFit="contain" />
      <Image source={wordmark} style={styles.brandMark} contentFit="contain" contentPosition="left" accessibilityLabel="ROUJAUNE" />
    </View>
  );
}

export function WorkoutTopBar({ elapsed, connectionState, stale, onPress, routeName = "Alpe d'Huez", riddenKm = 0, totalKm = 0, demoMode = false, onToggleDemo }: { elapsed: string; connectionState: string; stale: boolean; onPress: (m: string) => void; routeName?: string; riddenKm?: number; totalKm?: number; demoMode?: boolean; onToggleDemo?: () => void }) {
  const pct = totalKm > 0 ? Math.max(0, Math.min(100, Math.round((riddenKm / totalKm) * 100))) : 0;
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
        <Text style={styles.routeName} numberOfLines={1}>{routeName}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.progressEnd}>{riddenKm.toFixed(1)} km</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressEnd}>{totalKm.toFixed(1)} km</Text>
        </View>
        <Text style={styles.progressPct}>{pct}%</Text>
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
        <Touchable testID="demo-toggle" scaleTo={0.9} onPress={() => onToggleDemo?.()}>
          <View style={[styles.demoPill, demoMode && styles.demoPillOn]}>
            <Ionicons name="flask" size={13} color={demoMode ? "#241B00" : colors.yellow} />
            <Text style={[styles.demoText, demoMode && styles.demoTextOn]}>{demoMode ? "DEMO ON" : "DEMO DATA"}</Text>
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

function NotConnectedBody({ kind }: { kind: "trainer" | "wearable" }) {
  return (
    <View style={styles.ncBody} testID={`nc-${kind}`}>
      <Ionicons name={kind === "trainer" ? "bluetooth" : "watch-outline"} size={20} color={colors.textDim} />
      <Text style={styles.ncTitle}>Not connected</Text>
      <Text style={styles.ncSub}>{kind === "trainer" ? "Connect a smart trainer" : "Connect a wearable"}</Text>
    </View>
  );
}

export function PowerCard({ power, wkg, connected = true, target, zoneLabel, zoneIdx }: { power: number; wkg: string; connected?: boolean; target?: number; zoneLabel?: string; zoneIdx?: number }) {
  // Map training zone (Z1..Z6, idx 0..5) onto the 7-block zone bar.
  const blockMap = [6, 5, 4, 3, 1, 0];
  const activeBlock = zoneIdx == null ? 3 : blockMap[Math.max(0, Math.min(5, zoneIdx))];
  return (
    <View style={styles.metricCard} testID="power-card">
      <View style={styles.metricHead}><Ionicons name="flash" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>POWER</SectionLabel></View>
      {connected ? (
        <>
          <View style={styles.metricValRow}>
            <Text style={styles.metricBig}>{power}</Text>
            <Text style={styles.metricUnit}>W</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.metricSecondary}>{wkg} <Text style={styles.microLabel}>W/kg</Text></Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.tgtRow}>
            <Text style={styles.microLabel}>TARGET</Text>
            <Text style={styles.tgtVal}>{target ?? 251} W</Text>
          </View>
          <View style={styles.tgtRow}>
            <Text style={styles.microLabel}>ZONE</Text>
            <ZoneBlocks active={activeBlock} />
            <Text style={styles.zoneTag}>{zoneLabel ?? "Z4"}</Text>
          </View>
        </>
      ) : <NotConnectedBody kind="trainer" />}
    </View>
  );
}

export function HeartRateCard({ hr, connected = true }: { hr: number; connected?: boolean }) {
  const pct = Math.min(1, Math.max(0, (hr - 90) / (178 - 90)));
  return (
    <View style={styles.metricCard} testID="heart-rate-card">
      <View style={styles.metricHead}><Ionicons name="heart" size={15} color={colors.red} /><SectionLabel color={colors.red}>HEART RATE</SectionLabel></View>
      {connected ? (
        <>
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
        </>
      ) : <NotConnectedBody kind="wearable" />}
    </View>
  );
}

export function CadenceCard({ cadence, connected = true }: { cadence: number; connected?: boolean }) {
  const bars = Array.from({ length: 22 }, (_, i) => 0.3 + Math.abs(Math.sin(i * 0.7)) * 0.7);
  const activeIdx = Math.round((cadence / 120) * bars.length);
  return (
    <View style={styles.metricCard} testID="cadence-card">
      <View style={styles.metricHead}><Ionicons name="sync" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>CADENCE</SectionLabel></View>
      {connected ? (
        <>
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
        </>
      ) : <NotConnectedBody kind="trainer" />}
    </View>
  );
}

/* ============================ WORKOUT TIMELINE ============================ */
export function IntervalProfile({ width, height = 92, profile, color, activeIndex }: { width: number; height?: number; profile?: number[]; color?: string; activeIndex?: number }) {
  // Dynamic mode: draw bars from a supplied power profile (mirrors the chosen
  // workout's segments). The current segment is highlighted (falls back to the
  // tallest block when no active index is supplied).
  if (profile && profile.length) {
    const c = color || colors.red;
    const n = profile.length;
    const gap = 3;
    const bw = (width - gap * (n - 1)) / n;
    const activeIdx = activeIndex != null ? Math.max(0, Math.min(n - 1, activeIndex)) : profile.indexOf(Math.max(...profile));
    let x = 0;
    return (
      <Svg width={width} height={height}>
        {profile.map((v, i) => {
          const bh = Math.max(4, v * (height - 6));
          const rectX = x;
          x += bw + gap;
          const active = i === activeIdx;
          return (
            <React.Fragment key={i}>
              <Rect x={rectX} y={height - bh} width={bw} height={bh} rx={3} fill={c} opacity={active ? 1 : 0.3 + v * 0.55} />
              {active && (
                <>
                  <Rect x={rectX - 1} y={height - bh - 3} width={bw + 2} height={bh + 3} rx={4} fill="none" stroke={colors.yellow} strokeWidth={2} />
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

export function WorkoutTimelineCard({ width, onPress, title = "Threshold Climb", color, profile, step, timeLeft, activeIndex }: { width: number; onPress: () => void; title?: string; color?: string; profile?: number[]; step?: string; timeLeft?: string; activeIndex?: number }) {
  return (
    <Touchable testID="workout-timeline-card" onPress={onPress} lift={false} scaleTo={0.995}>
      <View style={styles.timelineCard}>
        <View style={styles.timelineHead}>
          <View style={{ flex: 1 }}>
            <SectionLabel color={colors.red}>WORKOUT</SectionLabel>
            <Text style={styles.timelineTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.timelineStep}>
            <Text style={styles.microLabel}>STEP</Text>
            <Text style={styles.stepVal}>{step ?? "3 / 6"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.timeLeft}>{timeLeft ?? "3:12"}</Text>
            <Text style={styles.microLabel}>TIME LEFT</Text>
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          <IntervalProfile width={width - spacing.lg * 2} profile={profile} color={color} activeIndex={activeIndex} />
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
export type RouteInfo = { title: string; place: string; km: number; elev: number; grade: number; isClimb: boolean; tag: string };

export function ClimbCard({ route, riddenKm = 0, progress = 0 }: { route?: RouteInfo; riddenKm?: number; progress?: number }) {
  const km = route?.km ?? 16;
  const elev = route?.elev ?? 1567;
  const grade = route?.grade ?? 7.8;
  const isClimb = route?.isClimb ?? true;
  const descent = elev < 0;
  const remaining = Math.max(0, km - riddenKm);
  return (
    <View style={styles.sideCard} testID="climb-card">
      <View style={styles.metricHead}><MaterialCommunityIcons name="terrain" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>{isClimb ? "CLIMB" : "TERRAIN"}</SectionLabel></View>
      <View style={styles.gradeRow}><Text style={styles.gradeVal}>{Math.abs(grade).toFixed(1)}</Text><Text style={styles.gradePct}>%</Text><Text style={styles.gradeLabel}>{isClimb ? "GRADE" : "AVG GRADE"}</Text></View>
      <View style={styles.climbStat}><Text style={styles.climbStatVal}>{Math.abs(elev).toLocaleString()} m</Text><Text style={styles.microLabel}>{descent ? "DESCENT" : isClimb ? "TO SUMMIT" : "ELEVATION GAIN"}</Text></View>
      <View style={styles.climbStat}><Text style={styles.climbStatVal}>{remaining.toFixed(1)} km</Text><Text style={styles.microLabel}>{isClimb ? "CLIMB REMAINING" : "DISTANCE LEFT"}</Text></View>
      <ClimbMini width={250} climb={isClimb} descent={descent} progress={progress} />
      <View style={styles.climbAxis}><Text style={styles.microLabel}>0</Text><Text style={styles.microLabel}>{(km / 2).toFixed(0)}</Text><Text style={styles.microLabel}>{km.toFixed(0)}</Text></View>
    </View>
  );
}

function ClimbMini({ width, height = 64, climb = true, descent = false, progress = 0 }: { width: number; height?: number; climb?: boolean; descent?: boolean; progress?: number }) {
  const pts = descent
    ? [0.95, 0.82, 0.7, 0.6, 0.5, 0.42, 0.34, 0.28, 0.2, 0.12]
    : climb
    ? [0.15, 0.2, 0.28, 0.32, 0.4, 0.5, 0.58, 0.7, 0.82, 0.95]
    : [0.4, 0.52, 0.44, 0.56, 0.46, 0.6, 0.48, 0.58, 0.5, 0.54];
  const stepX = width / (pts.length - 1);
  const coords = pts.map((v, i) => [i * stepX, height - 6 - v * (height - 12)]);
  const cur = Math.max(0, Math.min(pts.length - 1, Math.round(progress * (pts.length - 1))));
  return (
    <Svg width={width} height={height} style={{ marginTop: 8 }}>
      <Polyline points={coords.slice(0, cur + 1).map((c) => c.join(",")).join(" ")} fill="none" stroke={colors.yellow} strokeWidth={2.5} />
      <Polyline points={coords.slice(cur).map((c) => c.join(",")).join(" ")} fill="none" stroke={colors.red} strokeWidth={2.5} />
      <Circle cx={coords[cur][0]} cy={coords[cur][1]} r={4} fill="#fff" />
    </Svg>
  );
}

export function RouteMapCard({ title = "Alpe d'Huez", progress = 0, riddenKm = 0, totalKm = 0, timeBased = false, fill = false }: { title?: string; progress?: number; riddenKm?: number; totalKm?: number; timeBased?: boolean; fill?: boolean }) {
  const pct = Math.round(progress * 100);
  return (
    <View style={styles.sideCard} testID="route-map-card">
      <View style={styles.metricHead}><Ionicons name="location" size={15} color={colors.yellow} /><SectionLabel color={colors.yellow}>ROUTE</SectionLabel></View>
      <Text style={styles.routeMapTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.routeTrack}>
        <View style={[styles.routeFill, { width: `${pct}%` }]} />
        <View style={[styles.routeDot, { left: `${pct}%` }]} />
      </View>
      <Text style={styles.routeProg}>{riddenKm.toFixed(1)} / {totalKm.toFixed(1)} km · {pct}%{timeBased ? " · time-based" : ""}</Text>
      <View style={[styles.mapWrap, { height: fill ? 96 : 200 }]}>
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

export function WearableDataCard({ connected = true }: { connected?: boolean }) {
  return (
    <View style={styles.sideCard} testID="wearable-card">
      <View style={styles.metricHead}><MaterialCommunityIcons name="watch-variant" size={15} color={colors.white} /><SectionLabel color={colors.white}>FROM YOUR WEARABLE</SectionLabel></View>
      {connected ? (
        <>
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
        </>
      ) : <NotConnectedBody kind="wearable" />}
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

export function RideSummaryStrip({ speed, trainerConnected = true, withZones = true, riddenKm = 0, totalKm = 0, elevM = 0, progress = 0, temp = null }: { speed: string; trainerConnected?: boolean; withZones?: boolean; riddenKm?: number; totalKm?: number; elevM?: number; progress?: number; temp?: { value: string; sub: string } | null }) {
  const NA = "—";
  const gainedM = Math.round(elevM * progress);
  return (
    <View style={styles.summaryStrip} testID="ride-summary-strip">
      <SumMetric icon={<Ionicons name="speedometer-outline" size={14} color={colors.yellow} />} iconColor={colors.yellow} value={trainerConnected ? speed : NA} unit="km/h" label="SPEED" sub={trainerConnected ? "Live" : "Not connected"} />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="map-marker-distance" size={14} color={colors.yellow} />} iconColor={colors.yellow} value={trainerConnected ? riddenKm.toFixed(1) : NA} unit="km" label="DISTANCE" sub={trainerConnected ? `${Math.max(0, totalKm - riddenKm).toFixed(1)} km to go` : "Not connected"} />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="terrain" size={14} color={colors.yellow} />} iconColor={colors.yellow} value={trainerConnected ? gainedM.toLocaleString() : NA} unit="m" label="ELEVATION" sub={trainerConnected ? `${elevM.toLocaleString()} m total` : "Not connected"} />
      <View style={styles.sumDiv} />
      <SumMetric icon={<MaterialCommunityIcons name="speedometer" size={14} color={colors.red} />} iconColor={colors.red} value={trainerConnected ? "48" : NA} unit="TSS" label="TSS" sub={trainerConnected ? "92 TSS (Total)" : "Not connected"} />
      <View style={styles.sumDiv} />
      <SumMetric icon={<Ionicons name="flame" size={14} color={colors.red} />} iconColor={colors.red} value={trainerConnected ? "512" : NA} unit="kcal" label="CALORIES" sub={trainerConnected ? "622 kcal (Total)" : "Not connected"} />
      <View style={styles.sumDiv} />
      <SumMetric icon={<Ionicons name="thermometer-outline" size={14} color={colors.yellow} />} iconColor={colors.yellow} value={temp ? temp.value : NA} unit="°C" label="TEMP" sub={temp ? temp.sub : "Set your location"} />
      {withZones && (
        <>
          <View style={styles.sumDiv} />
          <View style={styles.zoneCell}>
            <SectionLabel color={colors.textDim}>TIME IN ZONES</SectionLabel>
            {trainerConnected ? (
              <View style={{ marginTop: 4, gap: 3 }}>
                {ZONE_TIMES.map((z) => (
                  <View key={z.z} style={styles.zoneLine}>
                    <Text style={styles.zoneLbl}>{z.z}</Text>
                    <View style={styles.zoneBarTrack}><View style={{ height: 5, borderRadius: 3, backgroundColor: z.c, width: `${z.w * 100}%` }} /></View>
                    <Text style={styles.zoneTime}>{z.t}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.microLabel, { marginTop: 6 }]}>Not connected</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const ZONE_TIMES = [
  { z: "Z1", t: "02:15", c: ZONE.z1, w: 0.3 },
  { z: "Z2", t: "05:30", c: ZONE.z2, w: 0.65 },
  { z: "Z3", t: "08:45", c: ZONE.z3, w: 1 },
  { z: "Z4", t: "06:20", c: ZONE.z4, w: 0.75 },
  { z: "Z5", t: "01:45", c: ZONE.z5, w: 0.25 },
];

/** Time-in-zones as a standalone card (used in the side column on tablet). */
export function TimeInZonesCard() {
  return (
    <View style={styles.metricCard} testID="time-in-zones-card">
      <SectionLabel color={colors.textDim}>TIME IN ZONES</SectionLabel>
      <View style={{ marginTop: 8, gap: 6 }}>
        {ZONE_TIMES.map((z) => (
          <View key={z.z} style={styles.zoneLine}>
            <Text style={styles.zoneLbl}>{z.z}</Text>
            <View style={styles.zoneBarTrack}><View style={{ height: 6, borderRadius: 3, backgroundColor: z.c, width: `${z.w * 100}%` }} /></View>
            <Text style={styles.zoneTime}>{z.t}</Text>
          </View>
        ))}
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

/* ============================ IMMERSIVE VIDEO HUD ============================ */
function connMeta(connectionState: string, stale: boolean) {
  if (connectionState === "connected" && !stale) return { c: colors.green, label: "LIVE", icon: "wifi" as const };
  if (connectionState === "connected" && stale) return { c: colors.yellow, label: "ESTIMATED", icon: "cellular" as const };
  if (connectionState === "disconnected") return { c: colors.red, label: "OFFLINE", icon: "cloud-offline" as const };
  return { c: colors.yellow, label: "RECONNECTING", icon: "sync" as const };
}

function HudChip({ icon, color, label, value, unit }: { icon: React.ReactNode; color: string; label: string; value: string | number; unit: string }) {
  return (
    <View style={styles.hudChip}>
      <View style={styles.hudChipHead}>{icon}<Text style={[styles.hudChipLabel, { color }]}>{label}</Text></View>
      <Text style={styles.hudChipVal}>{value}<Text style={styles.hudChipUnit}> {unit}</Text></Text>
    </View>
  );
}

export function ImmersiveHud({
  elapsed, power, wkg, hr, cadence, speed, progress, connectionState, stale, paused, cue, onPause, onEnd, onOpenRoutes,
  trainerConnected = true, wearableConnected = true,
}: {
  elapsed: string; power: number; wkg: string; hr: number; cadence: number; speed: string | number; progress: string;
  connectionState: string; stale: boolean; paused: boolean; cue: string; onPause: () => void; onEnd: () => void; onOpenRoutes: () => void;
  trainerConnected?: boolean; wearableConnected?: boolean;
}) {
  const conn = connMeta(connectionState, stale);
  const NC = "—";
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="immersive-hud">
      {/* top scrim + status */}
      <LinearGradient colors={["rgba(0,0,0,0.7)", "transparent"]} style={styles.hudTopScrim} pointerEvents="none" />
      <View style={styles.hudTopLeft} pointerEvents="none">
        <Text style={styles.hudElapsed}>{elapsed}</Text>
        <View style={styles.hudElapsedSub}>
          <Text style={styles.hudMicro}>ELAPSED</Text>
          <View style={[styles.hudConn, { borderColor: conn.c }]}>
            <View style={[styles.hudConnDot, { backgroundColor: conn.c }]} />
            <Text style={[styles.hudConnText, { color: conn.c }]}>{conn.label}</Text>
          </View>
          <Text style={styles.hudMicro}>{progress} to summit</Text>
        </View>
      </View>

      {/* routes button (left of the collapse control) */}
      <View style={styles.hudRoutes} pointerEvents="box-none">
        <RoutesButton onPress={onOpenRoutes} testID="hud-routes" />
      </View>

      {/* Alberto cue */}
      <View style={styles.hudCue} pointerEvents="none">
        <MaterialCommunityIcons name="account-voice" size={15} color={colors.gold} />
        <Text style={styles.hudCueText} numberOfLines={1}>{paused ? "Workout paused — take a breath." : cue}</Text>
      </View>

      {/* bottom scrim + metrics + controls */}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} style={styles.hudBotScrim} pointerEvents="none" />
      <View style={styles.hudBottom} pointerEvents="box-none">
        <View style={styles.hudChips} pointerEvents="none">
          <HudChip icon={<Ionicons name="flash" size={13} color={colors.yellow} />} color={colors.yellow} label="POWER" value={trainerConnected ? power : NC} unit={trainerConnected ? `W · ${wkg} W/kg` : "not connected"} />
          <HudChip icon={<Ionicons name="heart" size={13} color={colors.red} />} color={colors.red} label="HEART RATE" value={wearableConnected ? hr : NC} unit={wearableConnected ? "bpm" : "not connected"} />
          <HudChip icon={<Ionicons name="sync" size={13} color={colors.yellow} />} color={colors.yellow} label="CADENCE" value={trainerConnected ? cadence : NC} unit={trainerConnected ? "rpm" : "not connected"} />
          <HudChip icon={<Ionicons name="speedometer-outline" size={13} color="#fff" />} color="#fff" label="SPEED" value={trainerConnected ? speed : NC} unit={trainerConnected ? "km/h" : "not connected"} />
        </View>
        <View style={styles.hudControls}>
          <Pressable onPress={onPause} style={[styles.hudBtn, styles.hudPause]} testID="hud-pause" accessibilityRole="button" accessibilityLabel={paused ? "Resume workout" : "Pause workout"}>
            <Ionicons name={paused ? "play" : "pause"} size={18} color="#1a1300" />
            <Text style={styles.hudPauseText}>{paused ? "RESUME" : "PAUSE"}</Text>
          </Pressable>
          <Pressable onPress={onEnd} style={[styles.hudBtn, styles.hudEnd]} testID="hud-end" accessibilityRole="button" accessibilityLabel="End workout">
            <Ionicons name="stop" size={18} color="#fff" />
            <Text style={styles.hudEndText}>END</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function VideoPlaceholder({ width, onRestore }: { width: number; onRestore: () => void }) {
  return (
    <View style={[styles.placeholder, { width, aspectRatio: 16 / 9 }]} testID="video-placeholder">
      <Ionicons name="tv-outline" size={30} color={colors.textDim} />
      <Text style={styles.placeholderTitle}>Route playing in immersive mode</Text>
      <Pressable onPress={onRestore} style={styles.placeholderBtn} testID="video-restore" accessibilityRole="button" accessibilityLabel="Exit immersive mode">
        <Ionicons name="contract" size={15} color="#fff" />
        <Text style={styles.placeholderBtnText}>Exit full screen</Text>
      </Pressable>
    </View>
  );
}

/* ============================ ROUTE PICKER ============================ */
export function RoutesButton({ onPress, testID = "routes-button", label = "ROUTES", icon = "map" }: { onPress: () => void; testID?: string; label?: string; icon?: any }) {
  return (
    <Pressable onPress={onPress} style={styles.routesBtn} testID={testID} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color="#fff" />
      <Text style={styles.routesBtnText}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

export function RoutePicker({ routes, activeIndex, recommendedTag, auto, lastRouteId, onSelect, onAuto, onShuffle, onClose }: {
  routes: RouteOption[]; activeIndex: number; recommendedTag?: string; auto?: boolean; lastRouteId?: string | null;
  onSelect: (i: number) => void; onAuto: () => void; onShuffle: () => void; onClose: () => void;
}) {
  return (
    <Pressable style={styles.rpOverlay} onPress={onClose} testID="route-picker">
      <Pressable style={styles.rpPanel} onPress={() => { /* swallow */ }}>
        <View style={styles.rpHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rpTitle}>Choose your route</Text>
            <Text style={styles.rpSub}>Immersive first-person scenery — swap any time</Text>
          </View>
          <Pressable onPress={onClose} testID="route-picker-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>

        <View style={styles.rpActions}>
          <Pressable style={[styles.rpActionBtn, auto && styles.rpActionBtnOn]} onPress={onAuto} testID="route-auto" accessibilityRole="button" accessibilityLabel="Auto-match route to workout">
            <Ionicons name="sparkles" size={14} color={auto ? "#1a1300" : colors.yellow} />
            <Text style={[styles.rpActionText, auto && { color: "#1a1300" }]}>Auto-match to workout</Text>
          </Pressable>
          <Pressable style={styles.rpActionBtn} onPress={onShuffle} testID="route-shuffle" accessibilityRole="button" accessibilityLabel="Surprise me with a random route">
            <Ionicons name="shuffle" size={14} color="#fff" />
            <Text style={styles.rpActionText}>Surprise me</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.rpScroll} showsVerticalScrollIndicator={false}>
          {(["Race", "Casual"] as const).map((lvl) => {
            const items = routes.map((r, i) => ({ r, i })).filter((x) => x.r.level === lvl);
            if (items.length === 0) return null;
            return (
              <View key={lvl} style={{ width: "100%" }}>
                <View style={styles.rpSection}>
                  <Ionicons name={lvl === "Race" ? "trophy" : "leaf"} size={13} color={lvl === "Race" ? colors.red : colors.green} />
                  <Text style={styles.rpSectionText}>{lvl === "Race" ? "Legendary race climbs & stages" : "Easy & scenic — casual riders"}</Text>
                </View>
                <View style={styles.rpGrid}>
                  {items.map(({ r, i }) => {
                    const active = i === activeIndex;
                    const reco = !!recommendedTag && r.tag === recommendedTag;
                    const isLast = !!lastRouteId && r.id === lastRouteId;
                    return (
                      <Pressable key={r.id} testID={`route-option-${i}`} style={[styles.rpCard, active && styles.rpCardActive]} onPress={() => onSelect(i)} accessibilityRole="button" accessibilityLabel={`Select route ${r.title}`}>
                        <View style={styles.rpThumb}>
                          <Image source={{ uri: posterFor(r.id) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                          <View style={styles.rpThumbScrim} />
                          <View style={[styles.rpTag, { backgroundColor: r.tagColor }]}><Text style={styles.rpTagText}>{r.tag}</Text></View>
                          {active && <View style={styles.rpActiveBadge}><Ionicons name={auto ? "sparkles" : "checkmark"} size={12} color="#1a1300" /></View>}
                        </View>
                        <Text style={styles.rpName} numberOfLines={1}>{r.title}</Text>
                        <Text style={styles.rpPlace}>{r.place}</Text>
                        <View style={styles.rpStats}>
                          <View style={styles.rpStat}><MaterialCommunityIcons name="map-marker-distance" size={12} color={colors.textDim} /><Text style={styles.rpStatText}>{r.distance}</Text></View>
                          <View style={styles.rpStat}><MaterialCommunityIcons name="terrain" size={12} color={colors.textDim} /><Text style={styles.rpStatText}>{r.elevation}</Text></View>
                        </View>
                        {isLast ? (
                          <View style={[styles.rpReco, styles.rpLast]}><Ionicons name="time" size={10} color="#8FD3FF" /><Text style={[styles.rpRecoText, { color: "#8FD3FF" }]}>Your last ride</Text></View>
                        ) : reco ? (
                          <View style={styles.rpReco}><Ionicons name="star" size={10} color={colors.yellow} /><Text style={styles.rpRecoText}>Great for your workout</Text></View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const mh = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 };

/* ============================ SETTINGS & AUDIO PANELS ============================ */
export function SettingsPanel({ settings, setSetting, onClose }: {
  settings: Settings; setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void; onClose: () => void;
}) {
  const rows: { key: keyof Settings; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string }[] = [
    { key: "hasTrainer", icon: "bluetooth", label: "Smart trainer connected", sub: "Power, cadence & speed" },
    { key: "hasWearable", icon: "watch-outline", label: "Wearable connected", sub: "Heart rate & wellness" },
    { key: "hudEnabled", icon: "eye", label: "Show on-screen HUD", sub: "Live-data overlay in full screen" },
  ];
  return (
    <Pressable style={styles.rpOverlay} onPress={onClose} testID="settings-panel">
      <Pressable style={styles.spPanel} onPress={() => { /* swallow */ }}>
        <View style={styles.rpHead}>
          <View style={{ flex: 1 }}><Text style={styles.rpTitle}>Workout settings</Text><Text style={styles.rpSub}>Devices & display</Text></View>
          <Pressable onPress={onClose} testID="settings-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>
        {rows.map((r) => (
          <View key={r.key} style={styles.spRow}>
            <View style={styles.spIcon}><Ionicons name={r.icon} size={18} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}><Text style={styles.spLabel}>{r.label}</Text><Text style={styles.spSub}>{r.sub}</Text></View>
            <Switch testID={`toggle-${r.key}`} value={settings[r.key]} onValueChange={(v) => setSetting(r.key, v)} trackColor={{ true: colors.red, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" />
          </View>
        ))}
      </Pressable>
    </Pressable>
  );
}

export function MusicPanel({ musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, voiceOptions, voiceId, selectVoice, coach, chooseCoach, coachName, trackName, onSkip, onClose }: {
  musicOn: boolean; toggleMusic: () => void; volume: number; setVolume: (v: number) => void; voiceOn: boolean; toggleVoice: () => void;
  voiceOptions: { id: string; label: string; sublabel: string; accent: string; gender: "male" | "female" | "neutral" }[]; voiceId?: string; selectVoice: (id: string) => void;
  coach: CoachId; chooseCoach: (id: CoachId) => void; coachName: string; trackName?: string; onSkip?: () => void; onClose: () => void;
}) {
  const level = Math.round(volume * 5);
  return (
    <Pressable style={styles.rpOverlay} onPress={onClose} testID="music-panel">
      <Pressable style={styles.spPanel} onPress={() => { /* swallow */ }}>
        <View style={styles.rpHead}>
          <View style={{ flex: 1 }}><Text style={styles.rpTitle}>Music & audio</Text><Text style={styles.rpSub}>Ride soundtrack & your companion coach&apos;s voice</Text></View>
          <Pressable onPress={onClose} testID="music-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>

        <Text style={styles.coachPickHint}>Your companion coach</Text>
        <View style={styles.coachPickRow}>
          {(["alberto", "adriana"] as CoachId[]).map((id) => {
            const c = COACHES[id];
            const active = coach === id;
            return (
              <Pressable key={id} testID={`coach-${id}`} onPress={() => chooseCoach(id)} style={[styles.coachPick, active && styles.coachPickActive]}>
                <Image source={c.image} style={styles.coachPickImg} contentFit="cover" contentPosition="top center" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.coachPickName}>{c.name}</Text>
                  <Text style={styles.coachPickSub}>{c.gender === "female" ? "Female voice" : "Male voice"}</Text>
                </View>
                <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? colors.yellow : colors.textDim} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.spRow}>
          <View style={styles.spIcon}><Ionicons name="musical-notes" size={18} color={colors.yellow} /></View>
          <View style={{ flex: 1 }}><Text style={styles.spLabel}>Cycling music</Text><Text style={styles.spSub}>Upbeat instrumental mix</Text></View>
          <Switch testID="toggle-music" value={musicOn} onValueChange={toggleMusic} trackColor={{ true: colors.red, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" />
        </View>

        {musicOn && trackName ? (
          <View style={styles.spRow}>
            <View style={styles.spIcon}><Ionicons name="disc" size={18} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}><Text style={styles.spLabel} numberOfLines={1}>{trackName}</Text><Text style={styles.spSub}>Now playing</Text></View>
            <Pressable testID="music-skip" onPress={onSkip} style={styles.skipTrackBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip to next track">
              <Ionicons name="play-skip-forward" size={16} color="#fff" />
              <Text style={styles.skipTrackText}>Skip</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.spRow, !musicOn && { opacity: 0.4 }]}>
          <View style={styles.spIcon}><Ionicons name="volume-high" size={18} color={colors.yellow} /></View>
          <Text style={[styles.spLabel, { flex: 1 }]}>Volume</Text>
          <Pressable testID="volume-down" onPress={() => setVolume(volume - 0.2)} disabled={!musicOn} style={styles.volBtn} hitSlop={8}><Ionicons name="remove" size={18} color="#fff" /></Pressable>
          <View style={styles.volBars}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={[styles.volSeg, { backgroundColor: i < level ? colors.yellow : "rgba(255,255,255,0.15)" }]} />
            ))}
          </View>
          <Pressable testID="volume-up" onPress={() => setVolume(volume + 0.2)} disabled={!musicOn} style={styles.volBtn} hitSlop={8}><Ionicons name="add" size={18} color="#fff" /></Pressable>
        </View>

        <View style={styles.spRow}>
          <View style={styles.spIcon}><Ionicons name="mic" size={18} color={colors.yellow} /></View>
          <View style={{ flex: 1 }}><Text style={styles.spLabel}>{coachName}&apos;s voice</Text><Text style={styles.spSub}>Spoken cues · softens music</Text></View>
          <Switch testID="toggle-voice" value={voiceOn} onValueChange={toggleVoice} trackColor={{ true: colors.red, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" />
        </View>

        <View style={[styles.voiceBlock, !voiceOn && { opacity: 0.4 }]} pointerEvents={voiceOn ? "auto" : "none"}>
          <Text style={styles.voiceHint}>Voice & accent · tap any to hear it, then pick your favourite</Text>
          {voiceOptions.length === 0 ? (
            <Text style={styles.spSub}>Loading device voices…</Text>
          ) : (
            <ScrollView style={styles.voiceList} showsVerticalScrollIndicator={false}>
              {voiceOptions.map((v) => {
                const active = v.id === voiceId;
                return (
                  <Pressable key={v.id} testID={`voice-${v.id}`} onPress={() => selectVoice(v.id)} style={[styles.voiceRow, active && styles.voiceRowActive]}>
                    <Ionicons name={v.gender === "female" ? "woman" : v.gender === "male" ? "man" : "person"} size={16} color={active ? colors.yellow : colors.textDim} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceLabel, active && { color: colors.white }]} numberOfLines={1}>{v.label}</Text>
                      <Text style={styles.voiceSub} numberOfLines={1}>{v.sublabel}</Text>
                    </View>
                    <Ionicons name={active ? "checkmark-circle" : "play-circle-outline"} size={20} color={active ? colors.yellow : colors.textDim} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Pressable>
    </Pressable>
  );
}

export function MusicButton({ musicOn, onPress }: { musicOn: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.mediaPill, musicOn ? styles.mediaPillOn : styles.mediaPillOff]} onPress={onPress} testID="music-button" hitSlop={8} accessibilityRole="button" accessibilityLabel="Music and audio settings">
      <Ionicons name={musicOn ? "volume-high" : "volume-mute"} size={22} color={musicOn ? colors.bg : colors.textDim} />
      <Text style={[styles.mediaPillLabel, { color: musicOn ? colors.bg : colors.textDim }]}>Audio</Text>
    </Pressable>
  );
}

export function CastButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={[styles.mediaPill, styles.mediaPillOff]} onPress={onPress} testID="cast-button" hitSlop={8} accessibilityRole="button" accessibilityLabel="Mirror screen to TV">
      <Ionicons name="tv-outline" size={22} color={colors.white} />
      <Text style={[styles.mediaPillLabel, { color: colors.white }]}>Mirror</Text>
    </Pressable>
  );
}

/** "Mirror to TV" help sheet — the whole workout is shown on the TV via the
 * device's built-in screen mirroring (AirPlay on iOS / Cast screen on Android).
 * This is a system feature, so it only works on a real device, not Expo Go. */
export function CastPanel({ onClose }: { onClose: () => void }) {
  const ios = Platform.OS === "ios";
  const heading = ios ? "AirPlay · Screen Mirroring" : "Google · Cast screen";
  const steps = ios
    ? [
        "Open Control Centre (swipe down from the top-right corner).",
        "Tap Screen Mirroring.",
        "Pick your Apple TV or AirPlay-compatible TV.",
        "Return here — your full ride now shows on the TV.",
      ]
    : [
        "Swipe down to open Quick Settings.",
        "Tap Screen Cast (or Google Home app → Cast my screen).",
        "Pick your Chromecast or Android TV.",
        "Return here — your full ride now shows on the TV.",
      ];
  return (
    <Pressable style={styles.rpOverlay} onPress={onClose} testID="cast-panel">
      <Pressable style={styles.spPanel} onPress={() => { /* swallow */ }}>
        <View style={styles.rpHead}>
          <View style={{ flex: 1 }}><Text style={styles.rpTitle}>Mirror to TV</Text><Text style={styles.rpSub}>Show the whole workout on your TV</Text></View>
          <Pressable onPress={onClose} testID="cast-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>

        <View style={styles.mirrorHeadRow}>
          <View style={styles.spIcon}><Ionicons name="tv" size={18} color={colors.yellow} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.spLabel}>{heading}</Text>
            <Text style={styles.spSub}>Same Wi-Fi on phone &amp; TV</Text>
          </View>
        </View>

        {steps.map((s, i) => (
          <View key={i} style={styles.mirrorStep}>
            <View style={styles.mirrorNum}><Text style={styles.mirrorNumText}>{i + 1}</Text></View>
            <Text style={styles.mirrorStepText}>{s}</Text>
          </View>
        ))}

        <Text style={styles.castNote}>Screen mirroring is a system feature, so it runs from your phone&apos;s menu (not this button) and only works on a real device — not in Expo Go or the web preview. Tip: turn off auto-lock so the screen stays on during your ride.</Text>
      </Pressable>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  /* top bar */
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 10, ...shadow.card },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 168, height: 26 },
  demoPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.yellow, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.03)" },
  demoPillOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  demoText: { color: colors.yellow, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  demoTextOn: { color: "#241B00" },
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
  routeTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", marginTop: 10, justifyContent: "center" },
  routeFill: { height: 6, borderRadius: 3, backgroundColor: colors.yellow },
  routeDot: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", marginLeft: -6, borderWidth: 2, borderColor: colors.red },
  routeProg: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 8 },
  mapWrap: { marginTop: 8, borderRadius: radius.md, backgroundColor: "#0C0E0D", borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
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
  cue: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(12,10,9,0.9)", borderWidth: 1, borderColor: "rgba(233,180,76,0.4)", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 10 },
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

  /* not-connected metric body */
  ncBody: { minHeight: 92, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 10 },
  ncTitle: { color: colors.textDim, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  ncSub: { color: colors.textFaint, fontSize: 11 },

  /* immersive HUD */
  hudTopScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  hudTopLeft: { position: "absolute", top: 16, left: 60 },
  hudElapsed: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: 0.5, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  hudElapsedSub: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  hudMicro: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  hudConn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.35)" },
  hudConnDot: { width: 6, height: 6, borderRadius: 3 },
  hudConnText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  hudCue: { position: "absolute", top: 18, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(12,10,9,0.72)", borderWidth: 1, borderColor: "rgba(233,180,76,0.4)", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, maxWidth: "52%" },
  hudCueText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  hudBotScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 150 },
  hudBottom: { position: "absolute", left: 18, right: 18, bottom: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  hudChips: { flexDirection: "row", gap: 10, flex: 1, flexWrap: "wrap" },
  hudChip: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9, minWidth: 118 },
  hudChipHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  hudChipLabel: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6 },
  hudChipVal: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 2 },
  hudChipUnit: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  hudControls: { flexDirection: "row", gap: 10 },
  hudBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingHorizontal: 22, height: 52 },
  hudPause: { backgroundColor: colors.yellow },
  hudPauseText: { color: "#1a1300", fontSize: 15, fontWeight: "900" },
  hudEnd: { backgroundColor: colors.red },
  hudEndText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  /* inline placeholder while expanded */
  placeholder: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center", gap: 10 },
  placeholderTitle: { color: colors.textDim, fontSize: 13.5, fontWeight: "600" },
  placeholderBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  placeholderBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  /* routes button + picker */
  routesBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  routesBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  hudRoutes: { position: "absolute", top: 12, right: 58 },
  skipTrackBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  skipTrackText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  rpOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", zIndex: 60 },
  rpPanel: { width: 760, maxWidth: "92%", maxHeight: "88%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  rpHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  rpTitle: { color: colors.white, fontSize: 22, fontWeight: "800" },
  rpSub: { color: colors.textDim, fontSize: 12.5, marginTop: 3 },
  rpActions: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  rpActionBtn: { flexDirection: "row", alignItems: "center", gap: 7, height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border },
  rpActionBtnOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  rpActionText: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  rpReco: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, backgroundColor: "rgba(245,179,1,0.12)", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  rpRecoText: { color: colors.yellow, fontSize: 10.5, fontWeight: "700" },
  rpLast: { backgroundColor: "rgba(143,211,255,0.12)" },
  rpGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  rpScroll: { gap: 2, paddingBottom: spacing.sm },
  rpSection: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm, marginBottom: spacing.sm },
  rpSectionText: { color: colors.white, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  rpCard: { width: 224, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 2 },
  rpCardActive: { borderColor: colors.yellow, borderWidth: 2 },
  rpThumb: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000", marginBottom: 8 },
  rpThumbScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },
  rpTag: { position: "absolute", top: 8, left: 8, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  rpTagText: { color: "#1a1300", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  rpActiveBadge: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  rpName: { color: colors.white, fontSize: 15, fontWeight: "800" },
  rpPlace: { color: colors.textDim, fontSize: 12 },
  rpStats: { flexDirection: "row", gap: 14, marginTop: 6 },
  rpStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  rpStatText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },

  /* settings / music panels */
  spPanel: { width: 520, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  spRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  spIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  spLabel: { color: colors.white, fontSize: 14, fontWeight: "700" },
  spSub: { color: colors.textDim, fontSize: 11.5, marginTop: 2 },
  volBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  volBars: { flexDirection: "row", gap: 4, alignItems: "center", marginHorizontal: 4 },
  volSeg: { width: 12, height: 16, borderRadius: 3 },
  voiceBlock: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12, marginTop: 4 },
  coachPickHint: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, marginBottom: 8, marginTop: 2, textTransform: "uppercase" },
  coachPickRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  coachPick: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 2, borderColor: colors.borderSoft },
  coachPickActive: { borderColor: colors.yellow },
  coachPickImg: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)" },
  coachPickName: { color: colors.white, fontSize: 15, fontWeight: "800" },
  coachPickSub: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  voiceHint: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, marginBottom: 8, textTransform: "uppercase" },
  voiceList: { maxHeight: 168 },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 6 },
  voiceRowActive: { borderColor: colors.yellow, backgroundColor: "rgba(245,197,24,0.10)" },
  voiceLabel: { flex: 1, color: colors.textDim, fontSize: 13.5, fontWeight: "700" },
  voiceSub: { color: colors.textDim, fontSize: 11, marginTop: 1, opacity: 0.8 },
  mediaPill: { flexDirection: "row", alignItems: "center", gap: 7, height: 46, paddingHorizontal: 16, borderRadius: 23, borderWidth: 1.5, ...shadow.glow },
  mediaPillOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  mediaPillOff: { backgroundColor: colors.card, borderColor: colors.border },
  mediaPillLabel: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  castActive: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  castActiveText: { flex: 1, color: colors.bg, fontWeight: "800", fontSize: 13.5 },
  castStop: { backgroundColor: "rgba(0,0,0,0.18)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  castStopText: { color: colors.bg, fontWeight: "800", fontSize: 12.5 },
  castNote: { color: colors.textDim, fontSize: 11, marginTop: 10, lineHeight: 15 },
  mirrorHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  mirrorStep: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  mirrorNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(242,194,48,0.16)", borderWidth: 1, borderColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  mirrorNumText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  mirrorStepText: { flex: 1, color: colors.white, fontSize: 14, lineHeight: 19 },
});
