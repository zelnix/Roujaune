import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../theme";
import { useTodayReadiness, readinessTone, shouldGate } from "../lib/checkin";
import { getRiderProfile } from "../lib/rider-profile";
import { CAPABILITY_TO_LEVEL } from "../lib/workout-catalog";

// Map the rider's capability to a level-matched recovery ride.
function bestRecoveryId(): string {
  const cap = getRiderProfile().capability ?? "intermediate";
  const level = CAPABILITY_TO_LEVEL[cap] ?? "Development";
  const byLevel: Record<string, string> = {
    Foundation: "recovery-spin-foundation",
    Development: "recovery-spin-development",
    Performance: "recovery-spin-performance",
  };
  return byLevel[level] ?? "recovery-spin";
}

/** A supportive banner shown when today's readiness suggests easing off. */
export function ReadinessGate() {
  const router = useRouter();
  const { readiness } = useTodayReadiness();
  if (!shouldGate(readiness)) return null;

  const safety = !!readiness.safetyOverride;
  const tone = readinessTone(readiness.score, safety);
  const title = safety ? "Please rest today" : "Recovery recommended today";
  const detail = safety
    ? "You flagged a symptom that needs care — skip training and consider medical advice."
    : readiness.mainFactors?.[0] ?? "Your readiness is low — an easier ride will serve you better today.";

  return (
    <View style={[styles.banner, { borderColor: tone.color }]} testID="readiness-gate">
      <View style={[styles.iconWrap, { backgroundColor: `${tone.color}22`, borderColor: tone.color }]}>
        <Ionicons name={safety ? "medkit" : "leaf-outline"} size={20} color={tone.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {readiness.score != null && !safety ? (
            <View style={[styles.pill, { borderColor: tone.color }]}>
              <Text style={[styles.pillText, { color: tone.color }]}>Readiness {readiness.score}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.detail}>{detail}</Text>
        {!safety ? (
          <View style={styles.actions}>
            <Pressable
              testID="gate-recovery-start"
              onPress={() => router.push({ pathname: "/workout", params: { workoutId: bestRecoveryId() } } as any)}
              style={styles.primaryBtn}
            >
              <Ionicons name="heart-outline" size={15} color="#241B00" />
              <Text style={styles.primaryBtnText}>Start recovery ride</Text>
            </Pressable>
            <Pressable
              testID="gate-recovery-browse"
              onPress={() => router.push({ pathname: "/workout-list", params: { type: "recovery" } } as any)}
              style={styles.ghostBtn}
            >
              <Text style={styles.ghostBtnText}>Browse recovery</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", gap: 14, alignItems: "flex-start", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  pill: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: "800" },
  detail: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 11, flexWrap: "wrap" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.yellow, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
  primaryBtnText: { color: "#241B00", fontSize: 13, fontWeight: "800" },
  ghostBtn: { justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
  ghostBtnText: { color: colors.white, fontSize: 13, fontWeight: "700" },
});
