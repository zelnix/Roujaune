import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { BENCHMARK_TESTS, CATEGORY_META, AVAILABLE_TESTS } from "@/src/lib/benchmark/catalog";
import { BenchmarkTestCard } from "@/src/components/benchmark/BenchmarkTestCard";
import type { BenchmarkCategory } from "@/src/lib/benchmark/types";

type Filter = "all" | "available" | BenchmarkCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All tests" },
  { key: "available", label: "Ready now" },
  { key: "ftp", label: CATEGORY_META.ftp.label },
  { key: "aerobic", label: CATEGORY_META.aerobic.label },
  { key: "anaerobic", label: CATEGORY_META.anaerobic.label },
  { key: "neuromuscular", label: CATEGORY_META.neuromuscular.label },
  { key: "skill", label: CATEGORY_META.skill.label },
];

export default function BenchmarkLibraryScreen() {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");

  const tests = React.useMemo(() => {
    if (filter === "all") return BENCHMARK_TESTS;
    if (filter === "available") return BENCHMARK_TESTS.filter((t) => t.availability === "available");
    return BENCHMARK_TESTS.filter((t) => t.category === filter);
  }, [filter]);

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="lib-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>Benchmark</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title} accessibilityRole="header">Test Library</Text>
        <Text style={s.sub}>
          Choose a benchmark to see what it measures and how it runs. {AVAILABLE_TESTS.length} are ready now — more are on the way.
        </Text>

        {/* Category filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`lib-filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[s.filter, on && s.filterOn]}
              >
                <Text style={[s.filterText, on && s.filterTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tests.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="search-outline" size={22} color={CC.dim} />
            <Text style={s.emptyText}>No tests in this category yet.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {tests.map((t) => (
              <BenchmarkTestCard key={t.id} test={t} onPress={() => router.push(`/benchmark/${t.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 22, paddingBottom: 40, gap: 14 },
  title: { color: CC.white, fontSize: 28, fontWeight: "800", marginTop: 6 },
  sub: { color: CC.dim, fontSize: 13, lineHeight: 19 },
  filterRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  filter: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 40, justifyContent: "center" },
  filterOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  filterText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  filterTextOn: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyText: { color: CC.dim, fontSize: 13 },
});
