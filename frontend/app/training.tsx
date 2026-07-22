import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, LayoutChangeEvent, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { SideNavigation } from "@/src/components/SideNavigation";
import { BrandHeader } from "@/src/components/BrandHeader";
import { navItems, navFooter, brand } from "@/src/data";
import { GlassPill } from "@/src/components/ui";
import {
  AlbertoTrainingCard,
  MainWorkoutCard,
  RouteWeatherCard,
  ReadinessCard,
  TrainingLoadCard,
  WorkoutBreakdownCard,
  EquipmentCard,
  PreRideCard,
  FB50RecommendationCard,
  MPCRecommendationCard,
} from "@/src/components/training";

const coachAvatar = require("../assets/images/coach_alberto_b2.jpg");

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(), 1900);
    return () => clearTimeout(t);
  }, [message, anim]);
  if (!message) return null;
  return (
    <Animated.View
      testID="toast"
      style={[styles.toast, shadow.glow, { pointerEvents: "none", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

function TopStatus({ onPress }: { onPress: (m: string) => void }) {
  return (
    <View style={styles.statusWrap}>
      <View style={styles.statusRow}>
        <GlassPill testID="flame-pill" onPress={() => onPress("12 day streak 🔥")}>
          <Ionicons name="flame" size={16} color={colors.yellow} />
          <Text style={styles.pillText}>{brand.flame}</Text>
        </GlassPill>
        <GlassPill testID="bell-pill" onPress={() => onPress("You have 3 notifications")}>
          <Ionicons name="notifications" size={16} color="#fff" />
          <View style={styles.badge}><Text style={styles.badgeText}>{brand.notifications}</Text></View>
        </GlassPill>
        <GlassPill testID="profile-pill" style={styles.avatar} onPress={() => onPress("Profile")}>
          <Image source={coachAvatar} style={styles.avatarImg} contentFit="cover" contentPosition="top center" />
        </GlassPill>
      </View>
      <View style={styles.scriptWrap}>
        <Text style={styles.script}>Alberto</Text>
        <Text style={styles.scriptSub}>Your Coach</Text>
      </View>
    </View>
  );
}

export default function TodaysTraining() {
  const { width, height } = useWindowDimensions();
  const compact = height < 560;
  const navWidth = compact ? Math.max(72, Math.min(88, width * 0.09)) : Math.max(84, Math.min(104, width * 0.085));
  const contentPadH = compact ? spacing.md : spacing.lg;
  const mainWidth = width - navWidth - contentPadH * 2;
  const rightColW = compact ? mainWidth : 330;

  const router = useRouter();
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [leftW, setLeftW] = React.useState(560);

  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const onSelectNav = (key: string) => {
    if (key === "home") {
      router.replace("/");
      return;
    }
    if (key === "workouts" || key === "training") return; // already here
    const item = [...navItems, ...navFooter].find((n) => n.key === key);
    showToast(`${item?.label ?? key}`);
  };

  const onLeftLayout = (e: LayoutChangeEvent) => setLeftW(e.nativeEvent.layout.width);
  const chartWidth = Math.max(320, leftW - spacing.lg * 2);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left"]}>
        <View style={styles.row}>
          <SideNavigation active="home" onSelect={onSelectNav} width={navWidth} compact={compact} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.content, compact && { paddingHorizontal: spacing.md, gap: spacing.sm }]}
            showsVerticalScrollIndicator={false}
            testID="training-scroll"
          >
            {/* header */}
            {compact ? (
              <View style={{ gap: spacing.sm }}>
                <View style={styles.compactTopRow}>
                  <BrandHeader compact showDescriptor={false} />
                  <TopStatus onPress={showToast} />
                </View>
                <Text style={[styles.pageTitle, { fontSize: 30, marginTop: 2 }]}>Today&apos;s Training</Text>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={15} color={colors.textDim} />
                  <Text style={styles.dateText}>Wednesday, 12 May 2025</Text>
                </View>
                <AlbertoTrainingCard width={mainWidth} onPress={() => showToast("Message from Alberto")} />
              </View>
            ) : (
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <BrandHeader compact showDescriptor={false} />
                  <Text style={styles.pageTitle}>Today&apos;s Training</Text>
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={15} color={colors.textDim} />
                    <Text style={styles.dateText}>Wednesday, 12 May 2025</Text>
                  </View>
                </View>

                <AlbertoTrainingCard width={400} onPress={() => showToast("Message from Alberto")} />

                <View style={{ width: rightColW, alignItems: "flex-end" }}>
                  <TopStatus onPress={showToast} />
                </View>
              </View>
            )}

            {/* body */}
            <View style={[styles.body, compact && { flexDirection: "column" }]}>
              <View style={[styles.leftCol, compact && styles.fullCol]} onLayout={onLeftLayout}>
                <MainWorkoutCard chartWidth={chartWidth} onDetails={() => showToast("Opening workout details")} />
                <RouteWeatherCard onPreview={() => showToast("Previewing Alpe d'Huez")} onImagePress={() => showToast("Opening route map")} />
                <View style={styles.bottomRow}>
                  <View style={styles.bottomSlot}>
                    <PreRideCard />
                  </View>
                  <FB50RecommendationCard onPress={() => showToast("Starting Pre-Ride Activation")} />
                  <MPCRecommendationCard onPress={() => showToast("Starting Calm Start")} />
                </View>
              </View>

              <View style={[styles.rightCol, { width: rightColW }, compact && styles.fullCol]}>
                <ReadinessCard />
                <TrainingLoadCard width={rightColW} />
                <WorkoutBreakdownCard onStart={() => router.push("/workout")} />
                <EquipmentCard onItemPress={(label) => showToast(`${label} status`)} />
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>

      <Toast message={toast} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: { flex: 1, flexDirection: "row" },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  compactTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  fullCol: { width: "100%", flex: 0 },
  headerLeft: { flex: 1 },
  pageTitle: { color: colors.white, fontSize: 44, fontWeight: "800", letterSpacing: -0.5, marginTop: 8 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  dateText: { color: colors.textDim, fontSize: 14 },

  statusWrap: { alignItems: "flex-end" },
  statusRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pillText: { color: "#fff", fontWeight: "800", fontSize: 14, marginLeft: 6 },
  avatar: { width: 48, height: 48, paddingHorizontal: 0, borderColor: colors.border, overflow: "hidden" },
  avatarImg: { width: 48, height: 48, borderRadius: radius.pill },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  scriptWrap: { alignItems: "flex-end", marginTop: 10 },
  script: { color: colors.gold, fontSize: 26, fontStyle: "italic", fontWeight: "600" },
  scriptSub: { color: colors.white, fontSize: 12, marginTop: -2 },

  body: { flexDirection: "row", gap: spacing.md },
  leftCol: { flex: 1, gap: spacing.md },
  rightCol: { gap: spacing.md },
  bottomRow: { flexDirection: "row", gap: spacing.md },
  bottomSlot: { flex: 1, flexBasis: 0, minWidth: 0 },

  toast: { position: "absolute", top: 24, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(20,18,16,0.96)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  toastText: { color: colors.white, fontWeight: "700", fontSize: 14 },
});
