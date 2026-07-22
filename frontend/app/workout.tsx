import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, LayoutChangeEvent, Pressable, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useTelemetry } from "@/src/hooks/useTelemetry";
import {
  WorkoutTopBar, PowerCard, HeartRateCard, CadenceCard, WorkoutTimelineCard,
  RiderRouteViewport, ClimbCard, RouteMapCard, WearableDataCard, RideSummaryStrip,
  TrainerControlBar, AlbertoLiveCue,
} from "@/src/components/workout";

const CUES = [
  "Hold steady at 251 watts.",
  "Bring cadence toward 90 rpm.",
  "The gradient rises ahead.",
  "Three minutes remain in this block.",
  "Your heart rate is stable.",
];
const CONTROLS = [
  { key: "skip", label: "Skip Interval", icon: "play-skip-forward" as const },
  { key: "extend", label: "Extend Recovery", icon: "time" as const },
  { key: "reduce", label: "Reduce Intensity", icon: "remove-circle" as const },
  { key: "increase", label: "Increase Intensity", icon: "add-circle" as const },
  { key: "erg", label: "Toggle ERG Mode", icon: "sync" as const },
  { key: "camera", label: "Camera Selection", icon: "camera" as const },
  { key: "mute", label: "Mute Alberto", icon: "volume-mute" as const },
  { key: "reconnect", label: "Trainer Reconnect", icon: "bluetooth" as const },
  { key: "lock", label: "Touch Lock", icon: "lock-closed" as const },
  { key: "peaceful", label: "Peaceful Pause", icon: "leaf" as const },
];

const MENU = [
  { key: "reconnect", label: "Reconnect Trainer", icon: "bluetooth" as const },
  { key: "settings", label: "Workout Settings", icon: "settings" as const },
  { key: "lock", label: "Touch Lock", icon: "lock-closed" as const },
  { key: "peaceful", label: "Peaceful Pause", icon: "leaf" as const },
  { key: "save", label: "Save & Exit", icon: "save" as const },
];

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(), 1800);
    return () => clearTimeout(t);
  }, [message, anim]);
  if (!message) return null;
  return (
    <Animated.View testID="toast" style={[styles.toast, shadow.glow, { pointerEvents: "none", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function LiveWorkout() {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const compact = height < 620;
  const leftW = compact ? 240 : 300;
  const rightW = compact ? 300 : 340;

  const [centerW, setCenterW] = React.useState(560);
  const [paused, setPaused] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [cueIdx, setCueIdx] = React.useState(0);

  const { telemetry, connectionState, stale, sendErg, pause, resume, simulateDropout } = useTelemetry();
  const erg = telemetry.erg;

  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  React.useEffect(() => {
    const id = setInterval(() => setCueIdx((c) => (c + 1) % CUES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const onCenterLayout = (e: LayoutChangeEvent) => setCenterW(e.nativeEvent.layout.width);
  const viewportH = compact ? 240 : 320;

  const onErg = (d: number) => {
    const next = Math.max(50, Math.min(150, erg + d));
    sendErg(next);
    showToast(`ERG intensity ${next}%`);
  };
  const onPauseToggle = () => {
    if (paused) { resume(); } else { pause(); }
    setPaused((p) => !p);
    showToast(paused ? "Resuming workout" : "Workout paused");
  };
  const onControlAction = (label: string) => {
    setShowControls(false);
    showToast(label);
  };
  const onMenuAction = (item: { key: string; label: string }) => {
    setShowMenu(false);
    if (item.key === "reconnect") { simulateDropout(); showToast("Simulating trainer dropout…"); return; }
    if (item.key === "save") { router.replace("/training"); return; }
    showToast(item.label);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        <ScrollView contentContainerStyle={[styles.content, compact && { padding: spacing.sm, gap: spacing.sm }]} showsVerticalScrollIndicator={false} testID="workout-scroll">
          <WorkoutTopBar elapsed={fmt(telemetry.elapsed)} connectionState={connectionState} stale={stale} onPress={showToast} />

          <View style={styles.bodyRow}>
            <View style={styles.leftBlock}>
              <View style={styles.innerRow}>
                <View style={[styles.leftCol, { width: leftW }]}>
                  <PowerCard power={telemetry.power} wkg={(telemetry.power / 78).toFixed(1)} />
                  <HeartRateCard hr={telemetry.hr} />
                  <CadenceCard cadence={telemetry.cadence} />
                </View>
                <View style={styles.centerCol} onLayout={onCenterLayout}>
                  <WorkoutTimelineCard width={centerW} onPress={() => showToast("Workout timeline")} />
                  <RiderRouteViewport width={centerW} height={viewportH} onPress={() => showToast("Route camera")} />
                </View>
              </View>
              <RideSummaryStrip speed={String(telemetry.speed)} />
            </View>

            <View style={[styles.rightCol, { width: rightW }]}>
              <ClimbCard />
              <RouteMapCard />
              <WearableDataCard />
            </View>
          </View>

          <TrainerControlBar
            paused={paused}
            erg={erg}
            onPauseToggle={onPauseToggle}
            onErg={onErg}
            onEnd={() => router.replace("/training")}
            onControls={() => setShowControls(true)}
            onMenu={() => setShowMenu(true)}
          />
        </ScrollView>

        <AlbertoLiveCue message={paused ? "Workout paused — take a breath." : CUES[cueIdx]} />

        {showControls && (
          <Pressable style={styles.overlay} testID="controls-overlay" onPress={() => setShowControls(false)}>
            <Pressable style={styles.controlsPanel} onPress={(e) => e.stopPropagation()}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Controls</Text>
                <Pressable testID="controls-close" onPress={() => setShowControls(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
              </View>
              <View style={styles.panelGrid}>
                {CONTROLS.map((c) => (
                  <Pressable key={c.key} testID={`ctrl-${c.key}`} style={styles.panelItem} onPress={() => onControlAction(c.label)}>
                    <Ionicons name={c.icon} size={20} color={colors.yellow} />
                    <Text style={styles.panelItemText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        )}

        {showMenu && (
          <Pressable style={styles.overlay} testID="menu-overlay" onPress={() => setShowMenu(false)}>
            <Pressable style={styles.menuPanel} onPress={(e) => e.stopPropagation()}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Menu</Text>
                <Pressable testID="menu-close" onPress={() => setShowMenu(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
              </View>
              {MENU.map((m) => (
                <Pressable key={m.key} testID={`menu-${m.key}`} style={styles.menuItem} onPress={() => onMenuAction(m)}>
                  <Ionicons name={m.icon} size={20} color={colors.yellow} />
                  <Text style={styles.panelItemText}>{m.label}</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        )}
      </SafeAreaView>

      <Toast message={toast} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  bodyRow: { flexDirection: "row", gap: spacing.md },
  leftBlock: { flex: 1, gap: spacing.md },
  innerRow: { flexDirection: "row", gap: spacing.md },
  leftCol: { gap: spacing.md },
  centerCol: { flex: 1, gap: spacing.md },
  rightCol: { gap: spacing.md },

  toast: { position: "absolute", bottom: 90, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(20,18,16,0.96)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  toastText: { color: colors.white, fontWeight: "700", fontSize: 14 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  controlsPanel: { width: 560, maxWidth: "90%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  panelTitle: { color: colors.white, fontSize: 20, fontWeight: "800" },
  panelGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  panelItem: { flexDirection: "row", alignItems: "center", gap: 10, width: "48%", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14 },
  panelItemText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  menuPanel: { position: "absolute", left: spacing.lg, bottom: 90, width: 300, backgroundColor: colors.cardElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 6 },
});
