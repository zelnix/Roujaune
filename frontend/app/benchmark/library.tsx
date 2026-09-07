import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { CC } from "@/src/components/calendar";
import { AVAILABLE_TESTS } from "@/src/lib/benchmark/catalog";
import { BenchmarkLibrary, type BenchmarkLibraryFilter } from "@/src/components/benchmark/BenchmarkLibrary";

export default function BenchmarkLibraryScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = (filter ?? "all") as BenchmarkLibraryFilter;
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="lib-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>Benchmark Workouts</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title} accessibilityRole="header">Test Library</Text>
        <Text style={s.sub}>
          Choose a benchmark to see what it measures and how it runs. {AVAILABLE_TESTS.length} tests across six fitness areas.
        </Text>
        <BenchmarkLibrary initialFilter={initialFilter} />
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
});
