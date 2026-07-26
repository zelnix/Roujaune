import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { CATEGORY_META } from "@/src/lib/benchmark/catalog";
import type { BenchmarkTest, EquipmentKey } from "@/src/lib/benchmark/types";

const EQUIP_ICON: Record<EquipmentKey, any> = {
  smart_trainer: "hardware-chip-outline",
  power_meter: "flash-outline",
  heart_rate: "heart-outline",
  cadence: "sync-outline",
  speed: "speedometer-outline",
};
const EQUIP_LABEL: Record<EquipmentKey, string> = {
  smart_trainer: "Smart trainer", power_meter: "Power meter", heart_rate: "Heart rate", cadence: "Cadence", speed: "Speed",
};

/**
 * Reusable benchmark test card (Part 3). Data-driven from a `BenchmarkTest`.
 * Shows name, category, short description, duration, difficulty, effort type,
 * recommended equipment, and View Details / Start Test actions.
 */
export function BenchmarkTestCard({
  test, onViewDetails, onStart,
}: { test: BenchmarkTest; onViewDetails: () => void; onStart: () => void }) {
  const cat = CATEGORY_META[test.category];
  const maximal = test.effort === "maximal";

  return (
    <View
      style={s.card}
      accessibilityLabel={`${test.name}. ${cat.label}. ${maximal ? "Maximal" : "Submaximal"} effort. ${test.durationMin} minutes.`}
    >
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: `${cat.color}22` }]}>
          <Ionicons name={test.icon} size={20} color={cat.color} />
        </View>
        <View style={[s.chip, { borderColor: `${cat.color}66` }]}>
          <Text style={[s.chipText, { color: cat.color }]}>{cat.label}</Text>
        </View>
      </View>

      <Text style={s.name} numberOfLines={2}>{test.name}</Text>
      <Text style={s.summary} numberOfLines={3}>{test.summary}</Text>

      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <Ionicons name="time-outline" size={13} color={CC.dim} />
          <Text style={s.meta}>~{test.durationMin} min</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons name="barbell-outline" size={13} color={CC.dim} />
          <Text style={s.meta}>{test.difficulty}</Text>
        </View>
        <View style={[s.effort, maximal ? s.effortMax : s.effortSub]}>
          <Ionicons name={maximal ? "flame" : "leaf"} size={11} color={maximal ? "#FF7A66" : "#7FD98A"} />
          <Text style={[s.effortText, { color: maximal ? "#FF7A66" : "#7FD98A" }]}>{maximal ? "Maximal" : "Submaximal"}</Text>
        </View>
      </View>

      <View style={s.equipRow} accessibilityLabel={`Equipment: ${test.requiredEquipment.map((e) => EQUIP_LABEL[e]).join(", ")}`}>
        <Text style={s.equipLabel}>Needs</Text>
        {test.requiredEquipment.map((e) => (
          <View key={e} style={s.equipChip}>
            <Ionicons name={EQUIP_ICON[e]} size={12} color={CC.dim} />
            <Text style={s.equipText}>{EQUIP_LABEL[e]}</Text>
          </View>
        ))}
      </View>

      <View style={s.actions}>
        <Pressable
          testID={`bm-view-${test.id}`}
          onPress={onViewDetails}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${test.name}`}
          style={({ hovered }: any) => [s.btnGhost, hovered && s.btnGhostHover]}
        >
          <Text style={s.btnGhostText}>View Details</Text>
        </Pressable>
        <Pressable
          testID={`bm-start-${test.id}`}
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`Start the ${test.name}`}
          style={({ hovered }: any) => [s.btnPrimary, hovered && { opacity: 0.92 }]}
        >
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={s.btnPrimaryText}>Start Test</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: 260, maxWidth: 380, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 14, borderWidth: 1.5, borderColor: CC.borderSoft, padding: 14, gap: 9 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  name: { color: CC.white, fontSize: 15.5, fontWeight: "800" },
  summary: { color: CC.dim, fontSize: 12.5, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: CC.dim, fontSize: 11.5, fontWeight: "600" },
  effort: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  effortMax: { backgroundColor: "rgba(255,122,102,0.12)" },
  effortSub: { backgroundColor: "rgba(127,217,138,0.12)" },
  effortText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  equipRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  equipLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, marginRight: 2 },
  equipChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  equipText: { color: CC.white, fontSize: 10.5, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 11 },
  btnGhost: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 10, minHeight: 42, backgroundColor: "rgba(255,255,255,0.03)" },
  btnGhostHover: { borderColor: "rgba(255,255,255,0.28)" },
  btnGhostText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  btnPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: CC.rouge, borderRadius: 10, paddingVertical: 10, minHeight: 42 },
  btnPrimaryText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },
});
