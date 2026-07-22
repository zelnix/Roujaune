import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
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
import { ProgressCard, CommunityCard, WellnessCard, AchievementCard } from "@/src/components/BottomCards";
import { navItems, navFooter } from "@/src/data";

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, 1900);
    return () => clearTimeout(t);
  }, [message, anim]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      testID="toast"
      style={[
        styles.toast,
        shadow.glow,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
      ]}
    >
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function Dashboard() {
  const { width } = useWindowDimensions();
  const navWidth = Math.max(84, Math.min(104, width * 0.085));
  const contentWidth = width - navWidth;
  const mainWidth = contentWidth - spacing.lg * 2;
  const heroHeight = 400;

  const [active, setActive] = React.useState("home");
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);

  const showToast = React.useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  const onSelectNav = (key: string) => {
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
          <SideNavigation active={active} onSelect={onSelectNav} width={navWidth} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            testID="dashboard-scroll"
          >
            <HeroRoute
              width={mainWidth}
              height={heroHeight}
              onStart={() => showToast("Starting today's ride…")}
              onToast={showToast}
            />

            <MetricSummaryStrip />

            <View style={styles.midRow}>
              <View style={styles.midCol}>
                <TrainingPlanCard onPress={() => showToast("Opening training plan")} />
              </View>
              <View style={styles.midCol}>
                <FeaturedRouteCard onPress={() => showToast("Exploring Col du Galibier")} />
              </View>
              <View style={styles.midColWide}>
                <CalendarCard onToast={showToast} />
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
});
