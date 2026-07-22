import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { colors, radius, spacing } from "../theme";
import { featuredRoute } from "../data";
import { YellowButton, SectionLabel } from "./ui";

function ScenicBackdrop() {
  // Stylised mountain-pass backdrop (no photo asset provided for this route).
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
      <Defs>
        <SvgGrad id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7C8B57" />
          <Stop offset="0.5" stopColor="#4A5C39" />
          <Stop offset="1" stopColor="#111611" />
        </SvgGrad>
      </Defs>
      <Path d="M0 0 H300 V200 H0 Z" fill="url(#sky)" />
      <Path d="M0 120 L60 60 L120 130 L170 80 L230 140 L300 90 V200 H0 Z" fill="#2E3B24" opacity={0.85} />
      <Path d="M0 160 L70 110 L140 165 L210 120 L300 170 V200 H0 Z" fill="#1B2416" />
      <Path d="M150 200 C150 160 90 150 130 110 C150 90 130 70 150 55" stroke="#C9CBB5" strokeWidth={5} fill="none" opacity={0.55} strokeLinecap="round" />
    </Svg>
  );
}

export function FeaturedRouteCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.card} testID="featured-route-card">
      <ScenicBackdrop />
      <LinearGradient
        colors={["rgba(5,5,5,0.75)", "rgba(5,5,5,0.15)", "rgba(5,5,5,0.55)"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shield}>
        <Ionicons name="triangle" size={16} color={colors.yellow} />
      </View>

      <View style={styles.content}>
        <SectionLabel color={colors.yellow}>FEATURED ROUTE</SectionLabel>
        <Text style={styles.title}>{featuredRoute.title}</Text>
        <View style={styles.countryRow}>
          <Text style={styles.flag}>🇫🇷</Text>
          <Text style={styles.country}>{featuredRoute.country}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={styles.stat}>
          <Ionicons name="location-outline" size={14} color={colors.yellow} />
          <Text style={styles.statText}>{featuredRoute.distance}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="trending-up" size={14} color={colors.yellow} />
          <Text style={styles.statText}>{featuredRoute.elevation}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="analytics-outline" size={14} color={colors.yellow} />
          <Text style={styles.statText}>{featuredRoute.gradient}</Text>
        </View>

        <YellowButton testID="explore-route-button" label="Explore Route" onPress={onPress} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  shield: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, padding: spacing.md },
  title: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 6 },
  countryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  flag: { fontSize: 14 },
  country: { color: colors.white, fontSize: 13, fontWeight: "600" },
  stat: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statText: { color: colors.white, fontSize: 13, fontWeight: "600" },
});
