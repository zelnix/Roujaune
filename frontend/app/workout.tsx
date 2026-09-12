import React from "react";
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, LayoutChangeEvent, Pressable, Modal } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useTelemetry } from "@/src/hooks/useTelemetry";
import { useBLE } from "@/src/lib/ble-context";
import { rideRecorder } from "@/src/lib/ride";
import { useEntitlement, consumeRide, refreshEntitlement } from "@/src/lib/entitlement";
import { PaywallModal } from "@/src/components/PaywallModal";
import { getFavoriteRoute, setFavoriteRoute } from "@/src/lib/prefs";
import { useSettings } from "@/src/lib/settings";
import { currentWorkout } from "@/src/data";
import { getWorkout, buildSegments, currentSegment, mmss, targetWatts, extensionSegment } from "@/src/lib/workout-catalog";
import { fetchZoneBias, ZoneBias } from "@/src/lib/targets";
import { WORKOUT_TYPES } from "@/src/lib/workouts";
import { VirtualRidePlayer } from "@/src/components/virtual-route/VirtualRidePlayer";
import YouTubePlayer from "@/src/components/YouTubePlayer";
import { StreamingSourceSheet } from "@/src/components/streaming/StreamingSourceSheet";
import { VIRTUAL_ROUTES, getVRoute } from "@/src/lib/vroutes";
import { vrouteIdForType, deriveVirtualRide } from "@/src/lib/workout-vroute";
import { prTracker, prToastMessages } from "@/src/lib/pr-tracker";
import { Toast, CompletePrompt, EndPrompt } from "@/src/components/workout/WorkoutModals";
import { VRoutePicker } from "@/src/components/workout/VRoutePicker";
import { loadAppearance, RiderAppearanceConfiguration, DEFAULT_APPEARANCE } from "@/src/lib/rider-config";
import {
  SettingsPanel, MusicPanel, CastPanel, RouteMapCard,
} from "@/src/components/workout";
import {
  MetricCard, SessionCard, CoachBanner, TerrainCard, BrandCard, StepTimeline, StepDetailModal, LiveControlBar, AdjustmentsStrip, SensorHealthRow, SensorHealth,
} from "@/src/components/workout-live";
import { useWorkoutAudio } from "@/src/hooks/useWorkoutAudio";
import { BleSensorsPanel } from "@/src/components/BleSensorsPanel";
import { TrainerControlPanel } from "@/src/components/streaming/TrainerControlPanel";
import { fetchCoachCue, fetchExtendPlan, ExtendPlan } from "@/src/lib/coach";
import { useStruggleMonitor } from "@/src/hooks/useStruggleMonitor";
import { StruggleState, REASON_LABEL } from "@/src/lib/struggle";
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
  { key: "mute", label: "Mute Coach", icon: "volume-mute" as const },
  { key: "reconnect", label: "Trainer Reconnect", icon: "bluetooth" as const },
  { key: "trainer", label: "Trainer Control", icon: "speedometer" as const },
  { key: "lock", label: "Touch Lock", icon: "lock-closed" as const },
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

// Estimate terrain + route length from the chosen workout (used when the route
// can't be derived from a video). Avg speed & typical grade per workout type.
const TYPE_SPEED: Record<string, number> = { climbing: 20, threshold: 27, endurance: 30, tempo: 29, vo2max: 30, sprints: 31, recovery: 25, restday: 22, fb50: 24 };
const TYPE_GRADE: Record<string, number> = { climbing: 7.2, threshold: 4, endurance: 1.5, tempo: 2.2, vo2max: 2.6, sprints: 1.8, recovery: 0.6, restday: 0.4, fb50: 1 };



export default function LiveWorkout() {
  const { width: winW, height } = useWindowDimensions();
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
  const narrow = height >= 620 && winW < 1000;   // small-wide screens (e.g. Z Fold): 2×2 metric grid
  const leftW = compact ? 168 : 210;
  const rightW = compact ? 194 : 238;

  const [centerW, setCenterW] = React.useState(560);
  const [videoSlotH, setVideoSlotH] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [vRouteId, setVRouteId] = React.useState(() => vrouteIdForType(selected?.typeId));
  const [routeSource, setRouteSource] = React.useState<"auto" | "favorite" | "manual">("auto");
  const [favRouteId, setFavRouteId] = React.useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [appearance, setAppearance] = React.useState<RiderAppearanceConfiguration>(DEFAULT_APPEARANCE);
  const [showRoutes, setShowRoutes] = React.useState(false);
  const [showControls, setShowControls] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showMusic, setShowMusic] = React.useState(false);
  const [showCast, setShowCast] = React.useState(false);
  const [showBle, setShowBle] = React.useState(false);
  const [showTrainer, setShowTrainer] = React.useState(false);
  const [showStream, setShowStream] = React.useState(false);
  const [customVideoId, setCustomVideoId] = React.useState<string | null>(null);
  const [autoErg, setAutoErg] = React.useState(true);
  const [endPrompt, setEndPrompt] = React.useState(false);
  const [completePrompt, setCompletePrompt] = React.useState(false);
  const [extendAdvice, setExtendAdvice] = React.useState<string | null>(null);
  const [extendRec, setExtendRec] = React.useState<ExtendPlan["recommend"] | null>(null);
  const [extendPick, setExtendPick] = React.useState<ExtendPlan["suggested"]>(null);
  const [locked, setLocked] = React.useState(false);
  const [controlLog, setControlLog] = React.useState<{ id: number; t: string; label: string }[]>([]);
  const [stepDetail, setStepDetail] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [cueIdx] = React.useState(0);

  const { settings, setSetting, loaded } = useSettings();
  const { telemetry, connectionState, sendErg, sendTarget, sendInit, sendSensor, pause, resume } = useTelemetry();
  // Subscription gating — free tier is limited to N rides of ≤M minutes.
  const ent = useEntitlement();
  const [paywall, setPaywall] = React.useState<string | null>(null);
  const rideKeyRef = React.useRef(`workout-${selected?.id || "ride"}-${Date.now()}`);
  const gatedRef = React.useRef(false);
  const freeSecs = ent.freeRideMinutes * 60;
  const ble = useBLE();
  React.useEffect(() => { ble.setWheelCircumferenceMm(settings.wheelCircumference); }, [settings.wheelCircumference]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Struggle auto-ease: the coach quietly drops the ERG target while the rider
  // is struggling (1 = no ease, 0.92 = −8%, ~0.6 = safety active-recovery).
  const [struggleEase, setStruggleEase] = React.useState(1);
  const struggleEaseRef = React.useRef(1);
  React.useEffect(() => { struggleEaseRef.current = struggleEase; }, [struggleEase]);
  React.useEffect(() => {
    if (Date.now() > ergPendingUntil.current) { ergRef.current = telemetry.erg; setErg(telemetry.erg); }
  }, [telemetry.erg]);

  // Push real Bluetooth sensor readings into the telemetry stream so the backend
  // records measured power/cadence/HR (falls back to the trainer sim if BLE stops).
  React.useEffect(() => {
    if (ble.readings.ts <= 0 || connectionState !== "connected") return;
    sendSensor({ power: ble.readings.power, cadence: ble.readings.cadence, hr: ble.readings.hr, speed: ble.readings.speed });
    // Fires once per new BLE sample; ts advances with every reading so the
    // individual power/cadence/hr/speed values are captured fresh each time.
  }, [ble.readings.ts, ble.readings.power, ble.readings.cadence, ble.readings.hr, ble.readings.speed, connectionState, sendSensor]);

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
  // The watts actually sent to the trainer — the planned target, eased down while
  // the rider is struggling so the resistance backs off to help them recover.
  const effTarget = Math.max(0, Math.round(targetW * struggleEase));
  const timeLeftLabel = activeSeg ? mmss(activeSeg.remaining) : undefined;
  // Workout intervals as vertical "stages" for the shared fullscreen HUD rail.
  const workoutStages = React.useMemo(
    () => segments.map((seg, i) => ({
      label: seg.label,
      sub: seg.zoneLabel ?? mmss(seg.durationSec),
      state: (activeSeg ? (i < activeSeg.index ? "done" : i === activeSeg.index ? "active" : "upcoming") : "upcoming") as "done" | "active" | "upcoming",
    })),
    [segments, activeSeg],
  );
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
      sendInit({ elapsed: 0, distance: 0, watts: effTarget });
      lastTargetSent.current = effTarget;
      return;
    }
    if (effTarget !== lastTargetSent.current) {
      lastTargetSent.current = effTarget;
      if (ergModeRef.current) sendTarget(effTarget);
    }
  }, [connectionState, effTarget, sendInit, sendTarget]);

  // Real FTMS trainer: in ERG mode, auto-hold the current (eased) target watts.
  React.useEffect(() => {
    if (ble.hasTrainerControl && autoErg && ergMode) ble.setErgWatts(effTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effTarget, ble.hasTrainerControl, autoErg, ergMode]);

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

  React.useEffect(() => {
    rideRecorder.reset({ workout: workoutTitle, workoutId: selected?.id, ftp });
    energyRef.current = 0;
    lastEnergyElapsedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the recorder's FTP + adaptive bias current (they may load after mount)
  // so the summary scores against the exact targets ridden.
  React.useEffect(() => { rideRecorder.setFtp(ftp); }, [ftp]);
  React.useEffect(() => { rideRecorder.setZoneBias(zoneBias); }, [zoneBias]);

  // Keep the ride recorder's route in sync so the summary reflects the scenery ridden.
  React.useEffect(() => {
    const r = getVRoute(vRouteId);
    rideRecorder.setRoute({ id: r.id, name: r.name, place: r.place, distance: `${r.distanceKm} km`, elevation: `${r.elevationM} m`, tag: r.tag });
    // A route change starts a fresh record attempt (splits reset for the new scenery).
    prTracker.reset(r);
    prSubmittedRef.current = false;
  }, [vRouteId]);

  // Load the rider's saved appearance (identity + bike + clothing) for the scene.
  React.useEffect(() => {
    let alive = true;
    loadAppearance().then((cfg) => { if (alive) setAppearance(cfg); });
    return () => { alive = false; };
  }, []);

  // Load a route pinned as favourite for THIS workout type (auto-loads it),
  // otherwise the auto-matched route stays. Persists across sessions per type.
  React.useEffect(() => {
    const tid = selected?.typeId;
    if (!tid) return;
    let alive = true;
    (async () => {
      const fav = await getFavoriteRoute(tid);
      if (!alive || !fav) return;
      const r = VIRTUAL_ROUTES.find((v) => v.id === fav);
      if (r) {
        setFavRouteId(r.id);
        setVRouteId(r.id);
        setRouteSource("favorite");
        showToast(`Loaded your pick for ${(selectedType?.name ?? "this ride")}: ${r.name}`);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.typeId]);

  // Record live telemetry so the summary screen can compute real aggregates,
  // and integrate ACTUAL watts into a running energy total (joules) for an
  // accurate calorie estimate whenever a trainer/power meter is streaming.
  const energyRef = React.useRef(0);
  const lastEnergyElapsedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    // Record measured/simulated telemetry (sensor or demo) — never the
    // "disconnected" live placeholder — so the summary aggregates real work.
    if (telemetry.source === "sensor" || telemetry.source === "estimated" || telemetry.source === "trainer") {
      const prev = lastEnergyElapsedRef.current;
      lastEnergyElapsedRef.current = telemetry.elapsed;
      const dt = prev == null ? 0 : telemetry.elapsed - prev;
      if (dt > 0 && dt < 5) energyRef.current += telemetry.power * dt;
      rideRecorder.push(
        { power: telemetry.power, hr: telemetry.hr, cadence: telemetry.cadence, speed: telemetry.speed },
        telemetry.elapsed,
      );
    }
  }, [telemetry]);

  const { musicOn, toggleMusic, volume, setVolume, voiceOn, toggleVoice, speak, voiceOptions, voiceId, selectVoice, coach, chooseCoach, coachName, trackName, nextTrack } = useWorkoutAudio(paused);
  const persona = useCoach();

  // Keep the latest telemetry in a ref so cue timers read live values without
  // re-firing on every telemetry tick.
  const telemetryRef = React.useRef(telemetry);
  React.useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);

  const onCenterLayout = (e: LayoutChangeEvent) => setCenterW(e.nativeEvent.layout.width);

  // Record ride-affecting adjustments (skip/extend/intensity/ERG/pause) with the
  // ride time so the rider can see why a lap's numbers changed.
  const logControl = React.useCallback((label: string) => {
    const t = mmss(Math.round(telemetryRef.current.elapsed));
    setControlLog((prev) => [{ id: Date.now(), t, label }, ...prev].slice(0, 8));
    rideRecorder.addAdjustment(t, label);
  }, []);

  const onErg = (d: number) => {
    const next = Math.max(50, Math.min(150, ergRef.current + d));
    ergRef.current = next;
    setErg(next);
    ergPendingUntil.current = Date.now() + 1500;
    sendErg(next);
    showToast(`ERG intensity ${next}%`);
    logControl(`ERG ${d > 0 ? "+" : "−"}${Math.abs(d)}% → ${next}%`);
  };
  const onPauseToggle = () => {
    if (paused) { resume(); } else { pause(); }
    setPaused((p) => !p);
    showToast(paused ? "Resuming workout" : "Workout paused");
    logControl(paused ? "Resumed" : "Paused");
  };
  const onControlAction = (key: string) => {
    setShowControls(false);
    switch (key) {
      case "skip":
        if (activeSeg) { sendInit({ elapsed: telemetry.elapsed + activeSeg.remaining + 1 }); showToast("Skipped to the next interval"); logControl("Skipped interval"); }
        break;
      case "extend":
        if (selected) { setExtraSegments((x) => [...x, extensionSegment(selected, 3)]); showToast("Added 3:00 of easy recovery to your ride"); logControl("+3:00 recovery"); }
        break;
      case "reduce":
        onErg(-5);
        break;
      case "increase":
        onErg(5);
        break;
      case "erg":
        setErgMode((m) => { const next = !m; showToast(next ? "ERG mode ON — trainer holds your target" : "ERG mode OFF — ride at your own effort"); logControl(next ? "ERG mode ON" : "ERG mode OFF"); return next; });
        break;
      case "camera":
        setShowRoutes(true);
        break;
      case "mute":
        toggleVoice();
        showToast(voiceOn ? `${persona.name} muted` : `${persona.name} unmuted`);
        break;
      case "reconnect":
        setShowBle(true);
        break;
      case "trainer":
        setShowTrainer(true);
        break;
      case "lock":
        setLocked(true);
        showToast("Screen locked — hold the button to unlock.");
        break;
      default:
        break;
    }
  };
  // Ending a ride prompts to save or abandon. On abandon nothing is persisted
  // (the summary screen is what saves), so the ride is never recorded.
  const requestEnd = () => { setExpanded(false); if (!paused) { pause(); setPaused(true); } setEndPrompt(true); };
  const onSaveRide = () => {
    rideRecorder.setStruggles(struggleMon.moments.current);
    submitRoutePR(segTotalSec > 0 && telemetryRef.current.elapsed >= segTotalSec);
    setEndPrompt(false);
    router.replace("/summary");
  };
  const onAbandonRide = () => {
    setEndPrompt(false);
    rideRecorder.reset({ workout: workoutTitle, workoutId: selected?.id, ftp });
    router.replace("/");
  };
  const onResumeRide = () => { setEndPrompt(false); if (paused) { resume(); setPaused(false); } };

  // Entitlement gate: premium rides freely; free riders spend one of their
  // allowance (once), or hit the paywall when they've used them all.
  React.useEffect(() => {
    if (!ent.loaded || gatedRef.current) return;
    gatedRef.current = true;
    if (ent.premium) return;
    if (ent.canStartRide) {
      consumeRide(rideKeyRef.current);
    } else {
      if (!paused) { pause(); setPaused(true); }
      setPaywall(`You've used all ${ent.freeRidesLimit} free rides. Go Premium for unlimited riding.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent.loaded, ent.premium, ent.canStartRide]);

  // Free-ride length cap: pause at the free minute limit and offer Premium.
  React.useEffect(() => {
    if (ent.premium || paywall) return;
    if (telemetry.elapsed >= freeSecs) {
      if (!paused) { pause(); setPaused(true); }
      setPaywall(`Your free ride reached ${ent.freeRideMinutes} minutes. Go Premium for unlimited, full-length rides.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry.elapsed, ent.premium, freeSecs, paywall]);

  const closePaywall = React.useCallback(async () => {
    const e = await refreshEntitlement();
    setPaywall(null);
    if (e.premium) { if (paused) { resume(); setPaused(false); } }
    else { router.replace("/"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // ---- End-of-workout "Workout Complete" popup + ride extension ----
  const completeShownRef = React.useRef(false);
  const prSubmittedRef = React.useRef(false);
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

  const onFinishComplete = () => { rideRecorder.setStruggles(struggleMon.moments.current); setCompletePrompt(false); router.replace("/summary"); };
  const onExtendRide = (minutes: number, label: string) => {
    if (!selected) return;
    setExtraSegments((x) => [...x, extensionSegment(selected, minutes)]);
    rideRecorder.addExtension(minutes);
    completeShownRef.current = false;
    setCompletePrompt(false);
    if (paused) { resume(); setPaused(false); }
    showToast(`Ride extended · ${label} · added to your ride`);
  };

  const vroute = getVRoute(vRouteId);

  // A ride is LIVE only — real values come exclusively from a connected
  // Bluetooth device. A BLE power/cadence sensor counts as a trainer; a BLE
  // heart-rate strap counts as a wearable.
  const bleTrainer = ble.connected.length > 0 && (ble.readings.power != null || ble.readings.cadence != null);
  const bleWearable = ble.connected.length > 0 && ble.readings.hr != null;
  const trainerOn = bleTrainer;
  const wearableOn = bleWearable;
  // Names of the actual connected devices, shown on the metric cards. The HR
  // strap is matched by name; the trainer/power device is the other one.
  const hrDevice = ble.connected.find((d) => /hr|heart|polar|tickr|band|strap|rhythm/i.test(d.name));
  const trainerDevice = ble.connected.find((d) => /kickr|trainer|tacx|wahoo|saris|elite|neo|flux|power|bike|hammer|suito|assioma|stages|quarq/i.test(d.name)) ?? ble.connected.find((d) => d.id !== hrDevice?.id) ?? ble.connected[0];
  const hrName = hrDevice?.name ?? (bleWearable ? "HR Sensor" : undefined);
  const trainerName = trainerDevice?.name ?? (bleTrainer ? "Trainer" : undefined);
  const hrBattery = hrDevice ? ble.battery[hrDevice.id] ?? null : null;
  const trainerBattery = trainerDevice ? ble.battery[trainerDevice.id] ?? null : null;
  const hrSignal = hrDevice ? ble.rssi[hrDevice.id] ?? null : null;
  const trainerSignal = trainerDevice ? ble.rssi[trainerDevice.id] ?? null : null;
  // Nudge the rider once when any connected sensor's battery drops below ~15%.
  const lowBatWarnedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const d of ble.connected) {
      const lvl = ble.battery[d.id];
      if (lvl != null && lvl <= 15 && !lowBatWarnedRef.current.has(d.id)) {
        lowBatWarnedRef.current.add(d.id);
        showToast(`${d.name || "Sensor"} battery low (${lvl}%) — charge it soon`);
      } else if (lvl != null && lvl > 20) {
        lowBatWarnedRef.current.delete(d.id);
      }
    }
  }, [ble.battery, ble.connected, showToast]);

  // Announce brief sensor drop-outs: "Reconnecting {name}…" when a paired
  // sensor starts reconnecting, then "{name} reconnected" once it's back.
  const wasReconnectingRef = React.useRef<Set<string>>(new Set());
  const sensorNameRef = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    ble.connected.forEach((d) => { sensorNameRef.current[d.id] = d.name || "Sensor"; });
    const now = new Set(ble.reconnecting);
    const prev = wasReconnectingRef.current;
    now.forEach((id) => {
      if (!prev.has(id)) showToast(`Reconnecting ${sensorNameRef.current[id] || "sensor"}…`);
    });
    prev.forEach((id) => {
      if (!now.has(id) && ble.connected.some((d) => d.id === id)) {
        showToast(`${sensorNameRef.current[id] || "Sensor"} reconnected`);
      }
    });
    wasReconnectingRef.current = now;
  }, [ble.reconnecting, ble.connected, showToast]);

  // Compact per-sensor health list (battery + signal) for the strip, built from
  // the actually connected BLE devices. Empty with no sensors connected.
  const sensorHealth: SensorHealth[] = React.useMemo(() => {
    return ble.connected.map((d) => ({
      id: d.id,
      name: d.name || "Sensor",
      kind: d.id === hrDevice?.id ? "hr" : d.id === trainerDevice?.id ? "trainer" : "sensor",
      battery: ble.battery[d.id] ?? null,
      signal: ble.rssi[d.id] ?? null,
      reconnecting: ble.reconnecting.includes(d.id),
    }));
  }, [ble.connected, ble.battery, ble.rssi, ble.reconnecting, hrDevice, trainerDevice]);
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

  // Submit the finished scenic route to the PR tracker: fastest time (primary),
  // highest avg power (secondary) + per-checkpoint splits. Celebrates via toast.
  const submitRoutePR = React.useCallback((completed: boolean) => {
    if (prSubmittedRef.current) return;
    prSubmittedRef.current = true;
    const el = telemetryRef.current.elapsed;
    let avgPower = 0;
    if (energyRef.current > 0 && el > 0) {
      avgPower = energyRef.current / el;
    } else {
      let acc = 0; let t = el;
      for (const s of segments) { if (t <= 0) break; const d = Math.min(t, s.durationSec); acc += targetWatts(s, ftp, zoneBias) * d; t -= d; }
      avgPower = el > 0 ? acc / el : 0;
    }
    const rn = getVRoute(vRouteId).name;
    prTracker.submit({ avgPower, timeSec: el, completed }).then((records) => {
      const msgs = prToastMessages(records, rn);
      msgs.forEach((m, i) => setTimeout(() => showToast(m), 500 + i * 2300));
    });
  }, [segments, ftp, zoneBias, vRouteId, showToast]);

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
      submitRoutePR(true);
    }
  }, [telemetry.elapsed, segTotalSec, endPrompt, paused, pause, fetchExtendAdvice, submitRoutePR]);

  const timeProgress = Math.min(1, telemetry.elapsed / totalSec);
  const progress = trainerOn ? (terrain.km > 0 ? Math.min(1, telemetry.distance / terrain.km) : 0) : timeProgress;
  const riddenKm = trainerOn ? Math.min(terrain.km, telemetry.distance) : +(timeProgress * terrain.km).toFixed(1);
  const routeInfo = { title: vroute.name, place: vroute.place, km: terrain.km, elev: terrain.elev, grade: terrain.grade, isClimb: terrain.isClimb, tag: vroute.tag };

  // Record per-checkpoint split times as the rider advances along the scenic route.
  React.useEffect(() => { prTracker.mark(progress, telemetry.elapsed); }, [progress, telemetry.elapsed]);

  // Virtual route state: map the workout's progress onto the selected scenic route
  // (gradient / elevation / resistance / scene metrics). Feeds BOTH views.
  const { vState, vResistance, vMetrics } = deriveVirtualRide(
    vRouteId, progress, riddenKm,
    { power: telemetry.power, cadence: telemetry.cadence, speed: telemetry.speed, hr: telemetry.hr, elapsed: telemetry.elapsed },
    trainerOn, paused,
  );
  const routeTypeName = selectedType?.name ?? selected?.typeName ?? "your ride";
  const routeBadge =
    routeSource === "favorite" ? { icon: "star" as const, label: `Your pick · ${routeTypeName}` }
    : routeSource === "auto" ? { icon: "sparkles" as const, label: `Auto-matched · ${routeTypeName}` }
    : null;

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
    route: vroute.name,
    seated: settings.seatedMode,
    coach_name: persona.name,
    coach_gender: persona.gender,
  }), [vroute.name, persona.name, persona.gender, workoutTitle, targetW, activeSeg, settings.seatedMode]);

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

  const generateCue = React.useCallback(async (kind: "live" | "intro" | "next_preview" | "struggle" | "safety" = "live", extra?: Record<string, any>) => {
    if (paused || cueBusy.current) return;
    cueBusy.current = true;
    lastCueAt.current = Date.now();
    const t = telemetryRef.current;
    const seg = activeSegRef.current;
    const ctx: any = { ...coachCtxRef.current, cue_kind: kind, ...(extra ?? {}) };
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
      } else if (kind === "safety") {
        fallback = "Ease right off and just spin — sit tall, breathe deep and let your heart rate come down. Recovery is the smart move here.";
      } else if (kind === "struggle") {
        const prim = (extra?.struggle_primary as keyof typeof REASON_LABEL) || null;
        const tip = prim === "cadence_decay" ? "lift your cadence and keep the legs turning"
          : prim === "hr_near_max" || prim === "hr_decoupling" ? "breathe deep and settle your effort"
          : prim === "power_variability" || prim === "pedal_asymmetry" ? "smooth out your pedal stroke"
          : "stay relaxed and hold your form";
        fallback = `Dig in — ${tip}. You've got this, one pedal stroke at a time.`;
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

  // ---- Live struggle detection + auto-ease intervention ----
  // Watches multi-variable telemetry (cadence/HR/power, W′ balance, pedal
  // balance) and, when the rider starts to struggle, eases the ERG target and
  // has the coach cue them; a safety trip eases them into recovery.
  // Priority 1 gate — ERG Mechanical Failure ("spiral of death"): power holds
  // 10%+ under target for the full 10s window AND cadence sits under a 75rpm
  // floor AND the stroke is erratic (cadence CV > 10%) — this alone commands
  // a precise 5% ERG resistance drop, independent of any other signal.
  // Priority 2 gate — Pre-Emptive W′ Intervention: Time-to-Depletion (W′bal
  // divided by current power minus CP) is compared against the time left in
  // the interval. If the tank will hit zero before the interval ends, the
  // coach intervenes NOW — predicting the blow-up instead of reacting to it.
  // Priority 3 gate — Systemic Fatigue: heart rate drifting up 5%+ over a
  // ~15 minute horizon while power holds steady signals heat/dehydration or
  // deep fatigue, not a hard effort — the response is a hydration reminder
  // and a firm cap on target, not encouragement to dig in.
  const struggleMon = useStruggleMonitor({
    power: telemetry.power, cadence: telemetry.cadence, hr: telemetry.hr,
    elapsed: telemetry.elapsed, source: telemetry.source,
    balance: (ble.readings as any)?.balance ?? null,
    targetW, ftp, maxHr: settings.maxHr, age: settings.age,
    cadLow: CAD_LOW, cadHigh: CAD_HIGH, ergMode, trainerOn, wearableOn, paused,
    remainingIntervalSec: activeSeg?.remaining ?? 0,
    onStruggle: (s: StruggleState) => {
      const pct = Math.round(s.easePct * 100) || 8;
      setStruggleEase(1 - s.easePct);
      const label = REASON_LABEL[(s.primary ?? s.reasons[0]) as keyof typeof REASON_LABEL] ?? "you're straining";
      const mechanical = s.primary === "erg_spiral";
      const fatigued = s.primary === "systemic_fatigue";
      showToast(
        mechanical
          ? `Trainer eased ERG −${pct}% · cadence + power collapsing`
          : s.preemptive
          ? `${persona.name} eased −${pct}% now — you'd run out of gas before this interval ends`
          : fatigued
          ? `Hydration check — heart rate drifting while power holds. Target capped −${pct}%.`
          : `${persona.name} eased your target −${pct}% · ${label}`
      );
      logControl(
        `${mechanical ? "Mechanical-failure" : s.preemptive ? "Pre-emptive W-prime" : fatigued ? "Systemic-fatigue" : "Coach"} eased −${pct}% ` +
        `(${s.primary ?? "struggle"})${s.preemptive ? ` · ${s.wBalKj}/${s.wPrimeKj} kJ, ${Math.round(s.timeToDepletionSec ?? 0)}s to empty` : ""}`
      );
      generateCue("struggle", {
        struggle_reasons: s.reasons, struggle_primary: s.primary,
        struggle_severity: s.severity, struggle_safety: false,
        power_deficit_pct: Math.round(s.powerDeficitPct * 100) / 100,
        w_prime_pct: Math.round(s.wPrimePct * 100) / 100,
        near_max_hr_pct: Math.round(s.nearMaxHrPct * 100) / 100,
        place: vroute.place, eased_pct: pct,
        preemptive: s.preemptive, time_to_depletion_sec: s.timeToDepletionSec ?? undefined,
      });
    },
    onSafety: (s: StruggleState) => {
      setStruggleEase(1 - (s.easePct || 0.45));
      showToast(`${persona.name} eased you into active recovery — heart rate near your max`);
      logControl("Safety ease → active recovery");
      generateCue("safety", {
        struggle_reasons: s.reasons, struggle_primary: s.primary,
        struggle_severity: "high", struggle_safety: true,
        near_max_hr_pct: Math.round(s.nearMaxHrPct * 100) / 100,
        place: vroute.place,
      });
    },
    onRecover: () => {
      setStruggleEase(1);
      showToast("Back on top of it — target restored.");
      logControl("Recovered — target restored");
    },
  });
  const struggle = struggleMon.state;

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
  }, [activeSeg, activeSeg?.remaining, paused, generateCue]);

  const onSelectRoute = (id: string) => {
    setVRouteId(id); setShowRoutes(false);
    setRouteSource(id === favRouteId ? "favorite" : "manual");
    showToast(`Route: ${getVRoute(id).name}`);
  };
  const onAutoRoute = () => {
    const id = vrouteIdForType(selected?.typeId);
    setVRouteId(id); setShowRoutes(false); setRouteSource("auto");
    showToast(`Auto-matched to your ${(selectedType?.name ?? selected?.typeName ?? "ride").toLowerCase()}: ${getVRoute(id).name}`);
  };
  const onShuffleRoute = () => {
    let id = vRouteId;
    if (VIRTUAL_ROUTES.length > 1) { while (id === vRouteId) id = VIRTUAL_ROUTES[Math.floor(Math.random() * VIRTUAL_ROUTES.length)].id; }
    setVRouteId(id); setRouteSource(id === favRouteId ? "favorite" : "manual");
    showToast(`Surprise route: ${getVRoute(id).name}`);
  };
  // Pin/unpin a route as the favourite for the current workout type (persisted).
  const onPinRoute = (id: string) => {
    const tid = selected?.typeId;
    if (!tid) return;
    if (favRouteId === id) {
      setFavoriteRoute(tid, null); setFavRouteId(null);
      if (vRouteId === id) setRouteSource("manual");
      showToast(`Unpinned ${getVRoute(id).name}`);
    } else {
      setFavoriteRoute(tid, id); setFavRouteId(id);
      setVRouteId(id);
      setRouteSource("favorite");
      showToast(`Pinned ${getVRoute(id).name} for ${(selectedType?.name ?? "this ride")}`);
    }
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
  // Time-based ride: no live sensors connected → show duration metrics (elapsed,
  // interval remaining, calories, workout step) instead of blank telemetry cards.
  const timeBased = !trainerOn && !wearableOn;
  const elapsedShort = telemetry.elapsed >= 3600 ? fmt(telemetry.elapsed) : mmss(Math.round(telemetry.elapsed));
  // Calorie estimate: integrate ACTUAL watts when a power meter is streaming,
  // otherwise integrate the planned target watts (time-based ride). Work in kJ ×
  // ~0.7 (≈24% efficiency) — the same formula the saved summary uses, so the
  // number the rider sees live matches their saved ride total.
  const kcal = React.useMemo(() => {
    let kj: number;
    if (!timeBased && energyRef.current > 0) {
      kj = energyRef.current / 1000;
    } else {
      let acc = 0;
      let t = telemetry.elapsed;
      for (const s of segments) {
        if (t <= 0) break;
        const d = Math.min(t, s.durationSec);
        acc += targetWatts(s, ftp, zoneBias) * d;
        t -= d;
      }
      kj = acc / 1000;
    }
    return Math.round(kj * 0.7);
  }, [timeBased, segments, telemetry.elapsed, ftp, zoneBias]);
  // Persist so the saved summary carries the exact figure shown live.
  React.useEffect(() => { rideRecorder.setEstCalories(kcal); }, [kcal]);

  const body = (
    <>
      <View style={[styles.mainRow, tablet && styles.flex1]}>
        <View style={[styles.leftCenter, tablet && styles.flex1]}>
          <View style={[styles.metricRow, narrow && styles.metricRowWrap]}>
            {!narrow && <BrandCard dense={tablet} onPress={() => router.replace("/")} />}
            {timeBased ? (
              <>
                <MetricCard icon="stopwatch-outline" label="Elapsed" value={elapsedShort} sub={`TOTAL SESSION ${mmss(totalSec)}`} accent={colors.yellow} half={narrow} dense={tablet} />
                <MetricCard icon="timer-outline" label="Interval" value={timeLeftLabel ?? "—"} status="REMAINING" statusTone="neutral" sub="CURRENT BLOCK" accent="#5AC8FA" half={narrow} dense={tablet} />
                <MetricCard icon="flame" label="Calories" value={String(kcal)} unit="kcal" sub="ESTIMATED" accent={colors.red} half={narrow} dense={tablet} />
                <MetricCard icon="flag" label="Workout Step" value={`Step ${(activeSeg?.index ?? 0) + 1}`} unit={`of ${segments.length}`} sub="CURRENT STEP" accent={colors.green} half={narrow} dense={tablet} />
              </>
            ) : (
              <>
                <MetricCard icon="heart" label="Heart Rate" value={wearableOn ? String(telemetry.hr) : "—"} unit="bpm" status={wearableOn ? `ZONE ${hrZone(telemetry.hr)}` : undefined} statusTone="neutral" accent={colors.red} connected={wearableOn} deviceName={hrName} battery={hrBattery} signal={hrSignal} onDevicePress={() => setShowBle(true)} half={narrow} dense={tablet} />
                <MetricCard icon="speedometer" label="Speed" value={trainerOn ? String(Math.round(telemetry.speed)) : "—"} unit="km/h" accent="#5AC8FA" connected={trainerOn} deviceName={trainerName} battery={trainerBattery} signal={trainerSignal} onDevicePress={() => setShowBle(true)} half={narrow} dense={tablet} />
                <MetricCard icon="sync" label="Cadence" value={trainerOn ? String(telemetry.cadence) : "—"} unit="rpm" status={cadStatus} statusTone={cadInRange ? "good" : "warn"} sub={`TARGET ${CAD_LOW}–${CAD_HIGH}`} accent={colors.green} connected={trainerOn} deviceName={trainerName} battery={trainerBattery} signal={trainerSignal} onDevicePress={() => setShowBle(true)} half={narrow} dense={tablet} />
                <MetricCard icon="flash" label="Power" value={trainerOn ? String(powerVal) : "—"} unit="W" status={powerStatus} statusTone={powerTone} sub={`TARGET ${Math.max(0, targetW - 8)}–${targetW + 8} W`} accent={colors.yellow} connected={trainerOn} deviceName={trainerName} battery={trainerBattery} signal={trainerSignal} onDevicePress={() => setShowBle(true)} half={narrow} dense={tablet} />
              </>
            )}
          </View>

          <View style={[styles.innerRow, tablet && styles.flex1]}>
            <View style={[styles.leftCol, { width: leftW }]}>
              <SessionCard elapsed={fmt(telemetry.elapsed)} estFinish={estFinish} riddenKm={riddenKm} totalKm={routeInfo.km} />
            </View>
            <View style={styles.centerCol} onLayout={onCenterLayout}>
              <CoachBanner name={persona.name} message={liveCue} avatar={persona.image} struggle={struggle && struggle.active ? { severity: struggle.severity, safety: struggle.safety, label: REASON_LABEL[(struggle.primary ?? struggle.reasons[0]) as keyof typeof REASON_LABEL] ?? "digging deep" } : null} />
              <View
                style={[styles.videoSlot, tablet && styles.flex1]}
                onLayout={tablet ? (e) => setVideoSlotH(Math.round(e.nativeEvent.layout.height)) : undefined}
              >
                {expanded ? (
                  <Pressable style={styles.fsMinimised} onPress={() => setExpanded(false)} testID="vr-restore-inline">
                    <Ionicons name="contract-outline" size={22} color={colors.textDim} />
                    <Text style={styles.fsMinimisedText}>Virtual ride is fullscreen — tap to return</Text>
                  </Pressable>
                ) : customVideoId ? (
                  <View style={tablet ? styles.flex1 : { height: videoRenderH }}>
                    <YouTubePlayer
                      videoId={customVideoId}
                      width={centerW}
                      height={videoRenderH}
                      playing={!paused}
                    />
                    <View style={[styles.ytControls, { pointerEvents: "box-none" }]}>
                      <Pressable style={styles.ytSourceBtn} onPress={() => setShowStream(true)} testID="workout-source"
                        accessibilityRole="button" accessibilityLabel="Choose what to watch">
                        <Ionicons name="logo-youtube" size={13} color={colors.white} />
                        <Text style={styles.ytSourceText}>Watch</Text>
                        <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.65)" />
                      </Pressable>
                      <Pressable style={styles.ytIconBtn} onPress={() => setExpanded(true)} testID="workout-yt-fullscreen"
                        accessibilityRole="button" accessibilityLabel="Enter fullscreen">
                        <Ionicons name="expand-outline" size={18} color={colors.white} />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <VirtualRidePlayer
                    mode="embedded"
                    vroute={vroute}
                    routeState={vState}
                    appearance={appearance}
                    metrics={vMetrics}
                    paused={paused}
                    connected={trainerOn || wearableOn}
                    simulation={!trainerOn}
                    hrOn={wearableOn}
                    load={vResistance}
                    reducedMotion={reducedMotion}
                    onToggleReducedMotion={() => setReducedMotion((r) => !r)}
                    onFullscreen={() => setExpanded(true)}
                    onOpenRoutes={() => setShowRoutes(true)}
                    onOpenSource={() => setShowStream(true)}
                    sourceLabel="Watch"
                    sourceIcon="tv-outline"
                    routeBadge={routeBadge}
                    style={tablet ? styles.flex1 : { height: videoRenderH }}
                  />
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.rightCol, { width: rightW }]}>
          <TerrainCard grade={terrain.grade} elevGain={terrain.elev} distanceLeft={Math.max(0, terrain.km - riddenKm)} progress={progress} isClimb={terrain.isClimb} />
          <RouteMapCard title={routeInfo.title} progress={progress} riddenKm={riddenKm} totalKm={routeInfo.km} timeBased={!trainerOn} fill />
        </View>
      </View>

      <SensorHealthRow sensors={sensorHealth} onSensorPress={() => setShowBle(true)} />

      <StepTimeline steps={stepList} activeIndex={activeSeg?.index ?? -1} remaining={timeLeftLabel} stepProgress={activeSeg ? activeSeg.elapsedInSeg / Math.max(1, activeSeg.segment.durationSec) : 0} onStepPress={(i) => setStepDetail(i)} />

      <AdjustmentsStrip entries={controlLog} />

      <LiveControlBar
        paused={paused}
        erg={erg}
        audioOn={musicOn}
        onAudio={() => setShowMusic(true)}
        onMirror={() => setShowCast(true)}
        onErg={onErg}
        onControls={() => setShowControls(true)}
        onReconnect={() => setShowBle(true)}
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
      <PaywallModal visible={!!paywall} onClose={closePaywall} reason={paywall || undefined} />
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
          {customVideoId ? (
            <>
              <YouTubePlayer videoId={customVideoId} width={winW} height={height} playing={!paused} />
              <Pressable style={styles.fsExit} onPress={() => setExpanded(false)} testID="vr-exit-fullscreen"
                accessibilityRole="button" accessibilityLabel="Exit fullscreen">
                <Ionicons name="contract-outline" size={22} color={colors.white} />
              </Pressable>
            </>
          ) : (
            <VirtualRidePlayer
              mode="fullscreen"
              vroute={vroute}
              routeState={vState}
              appearance={appearance}
              metrics={vMetrics}
              paused={paused}
              connected={trainerOn || wearableOn}
              simulation={!trainerOn}
              hrOn={wearableOn}
              load={vResistance}
              compact={compact}
              reducedMotion={reducedMotion}
              onToggleReducedMotion={() => setReducedMotion((r) => !r)}
              cue={liveCue}
              stepLabel={activeSeg?.segment.label}
              stepTimeLeft={timeLeftLabel ?? undefined}
              stages={workoutStages}
              onExitFullscreen={() => setExpanded(false)}
              onPauseToggle={onPauseToggle}
              onPreset={(w) => { sendTarget(w); showToast(`Target ${w} W`); logControl(`Target → ${w} W`); }}
              ergOn={ergMode}
              onErgToggle={() => setErgMode((m) => { const next = !m; showToast(next ? "ERG mode ON" : "ERG mode OFF"); logControl(next ? "ERG mode ON" : "ERG mode OFF"); return next; })}
              onReconnect={() => setShowBle(true)}
            />
          )}
        </View>
      )}

      {showRoutes && (
        <VRoutePicker
          vRouteId={vRouteId}
          favRouteId={favRouteId}
          auto={routeSource === "auto"}
          workoutTypeName={routeTypeName}
          onSelect={onSelectRoute}
          onAuto={onAutoRoute}
          onShuffle={onShuffleRoute}
          onPin={onPinRoute}
          onClose={() => setShowRoutes(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} setSetting={setSetting} onClose={() => setShowSettings(false)} />
      )}

      <StreamingSourceSheet
        visible={showStream}
        source={customVideoId ? "youtube" : "route"}
        onClose={() => setShowStream(false)}
        onPickRoute={() => setCustomVideoId(null)}
        onPickYouTube={(id) => { setCustomVideoId(id); setPaused(false); }}
        routeLabel="Virtual ride (avatar)"
        routeDesc="Your rider on the virtual route, with live ERG resistance."
      />

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
          battery={ble.battery}
          reconnecting={ble.reconnecting}
          permissionStatus={ble.permissionStatus}
          error={ble.error}
          onScan={ble.startScan}
          onStopScan={ble.stopScan}
          onConnect={ble.connect}
          onDisconnect={ble.disconnect}
          onClose={() => setShowBle(false)}
          units={settings.units}
        />
      )}

      <TrainerControlPanel
        visible={showTrainer}
        onClose={() => setShowTrainer(false)}
        hasControl={ble.hasTrainerControl}
        mode={ble.controlMode}
        power={ble.readings.power}
        auto={autoErg}
        onToggleAuto={setAutoErg}
        onErg={ble.setErgWatts}
        onResistance={ble.setResistance}
        onGrade={ble.setSimGrade}
        onReset={ble.resetTrainer}
        context="workout"
      />

      {completePrompt && (
        <CompletePrompt
          workoutTitle={workoutTitle}
          persona={persona}
          extendAdvice={extendAdvice}
          extendRec={extendRec}
          extendPick={extendPick}
          onExtend={onExtendRide}
          on5km={() => {
            const kmh = TYPE_SPEED[selected?.typeId ?? "endurance"] ?? 28;
            onExtendRide(Math.max(6, Math.round((5 / kmh) * 60)), "+5 km");
          }}
          onFinish={onFinishComplete}
        />
      )}

      {endPrompt && (
        <EndPrompt onSave={onSaveRide} onAbandon={onAbandonRide} onResume={onResumeRide} />
      )}

      {stepDetail != null && stepList[stepDetail] && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setStepDetail(null)}>
          <Pressable style={styles.overlay} testID="step-detail-overlay" onPress={() => setStepDetail(null)}>
            <Pressable onPress={() => { /* swallow */ }}>
              <StepDetailModal
                step={stepList[stepDetail]}
                activeIndex={activeSeg?.index ?? -1}
                total={stepList.length}
                onClose={() => setStepDetail(null)}
              />
            </Pressable>
          </Pressable>
        </Modal>
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
  ytControls: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 7 },
  ytSourceBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  ytSourceText: { color: colors.white, fontSize: 11.5, fontWeight: "800" },
  ytIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  fsExit: { position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", zIndex: 51 },
  immersive: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 50, alignItems: "center", justifyContent: "center" },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 60 },
  lockTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  lockBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 12 },
  lockBtnText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  fsMinimised: { flex: 1, minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#0b0d12" },
  fsMinimisedText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  routePickerPanel: { width: 560, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...(shadow.card as any) },
  routePickerActions: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  routeActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.yellow + "88", backgroundColor: colors.yellow + "18" },
  routeActionOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  routeActionText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  routeOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 },
  routeOptSel: { borderColor: colors.yellow, backgroundColor: colors.cardElevated },
  routeOptThumb: { width: 84, height: 52, borderRadius: radius.sm, backgroundColor: "#0d0f14" },
  routeOptName: { color: colors.white, fontSize: 14, fontWeight: "800" },
  routeOptMeta: { color: colors.textFaint, fontSize: 12, fontWeight: "600", marginTop: 2 },
  metricRow: { flexDirection: "row", gap: spacing.sm },
  metricRowWrap: { flexWrap: "wrap", rowGap: spacing.sm },
  mainRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  leftCenter: { flex: 1, minWidth: 0, gap: spacing.sm },
  innerRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  leftCol: { gap: spacing.sm },
  centerCol: { flex: 1, minWidth: 0, gap: spacing.sm },
  rightCol: { gap: spacing.sm },

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
