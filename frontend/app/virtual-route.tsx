import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { useTelemetry } from "@/src/hooks/useTelemetry";
import { useBleSensors } from "@/src/hooks/useBleSensors";
import { BleSensorsPanel } from "@/src/components/BleSensorsPanel";
import { RouteProfile } from "@/src/components/virtual-route/RouteProfile";
import { riderVisualFor } from "@/src/lib/virtual-riders";
import { RIDER_TYPES, BIKE_TYPES, CLOTHING_STYLES, DEFAULT_APPEARANCE, loadAppearance, RiderAppearanceConfiguration } from "@/src/lib/rider-config";
import { VIRTUAL_ROUTES, getVRoute, routeStateAt, routeTerrainBias } from "@/src/lib/vroutes";
import { VirtualRouteScene, SceneTelemetry } from "@/src/components/virtual-route/scene";
import { VirtualRidePlayer } from "@/src/components/virtual-route/VirtualRidePlayer";
import { prTracker, prToastMessages, PRRecords, PRSummary, fetchAllRoutePRs, fmtPRTime } from "@/src/lib/pr-tracker";
import { EndPrompt } from "@/src/components/workout/WorkoutModals";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;


type RideSummary = {
  distanceKm: number;
  durationSec: number;
  avgPower: number;
  avgSpeed: number;
  avgCadence: number;
  avgHr: number;
  calories: number;
  reached: number;
  total: number;
  routeName: string;
};

function buildSummary(
  samples: { power: number; hr: number; cadence: number; speed: number }[],
  distanceKm: number,
  rawDurationSec: number,
  vroute: ReturnType<typeof getVRoute>,
): RideSummary {
  const n = samples.length;
  const mean = (k: "power" | "cadence" | "speed") => (n ? samples.reduce((a, x) => a + (x[k] || 0), 0) / n : 0);
  const hrs = samples.filter((x) => x.hr > 0);
  const avgPower = Math.round(mean("power"));
  const durationSec = Math.max(0, Math.round(rawDurationSec));
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationSec,
    avgPower,
    avgSpeed: Math.round(mean("speed") * 10) / 10,
    avgCadence: Math.round(mean("cadence")),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, x) => a + x.hr, 0) / hrs.length) : 0,
    calories: Math.round((avgPower * durationSec / 1000) * 0.7),
    reached: vroute.checkpoints.filter((c) => c.km <= distanceKm).length,
    total: vroute.checkpoints.length,
    routeName: vroute.name,
  };
}

export default function VirtualRouteScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const { telemetry, connectionState, stale, sendErg, sendTarget, sendSensor, simulateDropout, pause, resume } = useTelemetry();
  const ble = useBleSensors();
  const [showBle, setShowBle] = React.useState(false);

  // Push real Bluetooth sensor readings into the telemetry stream (overrides sim).
  React.useEffect(() => {
    if (ble.readings.ts <= 0 || connectionState !== "connected") return;
    sendSensor({ power: ble.readings.power, cadence: ble.readings.cadence, hr: ble.readings.hr });
  }, [ble.readings.ts, connectionState, sendSensor]);

  const [appearance, setAppearance] = React.useState<RiderAppearanceConfiguration>(DEFAULT_APPEARANCE);
  const [routeId, setRouteId] = React.useState(VIRTUAL_ROUTES[0].id);
  const [phase, setPhase] = React.useState<"setup" | "riding" | "paused">("setup");
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [autoResistance, setAutoResistance] = React.useState(true);
  const [emergency, setEmergency] = React.useState(false);
  const rider = riderVisualFor(appearance.riderType);
  const vroute = getVRoute(routeId);

  // Load persisted rider appearance on mount and whenever we return from the
  // customisation screen (persists until the user changes it again).
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      loadAppearance().then((cfg) => { if (alive) setAppearance(cfg); });
      fetchAllRoutePRs().then((m) => { if (alive) setPrByRoute(m); });
      return () => { alive = false; };
    }, []),
  );

  // Recorded telemetry + ride-relative timing for the end-of-ride summary/save.
  const samplesRef = React.useRef<{ power: number; hr: number; cadence: number; speed: number }[]>([]);
  const startElapsedRef = React.useRef(0);
  const [summary, setSummary] = React.useState<null | RideSummary>(null);
  const [saving, setSaving] = React.useState(false);
  const [prRecords, setPrRecords] = React.useState<PRRecords | null>(null);
  const [endPrompt, setEndPrompt] = React.useState(false);
  const [prByRoute, setPrByRoute] = React.useState<Record<string, PRSummary>>({});

  // Local route distance integrated from speed while riding.
  const distRef = React.useRef(0);
  const lastElRef = React.useRef<number | null>(null);
  const [distanceKm, setDistanceKm] = React.useState(0);

  // Smoothed telemetry (EMA) so the animation never jitters.
  const smRef = React.useRef({ power: 0, cadence: 0, speed: 0, hr: 0 });
  const [sm, setSm] = React.useState({ power: 0, cadence: 0, speed: 0, hr: 0 });

  const running = phase === "riding";

  React.useEffect(() => {
    const a = 0.16;
    const s = smRef.current;
    s.power += (telemetry.power - s.power) * a;
    s.cadence += (telemetry.cadence - s.cadence) * a;
    s.speed += (telemetry.speed - s.speed) * a;
    s.hr += (telemetry.hr - s.hr) * a;
    setSm({ power: Math.round(s.power), cadence: Math.round(s.cadence), speed: Math.round(s.speed * 10) / 10, hr: Math.round(s.hr) });

    if (running) {
      samplesRef.current.push({ power: telemetry.power, hr: telemetry.hr, cadence: telemetry.cadence, speed: telemetry.speed });
      const prev = lastElRef.current;
      lastElRef.current = telemetry.elapsed;
      const dt = prev == null ? 0 : telemetry.elapsed - prev;
      if (dt > 0 && dt < 5) {
        distRef.current = Math.min(vroute.distanceKm, distRef.current + (telemetry.speed / 3600) * dt);
        setDistanceKm(distRef.current);
        const prog = vroute.distanceKm > 0 ? distRef.current / vroute.distanceKm : 0;
        prTracker.mark(prog, telemetry.elapsed - startElapsedRef.current);
      }
    }
  }, [telemetry.elapsed, running]);

  const route = routeStateAt(vroute, distanceKm);
  const terrainBias = routeTerrainBias(vroute.id);
  // ERG resistance target (%) — steep gradient response + per-route terrain bias.
  const resistanceTarget = Math.round(Math.max(55, Math.min(150, 100 + route.gradient * 7 + terrainBias)));

  // Auto trainer resistance follows the route gradient + terrain (progressive, clamped).
  React.useEffect(() => {
    if (!running || !autoResistance || emergency) return;
    sendErg(resistanceTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, autoResistance, emergency, resistanceTarget]);

  const sensorsOn = telemetry.source === "trainer" || ble.connected.length > 0;
  const hrOn = telemetry.hr > 0;
  const scene: SceneTelemetry = {
    power: sm.power, cadence: sm.cadence, speed: sm.speed, hr: hrOn ? sm.hr : 0,
    gradient: route.gradient, curve: route.curve,
    moving: running, connected: connectionState === "connected", reducedMotion,
    simulation: !sensorsOn, emergencyStop: emergency,
  };

  const conn = deriveConnection(connectionState, stale, sensorsOn);

  const startRide = () => {
    distRef.current = 0; lastElRef.current = null; setDistanceKm(0);
    samplesRef.current = []; startElapsedRef.current = telemetry.elapsed;
    setSummary(null); setPrRecords(null); prTracker.reset(vroute); resume(); setPhase("riding");
  };
  const pauseRide = () => { pause(); setPhase("paused"); };
  const resumeRide = () => { resume(); setPhase("riding"); };
  // Tapping End Ride now opens a confirm popup (matching the Live Workout screen).
  const requestEnd = () => { pause(); setPhase("paused"); setEndPrompt(true); };
  const onResumeEnd = () => { setEndPrompt(false); resumeRide(); };
  const onAbandonEnd = () => { setEndPrompt(false); exitRide(); };
  const onSaveEnd = async () => {
    setEndPrompt(false);
    const dur = telemetry.elapsed - startElapsedRef.current;
    const sum = buildSummary(samplesRef.current, distRef.current, dur, vroute);
    setSummary(sum);
    // Log this attempt against the rider's records for this scenic route.
    const completed = distRef.current >= vroute.distanceKm - 0.05;
    prTracker.submit({ avgPower: sum.avgPower, timeSec: dur, completed }).then((records) => {
      if (records && (records.route_time || records.route_power || records.first_time || records.segments.length)) {
        setPrRecords(records);
      }
      fetchAllRoutePRs().then(setPrByRoute);
    });
    // Persist the ride to history (best-effort — never blocks the results view).
    setSaving(true);
    try {
      const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
      await fetch(`${base}/api/workouts/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workout: `Virtual Ride · ${vroute.name}`,
          workout_id: `virtual-${vroute.id}`,
          route: { id: vroute.id, name: vroute.name, place: vroute.place, distance: `${sum.distanceKm} km`, elevation: `${vroute.elevationM} m`, tag: vroute.tag },
          elapsed: sum.durationSec,
          ftp: 250,
          samples: samplesRef.current,
          est_calories: sum.calories,
        }),
      });
    } catch {
      /* history save is best-effort */
    } finally {
      setSaving(false);
    }
  };
  // Ending a ride returns to the setup screen (pick another route/rider).
  const exitRide = () => {
    pause();
    setSummary(null);
    distRef.current = 0; lastElRef.current = null; setDistanceKm(0);
    samplesRef.current = [];
    setPhase("setup");
  };
  // Leave the Virtual Route feature entirely (back to the app).
  const leaveScreen = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };
  const emergencyStop = () => { setEmergency(true); setAutoResistance(false); sendErg(50); };

  // Route checkpoints as vertical "stages" for the shared HUD rail.
  const upIdx = vroute.checkpoints.findIndex((c) => distanceKm < c.km);
  const vStages = vroute.checkpoints.map((c, idx) => ({
    label: c.label,
    sub: `${c.km} km`,
    state: (distanceKm >= c.km ? "done" : idx === upIdx ? "active" : "upcoming") as "done" | "active" | "upcoming",
  }));

  return (
    <View style={s.root}>
      <StatusBar hidden />

      {phase === "setup" ? (
        // Cinematic wide scene sits behind the setup card.
        <VirtualRouteScene rider={rider} appearance={appearance} align={vroute.riderAlign} bgScale={vroute.bgScale} bgShiftY={vroute.bgShiftY} backdrop={vroute.backdrop} telemetry={scene} showBrand />
      ) : (
        // Shared immersive Virtual Ride player — identical to the Live Workout fullscreen.
        <VirtualRidePlayer
          mode="fullscreen"
          vroute={vroute}
          routeState={route}
          appearance={appearance}
          metrics={{ power: sm.power, cadence: sm.cadence, speed: sm.speed, hr: sm.hr, elapsed: Math.max(0, telemetry.elapsed - startElapsedRef.current), riddenKm: distanceKm }}
          paused={!running}
          connected={connectionState === "connected"}
          simulation={!sensorsOn}
          hrOn={hrOn}
          load={resistanceTarget}
          compact={compact}
          reducedMotion={reducedMotion}
          onToggleReducedMotion={() => setReducedMotion((r) => !r)}
          stages={vStages}
          connLabel={conn.label}
          connTone={conn.tone}
          onPauseToggle={running ? pauseRide : resumeRide}
          onPreset={(w) => sendTarget(w)}
          ergOn={autoResistance && !emergency}
          onErgToggle={() => setAutoResistance((a) => !a)}
          onReconnect={simulateDropout}
          exitLabel="End Ride"
          exitIcon="stop"
          onExitFullscreen={requestEnd}
          onSensors={() => setShowBle(true)}
          sensorsOn={ble.connected.length > 0}
          onEmergency={emergencyStop}
        />
      )}

      {/* Setup overlay: rider selection + start */}
      {phase === "setup" && (
        <SafeAreaView style={s.setup} edges={["top", "bottom", "right"]}>
          <ScrollView contentContainerStyle={s.setupScroll} showsVerticalScrollIndicator={false}>
            <View style={s.setupCard}>
              <Pressable onPress={leaveScreen} testID="vr-exit" style={s.exitBtn} accessibilityRole="button" accessibilityLabel="Exit Virtual Routes" hitSlop={10}>
                <Ionicons name="chevron-back" size={24} color={colors.white} />
                <Text style={s.exitText}>Exit</Text>
              </Pressable>
              <Text style={s.routeName}>{vroute.name}</Text>
              <Text style={s.routePlace}>{vroute.place} · {vroute.distanceKm} km · {vroute.tag}</Text>
              <RouteProfile vroute={vroute} progress={0} height={46} />

              <Text style={s.sectionLabel}>CHOOSE YOUR ROUTE</Text>
              <View style={s.routeList}>
                {VIRTUAL_ROUTES.map((rt) => {
                  const sel = rt.id === routeId;
                  const best = prByRoute[rt.id]?.best_time_sec;
                  return (
                    <Pressable key={rt.id} onPress={() => setRouteId(rt.id)} testID={`route-${rt.id}`} style={[s.routeOpt, sel && s.routeOptSel]} accessibilityRole="button" accessibilityLabel={`Select ${rt.name}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.routeOptName} numberOfLines={1}>{rt.name}</Text>
                        <Text style={s.routeOptMeta} numberOfLines={1}>{rt.distanceKm} km · {rt.tag}</Text>
                      </View>
                      {best ? (
                        <View style={s.prChip} testID={`route-pr-${rt.id}`}>
                          <Ionicons name="trophy" size={11} color={colors.yellow} />
                          <Text style={s.prChipText}>{fmtPRTime(best)}</Text>
                        </View>
                      ) : null}
                      <Ionicons name={sel ? "checkmark-circle" : "chevron-forward"} size={18} color={sel ? colors.yellow : colors.textFaint} />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={s.sectionLabel}>YOUR RIDER</Text>
              <Pressable onPress={() => router.push("/rider-customise")} testID="vr-customise-rider" style={s.riderSummary} accessibilityRole="button" accessibilityLabel="Customise your rider">
                <Image source={rider.sprite} style={s.riderSummaryThumb} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={s.riderSummaryName} numberOfLines={1}>{RIDER_TYPES.find((r) => r.id === appearance.riderType)?.label}</Text>
                  <Text style={s.riderSummaryMeta} numberOfLines={1}>
                    {BIKE_TYPES.find((b) => b.id === appearance.bikeType)?.label} · {CLOTHING_STYLES.find((c) => c.id === appearance.clothingStyle)?.label}
                  </Text>
                </View>
                <View style={s.customiseBtn}>
                  <Ionicons name="options" size={15} color={colors.yellow} />
                  <Text style={s.customiseText}>Customise</Text>
                </View>
              </Pressable>

              <View style={s.setupRow}>
                <View style={[s.connPill, s.connPillInline, { borderColor: conn.tone + "88", backgroundColor: conn.tone + "22" }]}>
                  <View style={[s.connDot, { backgroundColor: conn.tone }]} />
                  <Text style={s.connText}>{conn.label}</Text>
                </View>
                <Text style={s.simNote}>Simulated ride mode available — no equipment required.</Text>
              </View>

              <Pressable onPress={() => setShowBle(true)} testID="vr-pair-sensors" style={s.pairBtn} accessibilityRole="button" accessibilityLabel="Pair Bluetooth sensors">
                <Ionicons name="bluetooth" size={16} color={ble.connected.length > 0 ? colors.green : colors.white} />
                <Text style={s.pairText}>{ble.connected.length > 0 ? `${ble.connected.length} sensor${ble.connected.length > 1 ? "s" : ""} connected` : "Pair Bluetooth sensors"}</Text>
              </Pressable>

              <Pressable onPress={startRide} testID="start-ride" style={s.startBtn} accessibilityRole="button" accessibilityLabel="Start ride">
                <Ionicons name="play" size={20} color={colors.bg} />
                <Text style={s.startText}>START RIDE</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      )}

      {/* End-ride confirmation popup (same as the Live Workout screen) */}
      {endPrompt && (
        <EndPrompt onSave={onSaveEnd} onAbandon={onAbandonEnd} onResume={onResumeEnd} />
      )}

      {/* End-of-ride summary shown after saving */}
      {summary && (
        <View style={s.summaryOverlay}>
          <View style={s.summaryCard} testID="vr-summary">
            <View style={s.summaryHead}>
              <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              <Text style={s.summaryTitle}>Ride Saved</Text>
            </View>
            <Text style={s.summarySub}>{summary.routeName} · {summary.reached}/{summary.total} checkpoints</Text>

            <View style={s.summaryGrid}>
              <SumCell label="DISTANCE" value={`${summary.distanceKm}`} unit="km" />
              <SumCell label="TIME" value={mmss(summary.durationSec)} unit="" />
              <SumCell label="AVG POWER" value={`${summary.avgPower}`} unit="W" />
              <SumCell label="AVG SPEED" value={`${summary.avgSpeed}`} unit="km/h" />
              <SumCell label="AVG CADENCE" value={`${summary.avgCadence}`} unit="rpm" />
              <SumCell label="AVG HR" value={summary.avgHr ? `${summary.avgHr}` : "—"} unit="bpm" />
              <SumCell label="CALORIES" value={`${summary.calories}`} unit="kcal" />
            </View>

            {prRecords && prToastMessages(prRecords, summary.routeName).length > 0 && (
              <View style={s.prBanner} testID="vr-pr-banner">
                <View style={s.prBadge}><Ionicons name="trophy" size={18} color={colors.bg} /></View>
                <View style={{ flex: 1 }}>
                  {prToastMessages(prRecords, summary.routeName).map((m, i) => (
                    <Text key={i} style={s.prBannerText}>{m}</Text>
                  ))}
                </View>
              </View>
            )}

            <Pressable onPress={exitRide} disabled={saving} testID="vr-summary-done" style={[s.summarySave, saving && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Done">
              <Ionicons name="checkmark-circle" size={18} color={colors.bg} />
              <Text style={s.summarySaveText}>{saving ? "Saving…" : "Done"}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Bluetooth sensor pairing */}
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
    </View>
  );
}

function SumCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={s.sumCell}>
      <Text style={s.sumValue}>{value}<Text style={s.sumUnit}> {unit}</Text></Text>
      <Text style={s.sumLabel}>{label}</Text>
    </View>
  );
}

function deriveConnection(state: string, stale: boolean, sensorsOn: boolean): { label: string; tone: string } {
  if (state === "connecting") return { label: "Connecting…", tone: colors.yellow };
  if (state === "reconnecting") return { label: "Signal lost — reconnecting", tone: colors.yellow };
  if (state === "disconnected") return { label: "Device disconnected", tone: colors.red };
  if (stale) return { label: "Signal temporarily lost", tone: colors.yellow };
  if (!sensorsOn) return { label: "Simulated ride mode", tone: "#5AC8FA" };
  return { label: "Connected", tone: colors.green };
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05060a" },
  topRight: { position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  connPill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  connPillInline: { alignSelf: "flex-start" },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: colors.border },
  iconBtnOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  iconBtnDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.border },

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

  minBar: { position: "absolute", left: 12, right: 12, bottom: 78, flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: "rgba(10,11,14,0.7)", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  miniStat: {},
  miniValue: { color: colors.white, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  miniUnit: { color: colors.textFaint, fontSize: 10, fontWeight: "700" },
  miniLabel: { color: colors.textFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.8 },
  minProgress: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  minFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },

  controls: { position: "absolute", left: 0, right: 0, bottom: 0 },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: "wrap" },
  spacer: { flex: 1, minWidth: 8 },
  ctrlBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  ctrlText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  presetChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: colors.yellow + "44", borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  presetText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  setup: { position: "absolute", top: 0, right: 0, bottom: 0, width: 460, maxWidth: "94%" },
  setupScroll: { padding: 16, flexGrow: 1, justifyContent: "center" },
  setupCard: { backgroundColor: "rgba(10,11,14,0.82)", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 12, ...(shadow.card as any) },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 12, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1.5, borderColor: colors.border },
  exitText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  routeName: {color: colors.white, fontSize: 24, fontWeight: "900" },
  routePlace: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: -6 },
  sectionLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  riderSummary: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  riderSummaryThumb: { width: 52, height: 64, backgroundColor: "#0d0f14", borderRadius: radius.sm },
  riderSummaryName: { color: colors.white, fontSize: 14, fontWeight: "800" },
  riderSummaryMeta: { color: colors.textFaint, fontSize: 12, fontWeight: "600", marginTop: 2 },
  customiseBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.yellow + "88", backgroundColor: colors.yellow + "18" },
  customiseText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  setupRow: { gap: 8, marginTop: 4 },
  simNote: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  pairBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, marginTop: 4 },
  pairText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 14, marginTop: 4, ...(shadow.glow as any) },
  startText: { color: colors.bg, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },

  routeList: { gap: 8 },
  routeOpt: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48 },
  routeOptSel: { borderColor: colors.yellow, backgroundColor: colors.yellow + "14" },
  routeOptName: { color: colors.white, fontSize: 13, fontWeight: "800" },
  routeOptMeta: { color: colors.textFaint, fontSize: 11, fontWeight: "600", marginTop: 2 },
  prChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.yellow + "18", borderWidth: 1, borderColor: colors.yellow + "55", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  prChipText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },

  summaryOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
  summaryCard: { width: 440, maxWidth: "94%", backgroundColor: "rgba(14,15,19,0.98)", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 12, ...(shadow.card as any) },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryTitle: { color: colors.white, fontSize: 20, fontWeight: "900" },
  summarySub: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: -6 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sumCell: { width: "30%", flexGrow: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  sumValue: { color: colors.white, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sumUnit: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
  sumLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  summarySave: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 14, marginTop: 2, ...(shadow.glow as any) },
  summarySaveText: { color: colors.bg, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  prBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.yellow + "18", borderWidth: 1, borderColor: colors.yellow + "66", borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  prBadge: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellow },
  prBannerText: { color: colors.white, fontSize: 13.5, fontWeight: "700", lineHeight: 19 },
  summaryDiscard: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  summaryDiscardText: { color: colors.textDim, fontSize: 14, fontWeight: "800" },
});
