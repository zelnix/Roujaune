import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest, CATEGORY_META } from "@/src/lib/benchmark/catalog";
import type { EquipmentKey } from "@/src/lib/benchmark/types";

const EQUIP_META: Record<EquipmentKey, { label: string; icon: any }> = {
  smart_trainer: { label: "Smart trainer", icon: "hardware-chip-outline" },
  power_meter: { label: "Power meter", icon: "flash-outline" },
  heart_rate: { label: "Heart-rate strap", icon: "heart-outline" },
  cadence: { label: "Cadence sensor", icon: "sync-outline" },
  speed: { label: "Speed sensor", icon: "speedometer-outline" },
};

export default function BenchmarkDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const test = getBenchmarkTest(String(id));
  const [notice, setNotice] = React.useState<string | null>(null);

  if (!test) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
        <StatusBar hidden />
        <View style={s.header}>
          <Pressable testID="detail-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
            <Ionicons name="chevron-back" size={20} color={CC.dim} />
            <Text style={s.backText}>Library</Text>
          </Pressable>
        </View>
        <View style={s.missing}>
          <Ionicons name="alert-circle-outline" size={26} color={CC.dim} />
          <Text style={s.missingText}>We couldn&apos;t find that benchmark.</Text>
          <Pressable testID="detail-to-library" onPress={() => router.replace("/benchmark")} style={s.ghostBtn}><Text style={s.ghostText}>Back to Benchmark Workouts</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cat = CATEGORY_META[test.category];
  const maximal = test.effort === "maximal";

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="detail-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>Library</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleRow}>
          <View style={[s.icon, { backgroundColor: `${cat.color}22` }]}>
            <Ionicons name={test.icon} size={26} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.chipRow}>
              <View style={[s.chip, { borderColor: `${cat.color}66` }]}><Text style={[s.chipText, { color: cat.color }]}>{cat.label}</Text></View>
              <View style={[s.effort, maximal ? s.effortMax : s.effortSub]}>
                <Ionicons name={maximal ? "flame" : "leaf"} size={11} color={maximal ? "#FF7A66" : "#7FD98A"} />
                <Text style={[s.effortText, { color: maximal ? "#FF7A66" : "#7FD98A" }]}>{maximal ? "Maximal" : "Submaximal"}</Text>
              </View>
            </View>
            <Text style={s.title} accessibilityRole="header">{test.name}</Text>
          </View>
        </View>

        <Text style={s.purpose}>{test.purpose}</Text>

        <View style={s.factsRow}>
          <Fact icon="time-outline" label="Duration" value={`~${test.durationMin} min`} />
          <Fact icon="barbell-outline" label="Difficulty" value={test.difficulty} />
          <Fact icon="repeat-outline" label="Frequency" value={test.recommendedFrequency} />
        </View>

        <View style={s.factsRow}>
          <Fact icon={maximal ? "flame-outline" : "leaf-outline"} label="Effort" value={maximal ? "Maximal" : "Submaximal"} />
          <Fact icon="home-outline" label="Indoor" value={test.indoorCompatible ? "Yes" : "No"} />
          <Fact icon="bicycle-outline" label="Outdoor" value={test.outdoorCompatible ? "Yes" : "No"} />
        </View>

        <Section title="WHO IT'S FOR"><Text style={s.body}>{test.whoFor}</Text></Section>

        <Section title="WHAT IT MEASURES">
          <Text style={s.body}>{test.whatItMeasures}</Text>
          <View style={s.measureRow}>
            {test.measures.map((m) => <View key={m} style={s.measureChip}><Text style={s.measureText}>{m}</Text></View>)}
          </View>
        </Section>

        <Section title="REQUIRED EQUIPMENT">
          <View style={s.equipRow}>
            {test.requiredEquipment.map((e) => (
              <View key={e} style={s.equipChip}><Ionicons name={EQUIP_META[e].icon} size={14} color={CC.dim} /><Text style={s.equipText}>{EQUIP_META[e].label}</Text></View>
            ))}
          </View>
          {test.optionalEquipment.length > 0 && (
            <>
              <Text style={s.optLabel}>Optional</Text>
              <View style={s.equipRow}>
                {test.optionalEquipment.map((e) => (
                  <View key={e} style={[s.equipChip, s.equipOpt]}><Ionicons name={EQUIP_META[e].icon} size={14} color={CC.dim} /><Text style={s.equipText}>{EQUIP_META[e].label}</Text></View>
                ))}
              </View>
            </>
          )}
        </Section>

        <Section title="HOW THE TEST RUNS">
          <Phase label="Warm-up" text={test.warmupSummary} />
          <Phase label="Main test" text={test.mainTestSummary} />
          <Phase label="Cool-down" text={test.cooldownSummary} />
        </Section>

        <Section title="RECOVERY"><Text style={s.body}>{test.recoveryRecommendation}</Text></Section>

        <View style={s.safety} testID="detail-safety">
          <Ionicons name="shield-checkmark-outline" size={18} color={CC.yellow} />
          <View style={{ flex: 1 }}>
            <Text style={s.safetyTitle}>Safety</Text>
            <Text style={s.safetyText}>{test.safetyInfo}</Text>
            {maximal && <Text style={s.safetyText}>Before you begin, we&apos;ll run a quick readiness check. You can stop at any time.</Text>}
          </View>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable testID="detail-start" onPress={() => router.push(`/benchmark/readiness/${test.id}`)} accessibilityRole="button" accessibilityLabel={`Start the ${test.name}`} style={s.startBtn}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={s.startText}>Start Test</Text>
          </Pressable>
          <Pressable testID="detail-schedule" onPress={() => setNotice("Scheduling arrives with the training-calendar integration.")} accessibilityRole="button" accessibilityLabel="Schedule this test" style={s.ghostBtn}>
            <Text style={s.ghostText}>Schedule Test</Text>
          </Pressable>
        </View>
        <Pressable testID="detail-home" onPress={() => router.push("/benchmark")} accessibilityRole="button" accessibilityLabel="Back to Benchmark Workouts" style={s.homeLink}>
          <Ionicons name="arrow-back" size={14} color={CC.dim} />
          <Text style={s.homeLinkText}>Back to Benchmark Workouts</Text>
        </Pressable>
        {notice && (
          <View style={s.notice} testID="detail-notice"><Ionicons name="information-circle-outline" size={15} color={CC.dim} /><Text style={s.noticeText}>{notice}</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Ionicons name={icon} size={16} color={CC.rouge} />
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<View style={s.section}><Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>{children}</View>);
}
function Phase({ label, text }: { label: string; text: string }) {
  return (
    <View style={s.phase}>
      <View style={s.phaseDot} />
      <View style={{ flex: 1 }}><Text style={s.phaseLabel}>{label}</Text><Text style={s.body}>{text}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 22, paddingBottom: 44, gap: 14, maxWidth: 820, width: "100%", alignSelf: "center" },

  titleRow: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginTop: 6 },
  icon: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },
  effort: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  effortMax: { backgroundColor: "rgba(255,122,102,0.12)" },
  effortSub: { backgroundColor: "rgba(127,217,138,0.12)" },
  effortText: { fontSize: 10, fontWeight: "800" },
  title: { color: CC.white, fontSize: 24, fontWeight: "800", marginTop: 6 },
  purpose: { color: CC.dim, fontSize: 14, lineHeight: 21 },

  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { flexGrow: 1, flexBasis: 130, backgroundColor: CC.card, borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 12, gap: 3 },
  factLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, marginTop: 4 },
  factValue: { color: CC.white, fontSize: 13.5, fontWeight: "700" },

  section: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 16, gap: 10 },
  sectionTitle: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },
  body: { color: CC.dim, fontSize: 13.5, lineHeight: 20 },
  measureRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  measureChip: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  measureText: { color: CC.white, fontSize: 11.5, fontWeight: "700" },

  equipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  equipChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.03)" },
  equipOpt: { opacity: 0.75, borderStyle: "dashed" },
  equipText: { color: CC.white, fontSize: 12, fontWeight: "700" },
  optLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, marginTop: 4 },

  phase: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  phaseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CC.rouge, marginTop: 6 },
  phaseLabel: { color: CC.white, fontSize: 13, fontWeight: "800", marginBottom: 2 },

  safety: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.25)", borderRadius: 12, padding: 14 },
  safetyTitle: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4, marginBottom: 4 },
  safetyText: { color: CC.white, fontSize: 12.5, lineHeight: 18, marginBottom: 4 },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  startBtn: { flexGrow: 1, flexBasis: 160, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, minHeight: 52 },
  startText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ghostBtn: { flexGrow: 1, flexBasis: 160, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 14, paddingVertical: 15, minHeight: 52, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  homeLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  homeLinkText: { color: CC.dim, fontSize: 13, fontWeight: "700" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8 },
  noticeText: { color: CC.dim, fontSize: 12.5, flex: 1, lineHeight: 17 },

  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  missingText: { color: CC.dim, fontSize: 14, textAlign: "center" },
});
