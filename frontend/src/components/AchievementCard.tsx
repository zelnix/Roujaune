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
  variant?: "season";       // bold year-in-review treatment
  kicker: string; // "PROGRAMME COMPLETE" | "PHASE 1 COMPLETE"
  title: string; // plan or phase name
  subtitle: string; // weeks label / phase weeks
  stats: { label: string; value: string }[];
  coachName: string;
  hero?: { label: string; value: string };  // focal callout (e.g. biggest climb)
  watermark?: string;                        // giant faint backdrop text (e.g. year)
};

/** A 1080×1350-ratio branded card captured to an image for sharing. Fixed pixel
 * size so the exported image is crisp and consistent across devices. */
export const CARD_W = 360;
export const CARD_H = 450;

export const AchievementCard = React.forwardRef<View, { data: AchievementCardData }>(
  function AchievementCard({ data }, ref) {
    const { isPlanEnd, variant, kicker, title, subtitle, stats, coachName, hero, watermark } = data;
    const isSeason = variant === "season";
    return (
      <View ref={ref} collapsable={false} style={c.card}>
        <ImageBackground source={BG} style={StyleSheet.absoluteFill as any} resizeMode="cover">
          <LinearGradient
            colors={isSeason
              ? ["rgba(5,6,6,0.45)", "rgba(5,6,6,0.72)", "rgba(5,6,6,0.96)"]
              : ["rgba(5,6,6,0.55)", "rgba(5,6,6,0.72)", "rgba(5,6,6,0.92)"]}
            style={StyleSheet.absoluteFill as any}
          />
        </ImageBackground>

        {watermark ? (
          <Text style={c.watermark} numberOfLines={1} allowFontScaling={false}>{watermark}</Text>
        ) : null}

        <View style={c.inner}>
          <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />

          {!isSeason ? (
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
          ) : (
            <View style={c.seasonMark}>
              <Ionicons name="trending-up" size={30} color={C.yellow} />
            </View>
          )}

          <Text style={c.kicker}>{kicker}</Text>
          <Text style={c.title} numberOfLines={2}>{title}</Text>
          <Text style={c.subtitle}>{subtitle}</Text>

          {hero ? (
            <View style={c.hero}>
              <Ionicons name="trending-up" size={16} color={C.yellow} />
              <Text style={c.heroLabel}>{hero.label.toUpperCase()}</Text>
              <Text style={c.heroValue}>{hero.value}</Text>
            </View>
          ) : null}

          {stats.length > 3 ? (
            <View style={c.statsGrid}>
              {stats.map((s) => (
                <View key={s.label} style={c.gridStat}>
                  <Text style={c.gridValue} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
                  <Text style={c.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          ) : (
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
          )}

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
  seasonMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,194,10,0.14)", borderWidth: 1.5, borderColor: "rgba(255,194,10,0.5)", alignItems: "center", justifyContent: "center", marginTop: 16, marginBottom: 12 },
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
  statsGrid: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.28)", paddingVertical: 12, paddingHorizontal: 6, alignSelf: "stretch",
  },
  gridStat: { width: "33.33%", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4 },
  gridValue: { color: C.yellow, fontSize: 21, fontWeight: "900" },
  watermark: { position: "absolute", right: -12, bottom: -34, fontSize: 168, fontWeight: "900", color: "rgba(255,194,10,0.08)", letterSpacing: -6 },
  hero: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.45)", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignSelf: "stretch" },
  heroLabel: { color: "#F3F1EA", fontSize: 11, fontWeight: "800", letterSpacing: 1, flex: 1 },
  heroValue: { color: C.yellow, fontSize: 20, fontWeight: "900" },
  statLabel: { color: C.white, fontSize: 11, fontWeight: "600", marginTop: 3, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 },
  statDivider: { width: 1, height: 38, backgroundColor: "rgba(255,255,255,0.14)" },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: "auto", paddingTop: 18 },
  footerText: { color: C.dim, fontSize: 11.5, fontWeight: "600", textAlign: "center" },
});
