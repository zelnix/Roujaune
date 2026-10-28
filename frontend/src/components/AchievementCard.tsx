import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polygon } from "react-native-svg";
import Ionicons from "@react-native-vector-icons/ionicons";
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
  bgUri?: string;                            // rider-chosen backdrop photo (Season)
};

/** A 16:9 landscape branded card captured to an image for sharing on
 * Facebook, Instagram Feed, X, and other social platforms. Rendered at 640×360
 * and scaled to fit phone screens in the modal preview. */
export const CARD_W = 640;
export const CARD_H = 360;

export const AchievementCard = React.forwardRef<View, { data: AchievementCardData }>(
  function AchievementCard({ data }, ref) {
    const { isPlanEnd, variant, kicker, title, subtitle, stats, coachName, hero, watermark, bgUri } = data;
    const isSeason = variant === "season";
    return (
      <View ref={ref} collapsable={false} style={c.card}>
        <ImageBackground source={bgUri ? { uri: bgUri } : BG} style={StyleSheet.absoluteFill as any} resizeMode="cover">
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
          {/* Top bar: wordmark */}
          <View style={c.topBar}>
            <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />
          </View>

          {/* Main body: two-column landscape layout */}
          <View style={c.body}>
            {/* Left column: badge + text */}
            <View style={c.leftCol}>
              {!isSeason ? (
                <View style={c.badge}>
                  <Svg width={72} height={72} viewBox="0 0 116 116">
                    <Circle cx={58} cy={58} r={54} fill="rgba(36,27,0,0.85)" stroke={C.yellow} strokeWidth={3} />
                    <Circle cx={58} cy={58} r={44} fill="none" stroke="rgba(255,194,10,0.35)" strokeWidth={1.5} />
                    {!isPlanEnd ? (
                      <Polygon points="58,26 66,50 92,50 71,66 79,92 58,76 37,92 45,66 24,50 50,50" fill={C.yellow} opacity={0.95} />
                    ) : null}
                  </Svg>
                  {isPlanEnd ? (
                    <View style={c.badgeIcon}>
                      <Ionicons name="trophy" size={28} color={C.yellow} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={c.seasonMark}>
                  <Ionicons name="trending-up" size={24} color={C.yellow} />
                </View>
              )}

              <Text style={c.kicker}>{kicker}</Text>
              <Text style={c.title} numberOfLines={2}>{title}</Text>
              <Text style={c.subtitle}>{subtitle}</Text>

              {hero ? (
                <View style={c.hero}>
                  <Ionicons name="trending-up" size={14} color={C.yellow} />
                  <Text style={c.heroLabel}>{hero.label.toUpperCase()}</Text>
                  <Text style={c.heroValue}>{hero.value}</Text>
                </View>
              ) : null}
            </View>

            {/* Right column: stats */}
            <View style={c.rightCol}>
              {stats.map((s) => (
                <View key={s.label} style={c.gridStat}>
                  <Text style={c.gridValue} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
                  <Text style={c.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={c.footer}>
            <Ionicons name="bicycle" size={13} color={C.yellow} />
            <Text style={c.footerText}>Coached by {coachName} · Your strongest ride is your own</Text>
          </View>
        </View>
      </View>
    );
  },
);

const c = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, borderRadius: 18, overflow: "hidden", backgroundColor: C.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 14 },
  topBar: { alignItems: "flex-start", marginBottom: 6 },
  wordmark: { width: 130, height: 20 },
  body: { flex: 1, flexDirection: "row", gap: 18 },
  leftCol: { flex: 1, justifyContent: "center", alignItems: "flex-start" },
  rightCol: { width: 200, flexDirection: "row", flexWrap: "wrap", alignContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,194,10,0.22)", padding: 10 },
  badge: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  seasonMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,194,10,0.14)", borderWidth: 1.5, borderColor: "rgba(255,194,10,0.5)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  badgeIcon: { position: "absolute", width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  kicker: { color: C.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  title: { color: C.white, fontSize: 20, fontWeight: "900", marginTop: 4, lineHeight: 24 },
  subtitle: { color: C.dim, fontSize: 11.5, fontWeight: "600", marginTop: 4 },
  gridStat: { width: "46%", alignItems: "center", paddingVertical: 6, paddingHorizontal: 2 },
  gridValue: { color: C.yellow, fontSize: 18, fontWeight: "900" },
  watermark: { position: "absolute", right: -10, bottom: -20, fontSize: 120, fontWeight: "900", color: "rgba(255,194,10,0.06)", letterSpacing: -4 },
  hero: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.45)", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "stretch" },
  heroLabel: { color: "#F3F1EA", fontSize: 9, fontWeight: "800", letterSpacing: 1, flex: 1 },
  heroValue: { color: C.yellow, fontSize: 16, fontWeight: "900" },
  statLabel: { color: C.white, fontSize: 9, fontWeight: "600", marginTop: 2, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8 },
  footerText: { color: C.dim, fontSize: 10, fontWeight: "600" },
});
