import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest, CATEGORY_META } from "@/src/lib/benchmark/catalog";
import {
  READINESS_QUESTIONS, evaluateReadiness, buildOutcome, allAnswered, loadCachedAnswers, cacheAnswers,
} from "@/src/lib/benchmark/readiness";
import { createBenchmarkSession } from "@/src/lib/benchmark/api";
import {
  SETUP_STEPS, EQUIPMENT_OPTIONS, emptyEquipment, hasPower, computeSensorLevel, SENSOR_LEVEL_META,
  checkCompatibility, sprintEligibility, ENV_CHECKS, COACH_VOICES, COACH_DEPTHS, simulateSensors,
  type EquipmentState, type EnvMode, type CoachVoice, type CoachDepth, type SetupStepKey,
} from "@/src/lib/benchmark/setup";
import type { ReadinessAnswer, ReadinessStatus } from "@/src/lib/benchmark/types";

const RD_STATUS: Record<ReadinessStatus, { label: string; icon: any; color: string }> = {
  ready: { label: "Ready", icon: "checkmark-circle", color: "#7FD98A" },
  caution: { label: "Caution", icon: "alert-circle", color: "#FFC20A" },
  do_not_start: { label: "Do Not Start", icon: "hand-left", color: "#FF7A66" },
};

function apiBase() { return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, ""); }

export default function SetupWizardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const testId = String(id);
  const test = getBenchmarkTest(testId);

  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, ReadinessAnswer>>(() => loadCachedAnswers(testId));
  const [equip, setEquip] = React.useState<EquipmentState>(emptyEquipment);
  const [envMode, setEnvMode] = React.useState<EnvMode>("indoor");
  const [envChecks, setEnvChecks] = React.useState<Record<string, boolean>>({});
  const [voice, setVoice] = React.useState<CoachVoice>("alberto");
  const [depth, setDepth] = React.useState<CoachDepth>("full");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [begun, setBegun] = React.useState(false);
  const [capability, setCapability] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    (async () => {
      try {
        const rp = await fetch(`${apiBase()}/api/rider/profile`);
        if (rp.ok) { const prof = await rp.json(); setCapability(prof?.capability); }
      } catch { /* noop */ }
    })();
  }, []);

  if (!test) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.missing}>
          <Text style={s.missingText}>We couldn&apos;t find that benchmark.</Text>
          <Pressable onPress={() => router.replace("/benchmark")} style={s.ghostBtn}><Text style={s.ghostText}>Back to Benchmark Workouts</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cat = CATEGORY_META[test.category];
  const step: SetupStepKey = SETUP_STEPS[stepIdx].key;
  const rdStatus = allAnswered(answers) ? evaluateReadiness(answers) : null;
  const level = computeSensorLevel(equip);
  const compat = checkCompatibility(test, equip);
  const anyEquip = EQUIPMENT_OPTIONS.some((o) => o.key !== "none" && (equip as any)[o.key]);
  const sensors = simulateSensors(equip);
  const sprintGate = test.id === "sprint_power"
    ? sprintEligibility({ capability, equipment: equip, envMode, envChecks, readiness: rdStatus })
    : { ok: true, reasons: [] as string[] };

  const setAnswer = (qid: string, a: ReadinessAnswer) => {
    setAnswers((prev) => { const n = { ...prev, [qid]: a }; cacheAnswers(testId, n); return n; });
  };
  const toggleEquip = (key: keyof EquipmentState) => {
    setEquip((prev) => {
      if (key === "none") return { ...emptyEquipment(), none: !prev.none };
      return { ...prev, none: false, [key]: !prev[key] } as EquipmentState;
    });
  };
  const toggleEnv = (cid: string) => setEnvChecks((p) => ({ ...p, [cid]: !p[cid] }));

  const goNext = async () => {
    // Readiness gate: persist session + block Do-Not-Start.
    if (step === "readiness") {
      if (rdStatus === "do_not_start") return;
      if (!sessionId) {
        const sess = await createBenchmarkSession({ testId, readinessAnswers: answers, readiness: buildOutcome(rdStatus ?? "ready") });
        if (sess?.id) setSessionId(sess.id);
      }
    }
    if (step === "equipment" && !compat.ok) return; // incompatible gate
    setStepIdx((i) => Math.min(SETUP_STEPS.length - 1, i + 1));
  };
  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  const beginTest = async () => {
    if (!sprintGate.ok) return; // sprint eligibility gate
    // Persist the full setup snapshot to the session (data integrity).
    if (sessionId) {
      try {
        await fetch(`${apiBase()}/api/benchmark/sessions/${sessionId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipment: equip, sensorLevel: level, environment: { mode: envMode, checks: envChecks },
            coaching: { voice, depth }, usingDevData: true, status: "ready_to_start",
          }),
        });
      } catch { /* non-blocking */ }
    }
    setBegun(true);
    router.replace(`/benchmark/player/${testId}${sessionId ? `?session=${sessionId}` : ""}`);
  };

  const canContinue =
    step === "overview" ? true :
    step === "readiness" ? rdStatus != null && rdStatus !== "do_not_start" :
    step === "equipment" ? (anyEquip || equip.none) && compat.ok :
    true;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="setup-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>{test.name}</Text>
        </Pressable>
        <Pressable testID="setup-cancel" onPress={() => router.replace("/benchmark")} hitSlop={10}>
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
      </View>

      {/* Progress */}
      <View style={s.progress}>
        <View style={s.progressBar}>
          {SETUP_STEPS.map((st, i) => (
            <View key={st.key} style={[s.progressSeg, i <= stepIdx && s.progressSegOn]} />
          ))}
        </View>
        <Text style={s.progressLabel}>Step {stepIdx + 1} of {SETUP_STEPS.length} · {SETUP_STEPS[stepIdx].label}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* 1 — OVERVIEW */}
        {step === "overview" && (
          <View style={s.card} testID="step-overview">
            <View style={s.ovHead}>
              <View style={[s.ovIcon, { backgroundColor: `${cat.color}22` }]}><Ionicons name={test.icon} size={24} color={cat.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{test.name}</Text>
                <Text style={s.dim}>{CATEGORY_META[test.category].label} · {test.effort === "maximal" ? "Maximal" : "Submaximal"}</Text>
              </View>
            </View>
            <Text style={s.body}>{test.description}</Text>
            <View style={s.factRow}>
              <Chip icon="time-outline" text={`~${test.durationMin} min`} />
              <Chip icon="barbell-outline" text={test.difficulty} />
              <Chip icon={test.indoorCompatible ? "home-outline" : "bicycle-outline"} text={test.outdoorCompatible ? "Indoor / Outdoor" : "Indoor"} />
            </View>
            <Text style={s.note}>We&apos;ll run a quick readiness and equipment check, then you&apos;re ready to begin.</Text>
          </View>
        )}

        {/* 2 — READINESS */}
        {step === "readiness" && (
          <View style={{ gap: 12 }} testID="step-readiness">
            <Text style={s.h2}>Readiness Check</Text>
            <Text style={s.dim}>A few quick questions to make sure it&apos;s a safe day to test. Not a medical assessment.</Text>
            {READINESS_QUESTIONS.map((q) => {
              const a = answers[q.id];
              return (
                <View key={q.id} style={s.card}>
                  <Text style={s.qText}>{q.text}</Text>
                  <View style={s.qBtns}>
                    {(["yes", "no"] as ReadinessAnswer[]).map((opt) => {
                      const on = a === opt;
                      return (
                        <Pressable key={opt} testID={`rd-${q.id}-${opt}`} onPress={() => setAnswer(q.id, opt)}
                          accessibilityRole="button" accessibilityState={{ selected: on }}
                          accessibilityLabel={`${opt === "yes" ? "Yes" : "No"} to: ${q.text}`}
                          style={[s.qBtn, on && s.qBtnOn]}>
                          {on && <Ionicons name="checkmark" size={15} color="#fff" />}
                          <Text style={[s.qBtnText, on && s.qBtnTextOn]}>{opt === "yes" ? "Yes" : "No"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {rdStatus && (
              <View style={[s.outcome, { borderColor: `${RD_STATUS[rdStatus].color}55` }]} testID={`rd-outcome-${rdStatus}`}>
                <View style={s.rowGap}>
                  <Ionicons name={RD_STATUS[rdStatus].icon} size={20} color={RD_STATUS[rdStatus].color} />
                  <Text style={[s.outcomeLabel, { color: RD_STATUS[rdStatus].color }]}>{RD_STATUS[rdStatus].label}</Text>
                </View>
                <Text style={s.body}>{buildOutcome(rdStatus).message}</Text>
                {rdStatus === "do_not_start" && (
                  <View style={{ gap: 10 }}>
                    <Pressable testID="rd-exit" onPress={() => router.replace("/benchmark")} style={s.primaryBtn}><Text style={s.primaryText}>Exit Benchmark</Text></Pressable>
                    <Pressable testID="rd-submax" onPress={() => router.replace("/benchmark/library?filter=submaximal")} style={s.ghostBtn}><Text style={s.ghostText}>View Submaximal Options</Text></Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* 3 — EQUIPMENT */}
        {step === "equipment" && (
          <View style={{ gap: 12 }} testID="step-equipment">
            <Text style={s.h2}>Equipment Selection</Text>
            <Text style={s.dim}>Select everything you&apos;re using today. You can pick more than one.</Text>
            {EQUIPMENT_OPTIONS.map((o) => {
              const on = (equip as any)[o.key];
              return (
                <Pressable key={o.key} testID={`eq-${o.key}`} onPress={() => toggleEquip(o.key)}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
                  style={[s.eqRow, on && s.eqRowOn]}>
                  <Ionicons name={o.icon} size={18} color={on ? CC.rouge : CC.dim} />
                  <Text style={[s.eqLabel, on && { color: CC.white }]}>{o.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? CC.rouge : CC.dim} />
                </Pressable>
              );
            })}
            <View style={s.levelBox}>
              <Text style={s.levelTitle}>{SENSOR_LEVEL_META[level].label}</Text>
              <Text style={s.dim}>{SENSOR_LEVEL_META[level].blurb}</Text>
            </View>
            {compat.preferredWarning && (
              <View style={s.warn}><Ionicons name="information-circle-outline" size={16} color={CC.yellow} /><Text style={s.warnText}>Power is preferred for this test — you can continue, but some metrics will be estimated.</Text></View>
            )}
            {!compat.ok && (
              <View style={s.incompat} testID="eq-incompatible">
                <Ionicons name="alert-circle" size={18} color="#FF7A66" />
                <Text style={s.incompatText}>This benchmark requires equipment that is not currently available.</Text>
                <View style={{ gap: 8, width: "100%" }}>
                  <Pressable testID="eq-view-compatible" onPress={() => router.replace("/benchmark/library?filter=submaximal")} style={s.ghostBtn}><Text style={s.ghostText}>View Compatible Tests</Text></Pressable>
                  <Pressable testID="eq-update" onPress={() => { /* stays on step */ }} style={s.ghostBtn}><Text style={s.ghostText}>Update Equipment</Text></Pressable>
                  <Pressable testID="eq-cancel" onPress={() => router.replace("/benchmark")} style={s.ghostBtn}><Text style={s.ghostText}>Cancel</Text></Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {/* 4 — SENSOR CHECK */}
        {step === "sensors" && (
          <View style={{ gap: 12 }} testID="step-sensors">
            <Text style={s.h2}>Sensor Check</Text>
            <View style={s.devBadge}><Ionicons name="construct-outline" size={13} color={CC.yellow} /><Text style={s.devText}>Simulated connections — development data</Text></View>
            {sensors.length === 0 ? (
              <Text style={s.dim}>No connected sensors selected. You&apos;ll ride by perceived effort.</Text>
            ) : sensors.map((sn) => (
              <View key={sn.key} style={s.card}>
                <View style={s.rowGap}>
                  <Text style={s.sensorName}>{sn.name}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={s.stateChip}><View style={s.stateDot} /><Text style={s.stateText}>{sn.state}</Text></View>
                </View>
                <View style={s.sensorMeta}>
                  <Text style={s.dim}>Signal: {sn.signal}</Text>
                  {sn.battery != null && <Text style={s.dim}>Battery: {sn.battery}%</Text>}
                  {sn.calibration && <Text style={s.dim}>Calibration: {sn.calibration}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 5 — ENVIRONMENT + COACHING */}
        {step === "environment" && (
          <View style={{ gap: 12 }} testID="step-environment">
            <Text style={s.h2}>Environment Check</Text>
            <View style={s.segRow}>
              {(["indoor", "outdoor"] as EnvMode[]).map((m) => (
                <Pressable key={m} testID={`env-mode-${m}`} onPress={() => { setEnvMode(m); setEnvChecks({}); }}
                  accessibilityRole="button" accessibilityState={{ selected: envMode === m }}
                  style={[s.seg, envMode === m && s.segOn]}>
                  <Ionicons name={m === "indoor" ? "home" : "bicycle"} size={15} color={envMode === m ? "#fff" : CC.dim} />
                  <Text style={[s.segText, envMode === m && { color: "#fff" }]}>{m === "indoor" ? "Indoor" : "Outdoor"}</Text>
                </Pressable>
              ))}
            </View>
            {ENV_CHECKS[envMode].map((c) => {
              const on = !!envChecks[c.id];
              return (
                <Pressable key={c.id} testID={`env-${c.id}`} onPress={() => toggleEnv(c.id)}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c.label}
                  style={[s.eqRow, on && s.eqRowOn]}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? CC.rouge : CC.dim} />
                  <Text style={[s.eqLabel, on && { color: CC.white }]}>{c.label}</Text>
                </Pressable>
              );
            })}
            <Text style={[s.h2, { marginTop: 8 }]}>Coaching</Text>
            <View style={s.segRow}>
              {COACH_VOICES.map((v) => (
                <Pressable key={v.key} testID={`coach-${v.key}`} onPress={() => setVoice(v.key)}
                  accessibilityRole="button" accessibilityState={{ selected: voice === v.key }}
                  style={[s.seg, voice === v.key && s.segOn]}><Text style={[s.segText, voice === v.key && { color: "#fff" }]}>{v.label}</Text></Pressable>
              ))}
            </View>
            <View style={s.segRow}>
              {COACH_DEPTHS.map((d) => (
                <Pressable key={d.key} testID={`depth-${d.key}`} onPress={() => setDepth(d.key)}
                  accessibilityRole="button" accessibilityState={{ selected: depth === d.key }}
                  style={[s.seg, depth === d.key && s.segOn]}><Text style={[s.segText, depth === d.key && { color: "#fff" }]}>{d.label}</Text></Pressable>
              ))}
            </View>
          </View>
        )}

        {/* 6 — SUMMARY */}
        {step === "summary" && (
          <View style={{ gap: 12 }} testID="step-summary">
            <Text style={s.h2}>Final Summary</Text>
            <View style={s.card}>
              <SumRow label="Benchmark" value={test.name} />
              <SumRow label="Environment" value={envMode === "indoor" ? "Indoor" : "Outdoor"} />
              <SumRow label="Estimated duration" value={`~${test.durationMin} min`} />
              <SumRow label="Intensity" value={test.effort === "maximal" ? "Maximal" : "Submaximal"} />
              <SumRow label="Equipment" value={EQUIPMENT_OPTIONS.filter((o) => (equip as any)[o.key]).map((o) => o.label).join(", ") || "None"} />
              <SumRow label="Sensor level" value={SENSOR_LEVEL_META[level].label} />
              <SumRow label="Readiness" value={rdStatus ? RD_STATUS[rdStatus].label : "—"} />
              <SumRow label="Environment confirmed" value={`${Object.values(envChecks).filter(Boolean).length}/${ENV_CHECKS[envMode].length} checks`} />
              <SumRow label="Coaching" value={`${COACH_VOICES.find((v) => v.key === voice)?.label} · ${COACH_DEPTHS.find((d) => d.key === depth)?.label}`} />
              <SumRow label="Recovery" value={test.recoveryRecommendation} last />
            </View>
            {begun ? (
              <View style={s.begun} testID="setup-begun">
                <Ionicons name="checkmark-circle" size={20} color="#7FD98A" />
                <Text style={s.begunText}>Setup saved. Launching your guided Workout Player…</Text>
              </View>
            ) : !sprintGate.ok ? (
              <View style={s.sprintBlock} testID="sprint-blocked">
                <View style={s.sprintBlockHead}>
                  <Ionicons name="shield-outline" size={18} color={CC.yellow} />
                  <Text style={s.sprintBlockTitle}>Not recommended right now</Text>
                </View>
                {sprintGate.reasons.map((r, i) => (
                  <Text key={i} style={s.sprintBlockReason}>• {r}</Text>
                ))}
                <Pressable testID="sprint-alt" onPress={() => router.replace("/benchmark/library")} style={s.ghostBtn}>
                  <Text style={s.ghostText}>Choose a suitable test</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable testID="begin-test" onPress={beginTest} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Begin test">
                <Ionicons name="play" size={18} color="#fff" /><Text style={s.primaryText}>Begin Test</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer nav */}
      {!(step === "readiness" && rdStatus === "do_not_start") && !(step === "equipment" && !compat.ok) && (
        <View style={s.footer}>
          {stepIdx > 0 && (
            <Pressable testID="setup-prev" onPress={goBack} style={s.footBack} accessibilityRole="button" accessibilityLabel="Go back a step">
              <Ionicons name="chevron-back" size={16} color={CC.white} /><Text style={s.footBackText}>Back</Text>
            </Pressable>
          )}
          {step !== "summary" && (
            <Pressable testID="setup-next" onPress={goNext} disabled={!canContinue}
              accessibilityRole="button" accessibilityState={{ disabled: !canContinue }} accessibilityLabel="Continue"
              style={[s.footNext, !canContinue && s.footNextOff]}>
              <Text style={[s.footNextText, !canContinue && { color: CC.dim }]}>Continue</Text>
              <Ionicons name="chevron-forward" size={16} color={canContinue ? "#fff" : CC.dim} />
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Chip({ icon, text }: { icon: any; text: string }) {
  return <View style={s.smallChip}><Ionicons name={icon} size={13} color={CC.dim} /><Text style={s.smallChipText}>{text}</Text></View>;
}
function SumRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.sumRow, !last && s.sumRowBorder]}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={s.sumValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3 },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  cancel: { color: CC.dim, fontSize: 13, fontWeight: "700" },
  progress: { paddingHorizontal: 22, paddingTop: 12, gap: 6 },
  progressBar: { flexDirection: "row", gap: 5 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)" },
  progressSegOn: { backgroundColor: CC.rouge },
  progressLabel: { color: CC.dim, fontSize: 11.5, fontWeight: "700" },
  scroll: { paddingHorizontal: 22, paddingVertical: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },

  card: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 15, gap: 10 },
  h2: { color: CC.white, fontSize: 20, fontWeight: "800" },
  dim: { color: CC.dim, fontSize: 13, lineHeight: 19 },
  body: { color: CC.dim, fontSize: 13.5, lineHeight: 20 },
  note: { color: CC.dim, fontSize: 12.5, fontStyle: "italic" },
  ovHead: { flexDirection: "row", gap: 14, alignItems: "center" },
  ovIcon: { width: 50, height: 50, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  factRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallChipText: { color: CC.white, fontSize: 11.5, fontWeight: "700" },

  qText: { color: CC.white, fontSize: 14.5, fontWeight: "600", lineHeight: 20 },
  qBtns: { flexDirection: "row", gap: 10 },
  qBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 11, minHeight: 46, backgroundColor: "rgba(255,255,255,0.03)" },
  qBtnOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  qBtnText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  qBtnTextOn: { color: "#fff" },
  outcome: { borderWidth: 1, borderRadius: 14, padding: 15, gap: 10, backgroundColor: "rgba(255,255,255,0.02)" },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 8 },
  outcomeLabel: { fontSize: 16, fontWeight: "800" },

  eqRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 50 },
  eqRowOn: { borderColor: "rgba(201,23,39,0.5)", backgroundColor: "rgba(201,23,39,0.06)" },
  eqLabel: { color: CC.dim, fontSize: 14, fontWeight: "700" },
  levelBox: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 13, gap: 3 },
  levelTitle: { color: CC.white, fontSize: 14, fontWeight: "800" },
  warn: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.25)", borderRadius: 10, padding: 12 },
  warnText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },
  incompat: { alignItems: "center", gap: 12, backgroundColor: "rgba(255,122,102,0.08)", borderWidth: 1, borderColor: "rgba(255,122,102,0.3)", borderRadius: 12, padding: 16 },
  incompatText: { color: CC.white, fontSize: 13, fontWeight: "700", textAlign: "center" },

  devBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(255,194,10,0.1)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  devText: { color: CC.yellow, fontSize: 11, fontWeight: "800" },
  sensorName: { color: CC.white, fontSize: 14.5, fontWeight: "800" },
  stateChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(127,217,138,0.12)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#7FD98A" },
  stateText: { color: "#7FD98A", fontSize: 11.5, fontWeight: "800" },
  sensorMeta: { flexDirection: "row", flexWrap: "wrap", gap: 14 },

  segRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  seg: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 42, justifyContent: "center" },
  segOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  segText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },

  sumRow: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 9 },
  sumRowBorder: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  sumLabel: { color: CC.dim, fontSize: 12.5, fontWeight: "700", flexShrink: 0 },
  sumValue: { color: CC.white, fontSize: 12.5, fontWeight: "700", flex: 1, textAlign: "right" },
  begun: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(127,217,138,0.08)", borderWidth: 1, borderColor: "rgba(127,217,138,0.3)", borderRadius: 12, padding: 15 },
  begunText: { flex: 1, color: CC.white, fontSize: 13, lineHeight: 19 },
  sprintBlock: { backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", borderRadius: 12, padding: 14, gap: 8 },
  sprintBlockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sprintBlockTitle: { color: CC.white, fontSize: 14, fontWeight: "800" },
  sprintBlockReason: { color: CC.dim, fontSize: 12.5, lineHeight: 18 },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ghostBtn: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, minHeight: 48, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 14, fontWeight: "700" },

  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: CC.border },
  footBack: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 48, justifyContent: "center" },
  footBackText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  footNext: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 13, minHeight: 48 },
  footNextOff: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border },
  footNextText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },

  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  missingText: { color: CC.dim, fontSize: 14, textAlign: "center" },
});
