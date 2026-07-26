import React from "react";
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow } from "@/src/theme";
import { VirtualRouteScene, SceneTelemetry } from "./scene";
import { RouteProfile } from "./RouteProfile";
import type { VRoute, RouteState } from "@/src/lib/vroutes";
import { riderVisualFor } from "@/src/lib/virtual-riders";
import { RiderAppearanceConfiguration, DEFAULT_APPEARANCE } from "@/src/lib/rider-config";

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
  // Controls
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
  onPauseToggle?: () => void;
  onOpenRoutes?: () => void;
  onPreset?: (watts: number) => void;
  ergOn?: boolean;
  onErgToggle?: () => void;
  onReconnect?: () => void;
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
    hrOn, load = 100, reducedMotion, onToggleReducedMotion, cue, stepLabel, stepTimeLeft, compact, style,
    onFullscreen, onExitFullscreen, onPauseToggle, onOpenRoutes, onPreset, ergOn, onErgToggle, onReconnect,
  } = props;

  const rider = riderVisualFor(appearance.riderType);
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
        <VirtualRouteScene rider={rider} appearance={appearance} backdrop={vroute.backdrop} telemetry={scene} showBrand={false} />

        {/* Minimal overlay only — no duplicated HUD/metrics */}
        <View style={st.embedTopRow} pointerEvents="box-none">
          <Pressable onPress={onOpenRoutes} style={st.routeNamePill} testID="vr-embed-route" accessibilityRole="button" accessibilityLabel="Change route">
            <Ionicons name="location" size={13} color={colors.yellow} />
            <Text style={st.routeNameText} numberOfLines={1}>{vroute.name}</Text>
            {onOpenRoutes && <Ionicons name="chevron-down" size={13} color={colors.textFaint} />}
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onToggleReducedMotion} style={[st.embedIcon, reducedMotion && st.embedIconOn]} testID="vr-embed-view" accessibilityRole="button" accessibilityLabel="Toggle camera / motion">
            <Ionicons name={reducedMotion ? "eye-off-outline" : "videocam-outline"} size={16} color={reducedMotion ? colors.bg : colors.white} />
          </Pressable>
          <Pressable onPress={onFullscreen} style={st.embedIcon} testID="vr-embed-fullscreen" accessibilityRole="button" accessibilityLabel="Enter fullscreen virtual ride">
            <Ionicons name="expand-outline" size={16} color={colors.white} />
          </Pressable>
        </View>

        <View style={st.embedBottomRow} pointerEvents="none">
          <View style={[st.gradePill, { borderColor: gradeTone + "99" }]}>
            <Ionicons name="trending-up" size={13} color={gradeTone} />
            <Text style={st.gradeText}>{routeState.gradient > 0 ? "+" : ""}{routeState.gradient}%</Text>
          </View>
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
      <VirtualRouteScene rider={rider} appearance={appearance} backdrop={vroute.backdrop} telemetry={scene} showBrand />

      {/* Top-right controls */}
      <View style={st.fsTopRight} pointerEvents="box-none">
        {!!cue && (
          <View style={st.cuePill}>
            <Ionicons name="chatbubble-ellipses" size={13} color={colors.yellow} />
            <Text style={st.cueText} numberOfLines={2}>{cue}</Text>
          </View>
        )}
        <Pressable onPress={onToggleReducedMotion} style={[st.fsIcon, reducedMotion && st.fsIconOn]} accessibilityRole="button" accessibilityLabel="Toggle camera / motion">
          <Ionicons name={reducedMotion ? "eye-off-outline" : "videocam-outline"} size={18} color={reducedMotion ? colors.bg : colors.white} />
        </Pressable>
        <Pressable onPress={onExitFullscreen} style={st.fsIcon} testID="vr-exit-fullscreen" accessibilityRole="button" accessibilityLabel="Exit fullscreen">
          <Ionicons name="contract-outline" size={18} color={colors.white} />
        </Pressable>
      </View>

      {/* Interval chip (top-left) */}
      {(stepLabel || stepTimeLeft) && (
        <View style={st.fsInterval} pointerEvents="none">
          <Ionicons name="flag" size={13} color={colors.yellow} />
          <Text style={st.fsIntervalText} numberOfLines={1}>{stepLabel ?? "Interval"}{stepTimeLeft ? ` · ${stepTimeLeft}` : ""}</Text>
        </View>
      )}

      {/* Telemetry HUD (bottom-left) */}
      <View style={[st.panel, compact && st.panelCompact]} pointerEvents="box-none" testID="vr-full-panel">
        <View style={st.panelHead}>
          <Ionicons name="location" size={13} color={colors.yellow} />
          <Text style={st.panelRoute} numberOfLines={1}>Next: {routeState.segmentLabel} · {routeState.remainingKm.toFixed(1)} km to go</Text>
        </View>
        <RouteProfile vroute={vroute} progress={routeState.progress} height={compact ? 34 : 44} />
        <View style={st.progressTrack}><View style={[st.progressFill, { width: `${routeState.progress * 100}%` }]} /></View>
        <View style={st.panelGrid}>
          {cells.map((c) => (
            <View key={c.label} style={st.panelCell}>
              <Ionicons name={c.icon} size={13} color={c.tone} />
              <Text style={st.panelValue}>{c.value}<Text style={st.panelUnit}> {c.unit}</Text></Text>
              <Text style={st.panelLabel}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Control bar (bottom) */}
      <View style={st.controls} pointerEvents="box-none">
        <View style={st.controlRow}>
          <CtrlBtn icon={paused ? "play" : "pause"} label={paused ? "Resume" : "Pause"} tone={paused ? colors.green : undefined} onPress={onPauseToggle} />
          <CtrlBtn icon="contract" label="Exit" onPress={onExitFullscreen} />
          <View style={{ flex: 1, minWidth: 8 }} />
          {onPreset && PRESETS.map((p) => (
            <Pressable key={p.label} onPress={() => onPreset(p.w)} style={st.presetChip} accessibilityLabel={`Set ${p.label} effort`}>
              <Ionicons name={p.icon} size={14} color={colors.yellow} />
              <Text style={st.presetText}>{p.label}</Text>
            </Pressable>
          ))}
          {onErgToggle && (
            <Pressable onPress={onErgToggle} style={[st.iconBtnDark, ergOn && st.iconBtnOn]} accessibilityLabel="Toggle ERG resistance">
              <Ionicons name="options-outline" size={16} color={ergOn ? colors.bg : colors.white} />
            </Pressable>
          )}
          {onReconnect && (
            <Pressable onPress={onReconnect} style={st.iconBtnDark} accessibilityLabel="Simulate signal drop / reconnect">
              <Ionicons name="cellular-outline" size={16} color={colors.white} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function CtrlBtn({ icon, label, tone, onPress }: { icon: any; label: string; tone?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.ctrlBtn, tone ? { backgroundColor: tone } : null]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={tone ? "#0b0b0b" : colors.white} />
      <Text style={[st.ctrlText, tone ? { color: "#0b0b0b" } : null]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  embedWrap: { flex: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#05060a", position: "relative" },
  embedTopRow: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  routeNamePill: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "62%", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  routeNameText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  embedIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },
  embedIconOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  embedBottomRow: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  gradePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  gradeText: { color: colors.white, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },

  fsWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05060a" },
  fsTopRight: { position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, maxWidth: "70%" },
  fsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },
  fsIconOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  cuePill: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(10,11,14,0.8)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  cueText: { color: colors.textDim, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  fsInterval: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  fsIntervalText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  panel: { position: "absolute", left: 12, bottom: 78, width: 360, backgroundColor: "rgba(10,11,14,0.72)", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10, ...(shadow.card as any) },
  panelCompact: { width: 300 },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  panelRoute: { color: colors.textDim, fontSize: 12, fontWeight: "700", flex: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  panelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panelCell: { width: "30%", flexGrow: 1, gap: 2 },
  panelValue: { color: colors.white, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  panelUnit: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
  panelLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },

  controls: { position: "absolute", left: 0, right: 0, bottom: 0 },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: "wrap" },
  ctrlBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  ctrlText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  presetChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  presetText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  iconBtnDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },
  iconBtnOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
