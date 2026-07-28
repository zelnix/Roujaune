import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../../theme";
import { ScheduledWorkoutReminder } from "./ScheduledWorkoutReminder";

type Dest = { id: string; title: string; country: string; minutes: number; feel: string; tag?: string };

const CONTINUE: Dest[] = [
  { id: "garda", title: "Lake Garda Lakeside", country: "Italy", minutes: 42, feel: "Relaxed" },
];
const RECOMMENDED: Dest[] = [
  { id: "hyde", title: "Hyde Park & Kensington", country: "London", minutes: 28, feel: "Gentle" },
  { id: "swan", title: "Swan River", country: "Perth", minutes: 35, feel: "Relaxed" },
  { id: "tuscany", title: "Tuscan Hills", country: "Italy", minutes: 55, feel: "Rolling" },
];
const RECENT: Dest[] = [
  { id: "amsterdam", title: "Amsterdam Canals", country: "Netherlands", minutes: 32, feel: "Flat", tag: "New" },
  { id: "coast", title: "Coastal Road", country: "Amalfi", minutes: 48, feel: "Scenic", tag: "New" },
];
const SHORT: Dest[] = [
  { id: "hyde2", title: "Hyde Park Loop", country: "London", minutes: 22, feel: "Gentle" },
  { id: "town", title: "Historic Town Ride", country: "Bruges", minutes: 26, feel: "Relaxed" },
];
const FAVOURITES: Dest[] = [
  { id: "garda2", title: "Lake Garda Lakeside", country: "Italy", minutes: 42, feel: "Relaxed" },
];

/** Calm, destination-led Today content for the Scenic Cycling experience.
 *  Feels vacation-like — never a performance dashboard. "Begin Scenic Journey"
 *  continues into the existing Roujaune scenic flow (/routes → /virtual-route). */
export function ScenicCyclingTodayView({ onToast }: { onToast?: (t: string) => void }) {
  const router = useRouter();
  const begin = () => router.push("/virtual-route");
  const explore = () => router.push("/routes");

  return (
    <View style={{ gap: spacing.md }} testID="scenic-cycling-today">
      <ScheduledWorkoutReminder />

      <Text style={styles.h1}>WHERE SHALL WE EXPLORE TODAY?</Text>

      {/* Hero destination */}
      <View style={styles.hero} testID="scenic-hero">
        <View style={styles.heroGlow} />
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
        <Text style={styles.heroTitle}>LAKE GARDA LAKESIDE JOURNEY</Text>
        <Text style={styles.heroCountry}>Italy</Text>
        <Text style={styles.heroDesc}>
          Ride beside Lake Garda through historic villages, olive-lined roads and mountain scenery.
        </Text>
        <View style={styles.heroStats}>
          <Stat icon="time-outline" label="42 minutes" />
          <Stat icon="leaf-outline" label="Relaxed" />
          <Stat icon="sparkles-outline" label="8 discoveries" />
        </View>
        <View style={styles.heroCtas}>
          <Pressable testID="begin-scenic-journey" onPress={begin} accessibilityRole="button" accessibilityLabel="Begin scenic journey to Lake Garda"
            style={({ hovered }: any) => [styles.primaryCta, hovered && styles.primaryCtaHover]}>
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.primaryCtaText}>BEGIN SCENIC JOURNEY</Text>
          </Pressable>
          <Pressable testID="explore-destinations" onPress={explore} accessibilityRole="button"
            style={({ hovered }: any) => [styles.secondaryCta, hovered && styles.secondaryCtaHover]}>
            <Text style={styles.secondaryCtaText}>EXPLORE DESTINATIONS</Text>
          </Pressable>
        </View>
      </View>

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

      <DestRow title="Continue your journey" data={CONTINUE} onPress={begin} />
      <DestRow title="Recommended for you" data={RECOMMENDED} onPress={explore} />
      <DestRow title="Recently added destinations" data={RECENT} onPress={explore} />
      <DestRow title="Scenic rides under 30 minutes" data={SHORT} onPress={explore} />
      <DestRow title="Favourite journeys" data={FAVOURITES} onPress={begin} />
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

function DestRow({ title, data, onPress }: { title: string; data: Dest[]; onPress: () => void }) {
  return (
    <View style={styles.section} testID={`scenic-row-${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {data.map((d) => (
          <Pressable key={d.id} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${d.title}, ${d.country}, ${d.minutes} minutes, ${d.feel}`}
            style={({ hovered }: any) => [styles.destCard, hovered && styles.destCardHover]}>
            <View style={styles.destThumb}>
              <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.35)" />
              {d.tag ? <View style={styles.newTag}><Text style={styles.newTagText}>{d.tag}</Text></View> : null}
            </View>
            <Text style={styles.destTitle} numberOfLines={1}>{d.title}</Text>
            <Text style={styles.destCountry} numberOfLines={1}>{d.country}</Text>
            <View style={styles.destMeta}>
              <Ionicons name="time-outline" size={12} color={colors.textFaint} />
              <Text style={styles.destMetaText}>{d.minutes}m · {d.feel}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.white, fontSize: 22, fontWeight: "800", letterSpacing: 0.4 },

  hero: { minHeight: 300, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: "#0E1512", padding: 22, overflow: "hidden", justifyContent: "flex-end" },
  heroGlow: { position: "absolute", top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(67,209,122,0.14)" },
  heroTopRow: { position: "absolute", top: 18, left: 22, right: 22, flexDirection: "row", justifyContent: "space-between" },
  povBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(224,30,43,0.9)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  povText: { color: "#fff", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  guidedBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  guidedText: { color: colors.yellow, fontSize: 9.5, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 0.4 },
  heroCountry: { color: colors.yellow, fontSize: 14, fontWeight: "700", marginTop: 2 },
  heroDesc: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 560 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  primaryCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
  primaryCtaHover: { backgroundColor: colors.redBright },
  primaryCtaText: { color: "#fff", fontSize: 13.5, fontWeight: "800", letterSpacing: 0.6 },
  secondaryCta: { justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 22, minHeight: 48, backgroundColor: "rgba(255,255,255,0.04)" },
  secondaryCtaHover: { borderColor: "rgba(255,255,255,0.28)" },
  secondaryCtaText: { color: colors.white, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.6 },

  prefs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 20, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  prefItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  prefLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  prefValue: { color: colors.white, fontSize: 14, fontWeight: "700", marginTop: 1 },
  adjust: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" as any, borderWidth: 1, borderColor: "rgba(245,179,1,0.3)", borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, minHeight: 44 },
  adjustText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },

  section: { gap: 10 },
  sectionTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  destCard: { width: 190, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 3 },
  destCardHover: { borderColor: "rgba(255,255,255,0.24)" },
  destThumb: { height: 96, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  newTag: { position: "absolute", top: 8, left: 8, backgroundColor: colors.yellow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newTagText: { color: "#241B00", fontSize: 9, fontWeight: "800" },
  destTitle: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  destCountry: { color: colors.yellow, fontSize: 11.5, fontWeight: "600" },
  destMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  destMetaText: { color: colors.textDim, fontSize: 11.5 },
});
