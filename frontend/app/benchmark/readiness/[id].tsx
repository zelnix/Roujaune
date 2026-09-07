import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest } from "@/src/lib/benchmark/catalog";
import {
  READINESS_QUESTIONS, evaluateReadiness, buildOutcome, allAnswered,
  loadCachedAnswers, cacheAnswers,
} from "@/src/lib/benchmark/readiness";
import { createBenchmarkSession } from "@/src/lib/benchmark/api";
import type { ReadinessAnswer, ReadinessStatus } from "@/src/lib/benchmark/types";

const STATUS_META: Record<ReadinessStatus, { label: string; icon: any; color: string; bg: string }> = {
  ready: { label: "Ready", icon: "checkmark-circle", color: "#7FD98A", bg: "rgba(127,217,138,0.1)" },
  caution: { label: "Caution", icon: "alert-circle", color: "#FFC20A", bg: "rgba(255,194,10,0.1)" },
  do_not_start: { label: "Do Not Start", icon: "hand-left", color: "#FF7A66", bg: "rgba(255,122,102,0.12)" },
};

export default function ReadinessScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const testId = String(id);
  const test = getBenchmarkTest(testId);

  const [answers, setAnswers] = React.useState<Record<string, ReadinessAnswer>>(() => loadCachedAnswers(testId));
  const [outcome, setOutcome] = React.useState<ReadinessStatus | null>(null);
  const [continued, setContinued] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const answeredCount = READINESS_QUESTIONS.filter((q) => answers[q.id] != null).length;
  const total = READINESS_QUESTIONS.length;
  const complete = allAnswered(answers);

  const setAnswer = (qid: string, a: ReadinessAnswer) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: a };
      cacheAnswers(testId, next);
      return next;
    });
    setOutcome(null); // re-evaluate after any change
    setContinued(false);
  };

  const check = async () => {
    if (!complete) return;
    const status = evaluateReadiness(answers);
    setOutcome(status);
    // Persist the readiness answers + outcome to a benchmark session (audit + data integrity).
    setSaving(true);
    await createBenchmarkSession({ testId, readinessAnswers: answers, readiness: buildOutcome(status) });
    setSaving(false);
  };

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

  const sm = outcome ? STATUS_META[outcome] : null;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="rd-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>{test.name}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Setup progress */}
        <View style={s.stepHead}>
          <Text style={s.stepKicker}>BENCHMARK SETUP · STEP 1 OF 3</Text>
          <Text style={s.title} accessibilityRole="header">Readiness Check</Text>
          <Text style={s.sub}>A few quick questions to make sure it&apos;s a safe day to test. This is not a medical assessment.</Text>
        </View>
        <View style={s.progressWrap} accessibilityLabel={`${answeredCount} of ${total} questions answered`}>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${(answeredCount / total) * 100}%` }]} /></View>
          <Text style={s.progressText}>{answeredCount}/{total}</Text>
        </View>

        {/* Questions */}
        {READINESS_QUESTIONS.map((q, i) => {
          const a = answers[q.id];
          return (
            <View key={q.id} style={s.q} accessibilityLabel={`Question ${i + 1}: ${q.text}`}>
              <Text style={s.qText}>{q.text}</Text>
              <View style={s.qBtns}>
                {(["yes", "no"] as ReadinessAnswer[]).map((opt) => {
                  const on = a === opt;
                  return (
                    <Pressable
                      key={opt}
                      testID={`rd-${q.id}-${opt}`}
                      onPress={() => setAnswer(q.id, opt)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${opt === "yes" ? "Yes" : "No"} to: ${q.text}`}
                      style={[s.qBtn, on && s.qBtnOn]}
                    >
                      {on && <Ionicons name="checkmark" size={15} color="#fff" />}
                      <Text style={[s.qBtnText, on && s.qBtnTextOn]}>{opt === "yes" ? "Yes" : "No"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Evaluate */}
        {!outcome && (
          <Pressable
            testID="rd-check"
            onPress={check}
            disabled={!complete}
            accessibilityRole="button"
            accessibilityState={{ disabled: !complete }}
            accessibilityLabel="Check my readiness"
            style={[s.checkBtn, !complete && s.checkDisabled]}
          >
            <Text style={[s.checkText, !complete && s.checkTextDisabled]}>
              {complete ? "Check my readiness" : `Answer all ${total} questions to continue`}
            </Text>
          </Pressable>
        )}

        {/* Outcome */}
        {outcome && sm && (
          <View style={[s.outcome, { backgroundColor: sm.bg, borderColor: `${sm.color}55` }]} testID={`rd-outcome-${outcome}`}>
            <View style={s.outcomeHead}>
              <Ionicons name={sm.icon} size={22} color={sm.color} />
              <Text style={[s.outcomeLabel, { color: sm.color }]}>{sm.label}</Text>
              {saving && <Text style={s.saving}>saving…</Text>}
            </View>
            <Text style={s.outcomeMsg}>{buildOutcome(outcome).message}</Text>

            {/* Actions per outcome */}
            {outcome === "ready" && !continued && (
              <Pressable testID="rd-continue" onPress={() => { setContinued(true); }} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Continue to setup">
                <Text style={s.primaryText}>Continue</Text>
              </Pressable>
            )}
            {outcome === "caution" && !continued && (
              <View style={s.actionCol}>
                <Pressable testID="rd-continue" onPress={() => { setContinued(true); }} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Continue anyway"><Text style={s.primaryText}>Continue</Text></Pressable>
                <Pressable testID="rd-another" onPress={() => router.replace("/benchmark/library")} style={s.ghostBtn} accessibilityRole="button" accessibilityLabel="Choose another test"><Text style={s.ghostText}>Choose Another Test</Text></Pressable>
                <Pressable testID="rd-reschedule" onPress={() => setNotice("Rescheduling arrives with the training-calendar integration. Your readiness answers are saved.")} style={s.ghostBtn} accessibilityRole="button" accessibilityLabel="Reschedule"><Text style={s.ghostText}>Reschedule</Text></Pressable>
              </View>
            )}
            {outcome === "do_not_start" && (
              <View style={s.actionCol}>
                <Pressable testID="rd-exit" onPress={() => router.replace("/benchmark")} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Exit benchmark"><Text style={s.primaryText}>Exit Benchmark</Text></Pressable>
                <Pressable testID="rd-submax" onPress={() => router.replace("/benchmark/library?filter=submaximal")} style={s.ghostBtn} accessibilityRole="button" accessibilityLabel="View submaximal options"><Text style={s.ghostText}>View Submaximal Options</Text></Pressable>
              </View>
            )}

            {/* Continued placeholder (equipment/player are the next parts) */}
            {continued && (
              <View style={s.continued} testID="rd-continued">
                <Ionicons name="checkmark-circle-outline" size={16} color="#7FD98A" />
                <Text style={s.continuedText}>Readiness saved. Equipment setup and the guided test arrive in the next update.</Text>
              </View>
            )}
          </View>
        )}

        {notice && (
          <View style={s.notice} testID="rd-notice"><Ionicons name="information-circle-outline" size={15} color={CC.dim} /><Text style={s.noticeText}>{notice}</Text></View>
        )}

        <Text style={s.disclaimer}>
          Roujaune doesn&apos;t provide medical advice. If you feel unwell, stop and seek appropriate medical guidance.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 22, paddingBottom: 44, gap: 14, maxWidth: 680, width: "100%", alignSelf: "center" },

  stepHead: { gap: 6, marginTop: 6 },
  stepKicker: { color: CC.rouge, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  title: { color: CC.white, fontSize: 26, fontWeight: "800" },
  sub: { color: CC.dim, fontSize: 13, lineHeight: 19 },

  progressWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: CC.rouge },
  progressText: { color: CC.dim, fontSize: 12, fontWeight: "800", minWidth: 34, textAlign: "right" },

  q: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 15, gap: 12 },
  qText: { color: CC.white, fontSize: 14.5, fontWeight: "600", lineHeight: 20 },
  qBtns: { flexDirection: "row", gap: 10 },
  qBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 11, minHeight: 46, backgroundColor: "rgba(255,255,255,0.03)" },
  qBtnOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  qBtnText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  qBtnTextOn: { color: "#fff" },

  checkBtn: { backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, alignItems: "center", minHeight: 52, justifyContent: "center" },
  checkDisabled: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border },
  checkText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  checkTextDisabled: { color: CC.dim },

  outcome: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  outcomeHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  outcomeLabel: { fontSize: 17, fontWeight: "800" },
  saving: { color: CC.dim, fontSize: 11, marginLeft: "auto", fontStyle: "italic" },
  outcomeMsg: { color: CC.white, fontSize: 13.5, lineHeight: 20 },
  actionCol: { gap: 10 },
  primaryBtn: { backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 13, alignItems: "center", minHeight: 48, justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  ghostBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, alignItems: "center", minHeight: 48, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  continued: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(127,217,138,0.08)", borderRadius: 10, padding: 12 },
  continuedText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },

  notice: { flexDirection: "row", alignItems: "center", gap: 8 },
  noticeText: { color: CC.dim, fontSize: 12.5, flex: 1, lineHeight: 17 },
  disclaimer: { color: CC.dim, fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 4 },

  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  missingText: { color: CC.dim, fontSize: 14, textAlign: "center" },
});
