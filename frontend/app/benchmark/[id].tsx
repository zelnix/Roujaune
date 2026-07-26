import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest, CATEGORY_META } from "@/src/lib/benchmark/catalog";
import type { EquipmentKey, TestInterval } from "@/src/lib/benchmark/types";

const EQUIPMENT_META: Record<EquipmentKey, { label: string; icon: any }> = {
  smart_trainer: { label: "Smart trainer", icon: "hardware-chip-outline" },
  power_meter: { label: "Power meter", icon: "flash-outline" },
  heart_rate: { label: "Heart-rate strap", icon: "heart-outline" },
  cadence: { label: "Cadence sensor", icon: "sync-outline" },
  speed: { label: "Speed sensor", icon: "speedometer-outline" },
};
const INTENSITY_LABEL = { moderate: "Moderate", hard: "Hard", maximal: "Maximal" } as const;

function fmtDur(sec: number): string {
  if (sec === 0) return "to exhaustion";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}

function intervalTarget(iv: TestInterval): string {
  if (iv.targetType === "ftp_pct" && iv.targetLowPct != null) {
    const base = iv.targetLowPct === iv.targetHighPct ? `${iv.targetLowPct}% FTP` : `${iv.targetLowPct}–${iv.targetHighPct}% FTP`;
    if (iv.cadenceLow != null) return `${base} · ${iv.cadenceLow}–${iv.cadenceHigh} rpm`;
    return base;
  }
  if (iv.targetType === "ramp") return `+${iv.rampStepWatts}W every ${iv.rampStepSec}s from ${iv.rampStartWatts}W`;
  if (iv.targetType === "rpe") return "by feel";
  return "free ride";
}

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
          <Text style={s.missingText}>We couldn&apos;t find that benchmark. It may have moved.</Text>
          <Pressable testID="detail-to-library" onPress={() => router.replace("/benchmark/library")} style={s.secondaryBtn}>
            <Text style={s.secondaryText}>Back to library</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cat = CATEGORY_META[test.category];
  const soon = test.availability === "coming_soon";

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
        {/* Header */}
        <View style={s.titleRow}>
          <View style={[s.icon, { backgroundColor: `${cat.color}22` }]}>
            <Ionicons name={test.icon} size={26} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.chipRow}>
              <View style={[s.chip, { borderColor: `${cat.color}66` }]}><Text style={[s.chipText, { color: cat.color }]}>{cat.label}</Text></View>
              {soon && <View style={s.soonPill}><Text style={s.soonText}>COMING SOON</Text></View>}
            </View>
            <Text style={s.title} accessibilityRole="header">{test.name}</Text>
          </View>
        </View>
        <Text style={s.desc}>{test.description}</Text>

        {/* Quick facts */}
        <View style={s.factsRow}>
          <Fact icon="time-outline" label="Duration" value={`~${test.durationMin} min`} />
          <Fact icon="flame-outline" label="Intensity" value={INTENSITY_LABEL[test.intensity]} />
          <Fact icon="repeat-outline" label="Frequency" value={test.recommendedFrequency} />
        </View>

        {/* What it measures */}
        <Section title="WHAT IT MEASURES">
          <Text style={s.body}>{test.whatItMeasures}</Text>
          <View style={s.measureRow}>
            {test.measures.map((m) => <View key={m} style={s.measureChip}><Text style={s.measureText}>{m}</Text></View>)}
          </View>
        </Section>

        {/* How it works */}
        <Section title="HOW IT WORKS">
          {test.howItWorks.map((step, i) => (
            <View key={i} style={s.step}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </Section>

        {/* Structure / interval overview */}
        <Section title="TEST STRUCTURE">
          {test.intervals.length === 0 ? (
            <Text style={s.body}>The full structure for this benchmark is being finalised and will appear here soon.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {test.intervals.map((iv, i) => (
                <View key={i} style={s.ivRow}>
                  <View style={[s.ivDot, { backgroundColor: cat.color }]} />
                  <Text style={s.ivLabel}>{iv.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={s.ivTarget}>{intervalTarget(iv)}</Text>
                  <Text style={s.ivDur}>{fmtDur(iv.durationSec)}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Equipment */}
        <Section title="YOU'LL NEED">
          <View style={s.equipRow}>
            {test.requiredEquipment.map((e) => (
              <View key={e} style={s.equipChip}>
                <Ionicons name={EQUIPMENT_META[e].icon} size={14} color={CC.dim} />
                <Text style={s.equipText}>{EQUIPMENT_META[e].label}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Maximal-effort safety note */}
        {test.requiresMaximalEffort && (
          <View style={s.safety} testID="detail-safety">
            <Ionicons name="shield-checkmark-outline" size={18} color={CC.yellow} />
            <Text style={s.safetyText}>
              This is a maximal effort. Before you begin, we&apos;ll run a quick readiness check to make sure it&apos;s a
              safe day to test. You can stop at any time.
            </Text>
          </View>
        )}

        {/* Primary action */}
        {soon ? (
          <View style={[s.startBtn, s.startDisabled]} testID="detail-start-disabled" accessibilityLabel="This benchmark is coming soon">
            <Ionicons name="lock-closed-outline" size={18} color={CC.dim} />
            <Text style={s.startDisabledText}>Coming soon</Text>
          </View>
        ) : (
          <Pressable
            testID="detail-start"
            onPress={() => setNotice("Readiness check, equipment setup and the guided test start in the next update.")}
            accessibilityRole="button"
            accessibilityLabel={`Start the ${test.name}`}
            style={({ hovered }: any) => [s.startBtn, hovered && { opacity: 0.92 }]}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={s.startText}>Start test</Text>
            <View style={s.soonMini}><Text style={s.soonMiniText}>SOON</Text></View>
          </Pressable>
        )}
        {notice && (
          <View style={s.notice} testID="detail-notice">
            <Ionicons name="information-circle-outline" size={15} color={CC.dim} />
            <Text style={s.noticeText}>{notice}</Text>
          </View>
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
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 22, paddingBottom: 44, gap: 16, maxWidth: 820, width: "100%", alignSelf: "center" },

  titleRow: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginTop: 6 },
  icon: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },
  soonPill: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  soonText: { color: CC.dim, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  title: { color: CC.white, fontSize: 24, fontWeight: "800", marginTop: 6 },
  desc: { color: CC.dim, fontSize: 14, lineHeight: 21 },

  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { flexGrow: 1, flexBasis: 150, backgroundColor: CC.card, borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 12, gap: 3 },
  factLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, marginTop: 4 },
  factValue: { color: CC.white, fontSize: 13.5, fontWeight: "700" },

  section: { backgroundColor: CC.card, borderRadius: 14, borderWidth: 1, borderColor: CC.border, padding: 16, gap: 10 },
  sectionTitle: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },
  body: { color: CC.dim, fontSize: 13.5, lineHeight: 20 },
  measureRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  measureChip: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  measureText: { color: CC.white, fontSize: 11.5, fontWeight: "700" },

  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(201,23,39,0.15)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumText: { color: CC.rouge, fontSize: 11.5, fontWeight: "800" },
  stepText: { flex: 1, color: CC.white, fontSize: 13.5, lineHeight: 20 },

  ivRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: CC.borderSoft, paddingBottom: 8 },
  ivDot: { width: 8, height: 8, borderRadius: 4 },
  ivLabel: { color: CC.white, fontSize: 13, fontWeight: "700" },
  ivTarget: { color: CC.dim, fontSize: 11.5, marginRight: 10 },
  ivDur: { color: CC.white, fontSize: 12.5, fontWeight: "800", minWidth: 78, textAlign: "right" },

  equipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  equipChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.03)" },
  equipText: { color: CC.white, fontSize: 12, fontWeight: "700" },

  safety: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.25)", borderRadius: 12, padding: 14 },
  safetyText: { flex: 1, color: CC.white, fontSize: 12.5, lineHeight: 18 },

  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, minHeight: 52 },
  startText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  soonMini: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  soonMiniText: { color: "#fff", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  startDisabled: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border },
  startDisabledText: { color: CC.dim, fontSize: 15, fontWeight: "800" },

  notice: { flexDirection: "row", alignItems: "center", gap: 8 },
  noticeText: { color: CC.dim, fontSize: 12.5, flex: 1, lineHeight: 17 },

  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  missingText: { color: CC.dim, fontSize: 14, textAlign: "center" },
  secondaryBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: "rgba(255,255,255,0.03)" },
  secondaryText: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
});
