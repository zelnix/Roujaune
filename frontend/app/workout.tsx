import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, LayoutChangeEvent, Pressable, Platform, Switch } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useTelemetry } from "@/src/hooks/useTelemetry";
import { rideRecorder } from "@/src/lib/ride";
import { getLastRouteId, setLastRouteId } from "@/src/lib/prefs";
import { useSettings } from "@/src/lib/settings";
import { routeVideos, nextInterval, currentWorkout } from "@/src/data";
import { RouteVideo } from "@/src/components/RouteVideo";
import {
  WorkoutTopBar, PowerCard, HeartRateCard, CadenceCard, WorkoutTimelineCard,
  ClimbCard, RouteMapCard, WearableDataCard, RideSummaryStrip,
  TrainerControlBar, AlbertoLiveCue, NextUpStrip, SafetyNote, ImmersiveHud, VideoPlaceholder,
  RoutesButton, RoutePicker, SettingsPanel, MusicPanel, MusicButton,
} from "@/src/components/workout";
import { useWorkoutAudio } from "@/src/hooks/useWorkoutAudio";

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
  { key: "music", label: "Music & Audio", icon: "musical-notes" as const },
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

// Pick the route that best matches the current workout type (falls back to first).
function autoRouteIndex() {
  const i = routeVideos.findIndex((r) => r.tag === currentWorkout.recommendedTag);
  return i >= 0 ? i : 0;
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
  const [expanded, setExpanded] = React.useState(false);
  const [routeIdx, setRouteIdx] = React.useState(autoRouteIndex);
  const [routeAuto, setRouteAuto] = React.useState(true);
  const [lastRouteId, setLastRouteIdState] = React.useState<string | null>(null);
  const [showRoutes, setShowRoutes] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showMusic, setShowMusic] = React.useState(false);
  const [hudVisible, setHudVisible] = React.useState(true);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [cueIdx, setCueIdx] = React.useState(0);

  const { telemetry, connectionState, stale, sendErg, pause, resume, simulateDropout } = useTelemetry();
  const { settings, setSetting, loaded } = useSettings();
  const erg = telemetry.erg;

  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  // Heads-up when the workout opens with the HUD turned off.
  const headsUpShown = React.useRef(false);
  React.useEffect(() => {
    if (!loaded || headsUpShown.current) return;
    headsUpShown.current = true;
    if (!settings.hudEnabled) {
      showToast("HUD is turned off — tap the eye icon in full screen to reveal live data.");
    }
  }, [loaded, settings.hudEnabled, showToast]);

  // Reset temporary HUD visibility to the saved preference each time we expand.
  React.useEffect(() => {
    if (expanded) setHudVisible(settings.hudEnabled);
  }, [expanded, settings.hudEnabled]);

  React.useEffect(() => {
    rideRecorder.reset({ workout: "Threshold Climb" });
  }, []);

  // Keep the ride recorder's route in sync so the summary reflects the scenery ridden.
  React.useEffect(() => {
    const r = routeVideos[routeIdx];
    rideRecorder.setRoute({ id: r.id, name: r.title, place: r.place, distance: r.distance, elevation: r.elevation, tag: r.tag });
  }, [routeIdx]);

  // Restore the rider's last route across sessions (falls back to auto-match).
  React.useEffect(() => {
    (async () => {
      const id = await getLastRouteId();
      if (!id) return;
      const i = routeVideos.findIndex((r) => r.id === id);
      if (i >= 0) {
        setRouteIdx(i);
        setRouteAuto(false);
        setLastRouteIdState(id);
        showToast(`Resuming your last route: ${routeVideos[i].title}`);
      }
    })();
  }, [showToast]);

  // Record live telemetry so the summary screen can compute real aggregates.
  React.useEffect(() => {
    if (telemetry.source === "trainer") {
      rideRecorder.push(
        { power: telemetry.power, hr: telemetry.hr, cadence: telemetry.cadence, speed: telemetry.speed },
        telemetry.elapsed,
      );
    }
  }, [telemetry]);

  const { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice, pitch, setPitch } = useWorkoutAudio();

  React.useEffect(() => {
    const id = setInterval(() => setCueIdx((c) => (c + 1) % CUES.length), 5000);
    return () => clearInterval(id);
  }, []);

  // Speak each in-workout instruction aloud as it appears (Alberto, mild French accent).
  React.useEffect(() => {
    if (!paused) speak(CUES[cueIdx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueIdx]);

  const onCenterLayout = (e: LayoutChangeEvent) => setCenterW(e.nativeEvent.layout.width);

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
    if (item.key === "music") { setShowMusic(true); return; }
    if (item.key === "settings") { setShowSettings(true); return; }
    if (item.key === "save") { router.replace("/training"); return; }
    showToast(item.label);
  };

  const activeRoute = routeVideos[routeIdx];
  const onSelectRoute = (i: number) => {
    setRouteIdx(i); setRouteAuto(false); setShowRoutes(false);
    setLastRouteIdState(routeVideos[i].id); setLastRouteId(routeVideos[i].id);
    showToast(`Route: ${routeVideos[i].title}`);
  };
  const onAutoRoute = () => {
    const i = autoRouteIndex();
    setRouteIdx(i); setRouteAuto(true); setShowRoutes(false);
    setLastRouteIdState(null); setLastRouteId(null);
    showToast(`Auto-matched to your ${currentWorkout.type.toLowerCase()}: ${routeVideos[i].title}`);
  };
  const onShuffleRoute = () => {
    let i = routeIdx;
    if (routeVideos.length > 1) { while (i === routeIdx) i = Math.floor(Math.random() * routeVideos.length); }
    setRouteIdx(i); setRouteAuto(false); setShowRoutes(false);
    setLastRouteIdState(routeVideos[i].id); setLastRouteId(routeVideos[i].id);
    showToast(`Surprise route: ${routeVideos[i].title}`);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        <ScrollView contentContainerStyle={[styles.content, compact && { padding: spacing.sm, gap: spacing.sm }]} showsVerticalScrollIndicator={false} testID="workout-scroll">
          <WorkoutTopBar elapsed={fmt(telemetry.elapsed)} connectionState={connectionState} stale={stale} onPress={(m) => (m === "Settings" ? setShowSettings(true) : showToast(m))} />

          <View style={styles.bodyRow}>
            <View style={styles.leftBlock}>
              <View style={styles.innerRow}>
                <View style={[styles.leftCol, { width: leftW }]}>
                  <PowerCard power={telemetry.power} wkg={(telemetry.power / 78).toFixed(1)} connected={settings.hasTrainer} />
                  <HeartRateCard hr={telemetry.hr} connected={settings.hasWearable} />
                  <CadenceCard cadence={telemetry.cadence} connected={settings.hasTrainer} />
                </View>
                <View style={styles.centerCol} onLayout={onCenterLayout}>
                  <WorkoutTimelineCard width={centerW} onPress={() => showToast("Workout timeline")} />
                  {expanded ? (
                    <VideoPlaceholder width={centerW} onRestore={() => setExpanded(false)} />
                  ) : (
                    <RouteVideo source={activeRoute.url} title={`${activeRoute.title}${routeAuto ? " · Auto-matched" : activeRoute.id === lastRouteId ? " · Last ride" : ""}`} playing={!paused} muted width={centerW} onToggleExpand={() => setExpanded(true)} expanded={false}>
                      <View style={styles.inlineRoutes} pointerEvents="box-none">
                        <RoutesButton onPress={() => setShowRoutes(true)} testID="inline-routes" />
                      </View>
                    </RouteVideo>
                  )}
                  <NextUpStrip next={nextInterval} />
                  <SafetyNote />
                </View>
              </View>
              <RideSummaryStrip speed={String(telemetry.speed)} trainerConnected={settings.hasTrainer} />
            </View>

            <View style={[styles.rightCol, { width: rightW }]}>
              <ClimbCard />
              <RouteMapCard />
              <WearableDataCard connected={settings.hasWearable} />
            </View>
          </View>

          <TrainerControlBar
            paused={paused}
            erg={erg}
            onPauseToggle={onPauseToggle}
            onErg={onErg}
            onEnd={() => router.replace("/summary")}
            onControls={() => setShowControls(true)}
            onMenu={() => setShowMenu(true)}
          />
        </ScrollView>

        <AlbertoLiveCue message={paused ? "Workout paused — take a breath." : CUES[cueIdx]} />

        <MusicButton musicOn={musicOn} onPress={() => setShowMusic(true)} />

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

      {expanded && (
        <View style={styles.immersive} testID="immersive-overlay">
          <RouteVideo
            source={activeRoute.url}
            playing={!paused}
            muted
            fill
            expanded
            onToggleExpand={() => setExpanded(false)}
          >
            {hudVisible && (
              <ImmersiveHud
                elapsed={fmt(telemetry.elapsed)}
                power={telemetry.power}
                wkg={(telemetry.power / 78).toFixed(1)}
                hr={telemetry.hr}
                cadence={telemetry.cadence}
                speed={telemetry.speed}
                progress="10.2 km"
                connectionState={connectionState}
                stale={stale}
                paused={paused}
                cue={CUES[cueIdx]}
                trainerConnected={settings.hasTrainer}
                wearableConnected={settings.hasWearable}
                onPause={onPauseToggle}
                onEnd={() => { setExpanded(false); router.replace("/summary"); }}
                onOpenRoutes={() => setShowRoutes(true)}
              />
            )}
            <Pressable
              style={styles.hudEye}
              onPress={() => setHudVisible((v) => !v)}
              testID="hud-eye-toggle"
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hudVisible ? "Hide on-screen data" : "Show on-screen data"}
            >
              <Ionicons name={hudVisible ? "eye" : "eye-off"} size={18} color="#fff" />
            </Pressable>
          </RouteVideo>
        </View>
      )}

      {showRoutes && (
        <RoutePicker
          routes={routeVideos}
          activeIndex={routeIdx}
          recommendedTag={currentWorkout.recommendedTag}
          auto={routeAuto}
          lastRouteId={lastRouteId}
          onSelect={onSelectRoute}
          onAuto={onAutoRoute}
          onShuffle={onShuffleRoute}
          onClose={() => setShowRoutes(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} setSetting={setSetting} onClose={() => setShowSettings(false)} />
      )}

      {showMusic && (
        <MusicPanel
          musicOn={musicOn}
          toggleMusic={toggleMusic}
          volume={volume}
          setVolume={setVolume}
          voiceOn={voiceOn}
          toggleVoice={toggleVoice}
          voiceOptions={voiceOptions}
          voiceId={voiceId}
          selectVoice={selectVoice}
          pitch={pitch}
          setPitch={setPitch}
          onClose={() => setShowMusic(false)}
        />
      )}

      <Toast message={toast} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  immersive: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 50 },
  hudEye: { position: "absolute", top: 12, left: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", zIndex: 5 },
  inlineRoutes: { position: "absolute", left: 10, bottom: 10 },
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
