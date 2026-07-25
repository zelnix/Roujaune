import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions, Platform, Modal, Pressable } from "react-native";
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
import { FeaturedRouteCard } from "@/src/components/FeaturedRouteCard";
import { CalendarCard } from "@/src/components/CalendarCard";
import { ReadinessGate } from "@/src/components/ReadinessGate";
import { ProgressCard, CommunityCard, WellnessCard, AchievementCard } from "@/src/components/BottomCards";
import { navItems, navFooter } from "@/src/data";
import { useCoach } from "@/src/lib/coach-persona";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import { ProgressPanel } from "@/src/components/ProgressPanel";
import { NotificationsModal } from "@/src/components/NotificationsModal";
import { VerifyEmailBanner } from "@/src/components/VerifyEmailBanner";
import { CC } from "@/src/components/calendar";

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
  const [active, setActive] = React.useState("home");
  const [showChat, setShowChat] = React.useState(false);
  const [showProgress, setShowProgress] = React.useState(false);
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);

  const showToast = React.useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  const onSelectNav = (key: string) => {
    if (key === "training") {
      router.push("/plan");
      return;
    }
    if (key === "workouts") {
      router.push("/workouts");
      return;
    }
    const routes: Record<string, string> = { calendar: "/calendar", routes: "/virtual-route", progress: "/progress", wellness: "/wellness", community: "/community", connections: "/connections", settings: "/settings", help: "/help" };
    if (routes[key]) {
      router.push(routes[key] as any);
      return;
    }
    setActive(key);
    if (key !== "home") {
      const item = [...navItems, ...navFooter].find((n) => n.key === key);
      showToast(`${item?.label ?? key}`);
    }
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
            <HeroRoute
              width={mainWidth}
              height={heroHeight}
              onStart={() => router.push("/training")}
              onMessage={() => setShowChat(true)}
              onProfile={() => router.push("/profile")}
              onFlame={() => setShowProgress(true)}
              onNotifications={() => setShowNotifs(true)}
              compact={compact}
            />

            <MetricSummaryStrip />

            <VerifyEmailBanner />

            <ReadinessGate />

            <View style={[styles.midRow, compact && { minHeight: 210 }]}>
              <View style={styles.midCol}>
                <TrainingPlanCard onPress={() => router.push("/plan")} />
              </View>
              <View style={styles.midCol}>
                <FeaturedRouteCard onPress={() => showToast("Exploring Col du Galibier")} />
              </View>
              <View style={styles.midColWide}>
                <CalendarCard onToast={showToast} onOpenCalendar={() => router.push("/calendar")} />
              </View>
            </View>

            <View style={styles.bottomRow}>
              <ProgressCard />
              <CommunityCard onPress={() => showToast("Joining a group ride")} />
              <WellnessCard />
              <AchievementCard />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>

      <Toast message={toast} />
      <CoachChatModal visible={showChat} onClose={() => setShowChat(false)} persona={persona} />
      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} />
      <Modal visible={showProgress} transparent animationType="fade" onRequestClose={() => setShowProgress(false)}>
        <Pressable style={styles.progressBackdrop} onPress={() => setShowProgress(false)} testID="progress-modal">
          <Pressable style={styles.progressCard} onPress={() => { /* swallow */ }}>
            <View style={styles.progressHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.progressTitle}>Your Progress</Text>
                <Text style={styles.progressSub}>Your riding at a glance</Text>
              </View>
              <Pressable onPress={() => setShowProgress(false)} testID="progress-close" hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
            </View>
            <ProgressPanel />
          </Pressable>
        </Pressable>
      </Modal>
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
  progressBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
  progressCard: { width: "100%", maxWidth: 440, backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border, borderRadius: 20, padding: 20 },
  progressHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  progressTitle: { color: colors.white, fontSize: 19, fontWeight: "900" },
  progressSub: { color: CC.dim, fontSize: 12.5, marginTop: 2 },
});
