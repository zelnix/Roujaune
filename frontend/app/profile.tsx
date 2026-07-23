import React from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useSettings } from "@/src/lib/settings";
import { useCoach } from "@/src/lib/coach-persona";

const riderImg = require("../assets/images/hero_cyclist_b2.jpg");

function Stat({ v, l, accent }: { v: string; l: string; accent?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statVal, accent ? { color: accent } : null]}>{v}</Text>
      <Text style={s.statLbl}>{l}</Text>
    </View>
  );
}

function SeasonRow({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={s.seasonRow}>
      <View style={[s.seasonIcon, { borderColor: color }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.seasonLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={s.seasonValue}>{value}</Text>
    </View>
  );
}

const ACHIEVEMENTS = [
  { icon: "trophy", label: "Everest Challenge", sub: "8,848 m in a week", color: CC.yellow },
  { icon: "flame", label: "12-Day Streak", sub: "Longest this season", color: CC.rouge },
  { icon: "flash", label: "New FTP PR", sub: "+6 W this block", color: CC.green },
  { icon: "medal", label: "Century Club", sub: "First 100 km ride", color: "#40A9C6" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const persona = useCoach();
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;

  return (
    <AppScaffold active="profile" title="Profile" subtitle="Your rider identity, season progress and achievements.">
      <View style={[s.row, !twoCol && { flexDirection: "column" }]}>
        {/* Rider identity */}
        <Card testID="profile-identity" style={{ flex: 1 }}>
          <View style={s.identityRow}>
            <View style={s.avatarWrap}>
              <Image source={riderImg} style={s.avatar} contentFit="cover" contentPosition="top center" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>Rider One</Text>
              <Text style={s.org}>Roujaune · Harmony Wellness Group</Text>
              <View style={s.badgeRow}>
                <View style={s.tierBadge}>
                  <Ionicons name="star" size={11} color="#241B00" />
                  <Text style={s.tierText}>Climber · Cat 2</Text>
                </View>
                <View style={s.coachChip}>
                  <Image source={persona.image} style={s.coachChipImg} contentFit="cover" contentPosition="top center" />
                  <Text style={s.coachChipText}>Coached by {persona.name}</Text>
                </View>
              </View>
            </View>
            <Pressable testID="edit-profile" onPress={() => router.push("/settings")} style={({ hovered }: any) => [s.editBtn, hovered && s.hover]}>
              <Ionicons name="create-outline" size={15} color={CC.white} />
              <Text style={s.editText}>Edit</Text>
            </Pressable>
          </View>

          <View style={s.statsRow}>
            <Stat v={`${settings.ftp} W`} l="FTP" accent={CC.yellow} />
            <Stat v="78 kg" l="Weight" />
            <Stat v={`${(settings.ftp / 78).toFixed(1)}`} l="W/kg" />
            <Stat v="58" l="VO2 Max" />
          </View>
        </Card>

        {/* Season snapshot */}
        <Card testID="profile-season" style={twoCol ? { width: 360 } : undefined}>
          <SectionTitle label="THIS SEASON" color={CC.rouge} />
          <SeasonRow icon="bicycle" label="Rides completed" value="86" color={CC.rouge} />
          <SeasonRow icon="navigate" label="Distance" value="3,420 km" color={CC.yellow} />
          <SeasonRow icon="trending-up" label="Elevation" value="48,600 m" color={CC.green} />
          <SeasonRow icon="time" label="Time in the saddle" value="142 h" color="#40A9C6" />
          <SeasonRow icon="flame" label="Current streak" value="12 days" color="#E8631C" />
        </Card>
      </View>

      {/* Achievements */}
      <Card testID="profile-achievements">
        <SectionTitle label="ACHIEVEMENTS" />
        <View style={s.achGrid}>
          {ACHIEVEMENTS.map((a) => (
            <View key={a.label} style={s.achCard}>
              <View style={[s.achIcon, { backgroundColor: a.color + "22", borderColor: a.color }]}>
                <Ionicons name={a.icon} size={20} color={a.color} />
              </View>
              <Text style={s.achLabel}>{a.label}</Text>
              <Text style={s.achSub}>{a.sub}</Text>
            </View>
          ))}
        </View>
      </Card>
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 16 },

  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  avatarWrap: { width: 84, height: 84, borderRadius: 42, overflow: "hidden", borderWidth: 2, borderColor: CC.yellow },
  avatar: { width: "100%", height: "100%" },
  name: { color: CC.white, fontSize: 24, fontWeight: "900" },
  org: { color: CC.dim, fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
  tierBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: CC.yellow, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  tierText: { color: "#241B00", fontSize: 12, fontWeight: "800" },
  coachChip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  coachChipImg: { width: 20, height: 20, borderRadius: 10 },
  coachChipText: { color: CC.white, fontSize: 12, fontWeight: "600" },

  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  hover: { borderColor: "rgba(255,255,255,0.3)" },
  editText: { color: CC.white, fontSize: 13, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 18, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 16 },
  stat: { flex: 1 },
  statVal: { color: CC.white, fontSize: 22, fontWeight: "900" },
  statLbl: { color: CC.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginTop: 3 },

  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  seasonIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  seasonLabel: { color: CC.white, fontSize: 14, fontWeight: "600" },
  seasonValue: { color: CC.white, fontSize: 15, fontWeight: "800" },

  achGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  achCard: { flexGrow: 1, flexBasis: 150, minWidth: 140, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: CC.border, borderRadius: 14, padding: 14, alignItems: "flex-start", gap: 4 },
  achIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  achLabel: { color: CC.white, fontSize: 14, fontWeight: "800" },
  achSub: { color: CC.dim, fontSize: 12 },
});
