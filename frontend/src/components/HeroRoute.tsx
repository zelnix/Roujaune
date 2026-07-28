import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { useRiderProfile } from "../lib/rider-profile";
import { useSettings } from "../lib/settings";
import { useWeather } from "../lib/weather";
import { BrandHeader } from "./BrandHeader";
import { AlbertoCoachCard } from "./AlbertoCoachCard";
import { GlassPill } from "./ui";

const heroImg = require("../../assets/images/hero_cyclist_b2.jpg");

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusBar({ onNotifications, onProfile, avatar, initialsText, notifCount }: { onNotifications: () => void; onProfile?: () => void; avatar?: string | null; initialsText: string; notifCount?: number }) {
  return (
    <View style={styles.statusRow}>
      <GlassPill testID="bell-pill" onPress={onNotifications}>
        <Ionicons name="notifications" size={16} color="#fff" />
        {(notifCount ?? 0) > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notifCount}</Text>
          </View>
        )}
      </GlassPill>

      <GlassPill testID="profile-pill" style={styles.avatar} onPress={onProfile}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" contentPosition="top center" />
        ) : initialsText ? (
          <View style={styles.avatarInitialsWrap}>
            <Text style={styles.avatarInitials}>{initialsText}</Text>
          </View>
        ) : (
          <Ionicons name="person" size={18} color="#fff" />
        )}
      </GlassPill>
    </View>
  );
}

export function HeroRoute({
  width,
  height,
  onStart,
  onMessage,
  onProfile,
  onNotifications,
  compact = false,
  sideSlot,
  notifCount,
}: {
  width: number;
  height: number;
  onStart: () => void;
  onMessage?: () => void;
  onProfile?: () => void;
  onNotifications: () => void;
  compact?: boolean;
  sideSlot?: React.ReactNode;
  notifCount?: number;
}) {
  const { avatar, profile, loaded: profileLoaded } = useRiderProfile();
  const { settings, loaded: settingsLoaded } = useSettings();
  const weather = useWeather({ city: settings.homeCity, lat: settings.homeLat, lon: settings.homeLon });
  const [showForecast, setShowForecast] = React.useState(false);
  return (
    <View style={[styles.wrap, { height }]} testID="hero-route">
      <Image
        source={heroImg}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ right: 0, top: "42%" }}
        accessibilityLabel="Cyclist climbing a mountain road at sunset"
      />
      <LinearGradient
        colors={["rgba(5,5,5,0.9)", "rgba(5,5,5,0.4)", "rgba(5,5,5,0.05)", "rgba(5,5,5,0.25)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(5,5,5,0.5)", "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />

      {/* top-left brand */}
      <View style={styles.brandArea}>
        <BrandHeader compact={compact} />
      </View>

      {/* top-right status */}
      <StatusBar onNotifications={onNotifications} onProfile={onProfile} avatar={avatar} initialsText={profileLoaded ? initials(profile?.name) : ""} notifCount={notifCount} />

      {/* right: local weather → tap for the 7-day forecast */}
      <Pressable
        testID="weather-forecast-open"
        onPress={() => setShowForecast(true)}
        hitSlop={{ top: 12, bottom: 16, left: 20, right: 20 }}
        style={[styles.signatureArea, compact && { top: "22%" }]}
        accessibilityRole="button"
        accessibilityLabel="Open seven-day forecast"
      >
        <View style={styles.weatherTop}>
          <Ionicons name={weather.icon} size={compact ? 17 : 21} color={colors.yellow} />
          <Text style={[styles.temp, compact && { fontSize: 21 }, (!settingsLoaded || weather.loading) && { opacity: 0 }]}>{weather.temp}</Text>
        </View>
        <Text style={[styles.place, compact && { fontSize: 15 }]} numberOfLines={1}>{!weather.loading && weather.place ? weather.place : "—"}</Text>
        <Text style={styles.dateText}>{weather.dateLabel}</Text>
        <View style={styles.forecastHint}>
          <Ionicons name="calendar-outline" size={13} color={colors.yellow} />
          <Text style={styles.forecastHintText}>7-day forecast</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.yellow} />
        </View>
      </Pressable>

      <Modal visible={showForecast} transparent animationType="fade" onRequestClose={() => setShowForecast(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowForecast(false)}>
          <Pressable style={styles.forecastCard} onPress={(e) => e.stopPropagation()} testID="weather-forecast-modal">
            <View style={styles.forecastHead}>
              <Text style={styles.forecastTitle}>7-Day Forecast</Text>
              <Text style={styles.forecastPlace}>{weather.place}</Text>
              <Pressable testID="weather-forecast-close" onPress={() => setShowForecast(false)} style={styles.forecastClose} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.white} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {weather.daily.length === 0 ? (
                <Text style={styles.forecastEmpty}>Forecast unavailable right now.</Text>
              ) : weather.daily.map((d, i) => (
                <View key={i} style={styles.forecastRow}>
                  <Text style={[styles.forecastDay, i === 0 && { color: colors.yellow }]}>{i === 0 ? "Today" : d.label}</Text>
                  <Ionicons name={d.icon} size={20} color={colors.yellow} style={{ width: 34, textAlign: "center" }} />
                  <View style={styles.forecastTemps}>
                    <Text style={styles.forecastMax}>{d.tmax}°</Text>
                    <Text style={styles.forecastMin}>{d.tmin}°</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* bottom-left coaching card + optional side slot (matched height) */}
      <View style={styles.coachArea} pointerEvents="box-none">
        <View style={styles.coachRow} pointerEvents="box-none">
          <AlbertoCoachCard
            width={compact ? Math.min(360, width * 0.7) : Math.min(430, width * 0.66)}
            onStart={onStart}
            onMessage={onMessage}
            compact={compact}
          />
          {sideSlot ? <View style={[styles.sideSlot, { width: compact ? 240 : 320 }]}>{sideSlot}</View> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderSoft,
    justifyContent: "flex-end",
  },
  brandArea: { position: "absolute", top: spacing.lg, left: spacing.lg },
  statusRow: { position: "absolute", top: spacing.lg, right: spacing.lg, flexDirection: "row", gap: 10, alignItems: "center" },
  pillText: { color: "#fff", fontWeight: "800", fontSize: 14, marginLeft: 6 },
  avatar: { width: 44, height: 44, paddingHorizontal: 0, borderColor: colors.yellow, borderWidth: 1.5 },
  avatarImg: { width: "100%", height: "100%", borderRadius: radius.pill },
  avatarInitialsWrap: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255,194,10,0.16)" },
  avatarInitials: { color: colors.yellow, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  signatureArea: { position: "absolute", right: spacing.xl, top: "30%", alignItems: "flex-end" },
  weatherTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  temp: { color: colors.white, fontSize: 27, fontWeight: "800" },
  place: { color: colors.white, fontSize: 18, fontWeight: "700", marginTop: 2 },
  dateText: { color: colors.textDim, fontSize: 13.5, fontWeight: "600", marginTop: 3 },
  forecastHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7, backgroundColor: "rgba(255,194,10,0.12)", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  forecastHintText: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  forecastCard: { width: "100%", maxWidth: 420, maxHeight: "80%", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  forecastHead: { marginBottom: spacing.md },
  forecastTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  forecastPlace: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  forecastClose: { position: "absolute", top: 0, right: 0, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  forecastEmpty: { color: colors.textDim, fontSize: 14, paddingVertical: 20, textAlign: "center" },
  forecastRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  forecastDay: { color: colors.white, fontSize: 14, fontWeight: "700", flex: 1 },
  forecastTemps: { flexDirection: "row", alignItems: "baseline", gap: 10, width: 88, justifyContent: "flex-end" },
  forecastMax: { color: colors.white, fontSize: 15, fontWeight: "800" },
  forecastMin: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  coachArea: { position: "absolute", left: spacing.lg, bottom: spacing.lg, right: spacing.lg },
  coachRow: { flexDirection: "row", alignItems: "stretch", gap: spacing.md },
  sideSlot: { alignSelf: "stretch" },
});
