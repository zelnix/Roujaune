import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../../theme";
import { VIRTUAL_ROUTES, getVRoute, VRoute } from "../../lib/vroutes";
import { ScheduledWorkoutReminder } from "./ScheduledWorkoutReminder";

const base = () => (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

/** Estimate a relaxed scenic ride time from distance (~24 km/h touring pace). */
function estMinutes(r: VRoute): number {
  return Math.max(8, Math.round((r.distanceKm / 24) * 60));
}
function discoveries(r: VRoute): number {
  return (r.checkpoints?.length ?? 0) || (r.points?.length ?? 0);
}

type LastRide = {
  available: boolean;
  routeId?: string;
  name?: string;
  place?: string;
  distance_km?: number;
  at?: string;
};

/** Calm, destination-led Today content for the Scenic Cycling experience —
 *  driven by the REAL virtual-route catalog. "Begin Scenic Journey" and every
 *  destination card open the actual immersive route; "Continue your journey"
 *  reflects the rider's genuine last scenic ride (hidden until they have one). */
export function ScenicCyclingTodayView({ onToast }: { onToast?: (t: string) => void }) {
  const router = useRouter();
  const [last, setLast] = React.useState<LastRide | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`${base()}/api/scenic/last`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setLast(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const hero = VIRTUAL_ROUTES[0];
  const open = (id: string) => router.push(`/virtual-route?route=${id}` as any);
  const explore = () => router.push("/routes");

  const others = VIRTUAL_ROUTES.filter((r) => r.id !== hero.id);
  const shortRides = VIRTUAL_ROUTES.filter((r) => estMinutes(r) < 35);
  const recent = VIRTUAL_ROUTES.slice(-2);

  const lastRoute = last?.available && last.routeId ? getVRoute(last.routeId) : null;

  return (
    <View style={{ gap: spacing.md }} testID="scenic-cycling-today">
      <ScheduledWorkoutReminder />

      <Text style={styles.h1}>WHERE SHALL WE EXPLORE TODAY?</Text>

      {/* Hero destination (real route) */}
      <ImageBackground source={hero.backdrop} style={styles.hero} imageStyle={styles.heroImg} testID="scenic-hero">
        <View style={styles.heroScrim} />
        <View style={styles.heroTopRow}>
          <View style={styles.povBadge}>
            <Ionicons name="videocam" size={12} color="#fff" />
            <Text style={styles.povText}>POV VIDEO</Text>
          </View>
          <View style={styles.guidedBadge}>
            <Ionicons name="mic" size={11} color={colors.yellow} />
            <Text style={styles.guidedText}>Guided stories</Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.heroTitle}>{hero.name.toUpperCase()}</Text>
        <Text style={styles.heroCountry}>{hero.place}</Text>
        <Text style={styles.heroDesc} numberOfLines={2}>
          A relaxed {hero.tag.toLowerCase()} journey — ride at your own pace and soak in the scenery.
        </Text>
        <View style={styles.heroStats}>
          <Stat icon="time-outline" label={`${estMinutes(hero)} minutes`} />
          <Stat icon="leaf-outline" label="Relaxed" />
          <Stat icon="trending-up-outline" label={`${hero.elevationM} m`} />
          {discoveries(hero) > 0 && <Stat icon="sparkles-outline" label={`${discoveries(hero)} discoveries`} />}
        </View>
        <View style={styles.heroCtas}>
          <Pressable testID="begin-scenic-journey" onPress={() => open(hero.id)} accessibilityRole="button" accessibilityLabel={`Begin scenic journey: ${hero.name}`}
            style={({ hovered }: any) => [styles.primaryCta, hovered && styles.primaryCtaHover]}>
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.primaryCtaText}>BEGIN SCENIC JOURNEY</Text>
          </Pressable>
          <Pressable testID="explore-destinations" onPress={explore} accessibilityRole="button"
            style={({ hovered }: any) => [styles.secondaryCta, hovered && styles.secondaryCtaHover]}>
            <Text style={styles.secondaryCtaText}>EXPLORE DESTINATIONS</Text>
          </Pressable>
        </View>
      </ImageBackground>

      {/* Preferences summary */}
      <View style={styles.prefs} testID="scenic-prefs">
        <Pref label="Companion" value="Alberto" icon="person-circle-outline" />
        <Pref label="Journey style" value="Discover" icon="compass-outline" />
        <Pref label="Ride feel" value="Relaxed Journey" icon="leaf-outline" />
        <Pressable testID="adjust-journey" onPress={() => router.push("/settings")} style={styles.adjust} accessibilityRole="button">
          <Ionicons name="options-outline" size={15} color={colors.yellow} />
          <Text style={styles.adjustText}>Adjust journey</Text>
        </Pressable>
      </View>

      {/* Continue your journey — only when the rider actually has a last scenic ride */}
      {lastRoute && (
        <View style={styles.section} testID="scenic-continue">
          <Text style={styles.sectionTitle}>Continue your journey</Text>
          <Pressable onPress={() => open(lastRoute.id)} accessibilityRole="button" accessibilityLabel={`Resume ${lastRoute.name}`}
            style={({ hovered }: any) => [styles.continueCard, hovered && styles.destCardHover]}>
            <Image source={lastRoute.backdrop} style={styles.continueThumb} contentFit="cover" />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.continueLabel}>PICK UP WHERE YOU LEFT OFF</Text>
              <Text style={styles.destTitle}>{lastRoute.name}</Text>
              <Text style={styles.destCountry}>{lastRoute.place}</Text>
            </View>
            <View style={styles.resumeBtn}><Ionicons name="play" size={16} color="#fff" /><Text style={styles.resumeText}>Resume</Text></View>
          </Pressable>
        </View>
      )}

      <DestRow title="Recommended for you" data={others} open={open} />
      <DestRow title="Recently added destinations" data={recent} open={open} tag="New" />
      <DestRow title="Scenic rides under 35 minutes" data={shortRides} open={open} />
    </View>
  );
}

function Stat({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={14} color={colors.yellow} />
      <Text style={styles.statText}>{label}</Text>
    </View>
  );
}

function Pref({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={styles.prefItem}>
      <Ionicons name={icon} size={16} color={colors.textDim} />
      <View>
        <Text style={styles.prefLabel}>{label}</Text>
        <Text style={styles.prefValue}>{value}</Text>
      </View>
    </View>
  );
}

function DestRow({ title, data, open, tag }: { title: string; data: VRoute[]; open: (id: string) => void; tag?: string }) {
  if (!data.length) return null;
  return (
    <View style={styles.section} testID={`scenic-row-${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {data.map((d) => (
          <Pressable key={d.id} onPress={() => open(d.id)} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.place}, ${estMinutes(d)} minutes, ${d.tag}`}
            style={({ hovered }: any) => [styles.destCard, hovered && styles.destCardHover]}>
            <View style={styles.destThumb}>
              <Image source={d.backdrop} style={StyleSheet.absoluteFill as any} contentFit="cover" />
              {tag ? <View style={styles.newTag}><Text style={styles.newTagText}>{tag}</Text></View> : null}
            </View>
            <Text style={styles.destTitle} numberOfLines={1}>{d.name}</Text>
            <Text style={styles.destCountry} numberOfLines={1}>{d.place}</Text>
            <View style={styles.destMeta}>
              <Ionicons name="time-outline" size={12} color={colors.textFaint} />
              <Text style={styles.destMetaText}>{estMinutes(d)}m · {d.tag}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.white, fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },

  hero: { minHeight: 300, borderRadius: radius.xl, overflow: "hidden", padding: 22, justifyContent: "flex-end", backgroundColor: "#0E1512" },
  heroImg: { borderRadius: radius.xl },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,8,7,0.5)" },
  heroTopRow: { position: "absolute", top: 18, left: 22, right: 22, flexDirection: "row", justifyContent: "space-between" },
  povBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(224,30,43,0.92)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  povText: { color: "#fff", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  guidedBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  guidedText: { color: colors.yellow, fontSize: 9.5, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 0.4 },
  heroCountry: { color: colors.yellow, fontSize: 14, fontWeight: "700", marginTop: 2 },
  heroDesc: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 560 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  primaryCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
  primaryCtaHover: { backgroundColor: colors.redBright },
  primaryCtaText: { color: "#fff", fontSize: 13.5, fontWeight: "800", letterSpacing: 0.6 },
  secondaryCta: { justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 22, minHeight: 48, backgroundColor: "rgba(0,0,0,0.35)" },
  secondaryCtaHover: { borderColor: "rgba(255,255,255,0.6)" },
  secondaryCtaText: { color: "#fff", fontSize: 12.5, fontWeight: "800", letterSpacing: 0.6 },

  prefs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 20, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  prefItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  prefLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  prefValue: { color: colors.white, fontSize: 14, fontWeight: "700", marginTop: 1 },
  adjust: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" as any, borderWidth: 1, borderColor: "rgba(245,179,1,0.3)", borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, minHeight: 44 },
  adjustText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },

  section: { gap: 10 },
  sectionTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },

  continueCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(245,179,1,0.28)", padding: 12 },
  continueThumb: { width: 96, height: 64, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.05)" },
  continueLabel: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  resumeBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
  resumeText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },

  destCard: { width: 190, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 3 },
  destCardHover: { borderColor: "rgba(255,255,255,0.24)" },
  destThumb: { height: 96, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden", marginBottom: 6 },
  newTag: { position: "absolute", top: 8, left: 8, backgroundColor: colors.yellow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newTagText: { color: "#241B00", fontSize: 9, fontWeight: "800" },
  destTitle: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  destCountry: { color: colors.yellow, fontSize: 11.5, fontWeight: "600" },
  destMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  destMetaText: { color: colors.textDim, fontSize: 11.5 },
});
