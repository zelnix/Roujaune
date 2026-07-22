import React from "react";
import { View, StyleSheet, ScrollView, Animated, useWindowDimensions, Platform, Text, LayoutChangeEvent } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useSummary } from "@/src/lib/summary";
import {
  SummaryHeader, SummarySidebar, HeroSummaryCard, MetricsGrid, ComplianceCard,
  ChartsRow, SyncExportRow, RouteSummaryCard, AchievementsCard, RecoveryCard, BottomActionBar,
} from "@/src/components/summary";

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(), 1800);
    return () => clearTimeout(t);
  }, [message, anim]);
  if (!message) return null;
  return (
    <Animated.View testID="toast" style={[styles.toast, shadow.glow, { pointerEvents: "none", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function WorkoutComplete() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const phone = height < 500;             // phone landscape
  const compact = height < 620;           // small tablet / large phone
  const navW = phone ? 58 : compact ? 132 : 176;
  const rightW = compact ? 300 : 344;
  const pad = phone ? spacing.sm : compact ? spacing.md : spacing.lg;

  const { stats, route } = useSummary();
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [mainW, setMainW] = React.useState(600);
  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const onMainLayout = (e: LayoutChangeEvent) => setMainW(e.nativeEvent.layout.width);

  const onSideSelect = (key: string) => {
    if (key === "overview") return;
    if (key === "workouts") { router.replace("/training"); return; }
    showToast(key.charAt(0).toUpperCase() + key.slice(1));
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        <View style={{ paddingHorizontal: pad, paddingTop: spacing.sm }}>
          <SummaryHeader brandWidth={navW} phone={phone} onToast={showToast} />
        </View>

        <View style={styles.body}>
          <View style={{ paddingLeft: pad }}>
            <SummarySidebar active="overview" onSelect={onSideSelect} width={navW} iconOnly={phone} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}
            showsVerticalScrollIndicator={false}
            testID="summary-scroll"
          >
            <View style={[styles.contentRow, phone && styles.contentCol]}>
              <View style={styles.mainCol} onLayout={onMainLayout}>
                <HeroSummaryCard compact={phone} />
                <MetricsGrid stats={stats} compact={compact} routeName={route.name} />
                <ComplianceCard stats={stats} compact={phone} />
                <ChartsRow stats={stats} width={mainW} vertical={phone} />
                {phone && <RightColumn score={78} phone route={route} />}
                <SyncExportRow onToast={showToast} compact={phone} />
              </View>

              {!phone && (
                <View style={[styles.rightCol, { width: rightW }]}>
                  <RouteSummaryCard route={route} />
                  <AchievementsCard />
                  <RecoveryCard score={78} />
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: pad, paddingBottom: spacing.sm }}>
          <BottomActionBar
            compact={phone}
            onView={() => showToast("Opening full analysis")}
            onSave={() => router.replace("/")}
            onShare={() => showToast("Preparing shareable ride card")}
            onPlan={() => router.replace("/training")}
          />
        </View>
      </SafeAreaView>

      <Toast message={toast} />
    </GestureHandlerRootView>
  );
}

// On phone landscape the right-hand cards flow below the main content in a wrap row.
function RightColumn({ score, phone, route }: { score: number; phone: boolean; route?: React.ComponentProps<typeof RouteSummaryCard>["route"] }) {
  return (
    <View style={phone ? styles.rightWrap : undefined}>
      <View style={phone && styles.rightWrapItemWide}><RouteSummaryCard route={route} /></View>
      <View style={phone && styles.rightWrapItem}><AchievementsCard /></View>
      <View style={phone && styles.rightWrapItem}><RecoveryCard score={score} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, flexDirection: "row" },
  scroll: { paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.md },
  contentRow: { flexDirection: "row", gap: spacing.md },
  contentCol: { flexDirection: "column" },
  mainCol: { flex: 1, gap: spacing.md },
  rightCol: { gap: spacing.md },
  rightWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  rightWrapItemWide: { width: "100%" },
  rightWrapItem: { flex: 1, flexBasis: 0, minWidth: 220 },
  toast: { position: "absolute", bottom: 90, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(20,18,16,0.96)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  toastText: { color: colors.white, fontWeight: "700", fontSize: 14 },
});
