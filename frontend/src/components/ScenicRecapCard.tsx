import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Line } from "react-native-svg";
import { colors } from "@/src/theme";
import { ScenicJourney } from "@/src/lib/scenic-routes";
import { elevationProfile, recapCaption } from "@/src/lib/scenic-recap";

const BG = require("../../assets/images/auth_bg_sunset.png");
const WORDMARK = require("../../assets/images/auth_wordmark.png");

export const RECAP_W = 640;
export const RECAP_H = 360;

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
          {/* Top bar */}
          <View style={c.topBar}>
            <Image source={WORDMARK} style={c.wordmark} contentFit="contain" />
            <Text style={c.kicker}>SCENIC JOURNEY</Text>
          </View>

          {/* Main body: two-column landscape */}
          <View style={c.body}>
            {/* Left column: cover + location */}
            <View style={c.leftCol}>
              <View style={c.thumbWrap}>
                {(journey.cover || journey.thumbnail) ? (
                  <Image source={{ uri: (journey.cover || journey.thumbnail) as string }} style={c.thumb} contentFit="cover" />
                ) : (
                  <View style={[c.thumb, c.thumbFallback]}><Ionicons name="image-outline" size={24} color={colors.textFaint} /></View>
                )}
                <LocationBadge place={journey.place} country={journey.country} />
              </View>
              <View style={c.traceWrap}>
                <View style={c.traceHead}>
                  <Text style={c.traceLabel}>PROFILE</Text>
                  <Text style={c.traceClimb}>{climb}</Text>
                </View>
                <ElevationTrace journey={journey} width={250} height={36} />
              </View>
            </View>

            {/* Right column: title + stats + discoveries */}
            <View style={c.rightCol}>
              <Text style={c.title} numberOfLines={2}>{journey.name}</Text>
              <Text style={c.subtitle}>{fmtDate(journey.at)}</Text>

              <View style={c.statsRow}>
                <View style={c.stat}><Text style={c.statValue}>{fmtDist(journey.distance_km)}</Text><Text style={c.statLabel}>Distance</Text></View>
                <View style={c.statDivider} />
                <View style={c.stat}><Text style={c.statValue}>{fmtDur(journey.duration_sec)}</Text><Text style={c.statLabel}>Ride time</Text></View>
                <View style={c.statDivider} />
                <View style={c.stat}><Text style={c.statValue}>{discoveries.length}</Text><Text style={c.statLabel}>Finds</Text></View>
              </View>

              {discoveries.length > 0 ? (
                <View style={c.discWrap}>
                  {discoveries.slice(0, 2).map((d) => (
                    <View key={d.id} style={c.discRow}>
                      <Ionicons name="bookmark" size={10} color={colors.yellow} />
                      <Text style={c.discText} numberOfLines={1}>{d.title}</Text>
                    </View>
                  ))}
                  {discoveries.length > 2 ? <Text style={c.discMore}>+{discoveries.length - 2} more</Text> : null}
                </View>
              ) : null}

              {caption ? <Text style={c.caption} numberOfLines={2}>&ldquo;{caption}&rdquo;</Text> : null}
            </View>
          </View>

          {/* Footer */}
          <View style={c.footer}>
            <Ionicons name="bicycle" size={13} color={colors.yellow} />
            <Text style={c.footerText}>ROUJAUNE Scenic Cycling · Ride, discover, remember</Text>
          </View>
        </View>
      </View>
    );
  },
);

const c = StyleSheet.create({
  card: { width: RECAP_W, height: RECAP_H, borderRadius: 18, overflow: "hidden", backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  wordmark: { width: 120, height: 18 },
  kicker: { color: colors.yellow, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  body: { flex: 1, flexDirection: "row", gap: 16 },
  leftCol: { width: 260, justifyContent: "center" },
  rightCol: { flex: 1, justifyContent: "center" },
  thumbWrap: { width: "100%" },
  thumb: { width: "100%", height: 150, borderRadius: 12, backgroundColor: "#0E1512", borderWidth: 1, borderColor: "rgba(255,194,10,0.28)" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  locBadge: {
    position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(8,10,10,0.82)", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)",
    paddingLeft: 7, paddingRight: 10, paddingVertical: 4, maxWidth: 220, overflow: "hidden",
  },
  locText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  traceWrap: { marginTop: 8 },
  traceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  traceLabel: { color: colors.textDim, fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  traceClimb: { color: colors.yellow, fontSize: 9, fontWeight: "800" },
  title: { color: colors.white, fontSize: 18, fontWeight: "900", lineHeight: 22 },
  subtitle: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 3 },
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.28)", paddingVertical: 8, paddingHorizontal: 6,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.yellow, fontSize: 15, fontWeight: "900" },
  statLabel: { color: colors.white, fontSize: 8, fontWeight: "600", marginTop: 2, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 },
  statDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.14)" },
  discWrap: { marginTop: 8, gap: 3 },
  discRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  discText: { color: "rgba(255,255,255,0.9)", fontSize: 10.5, fontWeight: "600", flex: 1 },
  discMore: { color: colors.textDim, fontSize: 9, fontWeight: "600" },
  caption: { color: colors.white, fontSize: 10.5, fontStyle: "italic", fontWeight: "600", marginTop: 8, lineHeight: 15, opacity: 0.9 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8 },
  footerText: { color: colors.textDim, fontSize: 9, fontWeight: "600" },
});
