import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../../theme";
import { useScenicRoutes, useScenicLast, ScenicRoute, ytThumb } from "../../lib/scenic-routes";
import { ExperienceHero, experienceHeroBg } from "./ExperienceHero";

/** Higher-res YouTube still for full-bleed backgrounds (falls back gracefully). */
function ytThumbMax(id: string): string {
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

function mins(r: ScenicRoute): number | null {
  return r.duration_min ?? null;
}
function thumbUri(r: ScenicRoute): string {
  return r.thumbnail || ytThumb(r.youtube_id);
}
function regionIcon(region: string): any {
  switch (region) {
    case "Alps": return "triangle-outline";
    case "Lakes": return "water-outline";
    case "Safari": return "paw-outline";
    case "Countryside": return "leaf-outline";
    default: return "sparkles-outline"; // "All"
  }
}

/** Calm, destination-led Today content for the Scenic Cycling experience —
 *  driven by the admin-managed scenic-route catalog (POV YouTube rides), fully
 *  separate from the training Virtual Routes. Every card opens the immersive
 *  scenic player; "Continue your journey" reflects the rider's genuine last
 *  scenic ride (hidden until they have one). */
export function ScenicCyclingTodayView({ onToast }: { onToast?: (t: string) => void }) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 560;
  const { routes, loading } = useScenicRoutes();
  const last = useScenicLast();
  const [region, setRegion] = React.useState<string>("All");

  const open = (id: string) => router.push(`/scenic-ride?route=${id}` as any);

  const surprise = React.useCallback(() => {
    if (!routes || routes.length === 0) return;
    const pick = routes[Math.floor(Math.random() * routes.length)];
    onToast?.(`Surprise! ${pick.name}`);
    open(pick.id);
  }, [routes, onToast]);

  if (loading) {
    return (
      <View style={styles.loadingWrap} testID="scenic-cycling-today">
        <ActivityIndicator color={colors.yellow} />
        <Text style={styles.loadingText}>Finding beautiful roads for you…</Text>
      </View>
    );
  }

  // Empty state — never fabricate destinations; wait for admins to publish.
  if (!routes || routes.length === 0) {
    return (
      <View style={{ gap: spacing.md }} testID="scenic-cycling-today">
        <ExperienceHero compact={compact} source={experienceHeroBg} descriptor="Where shall we explore today?" testID="scenic-header" />
        <View style={styles.empty} testID="scenic-empty">
          <View style={styles.emptyIcon}><Ionicons name="earth-outline" size={30} color={colors.yellow} /></View>
          <Text style={styles.emptyTitle}>New scenic destinations are on the way</Text>
          <Text style={styles.emptyBody}>
            We’re curating relaxed POV rides through beautiful places. Check back
            soon — your next journey will appear right here.
          </Text>
        </View>
      </View>
    );
  }

  const REGION_ORDER = ["Alps", "Lakes", "Safari", "Countryside"];
  const present = Array.from(new Set(routes.map((r) => r.region).filter(Boolean))) as string[];
  const regions = [
    ...REGION_ORDER.filter((r) => present.includes(r)),
    ...present.filter((r) => !REGION_ORDER.includes(r)).sort(),
  ];
  const activeRegion = region !== "All" && present.includes(region) ? region : "All";
  const filtered = activeRegion === "All" ? routes : routes.filter((r) => r.region === activeRegion);

  const hero = filtered[0];
  const others = filtered.filter((r) => r.id !== hero.id);
  const shortRides = filtered.filter((r) => (mins(r) ?? 999) < 35);
  const recent = filtered.slice(-2);
  const lastRoute = last?.available && last.routeId ? routes.find((r) => r.id === last.routeId) : null;

  // Header photo swaps to a matching destination when a region is selected.
  const regionHeroRoute = activeRegion === "All" ? null : routes.find((r) => r.region === activeRegion);
  const heroSource = regionHeroRoute ? { uri: ytThumbMax(regionHeroRoute.youtube_id) } : experienceHeroBg;

  return (
    <View style={{ gap: spacing.md }} testID="scenic-cycling-today">
      <ExperienceHero compact={compact} source={heroSource} descriptor="Where shall we explore today?" testID="scenic-header">
        {/* Overlaid POV showcase + prefs, sitting on the background photo */}
        <ImageBackground source={{ uri: thumbUri(hero) }} style={styles.hero} imageStyle={styles.heroImg} testID="scenic-hero">
          <View style={styles.heroScrim} />
          <View style={styles.heroTopRow}>
            <View style={styles.povBadge}>
              <Ionicons name="videocam" size={12} color="#fff" />
              <Text style={styles.povText}>POV VIDEO</Text>
            </View>
            <View style={styles.guidedBadge}>
              <Ionicons name="leaf" size={11} color={colors.yellow} />
              <Text style={styles.guidedText}>Relaxed ride</Text>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.heroTitle}>{hero.name.toUpperCase()}</Text>
          <Text style={styles.heroCountry}>{hero.place}</Text>
          <Text style={styles.heroDesc} numberOfLines={2}>
            {hero.description || `A relaxed ${hero.tag.toLowerCase()} journey — ride at your own pace and soak in the scenery.`}
          </Text>
          <View style={styles.heroStats}>
            {mins(hero) ? <Stat icon="time-outline" label={`${mins(hero)} minutes`} /> : null}
            <Stat icon="leaf-outline" label="Relaxed" />
            {hero.elevation_m ? <Stat icon="trending-up-outline" label={`${hero.elevation_m} m`} /> : null}
            {hero.distance_km ? <Stat icon="navigate-outline" label={`${hero.distance_km} km`} /> : null}
          </View>
          <View style={styles.heroCtas}>
            <Pressable testID="begin-scenic-journey" onPress={() => open(hero.id)} accessibilityRole="button" accessibilityLabel={`Begin scenic journey: ${hero.name}`}
              style={({ hovered }: any) => [styles.primaryCta, hovered && styles.primaryCtaHover]}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.primaryCtaText}>BEGIN SCENIC JOURNEY</Text>
            </Pressable>
            <Pressable testID="surprise-me" onPress={surprise} accessibilityRole="button" accessibilityLabel="Surprise me with a random scenic ride"
              style={({ hovered }: any) => [styles.surpriseCta, hovered && styles.surpriseCtaHover]}>
              <Ionicons name="shuffle" size={16} color={colors.yellow} />
              <Text style={styles.surpriseCtaText}>SURPRISE ME</Text>
            </Pressable>
          </View>
        </ImageBackground>

        {/* Preferences summary + region filters (same line as Ride feel) */}
        <View style={styles.prefs} testID="scenic-prefs">
          <Pref label="Companion" value="Alberto" icon="person-circle-outline" />
          <Pref label="Journey style" value="Discover" icon="compass-outline" />
          <Pref label="Ride feel" value="Relaxed Journey" icon="leaf-outline" />
          {regions.length > 1 && (
            <View style={styles.prefFilters} testID="scenic-region-filter">
              {["All", ...regions].map((r) => {
                const sel = activeRegion === r;
                return (
                  <Pressable
                    key={r}
                    testID={`scenic-region-${r}`}
                    onPress={() => setRegion(r)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`Show ${r} rides`}
                    style={[styles.filterChip, sel && styles.filterChipSel]}
                  >
                    <Ionicons name={regionIcon(r)} size={13} color={sel ? colors.bg : colors.yellow} />
                    <Text style={[styles.filterChipText, sel && styles.filterChipTextSel]}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable testID="adjust-journey" onPress={() => router.push("/settings")} style={styles.adjust} accessibilityRole="button">
            <Ionicons name="options-outline" size={15} color={colors.yellow} />
            <Text style={styles.adjustText}>Adjust journey</Text>
          </Pressable>
        </View>
      </ExperienceHero>

      {/* Continue your journey — only when the rider actually has a last scenic ride */}
      {lastRoute && (
        <View style={styles.section} testID="scenic-continue">
          <Text style={styles.sectionTitle}>Continue your journey</Text>
          <Pressable onPress={() => open(lastRoute.id)} accessibilityRole="button" accessibilityLabel={`Resume ${lastRoute.name}`}
            style={({ hovered }: any) => [styles.continueCard, hovered && styles.destCardHover]}>
            <Image source={{ uri: thumbUri(lastRoute) }} style={styles.continueThumb} contentFit="cover" />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.continueLabel}>PICK UP WHERE YOU LEFT OFF</Text>
              <Text style={styles.destTitle}>{lastRoute.name}</Text>
              <Text style={styles.destCountry}>{lastRoute.place}</Text>
            </View>
            <View style={styles.resumeBtn}><Ionicons name="play" size={16} color="#fff" /><Text style={styles.resumeText}>Resume</Text></View>
          </Pressable>
        </View>
      )}

      {others.length > 0 && <DestRow title="Recommended for you" data={others} open={open} />}
      {recent.length > 0 && <DestRow title="Recently added destinations" data={recent} open={open} tag="New" />}
      {shortRides.length > 0 && <DestRow title="Scenic rides under 35 minutes" data={shortRides} open={open} />}
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

function DestRow({ title, data, open, tag }: { title: string; data: ScenicRoute[]; open: (id: string) => void; tag?: string }) {
  if (!data.length) return null;
  return (
    <View style={styles.section} testID={`scenic-row-${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {data.map((d) => (
          <Pressable key={d.id} onPress={() => open(d.id)} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.place}${mins(d) ? `, ${mins(d)} minutes` : ""}, ${d.tag}`}
            style={({ hovered }: any) => [styles.destCard, hovered && styles.destCardHover]}>
            <View style={styles.destThumb}>
              <Image source={{ uri: thumbUri(d) }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
              {tag ? <View style={styles.newTag}><Text style={styles.newTagText}>{tag}</Text></View> : null}
            </View>
            <Text style={styles.destTitle} numberOfLines={1}>{d.name}</Text>
            <Text style={styles.destCountry} numberOfLines={1}>{d.place}</Text>
            <View style={styles.destMeta}>
              <Ionicons name="time-outline" size={12} color={colors.textFaint} />
              <Text style={styles.destMetaText}>{mins(d) ? `${mins(d)}m · ` : ""}{d.tag}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.white, fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },
  header: { gap: 6, marginBottom: 2 },
  wordmark: { width: 200, height: 30, alignSelf: "flex-start" },
  subtitle: { color: colors.textDim, fontSize: 13.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },

  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 2, paddingRight: 8 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,179,1,0.10)", borderWidth: 1, borderColor: "rgba(245,179,1,0.30)", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40 },
  filterChipSel: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  filterChipText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  filterChipTextSel: { color: colors.bg, fontWeight: "800" },

  loadingWrap: { gap: spacing.md, paddingVertical: 40, alignItems: "center" },
  loadingText: { color: colors.textDim, fontSize: 14, fontWeight: "600" },

  empty: { alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: 40, paddingHorizontal: 28 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)" },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: colors.textDim, fontSize: 14.5, lineHeight: 22, textAlign: "center", maxWidth: 460 },

  hero: { alignSelf: "flex-start", width: "100%", maxWidth: 672, minHeight: 252, borderRadius: radius.xl, overflow: "hidden", padding: 20, justifyContent: "flex-end", backgroundColor: "#0E1512" },
  heroImg: { borderRadius: radius.xl },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,8,7,0.5)" },
  heroTopRow: { position: "absolute", top: 14, left: 20, right: 20, flexDirection: "row", justifyContent: "space-between" },
  povBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(224,30,43,0.92)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  povText: { color: "#fff", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  guidedBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  guidedText: { color: colors.yellow, fontSize: 9.5, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 0.3 },
  heroCountry: { color: colors.yellow, fontSize: 14, fontWeight: "700", marginTop: 2 },
  heroDesc: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, lineHeight: 19, marginTop: 7, maxWidth: 560 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: "#fff", fontSize: 12.5, fontWeight: "600" },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginTop: 16 },
  primaryCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 20, minHeight: 48 },
  primaryCtaHover: { backgroundColor: colors.redBright },
  primaryCtaText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  surpriseCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(245,179,1,0.5)", borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 18, minHeight: 48 },
  surpriseCtaHover: { backgroundColor: "rgba(245,179,1,0.14)" },
  surpriseCtaText: { color: colors.yellow, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },

  prefs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, backgroundColor: "rgba(10,14,12,0.66)", borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 16 },
  prefFilters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
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
