import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { ScenicJourney } from "@/src/lib/scenic-routes";

const BG = require("../../assets/images/auth_bg_sunset.png");
const WORDMARK = require("../../assets/images/auth_wordmark.png");

export const RECAP_W = 360;
export const RECAP_H = 470;

function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDate(at?: string): string {
  if (!at) return "";
  try {
    return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function fmtDist(km?: number | string | null): string {
  if (km == null || km === "") return "—";
  const n = typeof km === "string" ? parseFloat(km) : km;
  if (!isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(n >= 10 ? 0 : 1)} km`;
}

/** A branded, capturable recap of a completed scenic ride + its discoveries. */
export const ScenicRecapCard = React.forwardRef<View, { journey: ScenicJourney; coachName?: string }>(
  function ScenicRecapCard({ journey, coachName }, ref) {
    const discoveries = journey.discoveries || [];
    return (
      <View ref={ref} collapsable={false} style={c.card}>
        <ImageBackground source={BG} style={StyleSheet.absoluteFill as any} resizeMode="cover">
          <LinearGradient colors={["rgba(5,6,6,0.5)", "rgba(5,6,6,0.72)", "rgba(5,6,6,0.94)"]} style={StyleSheet.absoluteFill as any} />
        </ImageBackground>

        <View style={c.inner}>
          <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />

          {journey.thumbnail ? (
            <Image source={{ uri: journey.thumbnail }} style={c.thumb} contentFit="cover" />
          ) : (
            <View style={[c.thumb, c.thumbFallback]}><Ionicons name="image-outline" size={28} color={colors.textFaint} /></View>
          )}

          <Text style={c.kicker}>SCENIC JOURNEY</Text>
          <Text style={c.title} numberOfLines={2}>{journey.name}</Text>
          <Text style={c.subtitle}>{[journey.place, fmtDate(journey.at)].filter(Boolean).join(" · ")}</Text>

          <View style={c.statsRow}>
            <View style={c.stat}><Text style={c.statValue}>{fmtDist(journey.distance_km)}</Text><Text style={c.statLabel}>Distance</Text></View>
            <View style={c.statDivider} />
            <View style={c.stat}><Text style={c.statValue}>{fmtDur(journey.duration_sec)}</Text><Text style={c.statLabel}>Ride time</Text></View>
            <View style={c.statDivider} />
            <View style={c.stat}><Text style={c.statValue}>{discoveries.length}</Text><Text style={c.statLabel}>Discoveries</Text></View>
          </View>

          {discoveries.length > 0 ? (
            <View style={c.discWrap}>
              {discoveries.slice(0, 4).map((d) => (
                <View key={d.id} style={c.discRow}>
                  <Ionicons name="bookmark" size={12} color={colors.yellow} />
                  <Text style={c.discText} numberOfLines={1}>{d.title}</Text>
                </View>
              ))}
              {discoveries.length > 4 ? <Text style={c.discMore}>+{discoveries.length - 4} more discoveries</Text> : null}
            </View>
          ) : null}

          <View style={c.footer}>
            <Ionicons name="bicycle" size={15} color={colors.yellow} />
            <Text style={c.footerText}>{coachName ? `Explored with ${coachName}` : "ROUJAUNE Scenic Cycling"} · Ride, discover, remember</Text>
          </View>
        </View>
      </View>
    );
  },
);

const c = StyleSheet.create({
  card: { width: RECAP_W, height: RECAP_H, borderRadius: 22, overflow: "hidden", backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 20, alignItems: "center" },
  wordmark: { width: 158, height: 24, marginBottom: 12 },
  thumb: { width: "100%", height: 118, borderRadius: 14, backgroundColor: "#0E1512", borderWidth: 1, borderColor: "rgba(255,194,10,0.28)" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.5, marginTop: 14 },
  title: { color: colors.white, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 6, lineHeight: 28 },
  subtitle: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 6, textAlign: "center" },
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 18,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.28)", paddingVertical: 14, paddingHorizontal: 8, alignSelf: "stretch",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.yellow, fontSize: 19, fontWeight: "900" },
  statLabel: { color: colors.white, fontSize: 10, fontWeight: "600", marginTop: 3, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 },
  statDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.14)" },
  discWrap: { alignSelf: "stretch", marginTop: 14, gap: 7 },
  discRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  discText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600", flex: 1 },
  discMore: { color: colors.textDim, fontSize: 11.5, fontWeight: "600", marginTop: 2 },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: "auto", paddingTop: 14 },
  footerText: { color: colors.textDim, fontSize: 11, fontWeight: "600", textAlign: "center" },
});
