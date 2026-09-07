import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, Animated, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import YouTubePlayer from "@/src/components/YouTubePlayer";
import { colors, radius } from "@/src/theme";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { useScenicRoute, useScenicPois, ScenicPoi, logScenicRide, ytThumb, saveDiscovery, deleteDiscovery, fetchDiscoveries } from "@/src/lib/scenic-routes";
import { getResume, saveResume, clearResume } from "@/src/lib/scenic-resume";
import { useCoach, useVoiceGuidance, setVoiceGuidance, VoiceGuidance } from "@/src/lib/coach-persona";
import { useBleSensors } from "@/src/hooks/useBleSensors";
import { RouteMapPoint } from "@/src/components/RideRouteMap";
import { recapCaption } from "@/src/lib/scenic-recap";
import { SERIF, clock, GradientText, Ring, Waveform, Metric, Seg, NavItem, MusicControl } from "@/src/components/scenic/hud-widgets";
import { ElevationChart } from "@/src/components/scenic/ElevationChart";
import { RideCompleteOverlay } from "@/src/components/scenic/RideCompleteOverlay";
import { LeaveRideDialog } from "@/src/components/scenic/LeaveRideDialog";
import { DiscoveryPrompt, SaveToast } from "@/src/components/scenic/DiscoveryPrompt";
import { useEntitlement, consumeRide, refreshEntitlement } from "@/src/lib/entitlement";
import { PaywallModal } from "@/src/components/PaywallModal";
import { StreamingSourceSheet } from "@/src/components/streaming/StreamingSourceSheet";
import { TrainerControlPanel } from "@/src/components/streaming/TrainerControlPanel";

/** Immersive live scenic-ride experience — a full-bleed POV video with a
 *  cinematic, fully hideable HUD (tap the scene to show/hide). */
export default function ScenicRideScreen() {
  const router = useRouter();
  const { route: routeId } = useLocalSearchParams<{ route?: string }>();
  const { width, height } = useWindowDimensions();
  const { route, loading, error } = useScenicRoute(routeId);
  const { pois } = useScenicPois(routeId);
  const persona = useCoach();

  // Resume support: continue from where the rider left off (if any).
  const resumeRef = React.useRef(getResume());
  const r0 = resumeRef.current && routeId && resumeRef.current.routeId === routeId ? resumeRef.current : null;

  const [playing, setPlaying] = React.useState(true);
  // Ride-screen source: the curated route video (default) or the rider's own
  // YouTube video. External apps (Netflix/Prime/…) launch out via the sheet.
  const [customVideoId, setCustomVideoId] = React.useState<string | null>(null);
  const [streamOpen, setStreamOpen] = React.useState(false);
  // FTMS smart-trainer control: auto-drive road gradient from the route's terrain.
  const [trainerOpen, setTrainerOpen] = React.useState(false);
  const [autoTerrain, setAutoTerrain] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(r0 ? r0.elapsedSec : 0);
  const [vpos, setVpos] = React.useState(0); // real video currentTime (sec)
  const [vdur, setVdur] = React.useState(0); // real video duration (sec)
  // Has the POV video actually begun playing yet? (Autoplay can be blocked in
  // Expo Go / mobile WebViews — we then surface a "tap to start" fallback.)
  const [videoStarted, setVideoStarted] = React.useState(false);
  const [showTapHint, setShowTapHint] = React.useState(false);
  const onVideoProgress = React.useCallback((cur: number, dur: number) => {
    if (typeof cur === "number" && cur >= 0) setVpos(cur);
    if (cur > 0.4) setVideoStarted(true);
    if (dur && dur > 0) setVdur((d) => (d > 0 ? d : dur));
  }, []);
  const onVideoState = React.useCallback((p: boolean) => {
    setPlaying(p);
    if (p) setVideoStarted(true);
  }, []);

  // Live BLE cadence / heart-rate telemetry (native build only). When no
  // sensor is connected these metrics are hidden from the HUD entirely.
  const ble = useBleSensors();
  const hasTelemetry = ble.connected.length > 0;
  const cadence = ble.readings.cadence;
  const hr = ble.readings.hr;

  const [hud, setHud] = React.useState(true);
  const [show, setShow] = React.useState({ location: true, comingUp: true, companion: true, metrics: true });
  const hideOne = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: false }));
  const [musicOn, setMusicOn] = React.useState(true);
  const [musicLevel, setMusicLevel] = React.useState(2); // 1..4
  const [heard, setHeard] = React.useState<Set<number>>(new Set());
  const [hiddenPoi, setHiddenPoi] = React.useState<Set<number>>(new Set());
  const [saved, setSaved] = React.useState<Set<number>>(new Set());
  const [sessionSaved, setSessionSaved] = React.useState<Set<number>>(new Set()); // saved during THIS ride
  const [ackComplete, setAckComplete] = React.useState(false);
  const celebratedRef = React.useRef(false);
  const [narrating, setNarrating] = React.useState(false);
  // Effortless capture: a subtle "save discovery" prompt + confirmation toast.
  const [discoveryPrompt, setDiscoveryPrompt] = React.useState<ScenicPoi | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const promptedRef = React.useRef<Set<number>>(new Set());
  const promptTimer = React.useRef<any>(null);
  const toastTimer = React.useRef<any>(null);
  const [pendingNav, setPendingNav] = React.useState<null | (() => void)>(null);
  // Subscription gating — free tier is limited to N rides of ≤M minutes.
  const ent = useEntitlement();
  const [paywall, setPaywall] = React.useState<string | null>(null);
  const rideKeyRef = React.useRef<string>(`${routeId || "ride"}-${Date.now()}`);
  const gatedRef = React.useRef(false);
  const guidance = useVoiceGuidance();
  const audioMode: "quiet" | "discover" | "guided" =
    guidance === "muted" ? "quiet" : guidance === "full" ? "guided" : "discover";
  const setAudio = (m: "quiet" | "discover" | "guided") => {
    const map: Record<typeof m, VoiceGuidance> = { quiet: "muted", discover: "essential", guided: "full" } as const;
    setVoiceGuidance(map[m]);
  };
  const fade = React.useRef(new Animated.Value(1)).current;

  // Soft, looping ambient soundtrack that replaces the (muted) video audio.
  const ambient = useAudioPlayer(require("../assets/audio/scenic_ambient.mp3"));
  // Gentle chime that plays when a new discovery prompt appears (eyes-forward).
  const chime = useAudioPlayer(require("../assets/audio/discovery_chime.wav"));
  React.useEffect(() => { try { chime.volume = 0.55; } catch {} }, [chime]);
  const alertDiscovery = React.useCallback(() => {
    // Quiet mode keeps the ride fully silent — only the haptic tap fires.
    if (audioMode !== "quiet") { try { chime.seekTo(0); chime.play(); } catch {} }
    if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
  }, [chime, audioMode]);
  React.useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try { ambient.loop = true; } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Music follows the ride + the rider's on/off + volume choice.
  React.useEffect(() => {
    const VOL = [0.08, 0.18, 0.32, 0.5];
    try {
      ambient.volume = musicOn ? VOL[musicLevel - 1] : 0;
      if (playing && musicOn) ambient.play(); else ambient.pause();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, musicOn, musicLevel]);
  // Stop the music when leaving the ride.
  React.useEffect(() => () => { try { ambient.pause(); } catch {} }, [ambient]);

  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);

  React.useEffect(() => {
    Animated.timing(fade, { toValue: hud ? 1 : 0, duration: 260, useNativeDriver: Platform.OS !== "web" }).start();
  }, [hud, fade]);

  // Reveal the "tap to start" fallback if the video hasn't begun after a beat.
  React.useEffect(() => {
    if (videoStarted) { setShowTapHint(false); return; }
    const t = setTimeout(() => setShowTapHint(true), 2800);
    return () => clearTimeout(t);
  }, [videoStarted]);

  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const startPos = r0 ? r0.positionSec : 0;
  // Prefer the video's REAL duration/position so progress + POI timing are
  // pixel-accurate; fall back to the route estimate / wall-clock until the
  // player reports real numbers.
  const estDur = (route?.duration_min ?? 45) * 60;
  const durationSec = vdur > 0 ? vdur : estDur;
  const estPos = Math.max(0, startPos + (elapsed - (r0 ? r0.elapsedSec : 0)));
  const positionSec = vpos > 0 ? vpos : estPos;
  const pct = Math.min(1, durationSec > 0 ? positionSec / durationSec : 0);
  const completed = pct >= 0.98;
  const freeSecs = ent.freeRideMinutes * 60;

  // Entitlement gate: on a fresh (non-resumed) ride, premium rides freely;
  // free riders spend one of their allowance (once), or hit the paywall when
  // they've used them all.
  React.useEffect(() => {
    if (!route || !ent.loaded || gatedRef.current) return;
    if (ent.premium) { gatedRef.current = true; return; }
    if (r0) { gatedRef.current = true; return; }  // resuming an already-counted ride
    gatedRef.current = true;
    if (ent.canStartRide) {
      consumeRide(rideKeyRef.current);
    } else {
      setPlaying(false);
      setPaywall(`You've used all ${ent.freeRidesLimit} free rides. Go Premium for unlimited riding.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ent.loaded, ent.premium, ent.canStartRide, r0]);

  // Free-ride length cap: end the ride at the free minute limit and offer Premium.
  React.useEffect(() => {
    if (!route || ent.premium || paywall || completed) return;
    if (elapsed >= freeSecs) {
      setPlaying(false);
      setPaywall(`Your free ride reached ${ent.freeRideMinutes} minutes. Go Premium for unlimited, full-length rides.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, ent.premium, freeSecs, route, paywall, completed]);

  // ---- FTMS auto-terrain: drive trainer gradient from the route's climb ----
  // Scenic routes carry only total elevation + distance, so we simulate gentle
  // rolling terrain around the route's AVERAGE gradient as the ride progresses.
  const avgGrade = React.useMemo(() => {
    const dist = (route?.distance_km ?? 0) * 1000;
    const elev = route?.elevation_m ?? 0;
    if (dist <= 0) return 0;
    return Math.max(0, Math.min(8, (elev / dist) * 100));
  }, [route]);
  const pctRef = React.useRef(0);
  React.useEffect(() => { pctRef.current = pct; }, [pct]);
  // Road gradient at a given distance from the route's per-km profile
  // (falls back to the route average when no profile is available).
  const gradeAtKm = React.useCallback((km: number) => {
    const profile = route?.elevation_profile ?? [];
    if (!profile.length) return avgGrade;
    let g = profile[0].grade;
    for (const pt of profile) { if (pt.km <= km) g = pt.grade; else break; }
    return g;
  }, [route, avgGrade]);
  // Live gradient at the rider's current position (for the HUD readout).
  const liveGrade = gradeAtKm(pct * (route?.distance_km ?? 0));
  React.useEffect(() => {
    if (!ble.hasTrainerControl || !autoTerrain || !playing) return;
    const dist = route?.distance_km ?? 0;
    const send = () => ble.setSimGrade(gradeAtKm(pctRef.current * dist));
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ble.hasTrainerControl, autoTerrain, playing, route, gradeAtKm]);

  const closePaywall = React.useCallback(async () => {
    const e = await refreshEntitlement();
    setPaywall(null);
    if (e.premium) { setPlaying(true); }
    else { leave(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Landscape end-of-ride recap data: discovery pins along the route + a caption.
  const rideDiscoveries = React.useMemo<RouteMapPoint[]>(
    () => [...sessionSaved]
      .map((o) => pois.find((p) => p.order === o))
      .filter((p): p is ScenicPoi => !!p)
      .sort((a, b) => a.at_pct - b.at_pct)
      .map((p) => ({ at_pct: p.at_pct, title: p.title, photo: p.image })),
    [sessionSaved, pois],
  );
  const rideCaption = React.useMemo(
    () => recapCaption({
      id: "", routeId: route?.id || "", name: route?.name || "", place: route?.place,
      country: route?.country, tag: route?.tag, elevation_m: route?.elevation_m,
      distance_km: route?.distance_km, duration_sec: elapsed, discoveries: [],
    } as any, persona?.name),
    [route, elapsed, persona],
  );
  const recapCardW = Math.min(820, width - 32);
  const recapMapW = recapCardW - 40;

  // Narrate a point-of-interest with the companion's voice; drives the waveform.
  const narrate = React.useCallback((text: string, order: number) => {
    if (narrating) { Speech.stop(); setNarrating(false); return; }
    if (!text) return;
    setNarrating(true);
    setHeard((s) => new Set(s).add(order));
    Speech.stop();
    Speech.speak(text, {
      pitch: persona.id === "adriana" ? 1.08 : 0.96,
      rate: 0.95,
      onDone: () => setNarrating(false),
      onStopped: () => setNarrating(false),
      onError: () => setNarrating(false),
    });
  }, [narrating, persona.id]);

  // Save / unsave a point of interest as a persisted discovery. Keeps the UI
  // instant (local set) while persisting to the rider's discoveries.
  const savedIds = React.useRef<Record<number, string>>({});
  React.useEffect(() => {
    if (!route) return;
    let alive = true;
    fetchDiscoveries(route.id).then((ds) => {
      if (!alive) return;
      const s = new Set<number>();
      ds.forEach((d) => { if (d.poi_order != null) { s.add(d.poi_order); savedIds.current[d.poi_order] = d.id; } });
      if (s.size) setSaved(s);
    });
    return () => { alive = false; };
  }, [route]);

  const toggleSave = React.useCallback(async (poi: ScenicPoi): Promise<boolean> => {
    if (!route) return false;
    const has = saved.has(poi.order);
    setSaved((sv) => { const n = new Set(sv); has ? n.delete(poi.order) : n.add(poi.order); return n; });
    if (has) {
      const id = savedIds.current[poi.order];
      if (id) { deleteDiscovery(id); delete savedIds.current[poi.order]; }
      setSessionSaved((s) => { const n = new Set(s); n.delete(poi.order); return n; });
      return true;
    }
    const d = await saveDiscovery({
      route_id: route.id, route_name: route.name, place: route.place,
      poi_order: poi.order, at_pct: poi.at_pct, title: poi.title,
      description: poi.description, narration: poi.narration,
      photo: poi.image || route.thumbnail || ytThumb(route.youtube_id),
    });
    if (d?.id) {
      savedIds.current[poi.order] = d.id;
      setSessionSaved((s) => new Set(s).add(poi.order));
      return true;
    }
    // Roll back the optimistic add if the save failed.
    setSaved((sv) => { const n = new Set(sv); n.delete(poi.order); return n; });
    return false;
  }, [route, saved]);

  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const acceptPrompt = React.useCallback(async () => {
    const p = discoveryPrompt;
    if (!p) return;
    setDiscoveryPrompt(null);
    if (promptTimer.current) clearTimeout(promptTimer.current);
    const ok = saved.has(p.order) ? true : await toggleSave(p);
    showToast(ok ? `Saved “${p.title}” to your scrapbook` : "Couldn't save just now — tap the bookmark to retry");
  }, [discoveryPrompt, saved, toggleSave, showToast]);

  const dismissPrompt = React.useCallback(() => {
    setDiscoveryPrompt(null);
    if (promptTimer.current) clearTimeout(promptTimer.current);
  }, []);

  // Persist an in-progress ride so it can be resumed from the Scenic hero.
  const persistResume = React.useCallback(() => {
    if (!route || completed) return;
    saveResume({ routeId: route.id, name: route.name, place: route.place, positionSec, elapsedSec: elapsed, pct });
  }, [route, completed, positionSec, elapsed, pct]);

  const endRide = async (saveState: boolean, navFn?: () => void) => {
    Speech.stop();
    if (saveState && !completed && route) {
      await persistResume();
    } else if (route) {
      await clearResume();
      await logScenicRide(route, elapsed);
    }
    (navFn ?? leave)();
  };

  // Auto-save the resume point every few seconds while riding.
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { persistResume(); }, 6000);
    return () => clearInterval(t);
  }, [playing, persistResume]);
  // Clear resume once the ride is essentially complete.
  React.useEffect(() => { if (completed) clearResume(); }, [completed]);
  // Celebrate once when the ride completes (chime + haptic, respecting Quiet).
  React.useEffect(() => {
    if (completed && !celebratedRef.current) {
      celebratedRef.current = true;
      if (audioMode !== "quiet") { try { chime.seekTo(0); chime.play(); } catch {} }
      if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    }
  }, [completed, audioMode, chime]);
  // Stop narration on unmount.
  React.useEffect(() => () => { Speech.stop(); }, []);

  // Next uncompleted point of interest along the ride.
  const upcomingPoi: ScenicPoi | null = React.useMemo(() => {
    const list = pois.filter((p) => !hiddenPoi.has(p.order));
    if (list.length === 0) return null;
    return list.find((p) => p.at_pct >= pct - 0.01) ?? list[list.length - 1];
  }, [pois, pct, hiddenPoi]);

  // Guided mode: auto-narrate a POI as the rider reaches it.
  React.useEffect(() => {
    if (audioMode !== "guided" || !upcomingPoi || narrating) return;
    if (pct >= upcomingPoi.at_pct - 0.005 && !heard.has(upcomingPoi.order)) {
      narrate(upcomingPoi.narration, upcomingPoi.order);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, upcomingPoi, audioMode]);

  // Effortless capture: when the rider reaches a POI, briefly prompt to save it
  // (one tap) — no need to open the panel. Skips already-saved / skipped POIs.
  React.useEffect(() => {
    if (!pois.length) return;
    const reached = pois.find((p) =>
      pct >= p.at_pct - 0.003 &&
      !promptedRef.current.has(p.order) &&
      !hiddenPoi.has(p.order) &&
      !saved.has(p.order));
    if (!reached) return;
    promptedRef.current.add(reached.order);
    setDiscoveryPrompt(reached);
    alertDiscovery();
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => setDiscoveryPrompt(null), 7000);
  }, [pct, pois, hiddenPoi, saved, alertDiscovery]);

  // Clear pending timers on unmount.
  React.useEffect(() => () => {
    if (promptTimer.current) clearTimeout(promptTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.yellow} />
        <Text style={s.centerText}>Loading your scenic ride…</Text>
      </View>
    );
  }
  if (error || !route) {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
        <Text style={s.centerText}>This scenic route isn’t available.</Text>
        <Pressable onPress={leave} style={s.pillBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={18} color={colors.white} />
          <Text style={s.pillBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // Cover-fit the 16:9 video to the whole screen.
  const cover = width / height > 16 / 9
    ? { w: width, h: width * 9 / 16 }
    : { w: height * 16 / 9, h: height };

  const remainingMin = Math.max(0, Math.ceil((durationSec - positionSec) / 60));
  const km = ((route.distance_km ?? 0) * pct).toFixed(1);
  const currentArea = [...pois].filter((p) => p.at_pct <= pct + 0.001).slice(-1)[0]?.title ?? (route.place || route.name);
  const upcoming = upcomingPoi?.title ?? (route.highlights?.[0] ?? "the next highlight");
  const subtitle = route.tag || "Scenic Route";

  return (
    <View style={s.root} testID="scenic-ride">
      <StatusBar style="light" hidden />

      {/* POV video — full-bleed cover. Until it starts playing we keep the
          video interactive so a tap can reach YouTube's play button (autoplay
          may be blocked in Expo Go / mobile WebViews). */}
      <View style={[s.videoWrap, { pointerEvents: videoStarted ? "none" : "auto" }]}>
        <View style={{ width: cover.w, height: cover.h, marginLeft: (width - cover.w) / 2, marginTop: (height - cover.h) / 2 }}>
          <YouTubePlayer height={cover.h} width={cover.w} playing={playing} videoId={customVideoId || route.youtube_id} startSeconds={customVideoId ? 0 : Math.floor(startPos)} onStateChange={onVideoState} onProgress={onVideoProgress} />
        </View>
      </View>

      {/* subtle legibility vignette */}
      <LinearGradient colors={["rgba(0,0,0,0.45)", "transparent", "transparent", "rgba(0,0,0,0.55)"]} style={[StyleSheet.absoluteFill as any, { pointerEvents: "none" }]} />

      {/* tap-catcher (below HUD) toggles the HUD — disabled until the video
          has started so the first tap goes to the player's play button. */}
      <Pressable style={[StyleSheet.absoluteFill as any, { pointerEvents: videoStarted ? "auto" : "none" }]} onPress={() => setHud((v) => !v)} testID="hud-toggle-scene" accessibilityRole="button" accessibilityLabel={hud ? "Hide overlay" : "Show overlay"} />

      {/* "Tap to start" fallback — non-blocking hint pointing at the play button */}
      {showTapHint && !videoStarted && (
        <View style={[s.tapHintWrap, { pointerEvents: "none" }]} testID="tap-to-start">
          <View style={s.tapHint}>
            <Ionicons name="play-circle" size={20} color={colors.bg} />
            <Text style={s.tapHintText}>Tap the video to begin your ride</Text>
          </View>
        </View>
      )}

      {/* HUD */}
      <Animated.View style={[StyleSheet.absoluteFill as any, { opacity: fade, pointerEvents: hud ? "box-none" : "none" }]}>
        {/* Title */}
        <View style={[s.title, { pointerEvents: "none" }]}>
          <GradientText text="SCENIC RIDE" style={s.titleText} />
        </View>

        {/* Music on/off + volume */}
        <MusicControl on={musicOn} level={musicLevel} onToggle={() => setMusicOn((v) => !v)} onLevel={(l) => { setMusicOn(true); setMusicLevel(l); }} />

        {/* Left — progress panel (tap to hide) */}
        {show.location && (
          <Pressable style={s.leftPanel} onPress={() => hideOne("location")} testID="hide-location" accessibilityRole="button" accessibilityLabel="Hide location panel">
            <Ionicons name="eye-off-outline" size={16} color={colors.textFaint} style={s.hideHint} />
            <View style={s.rowCenter}>
              <Ionicons name="location" size={16} color={colors.yellow} />
              <Text style={s.placeText} numberOfLines={1}>{currentArea}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.rowCenter}>
              <Ring pct={pct} />
              <View style={s.ringLabelWrap}><Text style={s.ringPct}>{Math.round(pct * 100)}%</Text></View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.metaBig}>{Math.round(pct * 100)}%</Text>
                <Text style={s.metaSub}>of route explored</Text>
              </View>
            </View>
            <View style={s.rowCenter}>
              <Ionicons name="stopwatch-outline" size={22} color={colors.white} />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.metaBig}>{remainingMin} min</Text>
                <Text style={s.metaSub}>remaining</Text>
              </View>
            </View>
            <View style={s.rowCenter} testID="live-gradient">
              <Ionicons
                name={liveGrade >= 0.5 ? "trending-up" : liveGrade <= -0.5 ? "trending-down" : "remove-outline"}
                size={22}
                color={liveGrade >= 4 ? colors.red : liveGrade >= 1 ? colors.yellow : colors.green}
              />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.metaBig}>{liveGrade > 0 ? "+" : ""}{liveGrade.toFixed(1)}%</Text>
                <Text style={s.metaSub}>gradient now</Text>
              </View>
            </View>
            {(route.elevation_profile?.length ?? 0) > 1 && (
              <View style={s.elevWrap} testID="elevation-chart">
                <Text style={s.elevLabel}>CLIMB PROFILE</Text>
                <ElevationChart profile={route.elevation_profile!} distanceKm={route.distance_km ?? 0} pct={pct} />
              </View>
            )}
            {sessionSaved.size > 0 && (
              <View style={s.savedChip}>
                <Ionicons name="bookmark" size={14} color={colors.yellow} />
                <Text style={s.savedChipText}>{sessionSaved.size} discover{sessionSaved.size === 1 ? "y" : "ies"} saved this ride</Text>
              </View>
            )}
          </Pressable>
        )}

        {/* Center — destination */}
        <View style={[s.center2, { pointerEvents: "none" }]}>
          <View style={s.rowCenter}>
            <Ionicons name="location" size={13} color={colors.yellow} />
            <Text style={s.country}>{(route.country || route.region || "").toUpperCase()}</Text>
          </View>
          <Text style={s.destination}>{route.name}</Text>
          <View style={s.rowCenter}>
            <Text style={s.destSub}>{subtitle}</Text>
            <Ionicons name="reorder-two" size={18} color={colors.yellow} style={{ marginLeft: 8 }} />
          </View>
        </View>

        {/* Right — points of interest (tap header area to hide) */}
        {show.comingUp && upcomingPoi && (
          <View style={[s.rightPanel, { pointerEvents: "box-none" }]}>
            <Pressable onPress={() => hideOne("comingUp")} testID="hide-comingup" accessibilityRole="button" accessibilityLabel="Hide points of interest" style={s.poiHead}>
              <Text style={s.comingUp}>POINTS OF INTEREST</Text>
              <Ionicons name="eye-off-outline" size={15} color={colors.textFaint} />
            </Pressable>
            <Text style={s.poiName}>{upcomingPoi.title}</Text>
            <Image source={{ uri: upcomingPoi.image || route.thumbnail || ytThumb(route.youtube_id) }} style={s.poiImg} contentFit="cover" />
            <Text style={s.poiDesc}>{upcomingPoi.description || `A scenic highlight along the ${subtitle.toLowerCase()}.`}</Text>
            <View style={s.poiActions}>
              <Pressable style={[s.hearBtn, { flex: 1 }]} testID="hear-the-story" onPress={() => narrate(upcomingPoi.narration, upcomingPoi.order)} accessibilityRole="button" accessibilityLabel={`${narrating ? "Stop" : "Hear"} the story of ${upcomingPoi.title}`}>
                <Ionicons name={narrating ? "pause" : "headset"} size={16} color="#fff" />
                <Text style={s.hearText}>{narrating ? "Stop story" : "Hear the story"}</Text>
              </Pressable>
              <Pressable style={s.poiIconBtn} testID="poi-save" onPress={() => toggleSave(upcomingPoi)} accessibilityRole="button" accessibilityLabel="Save this discovery">
                <Ionicons name={saved.has(upcomingPoi.order) ? "bookmark" : "bookmark-outline"} size={18} color={colors.yellow} />
              </Pressable>
              <Pressable style={s.poiIconBtn} testID="poi-skip" onPress={() => setHiddenPoi((h) => new Set(h).add(upcomingPoi.order))} accessibilityRole="button" accessibilityLabel="Skip this discovery">
                <Ionicons name="play-skip-forward-outline" size={18} color={colors.textDim} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Companion card (tap to hide) */}
        {show.companion && (
          <Pressable style={s.companion} onPress={() => hideOne("companion")} testID="hide-companion" accessibilityRole="button" accessibilityLabel={`Hide ${persona.name} companion`}>
            <Image source={persona.image} style={s.avatar} contentFit="cover" contentPosition="top center" />
            <View style={{ flex: 1 }}>
              <Text style={s.companionName}>{persona.name}</Text>
              <Text style={s.companionText}>
                {audioMode === "quiet"
                  ? `Riding quietly through ${currentArea}. I'll stay out of the way — tap Discover or Guided any time.`
                  : narrating
                    ? (upcomingPoi?.narration ?? `Enjoy the ${subtitle.toLowerCase()}.`)
                    : `We're passing ${currentArea}. ${audioMode === "guided" ? `I'll share a story as we reach ${upcoming}.` : `Tap "Hear the story" for ${upcoming}.`}`}
              </Text>
              <Waveform active={narrating} />
            </View>
          </Pressable>
        )}

        {/* Bottom metrics + audio mode (tap the metrics area to hide) */}
        {show.metrics && (
          <View style={[s.metricsBar, { pointerEvents: "box-none" }]}>
            <Pressable style={s.rowCenter} onPress={() => hideOne("metrics")} testID="hide-metrics" accessibilityRole="button" accessibilityLabel="Hide metrics bar">
              <Metric icon="time-outline" value={clock(elapsed)} label="Time" />
              {hasTelemetry && (
                <Metric icon="sync-outline" value={cadence != null ? String(Math.round(cadence)) : "—"} label="rpm" />
              )}
              {hasTelemetry && (
                <Metric icon="heart-outline" value={hr != null ? String(Math.round(hr)) : "—"} label="bpm" />
              )}
              <Metric icon="navigate-outline" value={km} label="km" />
            </Pressable>
            <View style={s.segment}>
              <Seg icon="leaf-outline" label="Quiet" active={audioMode === "quiet"} onPress={() => setAudio("quiet")} />
              <Seg icon="sparkles-outline" label="Discover" active={audioMode === "discover"} onPress={() => setAudio("discover")} />
              <Seg icon="headset-outline" label="Guided" active={audioMode === "guided"} onPress={() => setAudio("guided")} />
            </View>
          </View>
        )}

        {/* Bottom nav */}
        <View style={[s.nav, { pointerEvents: "box-none" }]}>
          <View style={s.navBrand}>
            <Image source={require("../assets/images/logo_glyph_t.png")} style={s.navGlyph} contentFit="contain" />
            <Image source={require("../assets/images/wordmark_t.png")} style={s.navWordmarkImg} contentFit="contain" />
          </View>
          <View style={s.navItems}>
            <NavItem icon="home-outline" label="Home" onPress={() => setPendingNav(() => () => router.replace("/"))} />
            <NavItem icon="compass-outline" label="Explore" onPress={async () => { await persistResume(); router.replace("/scenic-destinations"); }} />
            <NavItem icon="bicycle" label="Ride" active />
            <NavItem icon="map-outline" label="Journeys" onPress={() => setPendingNav(() => () => router.replace("/saved-destinations"))} />
            <NavItem icon="headset-outline" label="Audio" onPress={() => setMusicOn((v) => !v)} />
            <NavItem icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} />
            <NavItem icon="people-outline" label="Companion" onPress={() => router.push("/profile")} />
          </View>
        </View>
      </Animated.View>

      {/* Persistent utility cluster (always tappable, even when HUD hidden) */}
      <View style={[s.utility, { pointerEvents: "box-none" }]}>
        <Pressable style={s.utilBtn} onPress={() => setStreamOpen(true)} testID="scenic-source" accessibilityRole="button" accessibilityLabel="Choose ride screen source">
          <Ionicons name="tv-outline" size={20} color={customVideoId ? colors.yellow : "#fff"} />
        </Pressable>
        <Pressable style={s.utilBtn} onPress={() => setTrainerOpen(true)} testID="scenic-trainer" accessibilityRole="button" accessibilityLabel="Trainer control">
          <Ionicons name="speedometer-outline" size={20} color={ble.hasTrainerControl ? colors.yellow : "#fff"} />
        </Pressable>
        <Pressable style={s.utilBtn} onPress={() => {
          const allShown = hud && show.location && show.comingUp && show.companion && show.metrics;
          if (allShown) { setHud(false); }
          else { setHud(true); setShow({ location: true, comingUp: true, companion: true, metrics: true }); }
        }} testID="hud-toggle" accessibilityRole="button" accessibilityLabel="Show or hide overlay">
          <Ionicons name={hud ? "eye-outline" : "eye-off-outline"} size={20} color="#fff" />
        </Pressable>
        <Pressable style={s.utilBtn} onPress={() => setPlaying((p) => !p)} testID="scenic-playpause" accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"}>
          <Ionicons name={playing ? "pause" : "play"} size={20} color="#fff" />
        </Pressable>
        <Pressable style={[s.utilBtn, s.utilExit]} onPress={() => setPendingNav(() => leave)} testID="scenic-finish" accessibilityRole="button" accessibilityLabel="End ride">
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Effortless "save discovery" prompt — always visible & tappable */}
      {discoveryPrompt && (
        <DiscoveryPrompt poi={discoveryPrompt} onSave={acceptPrompt} onDismiss={dismissPrompt} />
      )}

      {/* Confirmation micro-toast */}
      {toast && <SaveToast message={toast} />}

      {/* End-of-ride landscape recap with animated route map */}
      {completed && !ackComplete && (
        <RideCompleteOverlay
          routeId={route.id}
          routeName={route.name}
          routePlace={route.place}
          elapsed={elapsed}
          km={km}
          savedCount={sessionSaved.size}
          discoveries={rideDiscoveries}
          caption={rideCaption}
          cardWidth={recapCardW}
          mapWidth={recapMapW}
          onShare={() => { setAckComplete(true); endRide(false, () => router.replace("/saved-destinations?justFinished=1")); }}
          onHome={() => { setAckComplete(true); endRide(false, () => router.replace("/")); }}
        />
      )}

      {/* Save & leave / End without saving / Continue dialog */}
      {pendingNav && (
        <LeaveRideDialog
          routeName={route.name}
          pct={pct}
          onSave={() => { const n = pendingNav; setPendingNav(null); endRide(true, n); }}
          onEnd={() => { const n = pendingNav; setPendingNav(null); endRide(false, n); }}
          onContinue={() => setPendingNav(null)}
        />
      )}

      {/* Subscription paywall — shown when free-ride allowance is exhausted */}
      <PaywallModal visible={!!paywall} onClose={closePaywall} reason={paywall || undefined} />

      {/* Ride-screen source picker: route video / own YouTube / streaming apps */}
      <StreamingSourceSheet
        visible={streamOpen}
        source={customVideoId ? "youtube" : "route"}
        onClose={() => setStreamOpen(false)}
        onPickRoute={() => setCustomVideoId(null)}
        onPickYouTube={(id) => { setCustomVideoId(id); setPlaying(true); }}
      />

      {/* FTMS smart-trainer control — ERG / resistance / gradient (+ auto terrain) */}
      <TrainerControlPanel
        visible={trainerOpen}
        onClose={() => setTrainerOpen(false)}
        hasControl={ble.hasTrainerControl}
        mode={ble.controlMode}
        power={ble.readings.power}
        auto={autoTerrain}
        onToggleAuto={setAutoTerrain}
        onErg={ble.setErgWatts}
        onResistance={ble.setResistance}
        onGrade={ble.setSimGrade}
        onReset={ble.resetTrainer}
        context="scenic"
      />
    </View>
  );
}

const PANEL = "rgba(14,18,20,0.55)";
const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05060a" },
  center: { flex: 1, backgroundColor: "#05060a", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center" },
  pillBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  pillBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  videoWrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#000" },

  rowCenter: { flexDirection: "row", alignItems: "center" },

  title: { position: "absolute", top: 26, left: 30 },
  titleText: { fontSize: 30, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },

  hideHint: { position: "absolute", top: 10, right: 10, opacity: 0.6 },

  leftPanel: { position: "absolute", top: 150, left: 24, width: 262, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 20, gap: 18 },
  placeText: { color: colors.white, fontSize: 17, fontWeight: "700", marginLeft: 10, flex: 1 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.14)" },
  ringLabelWrap: { position: "absolute", width: 54, alignItems: "center" },
  ringPct: { color: colors.white, fontSize: 12, fontWeight: "800" },
  metaBig: { color: colors.white, fontSize: 22, fontWeight: "800" },
  metaSub: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 1 },
  elevWrap: { marginTop: 4 },
  elevLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },

  center2: { position: "absolute", top: 70, alignSelf: "center", alignItems: "center", width: "100%" },
  country: { color: colors.white, fontSize: 13, fontWeight: "800", letterSpacing: 3, marginLeft: 6 },
  destination: { color: colors.white, fontFamily: SERIF, fontSize: 52, fontWeight: "700", marginTop: 2, ...(Platform.OS === "web" ? { textShadow: "0px 2px 18px rgba(0,0,0,0.6)" } : { textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 18, textShadowOffset: { width: 0, height: 2 } }) },
  destSub: { color: colors.white, fontSize: 17, fontWeight: "500", letterSpacing: 0.4 },

  rightPanel: { position: "absolute", top: 150, right: 24, width: 300, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 20 },
  comingUp: { color: colors.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  poiName: { color: colors.white, fontFamily: SERIF, fontSize: 26, fontWeight: "700", marginTop: 4, marginBottom: 12 },
  poiImg: { width: "100%", height: 150, borderRadius: radius.md, backgroundColor: "#0E1512" },
  poiDesc: { color: colors.textDim, fontSize: 13.5, lineHeight: 20, marginTop: 12 },
  hearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, minHeight: 46 },
  hearText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  poiHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  poiActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  poiIconBtn: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: BORDER },

  companion: { position: "absolute", left: 24, bottom: 168, width: 420, flexDirection: "row", gap: 14, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.yellow, backgroundColor: "#0E1512" },
  companionName: { color: colors.yellow, fontSize: 16, fontWeight: "700", fontStyle: "italic" },
  companionText: { color: "rgba(255,255,255,0.9)", fontSize: 13.5, lineHeight: 20, marginTop: 3 },

  metricsBar: { position: "absolute", bottom: 92, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(14,18,20,0.72)", borderRadius: radius.pill, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10 },
  segment: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radius.pill, padding: 4, marginLeft: 6, gap: 2 },

  nav: { position: "absolute", bottom: 16, left: 24, right: 24, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,10,10,0.78)", borderRadius: radius.pill, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 20, paddingVertical: 12 },
  navBrand: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 22, marginRight: 8, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  navGlyph: { width: 30, height: 30 },
  navWordmarkImg: { width: 132, height: 22 },
  navItems: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },

  utility: { position: "absolute", top: 24, right: 24, flexDirection: "row", gap: 10, zIndex: 20 },
  tapHintWrap: { position: "absolute", left: 0, right: 0, bottom: "34%", alignItems: "center", zIndex: 15 },
  tapHint: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  tapHintText: { color: colors.bg, fontSize: 13.5, fontWeight: "800" },
  savedChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,194,10,0.12)", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", paddingVertical: 7, paddingHorizontal: 12, alignSelf: "flex-start" },
  savedChipText: { color: colors.yellow, fontSize: 12, fontWeight: "800" },
  utilBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: BORDER },
  utilExit: { backgroundColor: "rgba(224,30,43,0.85)", borderColor: colors.red },
});
