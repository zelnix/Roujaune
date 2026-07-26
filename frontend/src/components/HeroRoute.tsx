import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, textShadow } from "../theme";
import { brand } from "../data";
import { useCoach } from "../lib/coach-persona";
import { useRiderProfile } from "../lib/rider-profile";
import { useSettings } from "../lib/settings";
import { useWeather } from "../lib/weather";
import { BrandHeader } from "./BrandHeader";
import { AlbertoCoachCard } from "./AlbertoCoachCard";
import { GlassPill } from "./ui";

const heroImg = require("../../assets/images/hero_cyclist_b2.jpg");

function StatusBar({ onFlame, onNotifications, onProfile, avatar }: { onFlame: () => void; onNotifications: () => void; onProfile?: () => void; avatar?: string | null }) {
  return (
    <View style={styles.statusRow}>
      <GlassPill testID="flame-pill" onPress={onFlame}>
        <Ionicons name="flame" size={16} color={colors.yellow} />
        <Text style={styles.pillText}>{brand.flame}</Text>
      </GlassPill>

      <GlassPill testID="bell-pill" onPress={onNotifications}>
        <Ionicons name="notifications" size={16} color="#fff" />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{brand.notifications}</Text>
        </View>
      </GlassPill>

      <GlassPill testID="profile-pill" style={styles.avatar} onPress={onProfile}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" contentPosition="top center" />
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
  onFlame,
  onNotifications,
  compact = false,
}: {
  width: number;
  height: number;
  onStart: () => void;
  onMessage?: () => void;
  onProfile?: () => void;
  onFlame: () => void;
  onNotifications: () => void;
  compact?: boolean;
}) {
  const persona = useCoach();
  const { avatar } = useRiderProfile();
  const { settings } = useSettings();
  const weather = useWeather({ city: settings.homeCity, lat: settings.homeLat, lon: settings.homeLon });
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
      <StatusBar onFlame={onFlame} onNotifications={onNotifications} onProfile={onProfile} avatar={avatar} />

      {/* right: coach signature + local weather + today's date */}
      <View style={[styles.signatureArea, compact && { top: "22%" }]}>
        <Text style={[styles.signature, compact && { fontSize: 26 }]}>{persona.name}</Text>
        <Text style={styles.signatureSub}>Your Companion Coach</Text>

        <View style={styles.weatherTop}>
          <Ionicons name={weather.icon} size={compact ? 15 : 18} color={colors.yellow} />
          <Text style={[styles.temp, compact && { fontSize: 18 }]}>{weather.temp}</Text>
        </View>
        <Text style={[styles.place, compact && { fontSize: 14 }]} numberOfLines={1}>{weather.place}</Text>
        <Text style={styles.dateText}>{weather.dateLabel}</Text>
      </View>

      {/* bottom-left coaching card */}
      <View style={styles.coachArea}>
        <AlbertoCoachCard
          width={compact ? Math.min(360, width * 0.7) : Math.min(430, width * 0.66)}
          onStart={onStart}
          onMessage={onMessage}
          compact={compact}
        />
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
  avatar: { width: 44, height: 44, paddingHorizontal: 0, borderColor: colors.yellow },
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
  signature: {
    color: colors.gold,
    fontSize: 34,
    fontStyle: "italic",
    fontWeight: "600",
    ...textShadow("rgba(0,0,0,0.5)", 8),
  },
  signatureSub: { color: colors.white, fontSize: 13, marginTop: -2 },
  weatherTop: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 },
  temp: { color: colors.white, fontSize: 22, fontWeight: "800" },
  place: { color: colors.white, fontSize: 16, fontWeight: "700", marginTop: 2 },
  dateText: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 3 },
  coachArea: { position: "absolute", left: spacing.lg, bottom: spacing.lg },
});
