import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polygon } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { C } from "./plan";

const BG = require("../../assets/images/auth_bg_sunset.png");
const WORDMARK = require("../../assets/images/auth_wordmark.png");

export type AchievementCardData = {
  isPlanEnd?: boolean;
  kicker: string; // "PROGRAMME COMPLETE" | "PHASE 1 COMPLETE"
  title: string; // plan or phase name
  subtitle: string; // weeks label / phase weeks
  stats: { label: string; value: string }[];
  coachName: string;
};

/** A 1080×1350-ratio branded card captured to an image for sharing. Fixed pixel
 * size so the exported image is crisp and consistent across devices. */
export const CARD_W = 360;
export const CARD_H = 450;

export const AchievementCard = React.forwardRef<View, { data: AchievementCardData }>(
  function AchievementCard({ data }, ref) {
    const { isPlanEnd, kicker, title, subtitle, stats, coachName } = data;
    return (
      <View ref={ref} collapsable={false} style={c.card}>
        <ImageBackground source={BG} style={StyleSheet.absoluteFill as any} resizeMode="cover">
          <LinearGradient
            colors={["rgba(5,6,6,0.55)", "rgba(5,6,6,0.72)", "rgba(5,6,6,0.92)"]}
            style={StyleSheet.absoluteFill as any}
          />
        </ImageBackground>

        <View style={c.inner}>
          <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />

          <View style={c.badge}>
            <Svg width={104} height={104} viewBox="0 0 116 116">
              <Circle cx={58} cy={58} r={54} fill="rgba(36,27,0,0.85)" stroke={C.yellow} strokeWidth={3} />
              <Circle cx={58} cy={58} r={44} fill="none" stroke="rgba(255,194,10,0.35)" strokeWidth={1.5} />
              {!isPlanEnd ? (
                <Polygon points="58,26 66,50 92,50 71,66 79,92 58,76 37,92 45,66 24,50 50,50" fill={C.yellow} opacity={0.95} />
              ) : null}
            </Svg>
            {isPlanEnd ? (
              <View style={c.badgeIcon}>
                <Ionicons name="trophy" size={42} color={C.yellow} />
              </View>
            ) : null}
          </View>

          <Text style={c.kicker}>{kicker}</Text>
          <Text style={c.title} numberOfLines={2}>{title}</Text>
          <Text style={c.subtitle}>{subtitle}</Text>

          <View style={c.statsRow}>
            {stats.map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 ? <View style={c.statDivider} /> : null}
                <View style={c.stat}>
                  <Text style={c.statValue}>{s.value}</Text>
                  <Text style={c.statLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <View style={c.footer}>
            <Ionicons name="bicycle" size={15} color={C.yellow} />
            <Text style={c.footerText}>Coached by {coachName} · Your strongest ride is your own</Text>
          </View>
        </View>
      </View>
    );
  },
);

const c = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, borderRadius: 22, overflow: "hidden", backgroundColor: C.bg },
  inner: { flex: 1, paddingHorizontal: 26, paddingTop: 26, paddingBottom: 22, alignItems: "center" },
  wordmark: { width: 168, height: 26, marginBottom: 8 },
  badge: { alignItems: "center", justifyContent: "center", marginTop: 14, marginBottom: 12 },
  badgeIcon: { position: "absolute", width: 104, height: 104, alignItems: "center", justifyContent: "center" },
  kicker: { color: C.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 2.5 },
  title: { color: C.white, fontSize: 25, fontWeight: "900", textAlign: "center", marginTop: 8, lineHeight: 30 },
  subtitle: { color: C.dim, fontSize: 13, fontWeight: "600", marginTop: 8, textAlign: "center" },
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 26,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.28)", paddingVertical: 16, paddingHorizontal: 10, alignSelf: "stretch",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: C.yellow, fontSize: 24, fontWeight: "900" },
  statLabel: { color: C.white, fontSize: 11, fontWeight: "600", marginTop: 3, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 },
  statDivider: { width: 1, height: 38, backgroundColor: "rgba(255,255,255,0.14)" },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: "auto", paddingTop: 18 },
  footerText: { color: C.dim, fontSize: 11.5, fontWeight: "600", textAlign: "center" },
});
