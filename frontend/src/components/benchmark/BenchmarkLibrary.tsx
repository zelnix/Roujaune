import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { CC } from "@/src/components/calendar";
import { BENCHMARK_TESTS, CATEGORY_META, CATEGORY_ORDER, needsNoPower } from "@/src/lib/benchmark/catalog";
import { BenchmarkTestCard } from "./BenchmarkTestCard";
import type { BenchmarkCategory, BenchmarkTest } from "@/src/lib/benchmark/types";

type Filter = "all" | "maximal" | "submaximal" | "no_power" | BenchmarkCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All Tests" },
  { key: "threshold", label: "Threshold" },
  { key: "aerobic_power", label: "Aerobic Power" },
  { key: "short_power", label: "Short-Duration Power" },
  { key: "endurance", label: "Endurance" },
  { key: "technique", label: "Technique" },
  { key: "recovery", label: "Recovery" },
  { key: "maximal", label: "Maximal" },
  { key: "submaximal", label: "Submaximal" },
  { key: "no_power", label: "No Power Required" },
];

function matches(t: BenchmarkTest, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "maximal") return t.effort === "maximal";
  if (f === "submaximal") return t.effort === "submaximal";
  if (f === "no_power") return needsNoPower(t);
  return t.category === f;
}

// Exported so screens can type their initial filter (e.g. "submaximal").
export type BenchmarkLibraryFilter = Filter;

/** Reusable Benchmark Test Library — filters + grouped/flat grid. */
export function BenchmarkLibrary({ initialFilter = "all" }: { initialFilter?: Filter }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>(initialFilter);

  const goDetails = (id: string) => router.push(`/benchmark/${id}`);
  const goStart = (id: string) => router.push(`/benchmark/setup/${id}`);

  const filtered = BENCHMARK_TESTS.filter((t) => matches(t, filter));
  const grouped = filter === "all";

  return (
    <View style={{ gap: 12 }}>
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
              accessibilityLabel={`Filter: ${f.label}`}
              style={[s.filter, on && s.filterOn]}
            >
              <Text style={[s.filterText, on && s.filterTextOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <Text style={s.empty}>No tests match this filter yet.</Text>
      ) : grouped ? (
        CATEGORY_ORDER.map((cat) => {
          const tests = BENCHMARK_TESTS.filter((t) => t.category === cat);
          if (tests.length === 0) return null;
          return (
            <View key={cat} style={{ gap: 10 }}>
              <View style={s.groupHead}>
                <View style={[s.groupDot, { backgroundColor: CATEGORY_META[cat].color }]} />
                <Text style={s.groupTitle} accessibilityRole="header">{CATEGORY_META[cat].label}</Text>
              </View>
              <View style={s.grid}>
                {tests.map((t) => (
                  <BenchmarkTestCard key={t.id} test={t} onViewDetails={() => goDetails(t.id)} onStart={() => goStart(t.id)} />
                ))}
              </View>
            </View>
          );
        })
      ) : (
        <View style={s.grid}>
          {filtered.map((t) => (
            <BenchmarkTestCard key={t.id} test={t} onViewDetails={() => goDetails(t.id)} onStart={() => goStart(t.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  filterRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  filter: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  filterOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  filterText: { color: CC.dim, fontSize: 12, fontWeight: "700" },
  filterTextOn: { color: "#fff" },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  groupDot: { width: 9, height: 9, borderRadius: 5 },
  groupTitle: { color: CC.white, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  empty: { color: CC.dim, fontSize: 13, paddingVertical: 20, textAlign: "center" },
});
