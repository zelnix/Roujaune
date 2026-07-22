import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme";
import { coach } from "../data";
import { PrimaryButton } from "./ui";

const albertoPortrait = require("../../assets/images/coach_alberto.png");

export function AlbertoCoachCard({ width, onStart }: { width: number; onStart: () => void }) {
  return (
    <LinearGradient
      testID="alberto-coach-card"
      colors={["rgba(23,20,18,0.92)", "rgba(10,9,8,0.92)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { width }]}
    >
      <View style={styles.portraitWrap}>
        <Image source={albertoPortrait} style={styles.portrait} contentFit="cover" accessibilityLabel="Coach Alberto" />
        <LinearGradient
          colors={["transparent", "rgba(10,9,8,0.9)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.role}>{coach.role}</Text>
          </View>
          <Text style={styles.quoteMark}>&#8220;</Text>
        </View>

        <Text style={styles.quote}>{coach.quote}</Text>
        <Text style={styles.support}>{coach.support}</Text>

        <PrimaryButton
          testID="start-ride-button"
          label={coach.cta}
          onPress={onStart}
          style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
        />
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
  portraitWrap: { width: 150, height: "100%" },
  portrait: { width: "100%", height: "100%" },
  body: { flex: 1, padding: spacing.md, justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "flex-start" },
  name: { color: colors.yellow, fontSize: 18, fontWeight: "800" },
  role: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  quoteMark: { color: colors.gold, fontSize: 46, lineHeight: 46, fontWeight: "800", marginTop: -6 },
  quote: { color: colors.white, fontSize: 24, fontWeight: "800", lineHeight: 27, marginTop: 2 },
  support: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 8, marginBottom: 4 },
});
