import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { SideNavigation } from "@/src/components/SideNavigation";
import { HeroRoute } from "@/src/components/HeroRoute";
import { MetricSummaryStrip } from "@/src/components/MetricSummaryStrip";
import { TrainingPlanCard } from "@/src/components/TrainingPlanCard";
import { TodayTrainingCard } from "@/src/components/TodayTrainingCard";
import { HomeNotificationArea } from "@/src/components/HomeNotificationArea";
import { ReadinessGate } from "@/src/components/ReadinessGate";
import { ProgressCard, CommunityCard, WellnessCard, AchievementCard } from "@/src/components/BottomCards";
import { useCoach } from "@/src/lib/coach-persona";
import { useTodayMode, resolveNav, rememberRoute, getExperience } from "@/src/lib/today-mode";
import { ScenicCyclingTodayView } from "@/src/components/today/ScenicCyclingTodayView";
import { FutureActivityTodayView } from "@/src/components/today/FutureActivityTodayView";
import { WelcomeBackRibbon } from "@/src/components/today/WelcomeBackRibbon";
import { HuCentAIIntro } from "@/src/components/today/HuCentAIIntro";
import { RideStatusBanner } from "@/src/components/RideStatusBanner";
import { useReducedMotionSafe } from "@/src/lib/use-reduced-motion";
import { useBenchmarkNudge } from "@/src/lib/benchmark/api";
import { useLiveNotifications, useNotificationReadState } from "@/src/lib/notifications";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import { NotificationsModal } from "@/src/components/NotificationsModal";

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
    }, 1900);
    return () => clearTimeout(t);
  }, [message, anim]);

  if (!message) return null;
  return (
    <Animated.View
      testID="toast"
      style={[
        styles.toast,
        shadow.glow,
        { pointerEvents: "none", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
      ]}
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function Dashboard() {
  const { width, height } = useWindowDimensions();
  const compact = height < 560;
  const navWidth = compact
    ? Math.max(72, Math.min(88, width * 0.09))
    : Math.max(84, Math.min(104, width * 0.085));
  const contentWidth = width - navWidth;
  const mainWidth = contentWidth - spacing.lg * 2;
  const heroHeight = compact ? Math.max(320, Math.round(height * 0.94)) : 476;

  const router = useRouter();
  const persona = useCoach();
  const { experience } = useTodayMode();
  const noMotion = useReducedMotionSafe();
  const fade = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (noMotion) { fade.setValue(1); return; }
    fade.setValue(0.35);
    Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: Platform.OS !== "web" }).start();
  }, [experience, noMotion, fade]);
  const { nudge: benchmarkNudge } = useBenchmarkNudge();
  const liveNotifs = useLiveNotifications(benchmarkNudge);
  const { readKeys } = useNotificationReadState();
  const unreadCount = liveNotifs.filter((n) => !readKeys.has(n.key)).length;
  const [active, setActive] = React.useState("home");
  const [showChat, setShowChat] = React.useState(false);
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);

  const showToast = React.useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  const onSelectNav = (key: string) => {
    const item = resolveNav(key);
    if (!item) { setActive(key); return; }
    if (item.availability === "coming-soon") { showToast(`${item.label} — coming soon`); return; }
    if (key === "home") { setActive("home"); return; }
    rememberRoute(getExperience(), item.route);
    router.push(item.route as any);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left"]}>
        <View style={styles.row}>
          <SideNavigation active={active} onSelect={onSelectNav} width={navWidth} compact={compact} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.content, compact && { gap: spacing.sm, paddingHorizontal: spacing.md }]}
            showsVerticalScrollIndicator={false}
            testID="dashboard-scroll"
          >
            {experience === "training" && <HomeNotificationArea />}

            <WelcomeBackRibbon />

            <RideStatusBanner hidePremium />

            <HuCentAIIntro />

            <Animated.View style={{ opacity: fade, gap: spacing.md }}>
            {experience === "training" ? (
            <>
            <View style={[styles.heroRow, { height: heroHeight }]}>
              <HeroRoute
                width={mainWidth}
                height={heroHeight}
                onStart={() => router.push("/training")}
                onMessage={() => setShowChat(true)}
                onProfile={() => router.push("/profile")}
                onNotifications={() => setShowNotifs(true)}
                notifCount={unreadCount}
                compact={compact}
                sideSlot={<TodayTrainingCard overlay onToast={showToast} onCalendar={() => router.push("/calendar")} />}
              />
            </View>

            <MetricSummaryStrip />

            <ReadinessGate />

            <View style={[styles.midRow, compact && { minHeight: 210 }]}>
              <View style={styles.midCol}>
                <TrainingPlanCard onPress={() => router.push("/plan")} />
              </View>
              <View style={styles.midCol}>
                <ProgressCard onPress={() => router.push("/progress")} />
              </View>
              <View style={styles.midCol}>
                <AchievementCard />
              </View>
              <View style={styles.midCol}>
                <WellnessCard />
              </View>
            </View>

            <View style={styles.bottomRow}>
              <View style={styles.midCol}>
                <CommunityCard onPress={() => showToast("Joining a group ride")} />
              </View>
            </View>
            </>
            ) : experience === "scenic-cycling" ? (
              <ScenicCyclingTodayView onToast={showToast} />
            ) : (
              <FutureActivityTodayView mode={experience} />
            )}
            </Animated.View>
          </ScrollView>
        </View>
      </SafeAreaView>

      <Toast message={toast} />
      <CoachChatModal visible={showChat} onClose={() => setShowChat(false)} persona={persona} />
      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} nudge={benchmarkNudge} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: { flex: 1, flexDirection: "row" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  midRow: { flexDirection: "row", gap: spacing.md, minHeight: 240 },
  heroRow: { position: "relative" },
  midCol: { flex: 1 },
  midColWide: { flex: 1.55 },
  bottomRow: { flexDirection: "row", gap: spacing.md },
  toast: {
    position: "absolute",
    top: 24,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(20,18,16,0.96)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  toastText: { color: colors.white, fontWeight: "700", fontSize: 14 },
});
