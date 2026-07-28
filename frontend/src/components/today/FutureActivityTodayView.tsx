import React from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../theme";
import { RiderExperience, modeMeta, setExperience } from "../../lib/today-mode";
import { ScheduledWorkoutReminder } from "./ScheduledWorkoutReminder";
import { ExperienceHero } from "./ExperienceHero";

/** Activity-specific preview copy for the roadmap experiences. */
export const PREVIEW: Record<string, { heading: string; blurb: string; bullets: string[] }> = {
  gravel: {
    heading: "GRAVEL ADVENTURES ARE ON THE WAY",
    blurb: "Mixed-surface routes with surface breakdowns, elevation, remoteness and resupply points.",
    bullets: ["Mixed-surface route", "Surface breakdown & elevation", "Remoteness & navigation", "Water and resupply points"],
  },
  "mountain-bike": {
    heading: "MOUNTAIN TRAILS ARE COMING SOON",
    blurb: "Technical trails with difficulty ratings, features and climb/descent breakdowns.",
    bullets: ["Named trails & difficulty", "Technical features", "Climbing & descending", "Trail conditions"],
  },
  walking: {
    heading: "SCENIC WALKING TOURS ARE COMING SOON",
    blurb: "POV walking destinations with points of interest and guided stories.",
    bullets: ["POV walking destination", "Duration & points of interest", "Guided stories"],
  },
  running: {
    heading: "SCENIC RUNS ARE COMING SOON",
    blurb: "POV treadmill destinations with light landmark commentary and optional pacing.",
    bullets: ["POV treadmill destination", "Duration & pacing", "Landmark commentary"],
  },
  rowing: {
    heading: "SCENIC WATERWAYS ARE COMING SOON",
    blurb: "Row famous waterways with landmarks, local history and optional stroke-rate guidance.",
    bullets: ["Waterway destination", "Duration & stroke rate", "Landmarks & history"],
  },
  climbing: {
    heading: "SCENIC CLIMBS ARE COMING SOON",
    blurb: "Ascend famous staircases and monuments with milestone tracking.",
    bullets: ["Famous staircase or ascent", "Step / elevation progress", "Landmark milestones"],
  },
};

/** Reusable Today content for roadmap activities — a friendly, on-brand
 *  "Coming soon" state that never dead-ends and points back to Train today. */
export function FutureActivityTodayView({ mode }: { mode: RiderExperience }) {
  const meta = modeMeta(mode);
  const { height } = useWindowDimensions();
  const compact = height < 560;
  const p = PREVIEW[mode] ?? { heading: "COMING SOON", blurb: "This experience is on the Roujaune roadmap.", bullets: [] };
  return (
    <View style={{ gap: spacing.md }} testID={`future-activity-${mode}`}>
      <ExperienceHero compact={compact} descriptor={`${meta.description}.`} testID={`future-hero-${mode}`}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={meta.icon} size={30} color={colors.yellow} />
          </View>
          <View style={styles.soonPill}><Text style={styles.soonPillText}>COMING SOON</Text></View>
          <Text style={styles.heading}>{p.heading}</Text>
          <Text style={styles.blurb}>{p.blurb}</Text>
          {p.bullets.length > 0 && (
            <View style={styles.bullets}>
              {p.bullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Ionicons name="ellipse" size={5} color={colors.yellow} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable
            testID={`future-cta-${mode}`}
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={`${meta.primaryActionLabel}. Coming soon`}
            style={styles.ctaDisabled}
          >
            <Text style={styles.ctaDisabledText}>{meta.primaryActionLabel}</Text>
          </Pressable>
          <Pressable testID="back-to-training" onPress={() => setExperience("training")} style={styles.back} accessibilityRole="button">
            <Ionicons name="arrow-back" size={15} color={colors.textDim} />
            <Text style={styles.backText}>Back to Train today</Text>
          </Pressable>
        </View>
      </ExperienceHero>
      <ScheduledWorkoutReminder />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(10,14,12,0.66)", borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 26, alignItems: "center", gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.1)", borderWidth: 1, borderColor: "rgba(245,179,1,0.3)" },
  soonPill: { borderWidth: 1, borderColor: "rgba(245,179,1,0.45)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  soonPillText: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heading: { color: colors.white, fontSize: 20, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
  blurb: { color: colors.textDim, fontSize: 13.5, textAlign: "center", lineHeight: 20, maxWidth: 520 },
  bullets: { gap: 8, marginTop: 4, alignSelf: "stretch", maxWidth: 420, alignItems: "flex-start", marginHorizontal: "auto" as any },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletText: { color: colors.text, fontSize: 13 },
  ctaDisabled: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 28, minHeight: 48, justifyContent: "center" },
  ctaDisabledText: { color: colors.textFaint, fontSize: 13, fontWeight: "800", letterSpacing: 0.6 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, minHeight: 44 },
  backText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
});
