import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme";
import { coach } from "../data";
import { useCoach } from "../lib/coach-persona";
import { usePlan } from "../lib/plan";
import { PrimaryButton } from "./ui";

const KIND_LABEL: Record<string, string> = { recovery: "Recovery", rest: "Rest", strength: "Strength", balance: "Balance", mobility: "Mobility", cycling: "" };

export function AlbertoCoachCard({ width, onStart, onMessage, compact = false }: { width: number; onStart: () => void; onMessage?: () => void; compact?: boolean }) {
  const persona = useCoach();
  const { plan } = usePlan();
  // The next scheduled activity of ANY type (ride, strength, recovery, rest…).
  const next = (plan.workouts?.find((w) => !w.completed) ?? plan.workouts?.[0]) as any;

  const isRest = next?.type === "rest";
  const kindLabel = KIND_LABEL[next?.type ?? "cycling"] ?? "";
  const dayLabel = next?.is_today ? "Today" : (next?.date_label ?? "");
  const headline = isRest ? "Rest & Recovery" : (next?.title ?? coach.quote);
  const support = next
    ? [dayLabel, kindLabel, next.duration, next.type === "cycling" ? next.zone : null, next.type === "cycling" ? next.tss : null]
        .filter(Boolean).join(" · ")
    : coach.support;

  // Phase / week acknowledgment kicker.
  const h = plan.hero;
  const heroKicker = h
    ? (h.is_phase_start
        ? `START OF PHASE ${h.phase_number} · ${(h.phase_name || "").toUpperCase()}`
        : `PHASE ${h.phase_number} · ${h.phase_name} · WEEK ${h.week_in_phase}`)
    : null;

  const cta = next?.is_today
    ? (isRest ? "View Today's Plan" : "View Today's Workout")
    : (isRest ? "View Next Scheduled Day" : "View Next Scheduled Workout");
  const portraitW = compact ? 108 : 138;
  return (
    <LinearGradient
      testID="alberto-coach-card"
      colors={["rgba(23,20,18,0.92)", "rgba(10,9,8,0.92)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { width }, compact && { minHeight: 150 }]}
    >
      <View style={[styles.portraitWrap, { width: portraitW }, compact && { minHeight: 150 }]}>
        <Image source={persona.image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top center" accessibilityLabel={`Coach ${persona.name}`} />
        <LinearGradient
          colors={["transparent", "rgba(10,9,8,0.9)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />
      </View>

      <View style={[styles.body, compact && { padding: spacing.sm }]}>
        {heroKicker ? (
          <View style={styles.kickerRow} testID="hero-phase-kicker">
            <Ionicons name={h?.is_phase_start ? "flag" : "calendar-outline"} size={11} color={colors.red} />
            <Text style={styles.kicker} numberOfLines={1}>{heroKicker}</Text>
          </View>
        ) : null}
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, compact && { fontSize: 15 }]}>{persona.name}</Text>
            <Text style={styles.role}>{plan.title ?? coach.role}</Text>
          </View>
          <Text style={[styles.quoteMark, compact && { fontSize: 34, lineHeight: 34 }]}>&#8220;</Text>
        </View>

        <Text style={[styles.quote, compact && { fontSize: 18, lineHeight: 21 }]} numberOfLines={2}>{headline}</Text>
        <Text style={[styles.support, compact && { fontSize: 11, lineHeight: 15, marginTop: 5 }]} numberOfLines={2}>{support}</Text>

        <PrimaryButton
          testID="start-ride-button"
          label={cta}
          onPress={onStart}
          style={[{ marginTop: spacing.sm, alignSelf: "stretch" }, Platform.select({ web: { boxShadow: "none" }, default: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 } }) as any]}
        />
        <View style={styles.linkRow}>
          {onMessage ? (
            <Pressable
              testID="home-message-coach"
              onPress={onMessage}
              accessibilityRole="button"
              accessibilityLabel={`Message ${persona.name}`}
              style={({ hovered }: any) => [styles.msgBtn, hovered && styles.msgBtnHover]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.yellow} />
              <Text style={styles.msgText} numberOfLines={1}>Message {persona.name}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    minHeight: 190,
  },
  portraitWrap: { width: 138, alignSelf: "stretch", minHeight: 190 },
  portrait: { width: "100%", height: "100%" },
  body: { flex: 1, padding: spacing.md, justifyContent: "center" },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  kicker: { color: colors.red, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.6, flex: 1 },
  headRow: { flexDirection: "row", alignItems: "flex-start" },
  name: { color: colors.yellow, fontSize: 18, fontWeight: "800" },
  role: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  quoteMark: { color: colors.gold, fontSize: 46, lineHeight: 46, fontWeight: "800", marginTop: -6 },
  quote: { color: colors.white, fontSize: 23, fontWeight: "800", lineHeight: 26, marginTop: 2 },
  support: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 8, marginBottom: 4 },
  linkRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  msgBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", borderRadius: radius.md, paddingVertical: 9, backgroundColor: "rgba(255,194,10,0.06)", minHeight: 40 },
  msgBtnHover: { backgroundColor: "rgba(255,194,10,0.14)" },
  msgText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },
});
