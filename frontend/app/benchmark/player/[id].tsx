import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest } from "@/src/lib/benchmark/catalog";
import { useSettings } from "@/src/lib/settings";
import { POWER_REQUIRED, POWER_PREFERRED } from "@/src/lib/benchmark/setup";
import {
  kindToState, targetWatts, STATE_LABEL, STOP_REASONS, SAFETY_GUIDANCE, coachPrompt,
  simulateReadings, RAMP_STEP_OPTIONS, type WorkoutState,
} from "@/src/lib/benchmark/player";

function apiBase() { return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, ""); }
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function WorkoutPlayerScreen() {
  const router = useRouter();
  const { id, session } = useLocalSearchParams<{ id: string; session?: string }>();
  const testId = String(id);
  const test = getBenchmarkTest(testId);
  const { settings } = useSettings();
  const ftp = settings.ftp || 250;
  const storeKey = `bm:player:${testId}`;

  const steps = React.useMemo(() => {
    if (!test) return [];
    return test.intervals.map((iv) => ({
      iv,
      state: kindToState(iv.kind),
      target: targetWatts(iv, ftp),
      cadenceTarget: iv.cadenceLow && iv.cadenceHigh ? Math.round((iv.cadenceLow + iv.cadenceHigh) / 2) : undefined,
      isRamp: iv.targetType === "ramp",
      duration: iv.durationSec,
    }));
  }, [test, ftp]);

  const [runState, setRunState] = React.useState<WorkoutState>("ready");
  const [stepIdx, setStepIdx] = React.useState(0);
  const [stepElapsed, setStepElapsed] = React.useState(0);
  const [totalElapsed, setTotalElapsed] = React.useState(0);
  const [rampTarget, setRampTarget] = React.useState(0);
  const [rampStep, setRampStep] = React.useState(20);
  const [readings, setReadings] = React.useState({ power: 0, hr: 0, cadence: 0 });
  const [p3, setP3] = React.useState(0);
  const [avgIv, setAvgIv] = React.useState(0);
  const [rpe, setRpe] = React.useState(5);
  const [fade, setFade] = React.useState(0);
  const [pauseTotal, setPauseTotal] = React.useState(0);
  const [showPauseWarn, setShowPauseWarn] = React.useState(false);
  const [showStop, setShowStop] = React.useState(false);
  const [stoppedReason, setStoppedReason] = React.useState<string | null>(null);
  const [safety, setSafety] = React.useState(false);
  const [recoveryPrompt, setRecoveryPrompt] = React.useState(false);

  const pRoll = React.useRef<number[]>([]);
  const ivAcc = React.useRef<{ sum: number; n: number }>({ sum: 0, n: 0 });
  const savedRef = React.useRef<any>(null);
  const running = ["warmup", "main", "recovery", "cooldown"].includes(runState);

  // Metric relevance
  const powerTest = !!test && (POWER_REQUIRED.has(test.id) || POWER_PREFERRED.has(test.id));
  const primary: "power" | "hr" | "cadence" = test?.id === "cadence_control" ? "cadence" : test?.id === "recovery_response" ? "hr" : "power";
  const step = steps[stepIdx];
  const curTarget = step?.isRamp ? rampTarget : (step?.target ?? 0);
  const remaining = step && !step.isRamp ? Math.max(0, step.duration - stepElapsed) : 0;

  // ── Refresh recovery check ──
  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storeKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && ["warmup", "main", "recovery", "cooldown", "paused"].includes(saved.runState)) {
            savedRef.current = saved;
            setRecoveryPrompt(true);
          } else {
            await AsyncStorage.removeItem(storeKey);
          }
        }
      } catch { /* noop */ }
    })();
  }, [storeKey]);

  const persist = React.useCallback((extra?: any) => {
    const snap = { testId, stepIdx, stepElapsed, totalElapsed, runState, rampTarget, pauseTotal, ...extra };
    AsyncStorage.setItem(storeKey, JSON.stringify(snap)).catch(() => {});
  }, [testId, stepIdx, stepElapsed, totalElapsed, runState, rampTarget, pauseTotal, storeKey]);

  const patchSession = React.useCallback((status: string, extra?: any) => {
    if (!session) return;
    fetch(`${apiBase()}/api/benchmark/sessions/${session}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, usingDevData: true, ...extra }),
    }).catch(() => {});
  }, [session]);

  // ── Ticker ──
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setTotalElapsed((v) => v + 1);
      setStepElapsed((se) => {
        const cur = steps[stepIdx];
        if (!cur) return se;
        const ne = se + 1;
        // ramp: bump target each rampStepSec
        if (cur.isRamp) {
          const stepSec = cur.iv.rampStepSec || 60;
          if (ne % stepSec === 0) setRampTarget((rt) => rt + rampStep);
        }
        // simulate telemetry
        const tgt = cur.isRamp ? rampTargetRef.current : cur.target;
        const r = simulateReadings(tgt, cur.state, cur.cadenceTarget, fadeRef.current);
        setReadings(r);
        pRoll.current = [...pRoll.current, r.power].slice(-3);
        setP3(Math.round(pRoll.current.reduce((a, b) => a + b, 0) / pRoll.current.length));
        ivAcc.current.sum += r.power; ivAcc.current.n += 1;
        setAvgIv(Math.round(ivAcc.current.sum / ivAcc.current.n));
        if (ne % 3 === 0) persist();
        // advance timed steps
        if (!cur.isRamp && ne >= cur.duration) {
          const next = stepIdx + 1;
          ivAcc.current = { sum: 0, n: 0 };
          pRoll.current = [];
          if (next >= steps.length) {
            setRunState("completed");
            AsyncStorage.removeItem(storeKey).catch(() => {});
            patchSession("completed", { completedAt: new Date().toISOString(), rpe });
          } else {
            setStepIdx(next);
            setRunState(steps[next].state);
          }
          return 0;
        }
        return ne;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, stepIdx, steps, rampStep, fade, persist, patchSession, rpe, storeKey]);

  // refs to read latest values inside interval
  const rampTargetRef = React.useRef(rampTarget); rampTargetRef.current = rampTarget;
  const fadeRef = React.useRef(fade); fadeRef.current = fade;

  if (!test) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.missing}><Text style={s.dim}>Benchmark not found.</Text>
          <Pressable onPress={() => router.replace("/benchmark")} style={s.ghost}><Text style={s.ghostText}>Back to Benchmark Workouts</Text></Pressable></View>
      </SafeAreaView>
    );
  }

  const begin = () => {
    setStepIdx(0); setStepElapsed(0); setTotalElapsed(0);
    ivAcc.current = { sum: 0, n: 0 }; pRoll.current = [];
    if (steps[0]?.isRamp) setRampTarget(steps[0].iv.rampStartWatts || 100);
    setRunState(steps[0]?.state ?? "main");
    patchSession("in_progress", { startedAt: new Date().toISOString() });
  };
  const doPause = () => {
    if (test.effort === "maximal") { setShowPauseWarn(true); return; }
    setRunState("paused");
  };
  const confirmPause = () => { setShowPauseWarn(false); setRunState("paused"); };
  const resume = () => { setPauseTotal((p) => p); setRunState(step?.state ?? "main"); };
  const pickStop = (rid: string, isSafety?: boolean) => {
    setShowStop(false); setStoppedReason(rid); setSafety(!!isSafety);
    setRunState("stopped_early");
    AsyncStorage.removeItem(storeKey).catch(() => {});
    patchSession("stopped_early", { stopReason: rid, endedAt: new Date().toISOString(), rpe });
  };
  const restoreSaved = () => {
    const sv = savedRef.current; if (!sv) return;
    setStepIdx(sv.stepIdx ?? 0); setStepElapsed(sv.stepElapsed ?? 0); setTotalElapsed(sv.totalElapsed ?? 0);
    setRampTarget(sv.rampTarget ?? 0); setPauseTotal(sv.pauseTotal ?? 0);
    setRunState("paused"); setRecoveryPrompt(false);
  };
  const endSaved = () => { AsyncStorage.removeItem(storeKey).catch(() => {}); setRecoveryPrompt(false); router.replace("/benchmark"); };
  const saveIncomplete = () => { AsyncStorage.removeItem(storeKey).catch(() => {}); patchSession("incomplete"); setRecoveryPrompt(false); router.replace("/benchmark"); };

  const cue = coachPrompt(runState, remaining, step?.iv.cue);
  const progress = steps.length ? Math.min(1, (stepIdx + (step && !step.isRamp ? stepElapsed / Math.max(1, step.duration) : 0)) / steps.length) : 0;

  const primaryValue = primary === "power" ? readings.power : primary === "hr" ? readings.hr : readings.cadence;
  const primaryUnit = primary === "power" ? "W" : primary === "hr" ? "bpm" : "rpm";
  const primaryLabel = primary === "power" ? "POWER" : primary === "hr" ? "HEART RATE" : "CADENCE";

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.topBar}>
        <Text style={s.testName} numberOfLines={1}>{test.name}</Text>
        <View style={s.stateChip}><Text style={s.stateChipText}>{STATE_LABEL[runState]}</Text></View>
        <View style={s.devBadge}><Text style={s.devText}>SIM DATA</Text></View>
      </View>
      <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress * 100}%` }]} /></View>

      {runState === "ready" ? (
        <ScrollView contentContainerStyle={s.readyWrap}>
          <Ionicons name={test.icon} size={40} color={CC.rouge} />
          <Text style={s.readyTitle}>{test.name}</Text>
          <View style={s.coachCard}><Ionicons name="chatbubble-ellipses-outline" size={16} color={CC.rouge} /><Text style={s.coachText}>{cue}</Text></View>
          {steps[0]?.isRamp && (
            <View style={s.rampCfg}>
              <Text style={s.dim}>Ramp increase per minute</Text>
              <View style={s.rampRow}>
                {RAMP_STEP_OPTIONS.map((w) => (
                  <Pressable key={w} testID={`ramp-${w}`} onPress={() => setRampStep(w)} style={[s.rampBtn, rampStep === w && s.rampBtnOn]}>
                    <Text style={[s.rampBtnText, rampStep === w && { color: "#fff" }]}>{w}W</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Pressable testID="player-begin" onPress={begin} style={s.beginBtn}><Ionicons name="play" size={20} color="#fff" /><Text style={s.beginText}>Begin</Text></Pressable>
        </ScrollView>
      ) : runState === "completed" || runState === "stopped_early" ? (
        <ScrollView contentContainerStyle={s.readyWrap}>
          <Ionicons name={runState === "completed" ? "checkmark-circle" : "stop-circle"} size={44} color={runState === "completed" ? "#7FD98A" : "#FF7A66"} />
          <Text style={s.readyTitle}>{runState === "completed" ? "Benchmark complete" : "Test stopped"}</Text>
          {runState === "completed" && <View style={s.coachCard}><Ionicons name="chatbubble-ellipses-outline" size={16} color={CC.rouge} /><Text style={s.coachText}>{coachPrompt("completed", 0)}</Text></View>}
          {safety && (
            <View style={s.safetyCard} testID="player-safety"><Ionicons name="medkit-outline" size={18} color={CC.yellow} /><Text style={s.safetyText}>{SAFETY_GUIDANCE}</Text></View>
          )}
          <View style={s.sumCard}>
            <Text style={s.sumLine}>Elapsed: {fmt(totalElapsed)}</Text>
            <Text style={s.sumLine}>Avg power (last interval): {avgIv} W</Text>
            {stoppedReason && <Text style={s.sumLine}>Reason: {STOP_REASONS.find((r) => r.id === stoppedReason)?.label}</Text>}
            <Text style={s.devInline}>Recorded from simulated development data — not added to your real profile.</Text>
          </View>
          <View style={s.noteCard}><Text style={s.dim}>Result calculation, confidence and accept/exclude arrive in the next update (Part 9). Your session has been saved.</Text></View>
          <Pressable testID="player-return" onPress={() => router.replace("/benchmark")} style={s.beginBtn}><Text style={s.beginText}>Return to Benchmark Workouts</Text></Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.runWrap}>
          <Text style={s.ivLabel}>{step?.iv.label}</Text>
          {step && !step.isRamp && <Text style={s.remain}>{fmt(remaining)} <Text style={s.remainSub}>remaining</Text></Text>}
          {step?.isRamp && <Text style={s.remain}>{fmt(stepElapsed)} <Text style={s.remainSub}>elapsed</Text></Text>}

          {/* Primary metric */}
          <View style={s.primaryBox}>
            <Text style={s.primaryLabel}>{primaryLabel}</Text>
            <Text style={s.primaryValue}>{primaryValue}<Text style={s.primaryUnit}> {primaryUnit}</Text></Text>
            {primary === "power" && curTarget > 0 && <Text style={s.targetText}>Target {curTarget} W</Text>}
            {primary === "cadence" && step?.cadenceTarget && <Text style={s.targetText}>Target {step.cadenceTarget} rpm</Text>}
          </View>

          {/* Secondary grid — only relevant metrics */}
          <View style={s.grid}>
            {powerTest && primary !== "power" && <Metric label="POWER" value={`${readings.power} W`} />}
            {powerTest && <Metric label="3s POWER" value={`${p3} W`} />}
            {powerTest && <Metric label="AVG (interval)" value={`${avgIv} W`} />}
            {primary !== "hr" && <Metric label="HEART RATE" value={`${readings.hr} bpm`} />}
            {primary !== "cadence" && <Metric label="CADENCE" value={`${readings.cadence} rpm`} />}
            <Metric label="ELAPSED" value={fmt(totalElapsed)} />
          </View>

          {/* RPE */}
          <View style={s.rpeRow}>
            <Text style={s.dim}>Perceived exertion (RPE)</Text>
            <View style={s.rpeBtns}>
              <Pressable testID="rpe-minus" onPress={() => setRpe((v) => Math.max(1, v - 1))} style={s.rpeBtn}><Ionicons name="remove" size={16} color="#fff" /></Pressable>
              <Text style={s.rpeValue}>{rpe}</Text>
              <Pressable testID="rpe-plus" onPress={() => setRpe((v) => Math.min(10, v + 1))} style={s.rpeBtn}><Ionicons name="add" size={16} color="#fff" /></Pressable>
            </View>
          </View>

          {/* Coaching prompt */}
          {!!cue && <View style={s.coachCard}><Ionicons name="chatbubble-ellipses-outline" size={16} color={CC.rouge} /><Text style={s.coachText}>{cue}</Text></View>}

          {/* Dev inject controls */}
          <View style={s.injectBox}>
            <Text style={s.injectTitle}>DEV · SIMULATE</Text>
            <View style={s.injectRow}>
              <Pressable testID="inject-fade" onPress={() => setFade((f) => Math.min(1, f + 0.2))} style={s.injectBtn}><Text style={s.injectText}>Power fade</Text></Pressable>
              <Pressable testID="inject-reset" onPress={() => setFade(0)} style={s.injectBtn}><Text style={s.injectText}>Reset</Text></Pressable>
              <Pressable testID="inject-interrupt" onPress={() => { setRunState("interrupted"); persist({ runState: "interrupted" }); }} style={s.injectBtn}><Text style={s.injectText}>Dropout</Text></Pressable>
            </View>
          </View>

          {runState === "interrupted" && (
            <View style={s.warnCard}><Ionicons name="wifi-outline" size={16} color={CC.yellow} /><Text style={s.warnText}>Sensor signal lost. Recorded data is preserved — resume when the signal returns.</Text>
              <Pressable testID="resume-interrupt" onPress={resume} style={s.smallBtn}><Text style={s.smallBtnText}>Resume</Text></Pressable></View>
          )}
        </ScrollView>
      )}

      {/* Footer controls (only while active/paused) */}
      {(running || runState === "paused") && (
        <View style={s.footer}>
          {runState === "paused" ? (
            <Pressable testID="player-resume" onPress={resume} style={s.pauseBtn}><Ionicons name="play" size={18} color="#fff" /><Text style={s.pauseText}>Resume</Text></Pressable>
          ) : (
            <Pressable testID="player-pause" onPress={doPause} style={s.pauseBtn}><Ionicons name="pause" size={18} color="#fff" /><Text style={s.pauseText}>Pause</Text></Pressable>
          )}
          <Pressable testID="player-stop" onPress={() => setShowStop(true)} style={s.stopBtn}><Ionicons name="stop" size={18} color="#fff" /><Text style={s.stopText}>Stop Test</Text></Pressable>
        </View>
      )}

      {/* Maximal pause warning */}
      <Modal transparent visible={showPauseWarn} animationType="fade" onRequestClose={() => setShowPauseWarn(false)}>
        <View style={s.modalWrap}><View style={s.modal}>
          <Text style={s.modalTitle}>Pause during the main test?</Text>
          <Text style={s.dim}>Pausing during the main test may affect the validity of your result.</Text>
          <Pressable testID="pause-confirm" onPress={confirmPause} style={s.pauseBtn}><Text style={s.pauseText}>Pause Test</Text></Pressable>
          <Pressable testID="pause-cancel" onPress={() => setShowPauseWarn(false)} style={s.ghost}><Text style={s.ghostText}>Continue Riding</Text></Pressable>
        </View></View>
      </Modal>

      {/* Stop reason sheet */}
      <Modal transparent visible={showStop} animationType="slide" onRequestClose={() => setShowStop(false)}>
        <View style={s.sheetWrap}><View style={s.sheet}>
          <Text style={s.modalTitle}>Why are you stopping?</Text>
          {STOP_REASONS.map((r) => (
            <Pressable key={r.id} testID={`stop-${r.id}`} onPress={() => pickStop(r.id, r.safety)} style={s.reasonRow}>
              <Text style={s.reasonText}>{r.label}</Text>
              {r.safety && <Ionicons name="medkit-outline" size={15} color={CC.yellow} />}
            </Pressable>
          ))}
          <Pressable testID="stop-cancel" onPress={() => setShowStop(false)} style={s.ghost}><Text style={s.ghostText}>Keep riding</Text></Pressable>
        </View></View>
      </Modal>

      {/* Refresh / interruption recovery */}
      <Modal transparent visible={recoveryPrompt} animationType="fade">
        <View style={s.modalWrap}><View style={s.modal}>
          <Text style={s.modalTitle}>Resume your session?</Text>
          <Text style={s.dim}>We found an interrupted benchmark. Your recorded data is preserved.</Text>
          <Pressable testID="rec-resume" onPress={restoreSaved} style={s.pauseBtn}><Text style={s.pauseText}>Resume Session</Text></Pressable>
          <Pressable testID="rec-incomplete" onPress={saveIncomplete} style={s.ghost}><Text style={s.ghostText}>Save as Incomplete</Text></Pressable>
          <Pressable testID="rec-end" onPress={endSaved} style={s.ghost}><Text style={s.ghostText}>End Session</Text></Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  testName: { color: CC.white, fontSize: 15, fontWeight: "800", flex: 1 },
  stateChip: { backgroundColor: "rgba(201,23,39,0.15)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stateChipText: { color: CC.rouge, fontSize: 11.5, fontWeight: "800" },
  devBadge: { backgroundColor: "rgba(255,194,10,0.12)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  devText: { color: CC.yellow, fontSize: 9.5, fontWeight: "800" },
  progressTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10 },
  progressFill: { height: 5, backgroundColor: CC.rouge },

  readyWrap: { alignItems: "center", gap: 14, padding: 24, maxWidth: 560, width: "100%", alignSelf: "center" },
  readyTitle: { color: CC.white, fontSize: 22, fontWeight: "800", textAlign: "center" },
  rampCfg: { width: "100%", gap: 8, alignItems: "center" },
  rampRow: { flexDirection: "row", gap: 8 },
  rampBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)" },
  rampBtnOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  rampBtnText: { color: CC.dim, fontSize: 13, fontWeight: "800" },
  beginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, minHeight: 52, width: "100%" },
  beginText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  runWrap: { padding: 20, gap: 14, maxWidth: 640, width: "100%", alignSelf: "center" },
  ivLabel: { color: CC.rouge, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
  remain: { color: CC.white, fontSize: 34, fontWeight: "900", textAlign: "center" },
  remainSub: { color: CC.dim, fontSize: 14, fontWeight: "700" },
  primaryBox: { alignItems: "center", backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, paddingVertical: 22, gap: 4 },
  primaryLabel: { color: CC.dim, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  primaryValue: { color: CC.white, fontSize: 60, fontWeight: "900", lineHeight: 64 },
  primaryUnit: { color: CC.dim, fontSize: 22, fontWeight: "800" },
  targetText: { color: CC.rouge, fontSize: 14, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: 100, backgroundColor: CC.card, borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, paddingVertical: 14, alignItems: "center" },
  metricLabel: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  metricValue: { color: CC.white, fontSize: 20, fontWeight: "900", marginTop: 4 },
  rpeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: CC.card, borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 12 },
  rpeBtns: { flexDirection: "row", alignItems: "center", gap: 12 },
  rpeBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: CC.rouge, alignItems: "center", justifyContent: "center" },
  rpeValue: { color: CC.white, fontSize: 20, fontWeight: "900", minWidth: 26, textAlign: "center" },
  coachCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "rgba(201,23,39,0.06)", borderWidth: 1, borderColor: "rgba(201,23,39,0.2)", borderRadius: 12, padding: 13, width: "100%" },
  coachText: { flex: 1, color: CC.white, fontSize: 13, lineHeight: 19 },
  injectBox: { backgroundColor: "rgba(255,194,10,0.05)", borderWidth: 1, borderColor: "rgba(255,194,10,0.2)", borderRadius: 12, padding: 12, gap: 8 },
  injectTitle: { color: CC.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  injectRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  injectBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.03)" },
  injectText: { color: CC.white, fontSize: 12, fontWeight: "700" },
  warnCard: { flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap", backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", borderRadius: 12, padding: 12 },
  warnText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },
  smallBtn: { backgroundColor: CC.rouge, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  smallBtnText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },

  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: CC.border },
  pauseBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  pauseText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  stopBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#8B1A1A", borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  stopText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 20, gap: 12, width: "100%", maxWidth: 420 },
  modalTitle: { color: CC.white, fontSize: 17, fontWeight: "800" },
  sheetWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: CC.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: CC.border, padding: 20, gap: 8 },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 50 },
  reasonText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  ghost: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, minHeight: 48, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 14, fontWeight: "700" },

  safetyCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", borderRadius: 12, padding: 14, width: "100%" },
  safetyText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },
  sumCard: { backgroundColor: CC.card, borderRadius: 12, borderWidth: 1, borderColor: CC.border, padding: 15, gap: 6, width: "100%" },
  sumLine: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
  devInline: { color: CC.yellow, fontSize: 11.5, marginTop: 4 },
  noteCard: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 13, width: "100%" },
  dim: { color: CC.dim, fontSize: 13, lineHeight: 19 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
});
