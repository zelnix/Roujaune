import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, LayoutChangeEvent, Pressable, Platform, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useTelemetry } from "@/src/hooks/useTelemetry";
import { rideRecorder } from "@/src/lib/ride";
import { getLastRouteId, setLastRouteId } from "@/src/lib/prefs";
import { useSettings } from "@/src/lib/settings";
import { routeVideos, currentWorkout } from "@/src/data";
import { getWorkout, buildSegments, currentSegment, mmss, targetWatts, planDayNumber, extensionSegment } from "@/src/lib/workout-catalog";
import { fetchZoneBias, ZoneBias } from "@/src/lib/targets";
import { usePlan } from "@/src/lib/plan";
import { getRiderProfile } from "@/src/lib/rider-profile";
import { WORKOUT_TYPES } from "@/src/lib/workouts";
import { RouteVideo } from "@/src/components/RouteVideo";
import { VirtualRoute } from "@/src/components/VirtualRoute";
import {
  VideoPlaceholder, RoutesButton, RoutePicker, SettingsPanel, MusicPanel, CastPanel, ImmersiveHud, RouteMapCard,
} from "@/src/components/workout";
import {
  MetricCard, ConnectionsPanel, CoachBanner, TerrainCard, WorkoutCard, BrandCard, StepTimeline, StepDetailModal, LiveControlBar,
} from "@/src/components/workout-live";
import { useWorkoutAudio } from "@/src/hooks/useWorkoutAudio";
import { useBleSensors } from "@/src/hooks/useBleSensors";
import { BleSensorsPanel } from "@/src/components/BleSensorsPanel";
import { fetchCoachCue, fetchExtendPlan, ExtendPlan } from "@/src/lib/coach";
import { useCoach } from "@/src/lib/coach-persona";

// Alberto's cues are generated live from the rider's real telemetry so the
// coaching reflects what's actually happening on the bike. The power target is
// driven by the current segment of the chosen workout (see LiveWorkout).
const CAD_LOW = 90;         // rpm cadence window
const CAD_HIGH = 100;

function buildCue(t: { power: number; hr: number; cadence: number; speed: number; elapsed: number }, idx: number, target: number, seated = false): string {
  const cat = idx % 4;
  if (cat === 0) {
    const d = t.power - target;
    if (d < -12) return seated ? `Stay seated and drive smoothly to ${target} watts — let your legs do the work.` : `You're at ${t.power} watts — lift it toward ${target}.`;
    if (d > 12) return `Ease off a touch, you're ${Math.round(d)} watts over target.`;
    return `Nicely done — holding ${t.power} watts right on target.`;
  }
  if (cat === 1) {
    if (t.cadence < CAD_LOW) return seated ? `Spin it up smoothly — keep your hips still and bring cadence toward ${CAD_LOW} rpm.` : `Spin it up — bring your cadence toward ${CAD_LOW} rpm.`;
    if (t.cadence > CAD_HIGH) return `Cadence is high at ${t.cadence} — settle back near ${CAD_HIGH}.`;
    return seated ? `Great seated rhythm at ${t.cadence} rpm — relax your shoulders.` : `Great rhythm at ${t.cadence} rpm — keep it smooth.`;
  }
  if (cat === 2) {
    if (t.hr > 170) return `Heart rate is climbing at ${t.hr} — breathe and stay controlled.`;
    if (t.hr < 130) return `You have room to give — heart rate is ${t.hr}.`;
    return `Heart rate steady at ${t.hr} beats — good work.`;
  }
  const m = Math.floor(t.elapsed / 60);
  return seated ? `${m} minutes in — stay planted in the saddle, upper body relaxed.` : `${m} minutes in at ${t.speed} kilometres per hour — strong and steady.`;
}

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

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Simple HR zone (1–5) used for the live metric card badge.
function hrZone(hr: number) {
  if (hr < 115) return 1;
  if (hr < 133) return 2;
  if (hr < 152) return 3;
  if (hr < 171) return 4;
  return 5;
}

// One-line effort description per training zone (used on the Workout card).
const ZONE_DESC: Record<string, string> = {
  Z1: "Very easy · active recovery",
  Z2: "Aerobic endurance · conversational",
  Z3: "Tempo · comfortably hard",
  Z4: "Threshold · sustainably hard",
  Z5: "VO2 max · very hard intervals",
  Z6: "Anaerobic · all-out effort",
};

// Pick the route whose terrain best matches the chosen workout's type.
const ROUTE_TAGS: Record<string, string[]> = {
  endurance: ["Flat", "Easy", "Scenic", "Coastal", "Forest", "Rolling"],
  recovery: ["Easy", "Flat", "Scenic"],
  climbing: ["Climb", "Mountain", "Epic"],
  threshold: ["Rolling", "Mountain", "Climb"],
  vo2max: ["Rolling", "Mountain"],
  sprints: ["Rolling", "Flat"],
  tempo: ["Rolling", "Forest", "Flat"],
  restday: ["Easy", "Scenic"],
  fb50: ["Easy", "Scenic"],
};
function routeIndexForType(typeId?: string) {
  const tags = (typeId && ROUTE_TAGS[typeId]) || ["Climb"];
  for (const t of tags) {
    const i = routeVideos.findIndex((r) => r.tag === t);
    if (i >= 0) return i;
  }
  return 0;
}

// Estimate terrain + route length from the chosen workout (used when the route
// can't be derived from a video). Avg speed & typical grade per workout type.
const TYPE_SPEED: Record<string, number> = { climbing: 20, threshold: 27, endurance: 30, tempo: 29, vo2max: 30, sprints: 31, recovery: 25, restday: 22, fb50: 24 };
const TYPE_GRADE: Record<string, number> = { climbing: 7.2, threshold: 4, endurance: 1.5, tempo: 2.2, vo2max: 2.6, sprints: 1.8, recovery: 0.6, restday: 0.4, fb50: 1 };

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

// One extension option in the Workout Complete popup. The coach's recommended
// option is highlighted with an accent border + "Coach pick" badge.
function ExtendChip({ testID, icon, label, pick, onPress }: { testID: string; icon: any; label: string; pick: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.extendChip, pick && styles.extendChipPick]}>
      {pick ? (
        <View style={styles.pickBadge}><Text style={styles.pickBadgeText}>COACH PICK</Text></View>
      ) : null}
      <Ionicons name={icon} size={16} color={colors.yellow} />
      <Text style={styles.extendChipText}>{label}</Text>
    </Pressable>
  );
}


export default function LiveWorkout() {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; workoutId?: string }>();
  // The workout the rider launched from the catalog (falls back to the default).
  const selected = getWorkout(params.workoutId) ?? getWorkout("threshold-climb");
  const selectedType = selected ? WORKOUT_TYPES.find((t) => t.id === selected.typeId) : undefined;
  const workoutTitle = selected?.name ?? params.title ?? currentWorkout.title;
  // Real interval timeline built from the chosen workout's segments.
  const baseSegments = React.useMemo(() => (selected ? buildSegments(selected) : []), [selected]);
  const [extraSegments, setExtraSegments] = React.useState<import("@/src/lib/workout-catalog").Segment[]>([]);
  const segments = React.useMemo(() => [...baseSegments, ...extraSegments], [baseSegments, extraSegments]);
  const compact = height < 620;
  const leftW = compact ? 150 : 212;
  const rightW = compact ? 170 : 236;

  const [centerW, setCenterW] = React.useState(560);
  const [videoSlotH, setVideoSlotH] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [virtualMode, setVirtualMode] = React.useState(false);
  const [routeIdx, setRouteIdx] = React.useState(() => routeIndexForType(selected?.typeId));
  const [routeAuto, setRouteAuto] = React.useState(true);
  const [lastRouteId, setLastRouteIdState] = React.useState<string | null>(null);
  const [showRoutes, setShowRoutes] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showMusic, setShowMusic] = React.useState(false);
  const [showCast, setShowCast] = React.useState(false);
  const [showBle, setShowBle] = React.useState(false);
  const [endPrompt, setEndPrompt] = React.useState(false);
  const [completePrompt, setCompletePrompt] = React.useState(false);
  const [extendAdvice, setExtendAdvice] = React.useState<string | null>(null);
  const [extendRec, setExtendRec] = React.useState<ExtendPlan["recommend"] | null>(null);
  const [extendPick, setExtendPick] = React.useState<ExtendPlan["suggested"]>(null);
  const [locked, setLocked] = React.useState(false);
  const [stepDetail, setStepDetail] = React.useState<number | null>(null);
  const videoFellBackRef = React.useRef(false);

  const [hudVisible, setHudVisible] = React.useState(true);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [cueIdx] = React.useState(0);

  const { telemetry, connectionState, stale, sendErg, sendTarget, sendInit, sendSensor, pause, resume, simulateDropout } = useTelemetry();
  const { settings, setSetting, loaded } = useSettings();
  const ble = useBleSensors();
  const { plan } = usePlan();

  // Plan context for the Workout card: plan name + current phase + week, with
  // the day shown as today's weekday (best-effort for catalog-launched rides).
  const planName = plan?.title ?? "Training Plan";
  const phaseLabel = plan?.phase?.name ? (/phase/i.test(plan.phase.name) ? plan.phase.name : `${plan.phase.name} Phase`) : undefined;
  const weekLabel = (() => {
    const w = plan?.progress?.weeks; // e.g. "3 / 12"
    const cur = w ? parseInt(String(w).split("/")[0].trim(), 10) : (plan as any)?.youAreHere;
    return cur && !Number.isNaN(cur) ? `Week ${cur}` : undefined;
  })();
  const dayInfo = params.workoutId ? planDayNumber(String(params.workoutId)) : null;
  const dayLabel = dayInfo ? `Day ${dayInfo.day}` : undefined;

  // ERG intensity: optimistic local value so +/- feels instant, then reconciles
  // with the trainer sim once taps settle (~1.5s of no local changes).
  const [erg, setErg] = React.useState(telemetry.erg);
  const ergRef = React.useRef(telemetry.erg);
  const ergPendingUntil = React.useRef(0);
  // ERG mode: when off, the trainer holds resistance and the rider controls effort
  // (we stop pushing per-segment target watts).
  const [ergMode, setErgMode] = React.useState(true);
  const ergModeRef = React.useRef(true);
  React.useEffect(() => { ergModeRef.current = ergMode; }, [ergMode]);
  React.useEffect(() => {
    if (Date.now() > ergPendingUntil.current) { ergRef.current = telemetry.erg; setErg(telemetry.erg); }
  }, [telemetry.erg]);

  // Push real Bluetooth sensor readings into the telemetry stream so the backend
  // records measured power/cadence/HR (falls back to the trainer sim if BLE stops).
  React.useEffect(() => {
    if (ble.readings.ts <= 0 || connectionState !== "connected") return;
    sendSensor({ power: ble.readings.power, cadence: ble.readings.cadence, hr: ble.readings.hr });
  }, [ble.readings.ts, connectionState, sendSensor]);

  // ---- Live segment driven by the chosen workout ----
  const ftp = settings.ftp || 287;
  // Adaptive per-zone target bias (set by the coach's adaptation engine).
  const [zoneBias, setZoneBias] = React.useState<ZoneBias>({});
  React.useEffect(() => { fetchZoneBias().then(setZoneBias).catch(() => {}); }, []);
  const activeSeg = React.useMemo(
    () => (segments.length ? currentSegment(segments, telemetry.elapsed) : null),
    [segments, telemetry.elapsed],
  );
  const targetW = activeSeg ? targetWatts(activeSeg.segment, ftp, zoneBias) : 251;
  const timeLeftLabel = activeSeg ? mmss(activeSeg.remaining) : undefined;
  // Full step list for the bottom timeline + Workout card — each segment with
  // its summary detail (duration, target watts, %FTP, RPE, one-line description).
  const stepList = React.useMemo(
    () => segments.map((s, i) => ({
      index: i,
      label: s.label,
      zoneLabel: s.zoneLabel,
      duration: mmss(s.durationSec),
      durationSec: s.durationSec,
      watts: s.durationSec > 0 ? targetWatts(s, ftp, zoneBias) : 0,
      targetPct: s.targetPct,
      rpe: s.rpe,
      color: s.color,
      intensity: Math.max(0.12, Math.min(1, s.targetPct / 1.4)),
      desc: ZONE_DESC[s.zoneLabel] ?? "Steady effort",
    })),
    [segments, ftp, zoneBias],
  );

  // Start the ride at the beginning of the chosen session and keep the trainer
  // sim tracking the current segment's target watts (true end-to-end execution).
  const initSent = React.useRef(false);
  const lastTargetSent = React.useRef<number>(-1);
  React.useEffect(() => {
    if (connectionState !== "connected") return;
    if (!initSent.current) {
      initSent.current = true;
      sendInit({ elapsed: 0, distance: 0, watts: targetW });
      lastTargetSent.current = targetW;
      return;
    }
    if (targetW !== lastTargetSent.current) {
      lastTargetSent.current = targetW;
      if (ergModeRef.current) sendTarget(targetW);
    }
  }, [connectionState, targetW, sendInit, sendTarget]);

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
    rideRecorder.reset({ workout: workoutTitle, workoutId: selected?.id, ftp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the recorder's FTP + adaptive bias current (they may load after mount)
  // so the summary scores against the exact targets ridden.
  React.useEffect(() => { rideRecorder.setFtp(ftp); }, [ftp]);
  React.useEffect(() => { rideRecorder.setZoneBias(zoneBias); }, [zoneBias]);

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

  const { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice, coach, chooseCoach, coachName, trackName, nextTrack } = useWorkoutAudio();
  const persona = useCoach();

  // Keep the latest telemetry in a ref so cue timers read live values without
  // re-firing on every telemetry tick.
  const telemetryRef = React.useRef(telemetry);
  React.useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);

  const onCenterLayout = (e: LayoutChangeEvent) => setCenterW(e.nativeEvent.layout.width);

  // If the route video can't load, gracefully fall back to the Virtual route
  // once (the rider can still switch back to Video manually afterwards).
  const onVideoError = React.useCallback(() => {
    if (videoFellBackRef.current) return;
    videoFellBackRef.current = true;
    setVirtualMode(true);
    showToast("Route video unavailable — switched to your Virtual ride.");
  }, [showToast]);

  const onErg = (d: number) => {
    const next = Math.max(50, Math.min(150, ergRef.current + d));
    ergRef.current = next;
    setErg(next);
    ergPendingUntil.current = Date.now() + 1500;
    sendErg(next);
    showToast(`ERG intensity ${next}%`);
  };
  const onPauseToggle = () => {
    if (paused) { resume(); } else { pause(); }
    setPaused((p) => !p);
    showToast(paused ? "Resuming workout" : "Workout paused");
  };
  const onControlAction = (key: string) => {
    setShowControls(false);
    switch (key) {
      case "skip":
        if (activeSeg) { sendInit({ elapsed: telemetry.elapsed + activeSeg.remaining + 1 }); showToast("Skipped to the next interval"); }
        break;
      case "extend":
        if (selected) { setExtraSegments((x) => [...x, extensionSegment(selected, 3)]); showToast("Added 3:00 of easy recovery to your ride"); }
        break;
      case "reduce":
        onErg(-5);
        break;
      case "increase":
        onErg(5);
        break;
      case "erg":
        setErgMode((m) => { const next = !m; showToast(next ? "ERG mode ON — trainer holds your target" : "ERG mode OFF — ride at your own effort"); return next; });
        break;
      case "camera":
        setShowRoutes(true);
        break;
      case "mute":
        toggleVoice();
        showToast(voiceOn ? `${persona.name} muted` : `${persona.name} unmuted`);
        break;
      case "reconnect":
        simulateDropout();
        showToast("Reconnecting trainer…");
        break;
      case "lock":
        setLocked(true);
        showToast("Screen locked — hold the button to unlock.");
        break;
      case "peaceful":
        if (!paused) { pause(); setPaused(true); }
        showToast("Peaceful pause — breathe deep and reset.");
        break;
      default:
        break;
    }
  };
  // Ending a ride prompts to save or abandon. On abandon nothing is persisted
  // (the summary screen is what saves), so the ride is never recorded.
  const requestEnd = () => { setExpanded(false); if (!paused) { pause(); setPaused(true); } setEndPrompt(true); };
  const onSaveRide = () => { setEndPrompt(false); router.replace("/summary"); };
  const onAbandonRide = () => {
    setEndPrompt(false);
    rideRecorder.reset({ workout: workoutTitle, workoutId: selected?.id, ftp });
    router.replace("/");
  };
  const onResumeRide = () => { setEndPrompt(false); if (paused) { resume(); setPaused(false); } };

  // ---- End-of-workout "Workout Complete" popup + ride extension ----
  const completeShownRef = React.useRef(false);
  const extendMetaRef = React.useRef<{ type_id: string; wearable_on: boolean }>({ type_id: "endurance", wearable_on: false });
  // Ask the companion coach whether extending is wise (and by how much), given
  // the rider's effort/HR, the workout type and how long they've ridden.
  const fetchExtendAdvice = React.useCallback(async () => {
    setExtendAdvice(null);
    setExtendRec(null);
    setExtendPick(null);
    try {
      const t = telemetryRef.current;
      const ctx = coachCtxRef.current as any;
      const plan = await fetchExtendPlan(t, {
        workout: ctx.workout,
        type_id: extendMetaRef.current.type_id,
        route: ctx.route,
        wearable_on: extendMetaRef.current.wearable_on,
        coach_name: ctx.coach_name,
        coach_gender: ctx.coach_gender,
      });
      setExtendAdvice(plan.advice);
      setExtendRec(plan.recommend);
      setExtendPick(plan.suggested);
      if (plan.advice) speak(plan.advice);
    } catch {
      setExtendAdvice(
        "Strong work finishing the session. If your legs feel fresh, a short easy spin adds volume — but if you're fading, finishing here is the smart, safe call.",
      );
      setExtendRec("extend");
      setExtendPick("10min");
    }
  }, [speak]);

  const onFinishComplete = () => { setCompletePrompt(false); router.replace("/summary"); };
  const onExtendRide = (minutes: number, label: string) => {
    if (!selected) return;
    setExtraSegments((x) => [...x, extensionSegment(selected, minutes)]);
    rideRecorder.addExtension(minutes);
    completeShownRef.current = false;
    setCompletePrompt(false);
    if (paused) { resume(); setPaused(false); }
    showToast(`Ride extended · ${label} · added to your ride`);
  };

  const activeRoute = routeVideos[routeIdx];

  // Live data is only shown for connected devices. "Demo mode" simulates both so
  // the rider can preview the connected experience. A connected BLE power/cadence
  // sensor counts as a trainer; a BLE heart-rate strap counts as a wearable.
  const bleTrainer = ble.connected.length > 0 && (ble.readings.power != null || ble.readings.cadence != null);
  const bleWearable = ble.connected.length > 0 && ble.readings.hr != null;
  const trainerOn = settings.hasTrainer || settings.demoMode || bleTrainer;
  const wearableOn = settings.hasWearable || settings.demoMode || bleWearable;
  // Keep the extend-advice context (workout type + wearable state) current.
  React.useEffect(() => {
    extendMetaRef.current = { type_id: selected?.typeId ?? "endurance", wearable_on: wearableOn };
  }, [selected, wearableOn]);

  // Terrain + route length derived from the chosen workout (not the video).
  const terrain = React.useMemo(() => {
    const type = selected?.typeId ?? "endurance";
    const dur = selected?.duration ?? 60;
    const kmh = TYPE_SPEED[type] ?? 28;
    const grade = TYPE_GRADE[type] ?? 2;
    const km = Math.max(2, +((dur / 60) * kmh).toFixed(1));
    const elev = Math.round((km * 1000 * grade) / 100);
    return { km, grade, elev, isClimb: grade >= 3 };
  }, [selected]);
  // Progress along the route: from the trainer's distance when connected, else
  // estimated on a time basis (elapsed / workout duration) so the terrain & route
  // cards still advance through the session.
  const segTotalSec = React.useMemo(() => segments.reduce((a, s) => a + Math.max(0, s.durationSec), 0), [segments]);
  const totalSec = Math.max(60, segTotalSec || (selected?.duration ?? 60) * 60);

  // Detect when every workout step is complete → show the "Workout Complete"
  // popup once (extension resets the guard so it can fire again).
  React.useEffect(() => {
    if (completeShownRef.current || endPrompt) return;
    if (segTotalSec > 0 && telemetry.elapsed >= segTotalSec) {
      completeShownRef.current = true;
      setExpanded(false);
      if (!paused) { pause(); setPaused(true); }
      setCompletePrompt(true);
      fetchExtendAdvice();
    }
  }, [telemetry.elapsed, segTotalSec, endPrompt, paused, pause, fetchExtendAdvice]);

  const timeProgress = Math.min(1, telemetry.elapsed / totalSec);
  const progress = trainerOn ? (terrain.km > 0 ? Math.min(1, telemetry.distance / terrain.km) : 0) : timeProgress;
  const riddenKm = trainerOn ? Math.min(terrain.km, telemetry.distance) : +(timeProgress * terrain.km).toFixed(1);
  const routeInfo = { title: activeRoute.title, place: activeRoute.place, km: terrain.km, elev: terrain.elev, grade: terrain.grade, isClimb: terrain.isClimb, tag: activeRoute.tag };

  // ---- Alberto's live AI coaching cues ----
  // Prefers the AI-generated cue; falls back to the local rule-based line while
  // a call is pending or fails.
  const [coachCue, setCoachCue] = React.useState<string | null>(null);
  const liveCue = paused ? "Workout paused — take a breath." : (coachCue ?? buildCue(telemetry, cueIdx, targetW, settings.seatedMode));

  // Keep the current target watts in a ref so cue timers read the live value.
  const targetRef = React.useRef(targetW);
  React.useEffect(() => { targetRef.current = targetW; }, [targetW]);
  const seatedRef = React.useRef(settings.seatedMode);
  React.useEffect(() => { seatedRef.current = settings.seatedMode; }, [settings.seatedMode]);

  const coachCtx = React.useMemo(() => ({
    power_target: targetW,
    segment: activeSeg?.segment.label,
    zone: activeSeg?.segment.zoneLabel,
    cadence_low: CAD_LOW,
    cadence_high: CAD_HIGH,
    workout: workoutTitle,
    route: activeRoute.title,
    seated: settings.seatedMode,
    coach_name: persona.name,
    coach_gender: persona.gender,
  }), [activeRoute.title, persona.name, persona.gender, workoutTitle, targetW, activeSeg, settings.seatedMode]);

  const cueBusy = React.useRef(false);
  const lastCueAt = React.useRef(0);

  // Refs so cue timers read the live segment/ftp/bias/context without re-firing.
  const activeSegRef = React.useRef(activeSeg);
  React.useEffect(() => { activeSegRef.current = activeSeg; }, [activeSeg]);
  const ftpRef = React.useRef(ftp);
  React.useEffect(() => { ftpRef.current = ftp; }, [ftp]);
  const zoneBiasRef = React.useRef(zoneBias);
  React.useEffect(() => { zoneBiasRef.current = zoneBias; }, [zoneBias]);
  const coachCtxRef = React.useRef(coachCtx);
  React.useEffect(() => { coachCtxRef.current = coachCtx; }, [coachCtx]);

  const generateCue = React.useCallback(async (kind: "live" | "intro" | "next_preview" = "live") => {
    if (paused || cueBusy.current) return;
    cueBusy.current = true;
    lastCueAt.current = Date.now();
    const t = telemetryRef.current;
    const seg = activeSegRef.current;
    const ctx: any = { ...coachCtxRef.current, cue_kind: kind };
    if (kind === "next_preview" && seg?.next) {
      ctx.next_segment = seg.next.label;
      ctx.next_zone = seg.next.zoneLabel;
      ctx.next_target = targetWatts(seg.next, ftpRef.current, zoneBiasRef.current);
    }
    try {
      const cue = await fetchCoachCue(t, ctx);
      setCoachCue(cue);
      speak(cue);
    } catch {
      let fallback: string;
      if (kind === "intro" && seg) {
        fallback = `Starting ${seg.segment.label} — ${seg.segment.zoneLabel}, aim for about ${targetRef.current} W. Settle in and find your rhythm.`;
      } else if (kind === "next_preview" && seg?.next) {
        fallback = `Coming up next: ${seg.next.label} (${seg.next.zoneLabel}). Get ready to adjust your effort.`;
      } else {
        fallback = buildCue(t, Math.floor(Date.now() / 1000) % 4, targetRef.current, seatedRef.current);
      }
      setCoachCue(fallback);
      speak(fallback);
    } finally {
      cueBusy.current = false;
    }
  }, [paused, speak]);

  // A cue at least every 60 seconds.
  React.useEffect(() => {
    const id = setInterval(() => generateCue("live"), 60000);
    return () => clearInterval(id);
  }, [generateCue]);

  // An extra cue when the rider drifts meaningfully off target (debounced ~25s).
  React.useEffect(() => {
    if (paused) return;
    const offPower = Math.abs(telemetry.power - targetRef.current) > 35;
    const offCadence = telemetry.cadence < CAD_LOW - 8 || telemetry.cadence > CAD_HIGH + 8;
    if ((offPower || offCadence) && Date.now() - lastCueAt.current > 25000) generateCue("live");
  }, [telemetry.power, telemetry.cadence, paused, generateCue]);

  // Introduce each step as the rider enters it (this also covers the very first
  // step shortly after the ride opens). Resets the "next step" preview guard.
  const introducedSegRef = React.useRef<number>(-1);
  const nextPreviewFiredRef = React.useRef(false);
  React.useEffect(() => {
    if (paused) return;
    const idx = activeSeg?.index ?? -1;
    if (idx < 0 || idx === introducedSegRef.current) return;
    introducedSegRef.current = idx;
    nextPreviewFiredRef.current = false;
    const first = idx === 0;
    const id = setTimeout(() => generateCue("intro"), first ? 2500 : 0);
    return () => clearTimeout(id);
  }, [activeSeg?.index, paused, generateCue]);

  // As the rider nears the end of the current step, prepare them for the next.
  React.useEffect(() => {
    if (paused || !activeSeg || !activeSeg.next || nextPreviewFiredRef.current) return;
    const threshold = Math.min(20, Math.max(8, Math.round(activeSeg.segment.durationSec * 0.15)));
    if (activeSeg.remaining > 0 && activeSeg.remaining <= threshold) {
      nextPreviewFiredRef.current = true;
      generateCue("next_preview");
    }
  }, [activeSeg?.remaining, paused, generateCue]);

  const onSelectRoute = (i: number) => {
    setRouteIdx(i); setRouteAuto(false); setShowRoutes(false);
    setLastRouteIdState(routeVideos[i].id); setLastRouteId(routeVideos[i].id);
    showToast(`Route: ${routeVideos[i].title}`);
  };
  const onAutoRoute = () => {
    const i = routeIndexForType(selected?.typeId);
    setRouteIdx(i); setRouteAuto(true); setShowRoutes(false);
    setLastRouteIdState(null); setLastRouteId(null);
    showToast(`Auto-matched to your ${(selectedType?.name ?? selected?.typeName ?? "ride").toLowerCase()}: ${routeVideos[i].title}`);
  };
  const onShuffleRoute = () => {
    let i = routeIdx;
    if (routeVideos.length > 1) { while (i === routeIdx) i = Math.floor(Math.random() * routeVideos.length); }
    setRouteIdx(i); setRouteAuto(false); setShowRoutes(false);
    setLastRouteIdState(routeVideos[i].id); setLastRouteId(routeVideos[i].id);
    showToast(`Surprise route: ${routeVideos[i].title}`);
  };

  // Tablet/TV (landscape): the layout fills the screen with a responsive
  // flexbox column — the route video expands to take the remaining vertical
  // space so nothing is stretched or squashed on any display size. Phones keep
  // a scrolling layout with a fixed 16:9 video sized from the column width.
  const tablet = !compact;
  const phoneVideoH = Math.round((centerW * 9) / 16);
  // On tablets the video fills its slot; use the measured slot height for the
  // virtual-route canvas so it matches exactly. Falls back to 16:9 before layout.
  const videoRenderH = tablet ? (videoSlotH || phoneVideoH) : phoneVideoH;

  // ---- Derived values for the redesigned live dashboard ----
  const powerVal = Math.round(telemetry.power);
  const dPower = powerVal - targetW;
  const powerStatus = trainerOn ? (Math.abs(dPower) <= 12 ? "ON TARGET" : dPower > 0 ? "HIGH" : "LOW") : undefined;
  const powerTone: "good" | "warn" = Math.abs(dPower) <= 12 ? "good" : "warn";
  const cadInRange = telemetry.cadence >= CAD_LOW && telemetry.cadence <= CAD_HIGH;
  const cadStatus = trainerOn ? (cadInRange ? "ON TARGET" : telemetry.cadence < CAD_LOW ? "LOW" : "HIGH") : undefined;
  const remainingSec = Math.max(0, totalSec - telemetry.elapsed);
  const finishAt = new Date(Date.now() + remainingSec * 1000);
  const estFinish = `${String(finishAt.getHours()).padStart(2, "0")}:${String(finishAt.getMinutes()).padStart(2, "0")}`;
  const isLive = !settings.demoMode && (trainerOn || wearableOn);

  const body = (
    <>
      <View style={[styles.mainRow, tablet && styles.flex1]}>
        <View style={[styles.leftCenter, tablet && styles.flex1]}>
          <View style={styles.metricRow}>
            <BrandCard />
            <MetricCard icon="heart" label="Heart Rate" value={wearableOn ? String(telemetry.hr) : "—"} unit="bpm" status={wearableOn ? `ZONE ${hrZone(telemetry.hr)}` : undefined} statusTone="neutral" accent={colors.red} />
            <MetricCard icon="speedometer" label="Speed" value={trainerOn ? String(Math.round(telemetry.speed)) : "—"} unit="km/h" accent="#5AC8FA" />
            <MetricCard icon="sync" label="Cadence" value={trainerOn ? String(telemetry.cadence) : "—"} unit="rpm" status={cadStatus} statusTone={cadInRange ? "good" : "warn"} sub={`TARGET ${CAD_LOW}–${CAD_HIGH}`} accent={colors.green} />
            <MetricCard icon="flash" label="Power" value={trainerOn ? String(powerVal) : "—"} unit="W" status={powerStatus} statusTone={powerTone} sub={`TARGET ${Math.max(0, targetW - 8)}–${targetW + 8} W`} accent={colors.yellow} />
          </View>

          <View style={[styles.innerRow, tablet && styles.flex1]}>
            <View style={[styles.leftCol, { width: leftW }]}>
              <ConnectionsPanel trainerOn={trainerOn} wearableOn={wearableOn} powerOn={trainerOn} hrOn={wearableOn} cadenceOn={trainerOn} />
            </View>
            <View style={styles.centerCol} onLayout={onCenterLayout}>
              <CoachBanner name={persona.name} message={liveCue} avatar={persona.image} />
              <View
                style={[styles.videoSlot, tablet && styles.flex1]}
                onLayout={tablet ? (e) => setVideoSlotH(Math.round(e.nativeEvent.layout.height)) : undefined}
              >
                {expanded ? (
                  <VideoPlaceholder width={centerW} onRestore={() => setExpanded(false)} />
                ) : virtualMode ? (
                  <View style={[tablet ? styles.flex1 : null, { position: "relative" }]}>
                    <VirtualRoute width={centerW} height={videoRenderH} speed={trainerOn ? telemetry.speed : 0} cadence={trainerOn ? telemetry.cadence : 88} gender={getRiderProfile().gender} paused={paused || !trainerOn} />
                    <View style={[styles.inlineRoutes, { pointerEvents: "box-none" }]}>
                      <RoutesButton onPress={() => setVirtualMode(false)} testID="switch-video" label="Video" icon="videocam" />
                    </View>
                  </View>
                ) : (
                  <RouteVideo source={activeRoute.url} title={`${activeRoute.title}${routeAuto ? " · Auto-matched" : activeRoute.id === lastRouteId ? " · Last ride" : ""}`} playing={!paused} muted width={tablet ? undefined : centerW} aspectRatio={16 / 9} fill={tablet} onToggleExpand={() => setExpanded(true)} expanded={false} onError={onVideoError}>
                    <View style={[styles.inlineRoutes, { pointerEvents: "box-none" }]}>
                      <RoutesButton onPress={() => setShowRoutes(true)} testID="inline-routes" />
                      <RoutesButton onPress={() => setVirtualMode(true)} testID="switch-virtual" label="Virtual" icon="bicycle" />
                    </View>
                  </RouteVideo>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.rightCol, { width: rightW }]}>
          <WorkoutCard
            planName={planName}
            phase={phaseLabel}
            week={weekLabel}
            day={dayLabel}
            workoutName={workoutTitle}
            description={selected?.description}
          />
          <TerrainCard grade={terrain.grade} elevGain={terrain.elev} distanceLeft={Math.max(0, terrain.km - riddenKm)} progress={progress} isClimb={terrain.isClimb} />
          <RouteMapCard title={routeInfo.title} progress={progress} riddenKm={riddenKm} totalKm={routeInfo.km} timeBased={!trainerOn} fill />
        </View>
      </View>

      <StepTimeline title={workoutTitle} steps={stepList} activeIndex={activeSeg?.index ?? -1} remaining={timeLeftLabel} stepProgress={activeSeg ? activeSeg.elapsedInSeg / Math.max(1, activeSeg.segment.durationSec) : 0} onStepPress={(i) => setStepDetail(i)} elapsed={fmt(telemetry.elapsed)} progress={progress} estFinish={estFinish} />

      <LiveControlBar
        paused={paused}
        erg={erg}
        audioOn={musicOn}
        live={isLive}
        onLive={() => setSetting("demoMode", !settings.demoMode)}
        onAudio={() => setShowMusic(true)}
        onMirror={() => setShowCast(true)}
        onErg={onErg}
        onControls={() => setShowControls(true)}
        onReconnect={() => { simulateDropout(); showToast("Reconnecting trainer…"); }}
        onSettings={() => setShowSettings(true)}
        onBluetooth={() => setShowBle(true)}
        onLock={() => { setLocked(true); showToast("Screen locked — hold the button to unlock."); }}
        locked={locked}
        onPauseToggle={onPauseToggle}
        onEnd={requestEnd}
      />
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        {tablet ? (
          <ScrollView style={styles.flex1} contentContainerStyle={styles.tabletContent} showsVerticalScrollIndicator={false} testID="workout-fit">
            {body}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { padding: spacing.sm, gap: spacing.sm }]} showsVerticalScrollIndicator={false} testID="workout-scroll">
            {body}
          </ScrollView>
        )}

        {showControls && (
          <Pressable style={styles.overlay} testID="controls-overlay" onPress={() => setShowControls(false)}>
            <Pressable style={styles.controlsPanel} onPress={(e) => e.stopPropagation()}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Controls</Text>
                <Pressable testID="controls-close" onPress={() => setShowControls(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
              </View>
              <View style={styles.panelGrid}>
                {CONTROLS.map((c) => (
                  <Pressable key={c.key} testID={`ctrl-${c.key}`} style={styles.panelItem} onPress={() => onControlAction(c.key)}>
                    <Ionicons name={c.icon} size={20} color={colors.yellow} />
                    <Text style={styles.panelItemText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        )}

        {locked && (
          <View style={styles.lockOverlay} testID="lock-overlay">
            <Ionicons name="lock-closed" size={34} color={colors.yellow} />
            <Text style={styles.lockTitle}>Screen locked</Text>
            <Pressable
              style={styles.lockBtn}
              testID="lock-unlock"
              delayLongPress={600}
              onLongPress={() => { setLocked(false); showToast("Screen unlocked."); }}
              onPress={() => showToast("Hold the button to unlock.")}
            >
              <Ionicons name="lock-open-outline" size={18} color={colors.bg} />
              <Text style={styles.lockBtnText}>Hold to unlock</Text>
            </Pressable>
          </View>
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
                cue={liveCue}
                trainerConnected={trainerOn}
                wearableConnected={wearableOn}
                onPause={onPauseToggle}
                onEnd={requestEnd}
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
            <Pressable
              style={styles.hudCast}
              onPress={() => setShowCast(true)}
              testID="hud-cast"
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Mirror screen to TV"
            >
              <Ionicons name="tv-outline" size={18} color="#fff" />
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
          coach={coach}
          chooseCoach={chooseCoach}
          coachName={coachName}
          trackName={trackName}
          onSkip={() => { nextTrack(); showToast("Skipped to next track"); }}
          onClose={() => setShowMusic(false)}
        />
      )}

      {showCast && (
        <CastPanel onClose={() => setShowCast(false)} />
      )}

      {showBle && (
        <BleSensorsPanel
          supported={ble.supported}
          poweredOn={ble.poweredOn}
          scanning={ble.scanning}
          devices={ble.devices}
          connected={ble.connected}
          readings={ble.readings}
          permissionStatus={ble.permissionStatus}
          error={ble.error}
          onScan={ble.startScan}
          onStopScan={ble.stopScan}
          onConnect={ble.connect}
          onDisconnect={ble.disconnect}
          onClose={() => setShowBle(false)}
        />
      )}

      {completePrompt && (
        <View style={styles.overlay}>
          <View style={styles.completePanel} testID="workout-complete-prompt">
            <View style={styles.completeBadge}><Ionicons name="checkmark-circle" size={40} color={colors.green} /></View>
            <Text style={styles.completeTitle}>Workout Complete</Text>
            <Text style={styles.completeSub}>You finished {workoutTitle}. Nicely done.</Text>

            <View style={styles.adviceCard}>
              <View style={styles.adviceHead}>
                <Image source={persona.image} style={styles.adviceAvatar} contentFit="cover" contentPosition="top center" />
                <Text style={styles.adviceName}>{`${persona.name}'s advice`}</Text>
              </View>
              {extendAdvice ? (
                <Text style={styles.adviceText} testID="extend-advice">{extendAdvice}</Text>
              ) : (
                <View style={styles.adviceLoading}>
                  <ActivityIndicator size="small" color={colors.yellow} />
                  <Text style={styles.adviceLoadingText}>{persona.name} is reviewing your ride…</Text>
                </View>
              )}
            </View>

            {extendRec === "finish" ? (
              <View style={styles.recoverNote} testID="recover-note">
                <Ionicons name="bed-outline" size={16} color={colors.green} />
                <Text style={styles.recoverNoteText}>{persona.name} recommends finishing here and recovering.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.extendLabel}>
                  EXTEND YOUR RIDE{extendPick ? " · COACH PICK HIGHLIGHTED" : ""}
                </Text>
                <View style={styles.extendRow}>
                  <ExtendChip
                    testID="extend-10" icon="time-outline" label="+10 min" pick={extendPick === "10min"}
                    onPress={() => onExtendRide(10, "+10 min")}
                  />
                  <ExtendChip
                    testID="extend-20" icon="time-outline" label="+20 min" pick={extendPick === "20min"}
                    onPress={() => onExtendRide(20, "+20 min")}
                  />
                  <ExtendChip
                    testID="extend-5km" icon="navigate-outline" label="+5 km" pick={extendPick === "5km"}
                    onPress={() => {
                      const kmh = TYPE_SPEED[selected?.typeId ?? "endurance"] ?? 28;
                      onExtendRide(Math.max(6, Math.round((5 / kmh) * 60)), "+5 km");
                    }}
                  />
                </View>
              </>
            )}

            <Pressable testID="complete-finish" onPress={onFinishComplete} style={({ hovered }: any) => [styles.endSave, { backgroundColor: colors.green }, hovered && { opacity: 0.9 }]}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.endSaveText}>OK</Text>
            </Pressable>
          </View>
        </View>
      )}

      {endPrompt && (
        <View style={styles.overlay}>
          <View style={styles.endPanel} testID="end-ride-prompt">
            <Ionicons name="flag" size={30} color={colors.yellow} />
            <Text style={styles.endTitle}>End this ride?</Text>
            <Text style={styles.endSub}>Save your ride to record it in your progress and plan, or abandon it — abandoned rides are not recorded.</Text>
            <Pressable testID="end-save" onPress={onSaveRide} style={({ hovered }: any) => [styles.endSave, hovered && { opacity: 0.9 }]}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.endSaveText}>Save Ride</Text>
            </Pressable>
            <Pressable testID="end-abandon" onPress={onAbandonRide} style={({ hovered }: any) => [styles.endAbandon, hovered && { backgroundColor: "rgba(224,30,43,0.14)" }]}>
              <Ionicons name="trash-outline" size={17} color={colors.red} />
              <Text style={styles.endAbandonText}>Abandon Ride</Text>
            </Pressable>
            <Pressable testID="end-resume" onPress={onResumeRide} style={styles.endResume}>
              <Text style={styles.endResumeText}>Resume</Text>
            </Pressable>
          </View>
        </View>
      )}

      {stepDetail != null && stepList[stepDetail] && (
        <Pressable style={styles.overlay} testID="step-detail-overlay" onPress={() => setStepDetail(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <StepDetailModal
              step={stepList[stepDetail]}
              activeIndex={activeSeg?.index ?? -1}
              total={stepList.length}
              onClose={() => setStepDetail(null)}
            />
          </Pressable>
        </Pressable>
      )}

      <Toast message={toast} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  tabletContent: { flexGrow: 1, padding: spacing.md, gap: spacing.md },
  flex1: { flex: 1 },
  videoSlot: { minHeight: 150 },
  immersive: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 50 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 60 },
  lockTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  lockBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 12 },
  lockBtnText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  hudEye: { position: "absolute", top: 12, left: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", zIndex: 5 },
  hudCast: { position: "absolute", top: 56, left: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", zIndex: 5 },
  hudCastOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  inlineRoutes: { position: "absolute", left: 10, bottom: 10 },
  metricRow: { flexDirection: "row", gap: spacing.md },
  mainRow: { flexDirection: "row", gap: spacing.md, alignItems: "stretch" },
  leftCenter: { flex: 1, gap: spacing.md },
  innerRow: { flexDirection: "row", gap: spacing.md, alignItems: "stretch" },
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

  endPanel: { width: 440, maxWidth: "90%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center", gap: 10, ...shadow.card },
  endTitle: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 4 },
  endSub: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, textAlign: "center", marginBottom: 6 },
  endSave: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 14, width: "100%", ...shadow.glow },
  endSaveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  endAbandon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 13, width: "100%", borderWidth: 1, borderColor: "rgba(224,30,43,0.4)", backgroundColor: "rgba(224,30,43,0.06)" },
  endAbandonText: { color: colors.red, fontSize: 14.5, fontWeight: "700" },
  endResume: { paddingVertical: 8, marginTop: 2 },
  endResumeText: { color: colors.textDim, fontSize: 14, fontWeight: "700" },

  completePanel: { width: 480, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center", gap: 10, ...shadow.card },
  completeBadge: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", backgroundColor: colors.green + "1A", borderWidth: 1, borderColor: colors.green + "55" },
  completeTitle: { color: colors.white, fontSize: 24, fontWeight: "900", marginTop: 2 },
  completeSub: { color: colors.textDim, fontSize: 14, textAlign: "center", marginBottom: 4 },
  adviceCard: { width: "100%", backgroundColor: colors.yellow + "10", borderWidth: 1, borderColor: colors.yellow + "3A", borderRadius: radius.lg, padding: 14, gap: 8 },
  adviceHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  adviceAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)" },
  adviceName: { color: colors.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  adviceText: { color: colors.white, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  adviceLoading: { flexDirection: "row", alignItems: "center", gap: 9 },
  adviceLoadingText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  extendLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", letterSpacing: 1, alignSelf: "flex-start", marginTop: 4 },
  extendRow: { flexDirection: "row", gap: 10, width: "100%" },
  extendChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.yellow + "44", borderRadius: radius.md, paddingVertical: 12 },
  extendChipPick: { borderColor: colors.yellow, backgroundColor: colors.yellow + "1E", ...(shadow.glow || {}) },
  extendChipText: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  pickBadge: { position: "absolute", top: -9, alignSelf: "center", backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pickBadgeText: { color: colors.bg, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
  recoverNote: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", backgroundColor: colors.green + "12", borderWidth: 1, borderColor: colors.green + "44", borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  recoverNoteText: { color: colors.white, fontSize: 13.5, fontWeight: "600", flex: 1 },
});
