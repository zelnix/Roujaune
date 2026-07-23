import React from "react";
import { View, Text, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useCoach } from "@/src/lib/coach-persona";
import { usePlan, useAdaptation } from "@/src/lib/plan";
import { markPlanSeen } from "@/src/lib/plan-badge";
import {
  C, PLAN_OPTIONS, PlanPhase, KeyWorkout, PlanProvider,
  PlanHeader, TopStatus, PlanSelector, PlanTabs,
  PlanHeroCard, PlanGoalsCard, CurrentPhaseRoadmap, WeeklyLoadCard,
  KeyWorkoutsCard, AlbertoAdaptationsCard, PlanProgressStrip, AlbertoTipFooter,
} from "@/src/components/plan";
import { SideNavigation } from "@/src/components/SideNavigation";

const DESIGN_W = 1280; // 96px rail + 1184px content (content geometry the cards are authored for)

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
  const { plan, loading, live } = usePlan();
  const adaptation = useAdaptation(persona.name, persona.gender);
  const { width } = useWindowDimensions();
  const compact = width < 700; // phones scroll; tablets fill

  const [tab, setTab] = React.useState("Overview");
  const [planName, setPlanName] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [availW, setAvailW] = React.useState(0);
  const [availH, setAvailH] = React.useState(0);
  const [contentH, setContentH] = React.useState(0);

  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);

  // Opening the plan clears the "updated after your last ride" badge.
  React.useEffect(() => { markPlanSeen(); }, []);

  const onSelectNav = (key: string) => {
    if (key === "home") { router.replace("/"); return; }
    if (key === "training") return;
    if (key === "calendar") { router.replace("/calendar"); return; }
    if (key === "workouts") { router.push("/workout"); return; }
    const routes: Record<string, string> = { routes: "/routes", progress: "/progress", wellness: "/wellness", community: "/community", connections: "/connections", settings: "/settings" };
    if (routes[key]) { router.replace(routes[key] as any); return; }
    showToast(`${key.charAt(0).toUpperCase() + key.slice(1)} — coming soon`);
  };

  const options = React.useMemo(() => Array.from(new Set([plan.title, ...PLAN_OPTIONS])), [plan.title]);
  const selectedPlan = planName ?? plan.title;
  const cyclePlan = () => {
    const i = options.indexOf(selectedPlan);
    const next = options[(i + 1) % options.length];
    setPlanName(next);
    showToast(`Plan: ${next}`);
  };
  const onPhase = (p: PlanPhase) => showToast(`${p.name} · ${p.weeks} · ${p.pct}% complete`);
  const onWorkout = (w: KeyWorkout) => showToast(`${w.title} · ${w.duration} · ${w.tss}`);

  const fitScaleX = !compact && availW > 0 ? Math.max(0.4, Math.min(2, availW / DESIGN_W)) : 1;
  const fitScaleY = !compact && contentH > 0 && availH > 0 ? Math.max(0.4, Math.min(2, availH / contentH)) : 1;

  const rightW = 336;
  const fullW = DESIGN_W - 96 - 44; // rail + content padding

  const hero = (
    <View style={styles.rowGap}>
      <View style={{ flex: 1 }}><PlanHeroCard /></View>
      <View style={{ width: rightW }}><PlanGoalsCard onEdit={() => showToast("Edit goals")} /></View>
    </View>
  );
  const roadmapRow = (
    <View style={styles.rowGap}>
      <CurrentPhaseRoadmap onPhase={onPhase} />
      <View style={{ width: 440 }}><WeeklyLoadCard width={440} onFilter={() => showToast("Filter: This Plan")} /></View>
    </View>
  );
  const workoutsRow = (
    <View style={styles.rowGap}>
      <KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} />
      <View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => showToast("All adaptations")} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /></View>
    </View>
  );
  const progress = <PlanProgressStrip onProgress={() => showToast("Opening Progress")} />;
  const tip = <AlbertoTipFooter />;

  let body: React.ReactNode;
  if (tab === "Phases") {
    body = (<>{hero}<CurrentPhaseRoadmap onPhase={onPhase} /><KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} />{tip}</>);
  } else if (tab === "Key Workouts") {
    body = (<><KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} /><View style={styles.rowGap}><WeeklyLoadCard width={fullW - 460} onFilter={() => showToast("Filter: This Plan")} /><View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => showToast("All adaptations")} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /></View></View>{tip}</>);
  } else if (tab === "Load & Progress") {
    body = (<><WeeklyLoadCard width={fullW} onFilter={() => showToast("Filter: This Plan")} />{progress}{tip}</>);
  } else if (tab === "Adaptations") {
    body = (<><AlbertoAdaptationsCard persona={persona} width={fullW} onViewAll={() => showToast("All adaptations")} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} />{progress}{tip}</>);
  } else {
    body = (<>{hero}{roadmapRow}{workoutsRow}{progress}{tip}</>);
  }

  const Grid = (
    <View style={styles.gridInner} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PlanHeader />
          <PlanTabs active={tab} onChange={setTab} />
        </View>
        <View style={styles.headerRight}>
          <TopStatus persona={persona} onPress={showToast} />
          <PlanSelector value={selectedPlan} onPress={cyclePlan} />
          {loading ? (
            <View style={styles.syncPill}><Text style={styles.syncText}>Syncing plan…</Text></View>
          ) : live ? (
            <View style={styles.syncPill}><View style={styles.liveDot} /><Text style={styles.syncText}>Live plan</Text></View>
          ) : null}
        </View>
      </View>
      {body}
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
          <PlanProvider value={plan}>
            <View style={[styles.canvas, { width: DESIGN_W, transform: [{ scaleX: fitScaleX }, { scaleY: fitScaleY }] }]}>
              <SideNavigation active="training" onSelect={onSelectNav} width={96} />
              <View style={styles.content}>{Grid}</View>
            </View>
          </PlanProvider>
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
  syncPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border },
  syncText: { color: C.dim, fontSize: 11, fontWeight: "600" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  rowGap: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: C.white, fontSize: 13, fontWeight: "600" },
});
