import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useCoach } from "@/src/lib/coach-persona";
import { BENCHMARK_TESTS, AVAILABLE_TESTS } from "@/src/lib/benchmark/catalog";
import { BenchmarkTestCard } from "@/src/components/benchmark/BenchmarkTestCard";
import { useBenchmarkResults } from "@/src/lib/benchmark/api";

export default function BenchmarkLandingScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { results, loading } = useBenchmarkResults();

  return (
    <AppScaffold
      active="benchmark"
      title="Benchmark Workouts"
      subtitle="Understand your current fitness — and let your coach personalise your training."
    >
      {/* Hero — the core message + coach identity */}
      <Card testID="bm-hero">
        <View style={s.heroRow}>
          <Image source={persona.image} style={s.coachImg} contentFit="cover" contentPosition="top center" />
          <View style={{ flex: 1 }}>
            <Text style={s.heroKicker}>{persona.name.toUpperCase()} · YOUR COMPANION COACH</Text>
            <Text style={s.heroTitle} accessibilityRole="header">Not a pass-or-fail test.</Text>
            <Text style={s.heroBody}>
              Benchmark Workouts give {persona.name} the information needed to understand your current fitness,
              personalise your training and help you build your strongest ride.
            </Text>
          </View>
        </View>
        <Pressable
          testID="bm-browse"
          onPress={() => router.push("/benchmark/library")}
          accessibilityRole="button"
          accessibilityLabel="Browse the benchmark test library"
          style={({ hovered }: any) => [s.cta, hovered && { opacity: 0.92 }]}
        >
          <Ionicons name="albums-outline" size={18} color="#fff" />
          <Text style={s.ctaText}>Browse the test library</Text>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </Pressable>
      </Card>

      {/* History — empty state until results exist */}
      <Card testID="bm-history">
        <SectionTitle label="YOUR BENCHMARKS" color={CC.rouge} />
        {loading ? (
          <View style={s.center}><ActivityIndicator color={CC.rouge} /></View>
        ) : results.length === 0 ? (
          <View style={s.empty} testID="bm-empty">
            <View style={s.emptyIcon}><Ionicons name="ribbon-outline" size={26} color={CC.dim} /></View>
            <Text style={s.emptyTitle} accessibilityRole="header">No benchmarks yet</Text>
            <Text style={s.emptyBody}>
              Complete a benchmark to capture a snapshot of your fitness. Your results will appear here so you and
              {" "}{persona.name} can track how your strongest ride is coming together.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {results.map((r) => (
              <View key={r.id} style={s.resultRow}>
                <Text style={s.resultTitle}>{r.testId}</Text>
                <Text style={s.resultMeta}>{new Date(r.createdAt).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Preview of the library (data-driven, reuses the shared card) */}
      <Card testID="bm-preview">
        <SectionTitle
          label="WHAT YOU CAN TEST"
          right={
            <Pressable testID="bm-view-all" onPress={() => router.push("/benchmark/library")} accessibilityRole="button" accessibilityLabel="View all benchmark tests" style={s.viewAll}>
              <Text style={s.viewAllText}>View all</Text>
              <Ionicons name="arrow-forward" size={13} color={CC.rouge} />
            </Pressable>
          }
        />
        <View style={s.grid}>
          {BENCHMARK_TESTS.slice(0, 4).map((t) => (
            <BenchmarkTestCard key={t.id} test={t} onPress={() => router.push(`/benchmark/${t.id}`)} />
          ))}
        </View>
        <Text style={s.previewHint}>
          {AVAILABLE_TESTS.length} tests are ready to launch, with more on the way. Open the library for full details,
          readiness checks and guided setup.
        </Text>
      </Card>
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  heroRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  coachImg: { width: 72, height: 72, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)" },
  heroKicker: { color: CC.rouge, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  heroTitle: { color: CC.white, fontSize: 22, fontWeight: "800", marginTop: 4 },
  heroBody: { color: CC.dim, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  cta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, alignSelf: "flex-start", backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, minHeight: 46 },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  center: { paddingVertical: 24, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 18, gap: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: CC.white, fontSize: 16, fontWeight: "800" },
  emptyBody: { color: CC.dim, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 460 },

  resultRow: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 12 },
  resultTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  resultMeta: { color: CC.dim, fontSize: 12 },

  viewAll: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAllText: { color: CC.rouge, fontSize: 12, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  previewHint: { color: CC.dim, fontSize: 12, marginTop: 14, lineHeight: 17 },
});
