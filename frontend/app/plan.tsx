import React from "react";
import { View, Text, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useCoach } from "@/src/lib/coach-persona";
import {
  C, PLAN_OPTIONS, PlanPhase, KeyWorkout,
  TrainingPlanSidebar, PlanHeader, TopStatus, PlanSelector, PlanTabs,
  PlanHeroCard, PlanGoalsCard, CurrentPhaseRoadmap, WeeklyLoadCard,
  KeyWorkoutsCard, AlbertoAdaptationsCard, PlanProgressStrip, AlbertoTipFooter,
} from "@/src/components/plan";

const DESIGN_W = 1420; // sidebar + content design canvas (scaled to fill the tablet)

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const op = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(op, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [message, op]);
  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: op }]}>
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function TrainingPlanScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { width } = useWindowDimensions();
  const compact = width < 700; // phones scroll; tablets fill

  const [tab, setTab] = React.useState("Overview");
  const [planIdx, setPlanIdx] = React.useState(0);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [availW, setAvailW] = React.useState(0);
  const [availH, setAvailH] = React.useState(0);
  const [contentH, setContentH] = React.useState(0);

  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);

  const onSelectNav = (key: string) => {
    if (key === "home") { router.replace("/"); return; }
    if (key === "training") return;
    if (key === "workouts") { router.push("/workout"); return; }
    showToast(`${key.charAt(0).toUpperCase() + key.slice(1)} — coming soon`);
  };

  const cyclePlan = () => { const n = (planIdx + 1) % PLAN_OPTIONS.length; setPlanIdx(n); showToast(`Plan: ${PLAN_OPTIONS[n]}`); };
  const onPhase = (p: PlanPhase) => showToast(`${p.name} · ${p.weeks} · ${p.pct}% complete`);
  const onWorkout = (w: KeyWorkout) => showToast(`${w.title} · ${w.duration} · ${w.tss}`);

  const fitScaleX = !compact && availW > 0 ? Math.max(0.4, Math.min(2, availW / DESIGN_W)) : 1;
  const fitScaleY = !compact && contentH > 0 && availH > 0 ? Math.max(0.4, Math.min(2, availH / contentH)) : 1;

  const rightW = 336; // goals column width baseline

  const Grid = (
    <View style={styles.gridInner} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PlanHeader />
          <PlanTabs active={tab} onChange={setTab} />
        </View>
        <View style={styles.headerRight}>
          <TopStatus persona={persona} onPress={showToast} />
          <PlanSelector value={PLAN_OPTIONS[planIdx]} onPress={cyclePlan} />
        </View>
      </View>

      <View style={styles.rowGap}>
        <View style={{ flex: 1 }}><PlanHeroCard /></View>
        <View style={{ width: rightW }}><PlanGoalsCard onEdit={() => showToast("Edit goals")} /></View>
      </View>

      <View style={styles.rowGap}>
        <CurrentPhaseRoadmap onPhase={onPhase} />
        <View style={{ width: 440 }}><WeeklyLoadCard width={440} onFilter={() => showToast("Filter: This Plan")} /></View>
      </View>

      <View style={styles.rowGap}>
        <KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} />
        <View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => showToast("All adaptations")} /></View>
      </View>

      <PlanProgressStrip onProgress={() => showToast("Opening Progress")} />
      <AlbertoTipFooter />
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "bottom", "left"]}>
        <View
          style={styles.fitOuter}
          onLayout={(e) => { setAvailW(e.nativeEvent.layout.width); setAvailH(e.nativeEvent.layout.height); }}
        >
          <View style={[styles.canvas, { width: DESIGN_W, transform: [{ scaleX: fitScaleX }, { scaleY: fitScaleY }] }]}>
            <TrainingPlanSidebar active="training" onSelect={onSelectNav} persona={persona} onMessage={() => showToast(`Message ${persona.name}`)} />
            <View style={styles.content}>{Grid}</View>
          </View>
        </View>
        <Toast message={toast} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fitOuter: { flex: 1, alignItems: "center", justifyContent: "center" },
  canvas: { flexDirection: "row", alignSelf: "center" },
  content: { flex: 1, paddingHorizontal: 22, paddingVertical: 18 },
  gridInner: { gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20 },
  headerRight: { alignItems: "flex-end", gap: 12 },
  rowGap: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: C.white, fontSize: 13, fontWeight: "600" },
});
