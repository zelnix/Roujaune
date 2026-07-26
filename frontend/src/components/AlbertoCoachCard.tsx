import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme";
import { coach } from "../data";
import { useCoach } from "../lib/coach-persona";
import { usePlan } from "../lib/plan";
import { useCalendarWeek } from "../lib/calendar";
import { PrimaryButton } from "./ui";

export function AlbertoCoachCard({ width, onStart, onMessage, compact = false }: { width: number; onStart: () => void; onMessage?: () => void; compact?: boolean }) {
  const persona = useCoach();
  const { plan } = usePlan();
  const { week } = useCalendarWeek();
  const next = (plan.workouts?.find((w) => !w.completed) ?? plan.workouts?.[0]) as any;

  // Reflect TODAY's actual scheduled activity (any type), not just the next ride.
  const hasWeek = !!week?.days?.length;
  const today = hasWeek ? week.days.find((d: any) => d.date === week.selected_date) : null;
  const todaySession: any = today ? (today.cycling ?? today.fb50 ?? today.wellness ?? null) : null;
  const isRest = hasWeek && !todaySession;
  const kindLabel = todaySession?.type === "fb50" ? "Strength" : todaySession?.type === "wellness" ? "Recovery" : "";

  const headline = todaySession?.title ?? (isRest ? "Rest Day" : (next?.title ?? coach.quote));
  const support = todaySession
    ? `Today${kindLabel ? ` · ${kindLabel}` : ""} · ${todaySession.duration}${todaySession.zone ? ` · ${todaySession.zone}` : ""}`
    : isRest
      ? (next ? `Your next workout is ${next.title} · ${next.duration}` : "Recovery day — rest up and come back strong.")
      : next ? `Next up · ${next.duration} · ${next.zone}${next.footer ? ` · ${next.footer}` : ""}` : coach.support;
  const cta = isRest ? "View Today's Plan" : "View Today's Workout";
  const portraitW = compact ? 108 : 150;
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
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, compact && { fontSize: 15 }]}>{persona.name}</Text>
            <Text style={styles.role}>{plan.title ?? coach.role}</Text>
          </View>
          <Text style={[styles.quoteMark, compact && { fontSize: 34, lineHeight: 34 }]}>&#8220;</Text>
        </View>

        <Text style={[styles.quote, compact && { fontSize: 18, lineHeight: 21 }]}>{headline}</Text>
        <Text style={[styles.support, compact && { fontSize: 11, lineHeight: 15, marginTop: 5 }]}>{support}</Text>

        <PrimaryButton
          testID="start-ride-button"
          label={cta}
          onPress={onStart}
          style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
        />
        {onMessage ? (
          <Pressable
            testID="home-message-coach"
            onPress={onMessage}
            accessibilityRole="button"
            accessibilityLabel={`Message ${persona.name}`}
            style={({ hovered }: any) => [styles.msgBtn, hovered && styles.msgBtnHover]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.yellow} />
            <Text style={styles.msgText}>Message {persona.name}</Text>
          </Pressable>
        ) : null}
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
  portraitWrap: { width: 150, alignSelf: "stretch", minHeight: 190 },
  portrait: { width: "100%", height: "100%" },
  body: { flex: 1, padding: spacing.md, justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "flex-start" },
  name: { color: colors.yellow, fontSize: 18, fontWeight: "800" },
  role: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  quoteMark: { color: colors.gold, fontSize: 46, lineHeight: 46, fontWeight: "800", marginTop: -6 },
  quote: { color: colors.white, fontSize: 24, fontWeight: "800", lineHeight: 27, marginTop: 2 },
  support: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 8, marginBottom: 4 },
  msgBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 8, borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", borderRadius: radius.md, paddingVertical: 9, backgroundColor: "rgba(255,194,10,0.06)", minHeight: 40 },
  msgBtnHover: { backgroundColor: "rgba(255,194,10,0.14)" },
  msgText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },
});
