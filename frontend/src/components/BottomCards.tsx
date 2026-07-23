import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { colors, radius, spacing } from "./../theme";
import { progressCard, community, wellness, achievement } from "../data";
import { LineChart, SecondaryButton, SectionLabel } from "./ui";
import { useSettings } from "../lib/settings";

/* -------- PROGRESS -------- */
export function ProgressCard() {
  return (
    <LinearGradient
      testID="progress-card"
      colors={["#2E0D10", "#120708"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headRow}>
        <View style={styles.iconLabel}>
          <Ionicons name="stats-chart" size={13} color={colors.red} />
          <SectionLabel color={colors.red}>PROGRESS</SectionLabel>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.delta}>{progressCard.delta}</Text>
          <Text style={styles.deltaUnit}>{progressCard.unit}</Text>
        </View>
      </View>
      <Text style={styles.title}>{progressCard.title}</Text>
      <Text style={styles.sub}>{progressCard.subtitle}</Text>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <LineChart data={progressCard.points} color={colors.redBright} width={230} height={64} />
      </View>
    </LinearGradient>
  );
}

/* -------- COMMUNITY -------- */
function Avatars() {
  const items = [0, 1, 2, 3, 4];
  return (
    <View style={styles.avatarRow}>
      {items.map((i) => (
        <View key={i} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]}>
          <Ionicons name="person" size={14} color="#ddd" />
        </View>
      ))}
      <View style={[styles.avatar, styles.avatarExtra, { marginLeft: -10 }]}>
        <Text style={styles.extraText}>{community.extra}</Text>
      </View>
    </View>
  );
}

export function CommunityCard({ onPress }: { onPress: () => void }) {
  return (
    <LinearGradient
      testID="community-card"
      colors={["#2A1C10", "#100B07"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.iconLabel}>
        <Ionicons name="people" size={13} color={colors.yellow} />
        <SectionLabel color={colors.yellow}>COMMUNITY</SectionLabel>
      </View>
      <Text style={styles.title}>{community.title}</Text>
      <Text style={styles.online}>{community.online}</Text>
      <Avatars />
      <View style={{ flex: 1 }} />
      <SecondaryButton testID="join-ride-button" label="Join a Group Ride" onPress={onPress} />
    </LinearGradient>
  );
}

/* -------- WELLNESS -------- */
function SunsetBackdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 200">
      <Defs>
        <SvgGrad id="sunset" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A2A2A" />
          <Stop offset="0.45" stopColor="#7A3A1E" />
          <Stop offset="0.7" stopColor="#3A1A12" />
          <Stop offset="1" stopColor="#0C0706" />
        </SvgGrad>
      </Defs>
      <Path d="M0 0 H300 V200 H0 Z" fill="url(#sunset)" />
      <Circle cx={225} cy={120} r={26} fill="#E8913A" opacity={0.7} />
      {/* seated meditation silhouette */}
      <Path
        d="M225 150 c-14 0 -26 6 -26 14 h52 c0 -8 -12 -14 -26 -14 Z M225 118 a9 9 0 1 1 0.1 0 Z M210 150 c0 -12 6 -20 15 -22 c9 2 15 10 15 22 Z"
        fill="#160C0A"
      />
    </Svg>
  );
}

export function WellnessCard() {
  const { settings } = useSettings();
  return (
    <View style={styles.card} testID="wellness-card">
      <SunsetBackdrop />
      <LinearGradient
        colors={["rgba(5,5,5,0.72)", "rgba(5,5,5,0.25)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.iconLabel}>
        <Ionicons name="leaf" size={13} color={colors.green} />
        <SectionLabel color={colors.green}>WELLNESS</SectionLabel>
      </View>
      {settings.hasWearable ? (
        <>
          <Text style={styles.title}>{wellness.title}</Text>
          <Text style={styles.score}>{wellness.score}</Text>
          <Text style={styles.good}>{wellness.status}</Text>
          <Text style={styles.note}>{wellness.note}</Text>
        </>
      ) : (
        <View style={styles.wellnessNC} testID="wellness-not-connected">
          <Ionicons name="watch-outline" size={26} color={colors.textDim} />
          <Text style={styles.ncTitle}>No wearable connected</Text>
          <Text style={styles.ncSub}>Connect a wearable to track readiness, HRV and recovery.</Text>
        </View>
      )}
    </View>
  );
}

/* -------- ACHIEVEMENTS -------- */
export function AchievementCard() {
  const pct = achievement.progress / achievement.total;
  return (
    <LinearGradient
      testID="achievement-card"
      colors={["#20200E", "#0C0C06"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.iconLabel}>
        <Ionicons name="shield" size={13} color={colors.yellow} />
        <SectionLabel color={colors.yellow}>ACHIEVEMENTS</SectionLabel>
      </View>
      <View style={styles.achRow}>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="terrain" size={24} color="#1a1300" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.achTitle}>{achievement.title}</Text>
          <Text style={styles.achDetail}>{achievement.detail}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.achCount}>{achievement.progress} / {achievement.total}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: "hidden",
    minHeight: 150,
  },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  delta: { color: colors.greenText, fontSize: 15, fontWeight: "800" },
  deltaUnit: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
  title: { color: colors.white, fontSize: 16, fontWeight: "800", marginTop: 8 },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  online: { color: colors.greenText, fontSize: 12.5, fontWeight: "600", marginTop: 3 },
  avatarRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#3a352f",
    borderWidth: 1.5,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarExtra: { backgroundColor: colors.redDeep },
  extraText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  score: { color: colors.white, fontSize: 34, fontWeight: "900", marginTop: 4 },
  good: { color: colors.greenText, fontSize: 13, fontWeight: "700" },
  note: { color: colors.textDim, fontSize: 11.5, marginTop: 6, maxWidth: "62%", lineHeight: 16 },
  wellnessNC: { flex: 1, justifyContent: "center", alignItems: "flex-start", gap: 4, marginTop: 6 },
  ncTitle: { color: colors.white, fontSize: 14, fontWeight: "800", marginTop: 4 },
  ncSub: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, maxWidth: "80%" },
  achRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
  },
  achTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  achDetail: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  achCount: { color: colors.textDim, fontSize: 11, fontWeight: "700", alignSelf: "flex-end", marginTop: 5 },
});
