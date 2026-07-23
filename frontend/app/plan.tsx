import React from "react";
import { View, Text, StyleSheet, Animated, ScrollView, useWindowDimensions, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useCoach } from "@/src/lib/coach-persona";
import { usePlan, useAdaptation, useAdaptiveTargets } from "@/src/lib/plan";
import { markPlanSeen } from "@/src/lib/plan-badge";
import {
  C, PLAN_OPTIONS, PlanPhase, KeyWorkout, PlanProvider,
  PlanHeader, PlanSelector, PlanTabs,
  PlanHeroCard, PlanGoalsCard, CurrentPhaseRoadmap, WeeklyLoadCard,
  KeyWorkoutsCard, AlbertoAdaptationsCard, AdaptiveTargetsCard, PlanProgressStrip, AlbertoTipFooter,
} from "@/src/components/plan";
import { SideNavigation } from "@/src/components/SideNavigation";
import { EditGoalsModal, ProgressModal, AdaptationsModal } from "@/src/components/plan-modals";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import type { EditableGoal } from "@/src/lib/plan";

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
    <Animated.View style={[styles.toast, { opacity: op, pointerEvents: "none" }]}>
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function TrainingPlanScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { plan, loading, live } = usePlan();
  const adaptation = useAdaptation(persona.name, persona.gender);
  const adaptiveTargets = useAdaptiveTargets();
  const { width } = useWindowDimensions();
  const compact = width < 700; // phones scroll; tablets fill

  const [tab, setTab] = React.useState("Overview");
  const [planName, setPlanName] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [availW, setAvailW] = React.useState(0);

  // Action-button modals
  const [showGoals, setShowGoals] = React.useState(false);
  const [showProgress, setShowProgress] = React.useState(false);
  const [showAdaptations, setShowAdaptations] = React.useState(false);
  const [showChat, setShowChat] = React.useState(false);
  const [goalsOverride, setGoalsOverride] = React.useState<EditableGoal[] | null>(null);

  const displayPlan = React.useMemo(
    () => (goalsOverride ? { ...plan, goals: goalsOverride as any } : plan),
    [plan, goalsOverride]
  );

  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);

  // Opening the plan clears the "updated after your last ride" badge.
  React.useEffect(() => { markPlanSeen(); }, []);

  const onSelectNav = (key: string) => {
    if (key === "home") { router.replace("/"); return; }
    if (key === "training") return;
    if (key === "calendar") { router.replace("/calendar"); return; }
    if (key === "workouts") { router.push("/workouts"); return; }
    const routes: Record<string, string> = { routes: "/routes", progress: "/progress", wellness: "/wellness", community: "/community", connections: "/connections", settings: "/settings", help: "/help" };
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

  const rightW = 336;
  const contentW = availW > 0 ? availW : width - 96;
  const fullW = Math.max(600, contentW - 44); // content minus horizontal padding

  const hero = (
    <View style={styles.rowGap}>
      <View style={{ flex: 1 }}><PlanHeroCard /></View>
      <View style={{ width: rightW }}><PlanGoalsCard onEdit={() => setShowGoals(true)} /></View>
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
      <View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => setShowAdaptations(true)} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /></View>
    </View>
  );
  const progress = <PlanProgressStrip onProgress={() => setShowProgress(true)} />;
  const tip = <AlbertoTipFooter />;

  let body: React.ReactNode;
  if (tab === "Phases") {
    body = (<>{hero}<CurrentPhaseRoadmap onPhase={onPhase} /><KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} />{tip}</>);
  } else if (tab === "Key Workouts") {
    body = (<><KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} /><View style={styles.rowGap}><WeeklyLoadCard width={fullW - 460} onFilter={() => showToast("Filter: This Plan")} /><View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => setShowAdaptations(true)} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /></View></View>{tip}</>);
  } else if (tab === "Load & Progress") {
    body = (<><WeeklyLoadCard width={fullW} onFilter={() => showToast("Filter: This Plan")} />{progress}{tip}</>);
  } else if (tab === "Adaptations") {
    body = (<><View style={styles.rowGap}><AlbertoAdaptationsCard persona={persona} onViewAll={() => setShowAdaptations(true)} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /><View style={{ width: 380 }}><AdaptiveTargetsCard targets={adaptiveTargets.targets} loading={adaptiveTargets.loading} width={380} /></View></View>{progress}{tip}</>);
  } else {
    body = (<>{hero}{roadmapRow}{workoutsRow}{progress}{tip}</>);
  }

  const Grid = (
    <View style={styles.gridInner}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PlanHeader />
          <PlanTabs active={tab} onChange={setTab} />
        </View>
        <View style={styles.headerRight}>
          <Pressable
            testID="message-coach"
            onPress={() => setShowChat(true)}
            accessibilityRole="button"
            accessibilityLabel={`Message ${persona.name}`}
            style={({ hovered }: any) => [styles.messageBtn, hovered && styles.messageBtnHover]}
          >
            <Image source={persona.image} style={styles.messageAvatar} contentFit="cover" contentPosition="top center" />
            <Text style={styles.messageBtnText}>Message {persona.name}</Text>
            <Ionicons name="chatbubble-ellipses" size={15} color={C.yellow} />
          </Pressable>
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
        <PlanProvider value={displayPlan}>
          <View style={styles.canvas}>
            {!compact && <SideNavigation active="training" onSelect={onSelectNav} width={96} />}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setAvailW(e.nativeEvent.layout.width)}
            >
              {Grid}
            </ScrollView>
          </View>
        </PlanProvider>
        <Toast message={toast} />
        <EditGoalsModal
          visible={showGoals}
          onClose={() => setShowGoals(false)}
          goals={displayPlan.goals as EditableGoal[]}
          onSaved={(g) => { setGoalsOverride(g); showToast("Goals updated"); }}
        />
        <ProgressModal visible={showProgress} onClose={() => setShowProgress(false)} />
        <AdaptationsModal visible={showAdaptations} onClose={() => setShowAdaptations(false)} persona={persona} />
        <CoachChatModal visible={showChat} onClose={() => setShowChat(false)} persona={persona} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: C.bg },
  content: { paddingHorizontal: 22, paddingVertical: 18 },
  gridInner: { gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20 },
  headerRight: { alignItems: "flex-end", gap: 12 },
  messageBtn: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44 },
  messageBtnHover: { borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,255,255,0.05)" },
  messageAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.08)" },
  messageBtnText: { color: C.white, fontSize: 13, fontWeight: "700" },
  syncPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border },
  syncText: { color: C.dim, fontSize: 11, fontWeight: "600" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  rowGap: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: C.white, fontSize: 13, fontWeight: "600" },
});
