import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme";
import { trainingPlan } from "../data";
import { CircularProgress, ClimbBars, SecondaryButton, SectionLabel } from "./ui";

export function TrainingPlanCard({ onPress }: { onPress: () => void }) {
  return (
    <LinearGradient
      testID="training-plan-card"
      colors={["#3A0E12", "#1A0809"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <SectionLabel color={colors.red}>TRAINING PLAN</SectionLabel>
          <Text style={styles.title}>{trainingPlan.title}</Text>
          <Text style={styles.week}>{trainingPlan.week}</Text>
        </View>
        <CircularProgress progress={trainingPlan.progress} color={colors.yellow} size={56} stroke={5} />
      </View>

      <View style={styles.divider} />

      <SectionLabel color={colors.red}>NEXT WORKOUT</SectionLabel>
      <View style={styles.workoutRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.workout}>{trainingPlan.nextWorkout}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={colors.textDim} />
            <Text style={styles.meta}>{trainingPlan.duration}</Text>
            <Ionicons name="flash" size={13} color={colors.yellow} style={{ marginLeft: 10 }} />
            <Text style={styles.meta}>{trainingPlan.tss}</Text>
          </View>
        </View>
        <ClimbBars data={trainingPlan.bars} color={colors.redBright} width={80} height={42} />
      </View>

      <SecondaryButton testID="view-plan-button" label="View Plan" tone="red" onPress={onPress} style={{ marginTop: spacing.sm }} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(224,30,43,0.3)",
    padding: spacing.md,
  },
  topRow: { flexDirection: "row", alignItems: "center" },
  title: { color: colors.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  week: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  workoutRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  workout: { color: colors.white, fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  meta: { color: colors.textDim, fontSize: 12, marginLeft: 4 },
});
