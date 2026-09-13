import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow } from "@/src/theme";

const WORDMARK = require("../../assets/images/auth_wordmark.png");
const LOGO_GLYPH = require("../../assets/images/auth_logo_glyph.png");

const PRESETS: { label: string; w: number; icon: any }[] = [
  { label: "Easy", w: 120, icon: "leaf-outline" },
  { label: "Steady", w: 200, icon: "walk-outline" },
  { label: "Hard", w: 280, icon: "flame-outline" },
];

export type FullscreenHudStage = { label: string; sub?: string; state: "done" | "active" | "upcoming" };

/**
 * The same telemetry HUD the Virtual Ride fullscreen scene shows (left rail
 * of live metrics + stages, top-right coaching cue, bottom control bar) — but
 * decoupled from the scenic route rendering so it can sit on top of ANY
 * fullscreen video (YouTube, a custom link, etc.) and the rider never loses
 * their live numbers just because they're watching something other than the
 * built-in virtual route.
 */
export function FullscreenHud({
  metrics, stages, cue, stepLabel, stepTimeLeft,
  paused, onPauseToggle, onExitFullscreen, exitLabel = "Exit", exitIcon = "contract-outline",
  ergOn, onErgToggle, onReconnect, onPreset, compact,
}: {
  metrics: { power: number; cadence: number; speed: number; hr: number; hrOn: boolean; elapsed: number; riddenKm: number };
  stages?: FullscreenHudStage[];
  cue?: string;
  stepLabel?: string;
  stepTimeLeft?: string;
  paused: boolean;
  onPauseToggle: () => void;
  onExitFullscreen: () => void;
  exitLabel?: string;
  exitIcon?: any;
  ergOn?: boolean;
  onErgToggle?: () => void;
  onReconnect?: () => void;
  onPreset?: (watts: number) => void;
  compact?: boolean;
}) {
  const { width } = useWindowDimensions();
  const smallTablet = width < 1000 || !!compact;
  const railW = smallTablet ? 160 : 208;
  const glyphSize = smallTablet ? 30 : 40;
  const wordW = railW - 24 - glyphSize - 10;
  const compactBar = width < 1180 || !!compact;
  const tinyBar = width < 900;
  const RB_H = tinyBar ? 44 : compactBar ? 48 : 50;
  const RB_ICON = tinyBar ? 16 : compactBar ? 17 : 18;
  const RB_TXT = tinyBar ? 10 : compactBar ? 10.5 : 11;
  const RB_MINW = tinyBar ? 54 : compactBar ? 62 : 68;
  const RB_PAD = tinyBar ? 8 : 10;
  const P_ICON = tinyBar ? 18 : compactBar ? 19 : 20;
  const P_TXT = tinyBar ? 13 : compactBar ? 14 : 15;
  const P_PAD = tinyBar ? 16 : compactBar ? 18 : 22;
  const EX_H = tinyBar ? 44 : compactBar ? 48 : 50;
  const EX_ICON = tinyBar ? 18 : compactBar ? 19 : 20;
  const EX_TXT = tinyBar ? 13 : compactBar ? 15 : 16;
  const EX_PAD = tinyBar ? 16 : compactBar ? 22 : 26;
  const EX_GAP = tinyBar ? 8 : compactBar ? 9 : 10;
  const roundDyn = { minWidth: RB_MINW, height: RB_H, paddingHorizontal: RB_PAD };
  const roundTxtDyn = { fontSize: RB_TXT };
  const RAIL_VAL = smallTablet ? 15 : 18;
  const RAIL_ICON = smallTablet ? 14 : 16;

  const cells = [
    { label: "POWER", value: `${Math.round(metrics.power)}`, unit: "W", icon: "flash" as const, tone: colors.yellow },
    { label: "CADENCE", value: `${Math.round(metrics.cadence)}`, unit: "rpm", icon: "sync" as const, tone: colors.green },
    { label: "SPEED", value: `${Math.round(metrics.speed)}`, unit: "km/h", icon: "speedometer" as const, tone: "#5AC8FA" },
    { label: "HEART RATE", value: metrics.hrOn ? `${Math.round(metrics.hr)}` : "—", unit: "bpm", icon: "heart" as const, tone: colors.red },
    { label: "DISTANCE", value: `${metrics.riddenKm.toFixed(1)}`, unit: "km", icon: "navigate" as const, tone: "#5AC8FA" },
    { label: "ELAPSED", value: `${Math.floor(metrics.elapsed / 60)}:${String(Math.floor(metrics.elapsed % 60)).padStart(2, "0")}`, unit: "", icon: "time-outline" as const, tone: colors.white },
  ];

  return (
    <View style={[fh.wrap, { pointerEvents: "box-none" }]} testID="fullscreen-hud">
      {/* Vertical HUD rail down the left — brand, live metrics, stages */}
      <ScrollView
        style={[fh.rail, { width: railW, pointerEvents: "box-none" }]}
        contentContainerStyle={fh.railContent}
        showsVerticalScrollIndicator={false}
        testID="fullscreen-hud-rail"
      >
        <View style={[fh.brand, { pointerEvents: "none" }]}>
          <Image source={LOGO_GLYPH} style={{ width: glyphSize, height: glyphSize }} contentFit="contain" />
          <Image source={WORDMARK} style={{ width: wordW, height: wordW * 0.17 }} contentFit="contain" />
        </View>
        <View style={fh.railMetrics}>
          {cells.map((c) => (
            <View key={c.label} style={fh.railRow}>
              <Ionicons name={c.icon} size={RAIL_ICON} color={c.tone} style={{ width: 20, textAlign: "center" }} />
              <View style={{ flex: 1 }}>
                <Text style={[fh.railValue, { fontSize: RAIL_VAL }]} numberOfLines={1}>{c.value}<Text style={fh.railUnit}> {c.unit}</Text></Text>
                <Text style={fh.railLabel}>{c.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {!!stages && stages.length > 0 && (
          <View style={fh.stages}>
            <Text style={fh.stagesLabel}>STAGES</Text>
            {stages.map((sg, i) => {
              const tone = sg.state === "active" ? colors.yellow : sg.state === "done" ? colors.green : colors.textFaint;
              const icon = sg.state === "done" ? "checkmark-circle" : sg.state === "active" ? "radio-button-on" : "ellipse-outline";
              return (
                <View key={`${sg.label}-${i}`} style={[fh.stageRow, sg.state === "active" && fh.stageActive]}>
                  <Ionicons name={icon as any} size={14} color={tone} style={{ width: 18, textAlign: "center" }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[fh.stageName, sg.state === "active" && { color: colors.white }, sg.state === "upcoming" && { color: colors.textDim }]} numberOfLines={1}>{sg.label}</Text>
                    {!!sg.sub && <Text style={fh.stageSub} numberOfLines={1}>{sg.sub}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Top-right: coaching cue + current interval */}
      <View style={[fh.topRight, { pointerEvents: "box-none" }]}>
        {(stepLabel || stepTimeLeft) && (
          <View style={fh.interval}>
            <Ionicons name="flag" size={13} color={colors.yellow} />
            <Text style={fh.intervalText} numberOfLines={1}>{stepLabel ?? "Interval"}{stepTimeLeft ? ` · ${stepTimeLeft}` : ""}</Text>
          </View>
        )}
        {!!cue && (
          <View style={fh.cuePill}>
            <Ionicons name="chatbubble-ellipses" size={13} color={colors.yellow} />
            <Text style={fh.cueText} numberOfLines={2}>{cue}</Text>
          </View>
        )}
      </View>

      {/* Bottom control bar — mirrors the Live Workout control bar */}
      <View style={[fh.controlsWrap, { pointerEvents: "box-none" }]}>
        <View style={fh.bar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fh.barScroll} contentContainerStyle={fh.barScrollInner}>
            {onPreset && PRESETS.map((p) => (
              <Pressable key={p.label} onPress={() => onPreset(p.w)} style={[fh.round, roundDyn]} accessibilityLabel={`Set ${p.label} effort`}>
                <Ionicons name={p.icon} size={RB_ICON} color={colors.yellow} />
                <Text style={[fh.roundText, roundTxtDyn]}>{p.label}</Text>
              </Pressable>
            ))}
            {onErgToggle && (
              <Pressable onPress={onErgToggle} style={[fh.round, roundDyn, ergOn && fh.roundOn]} accessibilityLabel="Toggle ERG resistance">
                <Ionicons name="options-outline" size={RB_ICON} color={ergOn ? colors.yellow : colors.white} />
                <Text style={[fh.roundText, roundTxtDyn, ergOn && { color: colors.yellow }]}>ERG</Text>
              </Pressable>
            )}
            {onReconnect && (
              <Pressable onPress={onReconnect} style={[fh.round, roundDyn]} accessibilityLabel="Manage sensors">
                <Ionicons name="bluetooth" size={RB_ICON} color={colors.white} />
                <Text style={[fh.roundText, roundTxtDyn]}>Sensors</Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable onPress={onPauseToggle} style={[fh.pausePrimary, { height: RB_H, paddingHorizontal: P_PAD }]} testID="fh-pause" accessibilityLabel={paused ? "Resume" : "Pause"}>
            <Ionicons name={paused ? "play" : "pause"} size={P_ICON} color={colors.bg} />
            <Text style={[fh.pausePrimaryText, { fontSize: P_TXT }]}>{paused ? "Resume" : "Pause"}</Text>
          </Pressable>
          <Pressable onPress={onExitFullscreen} style={[fh.exitBtn, { height: EX_H, paddingHorizontal: EX_PAD, gap: EX_GAP }]} testID="fh-exit" accessibilityLabel={exitLabel}>
            <Ionicons name={exitIcon} size={EX_ICON} color={colors.white} />
            <Text style={[fh.exitText, { fontSize: EX_TXT }]}>{exitLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const fh = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject },
  rail: { position: "absolute", left: 0, top: 0, bottom: 74, backgroundColor: "rgba(8,9,12,0.62)", borderRightWidth: 1, borderRightColor: colors.border },
  railContent: { padding: 12, gap: 8 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
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

  topRight: { position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, maxWidth: "62%" },
  cuePill: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(10,11,14,0.8)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  cueText: { color: colors.textDim, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  interval: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, height: 40 },
  intervalText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  controlsWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(8,9,9,0.86)", paddingHorizontal: 12, paddingVertical: 8, flexWrap: "nowrap", ...(shadow.card as any) },
  barScroll: { flex: 1 },
  barScrollInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },
  round: { alignItems: "center", justifyContent: "center", gap: 4, minWidth: 90, height: 72, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 },
  roundOn: { backgroundColor: colors.yellow + "22", borderColor: colors.yellow },
  roundText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  pausePrimary: { flexDirection: "row", alignItems: "center", gap: 8, height: 72, paddingHorizontal: 30, borderRadius: radius.md, backgroundColor: colors.yellow },
  pausePrimaryText: { color: colors.bg, fontSize: 20, fontWeight: "800" },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 88, paddingHorizontal: 44, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1.5, borderColor: colors.border },
  exitText: { color: colors.white, fontSize: 30, fontWeight: "800" },
});
