// ─────────────────────────────────────────────────────────────────────────
// Benchmark Result page (Part 9). Reads the just-finished run from AsyncStorage
// (`bm:lastresult`), shows the versioned calculation, a 0–100 confidence meter,
// a short non-diagnostic insight, and gathers the rider's reflection.
// The rider explicitly decides: accept, save for later, or exclude.
// Simulated results are clearly labelled and never change the real profile.
// ─────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest } from "@/src/lib/benchmark/catalog";
import { CONFIDENCE_NOTE } from "@/src/lib/benchmark/calc";
import { saveBenchmarkResult } from "@/src/lib/benchmark/api";
import { STOP_REASONS } from "@/src/lib/benchmark/player";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const FEEL_OPTIONS = [
  { id: "easy", label: "Easier than expected" },
  { id: "right", label: "About right" },
  { id: "hard", label: "Hard but fair" },
  { id: "toohard", label: "Too hard" },
];

export default function BenchmarkResultScreen() {
  const router = useRouter();
  const [payload, setPayload] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [feel, setFeel] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState<null | "accepted" | "pending" | "excluded">(null);
  const [saved, setSaved] = React.useState<null | string>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("bm:lastresult");
        if (raw) setPayload(JSON.parse(raw));
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, []);

  const test = payload ? getBenchmarkTest(payload.testId) : undefined;
  const result = payload?.result;
  const capture = payload?.capture;

  const submit = async (decision: "accepted" | "pending" | "excluded") => {
    if (!payload || !result) return;
    setSaving(decision);
    await saveBenchmarkResult({
      sessionId: payload.sessionId,
      testId: payload.testId,
      decision,
      quality: result.quality,
      confidence: result.confidence,
      metrics: result.metrics,
      primaryMetric: result.primaryMetric,
      calcVersion: result.calcVersion,
      isDevData: capture?.isDevData ?? true,
      insight: result.insight,
      notes: notes.trim() || undefined,
      reflection: feel || undefined,
      status: payload.status,
      stoppedReason: payload.stoppedReason,
      rpe: capture?.rpe,
    });
    await AsyncStorage.removeItem("bm:lastresult").catch(() => {});
    setSaving(null);
    setSaved(decision);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
      </SafeAreaView>
    );
  }

  if (!payload || !result || !test) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.center}>
          <Ionicons name="document-text-outline" size={36} color={CC.dim} />
          <Text style={s.dim}>No recent benchmark result to review.</Text>
          <Pressable testID="result-back" onPress={() => router.replace("/benchmark")} style={s.primaryBtn}>
            <Text style={s.primaryText}>Back to Benchmark Workouts</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Saved confirmation screen
  if (saved) {
    const dev = capture?.isDevData;
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.center}>
          <Ionicons name={saved === "excluded" ? "close-circle" : "checkmark-circle"} size={48} color={saved === "excluded" ? "#FF7A66" : "#7FD98A"} />
          <Text style={s.savedTitle}>
            {saved === "accepted" ? "Result accepted" : saved === "excluded" ? "Result excluded" : "Saved for later"}
          </Text>
          {saved === "accepted" && dev && (
            <View style={s.devNotice} testID="result-dev-notice">
              <Ionicons name="flask-outline" size={16} color={CC.yellow} />
              <Text style={s.devNoticeText}>
                This was recorded from simulated development data, so your training profile was not changed. Real sensor results can update your profile once reviewed.
              </Text>
            </View>
          )}
          {saved === "accepted" && !dev && (
            <Text style={s.dim}>Your training profile and zones have been updated. You can review them any time.</Text>
          )}
          <Pressable testID="result-done" onPress={() => router.replace("/benchmark")} style={s.primaryBtn}>
            <Text style={s.primaryText}>Back to Benchmark Workouts</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pm = result.primaryMetric;
  const conf = Math.round(result.confidence);
  const confColor = conf >= 75 ? "#7FD98A" : conf >= 50 ? CC.yellow : "#FF7A66";
  const stopLabel = payload.stoppedReason ? STOP_REASONS.find((r: any) => r.id === payload.stoppedReason)?.label : null;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.head}>
          <Ionicons name={test.icon} size={26} color={CC.rouge} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{test.name}</Text>
            <Text style={s.sub}>{payload.status === "completed" ? "Benchmark complete" : "Stopped early"}{stopLabel ? ` · ${stopLabel}` : ""}</Text>
          </View>
          {capture?.isDevData && <View style={s.devBadge}><Text style={s.devText}>SIM DATA</Text></View>}
        </View>

        {/* Primary metric */}
        {pm && (
          <View style={s.primaryCard} testID="result-primary">
            <Text style={s.primaryLabel}>{pm.label.toUpperCase()}</Text>
            <Text style={s.primaryValue}>{pm.value}<Text style={s.primaryUnit}> {pm.unit}</Text></Text>
          </View>
        )}

        {/* Confidence meter */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardLabel}>CONFIDENCE</Text>
            <Text style={[s.confPct, { color: confColor }]}>{conf}%</Text>
          </View>
          <View style={s.confTrack}><View style={[s.confFill, { width: `${conf}%`, backgroundColor: confColor }]} /></View>
          <Text style={s.qualityText}>Quality: {result.quality}</Text>
          <Text style={s.note}>{CONFIDENCE_NOTE}</Text>
        </View>

        {/* Secondary metrics */}
        {result.metrics.length > 1 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>MEASUREMENTS</Text>
            {result.metrics.map((m: any) => (
              <View key={m.key} style={s.metricRow}>
                <Text style={s.metricName}>{m.label}</Text>
                <Text style={s.metricVal}>{m.value} {m.unit}</Text>
              </View>
            ))}
            <View style={s.metricRow}><Text style={s.metricName}>Elapsed</Text><Text style={s.metricVal}>{fmt(capture?.totalElapsed || 0)}</Text></View>
            {typeof capture?.rpe === "number" && <View style={s.metricRow}><Text style={s.metricName}>Perceived exertion</Text><Text style={s.metricVal}>{capture.rpe}/10</Text></View>}
          </View>
        )}

        {/* Insight */}
        {!!result.insight && (
          <View style={s.insightCard}>
            <Ionicons name="bulb-outline" size={16} color={CC.rouge} />
            <Text style={s.insightText}>{result.insight}</Text>
          </View>
        )}

        {/* Reflection */}
        <View style={s.card}>
          <Text style={s.cardLabel}>HOW DID THIS TEST FEEL?</Text>
          <View style={s.chips}>
            {FEEL_OPTIONS.map((o) => (
              <Pressable key={o.id} testID={`feel-${o.id}`} onPress={() => setFeel(o.id)} style={[s.chip, feel === o.id && s.chipOn]}>
                <Text style={[s.chipText, feel === o.id && { color: "#fff" }]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="result-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note (optional) — anything about how it went."
            placeholderTextColor={CC.dim}
            style={s.input}
            multiline
          />
        </View>

        {/* Decision */}
        <Text style={s.decisionHint}>You decide what happens to this result. Nothing updates your profile without your say-so.</Text>
        <Pressable testID="result-accept" onPress={() => submit("accepted")} disabled={!!saving} style={[s.primaryBtn, saving === "accepted" && { opacity: 0.6 }]}>
          {saving === "accepted" ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.primaryText}>Accept result</Text></>}
        </Pressable>
        <View style={s.altRow}>
          <Pressable testID="result-later" onPress={() => submit("pending")} disabled={!!saving} style={s.ghostBtn}><Text style={s.ghostText}>Save for later</Text></Pressable>
          <Pressable testID="result-exclude" onPress={() => submit("excluded")} disabled={!!saving} style={s.ghostBtn}><Text style={s.ghostText}>Exclude</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
  wrap: { padding: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: CC.white, fontSize: 18, fontWeight: "800" },
  sub: { color: CC.dim, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  devBadge: { backgroundColor: "rgba(255,194,10,0.12)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  devText: { color: CC.yellow, fontSize: 9.5, fontWeight: "800" },
  primaryCard: { alignItems: "center", backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, paddingVertical: 24 },
  primaryLabel: { color: CC.dim, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  primaryValue: { color: CC.white, fontSize: 56, fontWeight: "900", lineHeight: 60, marginTop: 4 },
  primaryUnit: { color: CC.dim, fontSize: 22, fontWeight: "800" },
  card: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 15, gap: 8 },
  cardLabel: { color: CC.dim, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confPct: { fontSize: 18, fontWeight: "900" },
  confTrack: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  confFill: { height: 8, borderRadius: 999 },
  qualityText: { color: CC.white, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  note: { color: CC.dim, fontSize: 12, lineHeight: 18 },
  metricRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CC.borderSoft },
  metricName: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  metricVal: { color: CC.white, fontSize: 14, fontWeight: "800" },
  insightCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "rgba(201,23,39,0.06)", borderWidth: 1, borderColor: "rgba(201,23,39,0.2)", borderRadius: 12, padding: 13 },
  insightText: { flex: 1, color: CC.white, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)" },
  chipOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  chipText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  input: { color: CC.white, fontSize: 13.5, borderWidth: 1, borderColor: CC.border, borderRadius: 10, padding: 12, minHeight: 64, textAlignVertical: "top", backgroundColor: "rgba(255,255,255,0.02)" },
  decisionHint: { color: CC.dim, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 4 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, minHeight: 52 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  altRow: { flexDirection: "row", gap: 12 },
  ghostBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, minHeight: 48, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  savedTitle: { color: CC.white, fontSize: 20, fontWeight: "800" },
  devNotice: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", borderRadius: 12, padding: 14, maxWidth: 460 },
  devNoticeText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },
  dim: { color: CC.dim, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
});
