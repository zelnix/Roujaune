import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { CATEGORY_META } from "@/src/lib/benchmark/catalog";
import type { BenchmarkTest } from "@/src/lib/benchmark/types";

const INTENSITY_LABEL: Record<BenchmarkTest["intensity"], string> = {
  moderate: "Moderate",
  hard: "Hard",
  maximal: "Maximal",
};

/**
 * Reusable benchmark test card — used on the landing preview and the full
 * library. Data-driven from a `BenchmarkTest`. `onPress` is optional so it can
 * render as a static preview or an interactive, accessible button.
 */
export function BenchmarkTestCard({ test, onPress }: { test: BenchmarkTest; onPress?: () => void }) {
  const cat = CATEGORY_META[test.category];
  const soon = test.availability === "coming_soon";
  const interactive = !!onPress;

  const body = (hovered?: boolean) => (
    <>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: `${cat.color}22` }]}>
          <Ionicons name={test.icon} size={20} color={cat.color} />
        </View>
        {soon
          ? <View style={s.soonPill}><Text style={s.soonText}>SOON</Text></View>
          : <View style={[s.chip, { borderColor: `${cat.color}66` }]}><Text style={[s.chipText, { color: cat.color }]}>{cat.label}</Text></View>}
      </View>
      <Text style={s.name} numberOfLines={2}>{test.name}</Text>
      <Text style={s.summary} numberOfLines={3}>{test.summary}</Text>
      <View style={s.metaRow}>
        <Ionicons name="time-outline" size={13} color={CC.dim} />
        <Text style={s.meta}>~{test.durationMin} min</Text>
        <Text style={s.dot}>·</Text>
        <Ionicons name="flame-outline" size={13} color={CC.dim} />
        <Text style={s.meta}>{INTENSITY_LABEL[test.intensity]}</Text>
      </View>
      <View style={s.measureRow}>
        {test.measures.slice(0, 2).map((m) => (
          <View key={m} style={s.measureChip}><Text style={s.measureText}>{m}</Text></View>
        ))}
      </View>
      {interactive && (
        <View style={s.footer}>
          <Text style={[s.footerText, hovered && { color: CC.white }]}>{soon ? "Preview details" : "View details"}</Text>
          <Ionicons name="chevron-forward" size={15} color={hovered ? CC.white : CC.dim} />
        </View>
      )}
    </>
  );

  if (!interactive) {
    return (
      <View style={[s.card, soon && s.cardSoon]} accessibilityLabel={`${test.name}. ${cat.label}. ${soon ? "Coming soon" : "Available"}`}>
        {body()}
      </View>
    );
  }

  return (
    <Pressable
      testID={`bm-testcard-${test.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${test.name}. ${cat.label}. ${soon ? "Coming soon" : "Available"}. View details`}
      style={({ hovered }: any) => [s.card, soon && s.cardSoon, hovered && s.cardHover]}
    >
      {({ hovered }: any) => body(hovered)}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: 240, maxWidth: 360, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 14, borderWidth: 1.5, borderColor: CC.borderSoft, padding: 14, gap: 8 },
  cardSoon: { opacity: 0.8 },
  cardHover: { borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(255,255,255,0.035)" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  soonPill: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  soonText: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  name: { color: CC.white, fontSize: 15.5, fontWeight: "800" },
  summary: { color: CC.dim, fontSize: 12.5, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  meta: { color: CC.dim, fontSize: 11.5, fontWeight: "600" },
  dot: { color: CC.dim, fontSize: 11.5, marginHorizontal: 2 },
  measureRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  measureChip: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  measureText: { color: CC.white, fontSize: 10.5, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 10 },
  footerText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
});
