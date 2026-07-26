import React from "react";
import { View, Text, Image, StyleSheet, Pressable, ScrollView, useWindowDimensions, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow } from "@/src/theme";
import { VirtualRouteScene, SceneTelemetry } from "./scene";
import { RouteProfile } from "./RouteProfile";
import type { VRoute, RouteState } from "@/src/lib/vroutes";
import { riderVisualFor } from "@/src/lib/virtual-riders";
import { RiderAppearanceConfiguration, DEFAULT_APPEARANCE } from "@/src/lib/rider-config";

const WORDMARK = require("../../../assets/images/auth_wordmark.png");
const LOGO_GLYPH = require("../../../assets/images/auth_logo_glyph.png");

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const PRESETS = [
  { label: "Recovery", w: 120, icon: "leaf-outline" as const },
  { label: "Endurance", w: 185, icon: "bicycle-outline" as const },
  { label: "Tempo", w: 235, icon: "flame-outline" as const },
  { label: "Climb", w: 295, icon: "trending-up-outline" as const },
];

export type VirtualRideMetrics = {
  power: number;
  cadence: number;
  speed: number;
  hr: number;
  elapsed: number;
  riddenKm: number;
};

export type VirtualRidePlayerProps = {
  mode: "embedded" | "fullscreen";
  vroute: VRoute;
  routeState: RouteState;
  appearance?: RiderAppearanceConfiguration;
  metrics: VirtualRideMetrics;
  paused: boolean;
  connected: boolean;
  simulation: boolean;
  hrOn: boolean;
  load?: number; // ERG / resistance %
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  cue?: string;
  stepLabel?: string;
  stepTimeLeft?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  routeBadge?: { icon: keyof typeof Ionicons.glyphMap; label: string } | null;
  /** Vertical stage/segment progression shown in the rail (workout intervals or route checkpoints). */
  stages?: { label: string; sub?: string; state: "done" | "active" | "upcoming" }[];
  // Controls
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
  onPauseToggle?: () => void;
  onOpenRoutes?: () => void;
  onPreset?: (watts: number) => void;
  ergOn?: boolean;
  onErgToggle?: () => void;
  onReconnect?: () => void;
  // Context-aware extras (used by the standalone Virtual Routes ride)
  exitLabel?: string;
  exitIcon?: keyof typeof Ionicons.glyphMap;
  onSensors?: () => void;
  sensorsOn?: boolean;
  onEmergency?: () => void;
  connLabel?: string;
  connTone?: string;
};

/**
 * Shared immersive Virtual Ride player. Composes the existing `VirtualRouteScene`
 * renderer + `vroutes` route state + `RouteProfile` elevation strip. Used for both
 * the embedded (minimal overlay) and fullscreen (full HUD) views inside Live
 * Workout so the two stay perfectly in sync — all state is driven by the props
 * derived from the single ongoing workout.
 */
export function VirtualRidePlayer(props: VirtualRidePlayerProps) {
  const {
    mode, vroute, routeState, appearance = DEFAULT_APPEARANCE, metrics, paused, simulation,
    hrOn, load = 100, reducedMotion, onToggleReducedMotion, cue, stepLabel, stepTimeLeft, compact, style, routeBadge, stages,
    onFullscreen, onExitFullscreen, onPauseToggle, onOpenRoutes, onPreset, ergOn, onErgToggle, onReconnect,
    exitLabel = "Exit", exitIcon = "contract", onSensors, sensorsOn, onEmergency, connLabel, connTone,
  } = props;

  const rider = riderVisualFor(appearance.riderType);
  const { width } = useWindowDimensions();
  const smallTablet = width < 1000 || !!compact;
  const railW = smallTablet ? 160 : 208;
  const glyphSize = smallTablet ? 30 : 40;
  const wordW = railW - 24 - glyphSize - 10;
  const scene: SceneTelemetry = {
    power: metrics.power,
    cadence: metrics.cadence,
    speed: metrics.speed,
    hr: hrOn ? metrics.hr : 0,
    gradient: routeState.gradient,
    curve: routeState.curve,
    moving: !paused,
    connected: !paused,
    reducedMotion,
    simulation,
    emergencyStop: false,
  };

  const gradeTone = routeState.gradient >= 6 ? colors.red : routeState.gradient >= 3 ? colors.yellow : colors.green;

  if (mode === "embedded") {
    return (
      <View style={[st.embedWrap, style]}>
        <VirtualRouteScene rider={rider} appearance={appearance} align={vroute.riderAlign} bgScale={vroute.bgScale} bgShiftY={vroute.bgShiftY} backdrop={vroute.backdrop} telemetry={scene} showBrand={false} />

        {/* Minimal overlay only — no duplicated HUD/metrics */}
        <View style={[st.embedTopRow, { pointerEvents: "box-none" }]}>
          <Pressable onPress={onOpenRoutes} style={st.routeNamePill} testID="vr-embed-route" accessibilityRole="button" accessibilityLabel="Change route">
            <Ionicons name="location" size={13} color={colors.yellow} />
            <Text style={st.routeNameText} numberOfLines={1}>{vroute.name}</Text>
            {onOpenRoutes && <Ionicons name="chevron-down" size={13} color={colors.textFaint} />}
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onToggleReducedMotion} style={[st.embedIcon, reducedMotion && st.embedIconOn]} testID="vr-embed-view" accessibilityRole="button" accessibilityLabel="Toggle camera / motion">
            <Ionicons name={reducedMotion ? "eye-off-outline" : "videocam-outline"} size={22} color={reducedMotion ? colors.bg : colors.white} />
          </Pressable>
          <Pressable onPress={onFullscreen} style={st.embedIcon} testID="vr-embed-fullscreen" accessibilityRole="button" accessibilityLabel="Enter fullscreen virtual ride">
            <Ionicons name="expand-outline" size={22} color={colors.white} />
          </Pressable>
        </View>

        <View style={[st.embedBottomRow, { pointerEvents: "none" }]}>
          <View style={[st.gradePill, { borderColor: gradeTone + "99" }]}>
            <Ionicons name="trending-up" size={13} color={gradeTone} />
            <Text style={st.gradeText}>{routeState.gradient > 0 ? "+" : ""}{routeState.gradient}%</Text>
          </View>
          {routeBadge && (
            <View style={st.matchPill}>
              <Ionicons name={routeBadge.icon} size={12} color={colors.yellow} />
              <Text style={st.matchText} numberOfLines={1}>{routeBadge.label}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ---- Fullscreen: full Virtual Ride HUD ----
  const cells = [
    { label: "POWER", value: `${Math.round(metrics.power)}`, unit: "W", icon: "flash" as const, tone: colors.yellow },
    { label: "CADENCE", value: `${Math.round(metrics.cadence)}`, unit: "rpm", icon: "sync" as const, tone: colors.green },
    { label: "SPEED", value: `${Math.round(metrics.speed)}`, unit: "km/h", icon: "speedometer" as const, tone: "#5AC8FA" },
    { label: "HEART RATE", value: hrOn ? `${Math.round(metrics.hr)}` : "—", unit: "bpm", icon: "heart" as const, tone: colors.red },
    { label: "GRADIENT", value: `${routeState.gradient}`, unit: "%", icon: "trending-up" as const, tone: gradeTone },
    { label: "LOAD", value: `${load}`, unit: "%", icon: "barbell" as const, tone: load >= 120 ? colors.red : load >= 105 ? colors.yellow : colors.green },
    { label: "DISTANCE", value: `${metrics.riddenKm.toFixed(1)}`, unit: "km", icon: "navigate" as const, tone: "#5AC8FA" },
    { label: "ELAPSED", value: mmss(metrics.elapsed), unit: "", icon: "time-outline" as const, tone: colors.white },
  ];

  return (
    <View style={st.fsWrap} testID="vr-fullscreen">
      <VirtualRouteScene rider={rider} appearance={appearance} align={vroute.riderAlign} bgScale={vroute.bgScale} bgShiftY={vroute.bgShiftY} backdrop={vroute.backdrop} telemetry={scene} showBrand={false} />

      {/* Vertical HUD rail down the left — brand scales to screen, metrics stack top→bottom */}
      <ScrollView
        style={[st.rail, { width: railW, pointerEvents: "box-none" }]}
        contentContainerStyle={st.railContent}
        showsVerticalScrollIndicator={false}
        testID="vr-full-panel"
      >
        <View style={[st.brand, { pointerEvents: "none" }]}>
          <Image source={LOGO_GLYPH} style={{ width: glyphSize, height: glyphSize }} resizeMode="contain" />
          <Image source={WORDMARK} style={{ width: wordW, height: wordW * 0.17 }} resizeMode="contain" />
        </View>
        <View style={[st.railHead, { pointerEvents: "none" }]}>
          <Ionicons name="location" size={12} color={colors.yellow} />
          <Text style={st.railRoute} numberOfLines={1}>Next: {routeState.segmentLabel}</Text>
        </View>
        <Text style={[st.railKm, { pointerEvents: "none" }]}>{routeState.remainingKm.toFixed(1)} km to go</Text>
        <View style={st.progressTrack}><View style={[st.progressFill, { width: `${routeState.progress * 100}%` }]} /></View>
        <RouteProfile vroute={vroute} progress={routeState.progress} height={smallTablet ? 30 : 38} />

        <View style={st.railMetrics}>
          {cells.map((c) => (
            <View key={c.label} style={st.railRow}>
              <Ionicons name={c.icon} size={16} color={c.tone} style={{ width: 20, textAlign: "center" }} />
              <View style={{ flex: 1 }}>
                <Text style={st.railValue} numberOfLines={1}>{c.value}<Text style={st.railUnit}> {c.unit}</Text></Text>
                <Text style={st.railLabel}>{c.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {!!stages && stages.length > 0 && (
          <View style={st.stages}>
            <Text style={st.stagesLabel}>STAGES</Text>
            {stages.map((sg, i) => {
              const tone = sg.state === "active" ? colors.yellow : sg.state === "done" ? colors.green : colors.textFaint;
              const icon = sg.state === "done" ? "checkmark-circle" : sg.state === "active" ? "radio-button-on" : "ellipse-outline";
              return (
                <View key={`${sg.label}-${i}`} style={[st.stageRow, sg.state === "active" && st.stageActive]}>
                  <Ionicons name={icon as any} size={14} color={tone} style={{ width: 18, textAlign: "center" }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.stageName, sg.state === "active" && { color: colors.white }, sg.state === "upcoming" && { color: colors.textDim }]} numberOfLines={1}>{sg.label}</Text>
                    {!!sg.sub && <Text style={st.stageSub} numberOfLines={1}>{sg.sub}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Top-right: connection, coaching cue, interval, camera/motion toggle */}
      <View style={[st.fsTopRight, { pointerEvents: "box-none" }]}>
        {!!connLabel && (
          <View style={[st.connPill, { borderColor: (connTone ?? colors.textDim) + "88", backgroundColor: (connTone ?? colors.textDim) + "22" }]}>
            <View style={[st.connDot, { backgroundColor: connTone ?? colors.textDim }]} />
            <Text style={st.connText}>{connLabel}</Text>
          </View>
        )}
        {(stepLabel || stepTimeLeft) && (
          <View style={st.fsInterval}>
            <Ionicons name="flag" size={13} color={colors.yellow} />
            <Text style={st.fsIntervalText} numberOfLines={1}>{stepLabel ?? "Interval"}{stepTimeLeft ? ` · ${stepTimeLeft}` : ""}</Text>
          </View>
        )}
        {!!cue && (
          <View style={st.cuePill}>
            <Ionicons name="chatbubble-ellipses" size={13} color={colors.yellow} />
            <Text style={st.cueText} numberOfLines={2}>{cue}</Text>
          </View>
        )}
        <Pressable onPress={onToggleReducedMotion} style={[st.fsIcon, reducedMotion && st.fsIconOn]} accessibilityRole="button" accessibilityLabel="Toggle camera / motion">
          <Ionicons name={reducedMotion ? "eye-off-outline" : "videocam-outline"} size={22} color={reducedMotion ? colors.bg : colors.white} />
        </Pressable>
      </View>

      {/* Control bar (bottom) — mirrors the Live Workout control bar, pinned across the bottom */}
      <View style={[st.controlsWrap, { pointerEvents: "box-none" }]}>
        <View style={st.bar}>
          {onPreset && PRESETS.map((p) => (
            <Pressable key={p.label} onPress={() => onPreset(p.w)} style={st.round} accessibilityLabel={`Set ${p.label} effort`}>
              <Ionicons name={p.icon} size={24} color={colors.yellow} />
              <Text style={st.roundText}>{p.label}</Text>
            </Pressable>
          ))}
          {onErgToggle && (
            <Pressable onPress={onErgToggle} style={[st.round, ergOn && st.roundOn]} accessibilityLabel="Toggle ERG resistance">
              <Ionicons name="options-outline" size={24} color={ergOn ? colors.yellow : colors.white} />
              <Text style={[st.roundText, ergOn && { color: colors.yellow }]}>ERG</Text>
            </Pressable>
          )}
          {onReconnect && (
            <Pressable onPress={onReconnect} style={st.round} accessibilityLabel="Reconnect trainer">
              <Ionicons name="refresh" size={24} color={colors.white} />
              <Text style={st.roundText}>Reconnect</Text>
            </Pressable>
          )}
          {onSensors && (
            <Pressable onPress={onSensors} style={[st.round, sensorsOn && st.roundOn]} testID="vr-fs-sensors" accessibilityLabel="Pair Bluetooth sensors">
              <Ionicons name="bluetooth" size={24} color={sensorsOn ? colors.yellow : colors.white} />
              <Text style={[st.roundText, sensorsOn && { color: colors.yellow }]}>Sensors</Text>
            </Pressable>
          )}
          {onEmergency && (
            <Pressable onPress={onEmergency} style={[st.round, { borderColor: colors.red }]} testID="vr-fs-emergency" accessibilityLabel="Emergency stop resistance">
              <Ionicons name="warning-outline" size={24} color={colors.red} />
              <Text style={[st.roundText, { color: colors.red }]}>Stop</Text>
            </Pressable>
          )}
          <View style={st.barSpacer} />
          <Pressable onPress={onPauseToggle} style={st.pausePrimary} testID="vr-fs-pause" accessibilityLabel={paused ? "Resume" : "Pause"}>
            <Ionicons name={paused ? "play" : "pause"} size={28} color={colors.bg} />
            <Text style={st.pausePrimaryText}>{paused ? "Resume" : "Pause"}</Text>
          </Pressable>
          <Pressable onPress={onExitFullscreen} style={st.exitBtn} testID="vr-exit-fullscreen" accessibilityLabel={exitLabel}>
            <Ionicons name={exitIcon} size={26} color={colors.white} />
            <Text style={st.exitText}>{exitLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  embedWrap: { flex: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#05060a", position: "relative" },
  embedTopRow: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  routeNamePill: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "62%", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  routeNameText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  embedIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },
  embedIconOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  embedBottomRow: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  gradePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  gradeText: { color: colors.white, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  matchPill: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 210, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: colors.yellow + "66", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  matchText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },

  fsWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05060a" },

  // Vertical HUD rail (left)
  rail: { position: "absolute", left: 0, top: 0, bottom: 74, backgroundColor: "rgba(8,9,12,0.62)", borderRightWidth: 1, borderRightColor: colors.border },
  railContent: { padding: 12, gap: 8 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  railHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  railRoute: { color: colors.textDim, fontSize: 11, fontWeight: "700", flex: 1 },
  railKm: { color: colors.textFaint, fontSize: 10, fontWeight: "700" },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  railMetrics: { marginTop: 4, gap: 2 },
  railRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" } as any,
  railValue: { color: colors.white, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  railUnit: { color: colors.textFaint, fontSize: 10, fontWeight: "700" },
  railLabel: { color: colors.textFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.8 },
  stages: { marginTop: 8, gap: 2, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 6 },
  stagesLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, borderRadius: 8, paddingHorizontal: 4 },
  stageActive: { backgroundColor: "rgba(240,192,64,0.14)" },
  stageName: { color: colors.textDim, fontSize: 12, fontWeight: "700" },
  stageSub: { color: colors.textFaint, fontSize: 9.5, fontWeight: "600" },
  connPill: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  fsTopRight: { position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, maxWidth: "62%" },
  fsIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },
  fsIconOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  cuePill: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(10,11,14,0.8)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  cueText: { color: colors.textDim, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  fsInterval: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, height: 40 },
  fsIntervalText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  // Bottom control bar — mirrors LiveControlBar
  controlsWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(8,9,9,0.86)", paddingHorizontal: 12, paddingVertical: 8, flexWrap: "wrap", ...(shadow.card as any) },
  round: { alignItems: "center", justifyContent: "center", gap: 4, minWidth: 90, height: 72, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 },
  roundOn: { backgroundColor: colors.yellow + "22", borderColor: colors.yellow },
  roundText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  barSpacer: { flex: 1, minWidth: 8 },
  pausePrimary: { flexDirection: "row", alignItems: "center", gap: 10, height: 72, paddingHorizontal: 30, borderRadius: radius.md, backgroundColor: colors.yellow },
  pausePrimaryText: { color: colors.bg, fontSize: 20, fontWeight: "800" },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 72, paddingHorizontal: 26, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border },
  exitText: { color: colors.white, fontSize: 20, fontWeight: "800" },
});
