import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Line } from "react-native-svg";
import { colors } from "@/src/theme";
import { ScenicJourney } from "@/src/lib/scenic-routes";
import { elevationProfile, recapCaption } from "@/src/lib/scenic-recap";

const BG = require("../../assets/images/auth_bg_sunset.png");
const WORDMARK = require("../../assets/images/auth_wordmark.png");

export const RECAP_W = 360;
export const RECAP_H = 588;

function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDate(at?: string): string {
  if (!at) return "";
  try { return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}
function fmtDist(km?: number | string | null): string {
  if (km == null || km === "") return "—";
  const n = typeof km === "string" ? parseFloat(km) : km;
  if (!isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(n >= 10 ? 0 : 1)} km`;
}

/** Decorative, deterministic elevation trace (not real GPS). */
function ElevationTrace({ journey, width, height }: { journey: ScenicJourney; width: number; height: number }) {
  const pts = React.useMemo(() => elevationProfile(journey), [journey]);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const step = w / (pts.length - 1);
  const y = (v: number) => pad + h - v * h;
  const coords = pts.map((v, i) => `${pad + i * step},${y(v)}`);
  const line = `M ${coords.join(" L ")}`;
  const area = `M ${pad},${pad + h} L ${coords.join(" L ")} L ${pad + w},${pad + h} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="elev" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.yellow} stopOpacity={0.42} />
          <Stop offset="1" stopColor={colors.yellow} stopOpacity={0.03} />
        </SvgGradient>
      </Defs>
      {[0.5].map((g) => (
        <Line key={g} x1={pad} y1={pad + h * g} x2={pad + w} y2={pad + h * g} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}
      <Path d={area} fill="url(#elev)" />
      <Path d={line} stroke={colors.yellow} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** A stylized mini location badge (not a real satellite map). */
function LocationBadge({ place, country }: { place?: string; country?: string }) {
  const label = [place, country].filter(Boolean).join(", ") || "Scenic route";
  return (
    <View style={c.locBadge}>
      <Svg width={38} height={38} style={StyleSheet.absoluteFill as any}>
        {[10, 19, 28].map((v) => <Line key={`h${v}`} x1={0} y1={v} x2={38} y2={v} stroke="rgba(255,194,10,0.18)" strokeWidth={0.75} />)}
        {[10, 19, 28].map((v) => <Line key={`v${v}`} x1={v} y1={0} x2={v} y2={38} stroke="rgba(255,194,10,0.18)" strokeWidth={0.75} />)}
      </Svg>
      <Ionicons name="location" size={16} color={colors.yellow} />
      <Text style={c.locText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A branded, capturable recap of a completed scenic ride + its discoveries. */
export const ScenicRecapCard = React.forwardRef<View, { journey: ScenicJourney; coachName?: string }>(
  function ScenicRecapCard({ journey, coachName }, ref) {
    const discoveries = journey.discoveries || [];
    const caption = React.useMemo(() => recapCaption(journey, coachName), [journey, coachName]);
    const climb = journey.elevation_m != null && journey.elevation_m > 0 ? `${journey.elevation_m} m climb` : "Route profile";
    return (
      <View ref={ref} collapsable={false} style={c.card}>
        <ImageBackground source={BG} style={StyleSheet.absoluteFill as any} resizeMode="cover">
          <LinearGradient colors={["rgba(5,6,6,0.5)", "rgba(5,6,6,0.72)", "rgba(5,6,6,0.94)"]} style={StyleSheet.absoluteFill as any} />
        </ImageBackground>

        <View style={c.inner}>
          <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />

          <View style={c.thumbWrap}>
            {(journey.cover || journey.thumbnail) ? (
              <Image source={{ uri: (journey.cover || journey.thumbnail) as string }} style={c.thumb} contentFit="cover" />
            ) : (
              <View style={[c.thumb, c.thumbFallback]}><Ionicons name="image-outline" size={28} color={colors.textFaint} /></View>
            )}
            <LocationBadge place={journey.place} country={journey.country} />
          </View>

          <Text style={c.kicker}>SCENIC JOURNEY</Text>
          <Text style={c.title} numberOfLines={2}>{journey.name}</Text>
          <Text style={c.subtitle}>{fmtDate(journey.at)}</Text>

          <View style={c.statsRow}>
            <View style={c.stat}><Text style={c.statValue}>{fmtDist(journey.distance_km)}</Text><Text style={c.statLabel}>Distance</Text></View>
            <View style={c.statDivider} />
            <View style={c.stat}><Text style={c.statValue}>{fmtDur(journey.duration_sec)}</Text><Text style={c.statLabel}>Ride time</Text></View>
            <View style={c.statDivider} />
            <View style={c.stat}><Text style={c.statValue}>{discoveries.length}</Text><Text style={c.statLabel}>Discoveries</Text></View>
          </View>

          <View style={c.traceWrap}>
            <View style={c.traceHead}>
              <Text style={c.traceLabel}>ROUTE PROFILE</Text>
              <Text style={c.traceClimb}>{climb}</Text>
            </View>
            <ElevationTrace journey={journey} width={RECAP_W - 48} height={46} />
          </View>

          {discoveries.length > 0 ? (
            <View style={c.discWrap}>
              {discoveries.slice(0, 3).map((d) => (
                <View key={d.id} style={c.discRow}>
                  <Ionicons name="bookmark" size={12} color={colors.yellow} />
                  <Text style={c.discText} numberOfLines={1}>{d.title}</Text>
                </View>
              ))}
              {discoveries.length > 3 ? <Text style={c.discMore}>+{discoveries.length - 3} more discoveries</Text> : null}
            </View>
          ) : null}

          <Text style={c.caption} numberOfLines={3}>&ldquo;{caption}&rdquo;</Text>

          <View style={c.footer}>
            <Ionicons name="bicycle" size={15} color={colors.yellow} />
            <Text style={c.footerText}>ROUJAUNE Scenic Cycling · Ride, discover, remember</Text>
          </View>
        </View>
      </View>
    );
  },
);

const c = StyleSheet.create({
  card: { width: RECAP_W, height: RECAP_H, borderRadius: 22, overflow: "hidden", backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 18, alignItems: "center" },
  wordmark: { width: 152, height: 23, marginBottom: 12 },
  thumbWrap: { alignSelf: "stretch" },
  thumb: { width: "100%", height: 114, borderRadius: 14, backgroundColor: "#0E1512", borderWidth: 1, borderColor: "rgba(255,194,10,0.28)" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  locBadge: {
    position: "absolute", left: 8, bottom: 8, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(8,10,10,0.82)", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)",
    paddingLeft: 9, paddingRight: 12, paddingVertical: 6, maxWidth: RECAP_W - 80, overflow: "hidden",
  },
  locText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  kicker: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.5, marginTop: 13 },
  title: { color: colors.white, fontSize: 23, fontWeight: "900", textAlign: "center", marginTop: 5, lineHeight: 27 },
  subtitle: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 5, textAlign: "center" },
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.28)", paddingVertical: 12, paddingHorizontal: 8, alignSelf: "stretch",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.yellow, fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.white, fontSize: 9.5, fontWeight: "600", marginTop: 3, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 },
  statDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.14)" },
  traceWrap: { alignSelf: "stretch", marginTop: 14 },
  traceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  traceLabel: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  traceClimb: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  discWrap: { alignSelf: "stretch", marginTop: 12, gap: 6 },
  discRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  discText: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, fontWeight: "600", flex: 1 },
  discMore: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 1 },
  caption: { color: colors.white, fontSize: 13, fontStyle: "italic", fontWeight: "600", textAlign: "center", marginTop: 14, lineHeight: 19, opacity: 0.95 },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: "auto", paddingTop: 12 },
  footerText: { color: colors.textDim, fontSize: 10.5, fontWeight: "600", textAlign: "center" },
});
