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
import PlanBenchmarkGate from "@/src/components/benchmark/PlanBenchmarkGate";
import {
  C, PlanPhase, KeyWorkout, PlanProvider,
  PlanHeader, PlanTabs,
  PlanHeroCard, PlanGoalsCard, CurrentPhaseRoadmap, PhasesDetailCard, WeeklyLoadCard,
  KeyWorkoutsCard, AlbertoAdaptationsCard, AdaptiveTargetsCard, PlanProgressStrip, AlbertoTipFooter,
} from "@/src/components/plan";
import { SideNavigation } from "@/src/components/SideNavigation";
import { HeaderStatus } from "@/src/components/HeaderStatus";
import { CalendarCard } from "@/src/components/CalendarCard";
import { ReadinessGate } from "@/src/components/ReadinessGate";
import { EditGoalsModal, ProgressModal, AdaptationsModal, PhaseDetailModal, KeyWorkoutDetailModal } from "@/src/components/plan-modals";
import { PhaseCelebrationModal } from "@/src/components/PhaseCelebrationModal";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import type { AchievementCardData } from "@/src/components/AchievementCard";
import { usePhaseCelebration, usePlanCompletion } from "@/src/lib/phase-complete";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import { CoachPlanCreatorModal } from "@/src/components/CoachPlanCreatorModal";
import { SwapSessionSheet } from "@/src/components/SwapSessionSheet";
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
  const { plan, refresh: refreshPlan } = usePlan();
  const adaptation = useAdaptation(persona.name, persona.gender);
  const adaptiveTargets = useAdaptiveTargets();
  const { celebration, dismiss: dismissCelebration } = usePhaseCelebration(plan);
  const { completion, dismiss: dismissCompletion } = usePlanCompletion(plan);
  const [shareData, setShareData] = React.useState<AchievementCardData | null>(null);

  const buildCard = React.useCallback((c: any): AchievementCardData => {
    const prog = (plan as any)?.progress || {};
    const isPlanEnd = !!c.isPlanEnd;
    const weeksNum = String(c.weeks || "").replace(/[^0-9–-]/g, "") || String(c.weeks || "");
    return {
      isPlanEnd,
      kicker: isPlanEnd ? "PROGRAMME COMPLETE" : `PHASE ${c.number} COMPLETE`,
      title: c.name,
      subtitle: c.weeks,
      stats: isPlanEnd
        ? [
            { label: "Weeks", value: weeksNum },
            { label: "Rides", value: String(prog.workouts ?? "—") },
            { label: "Hours", value: String(prog.time ?? "—").replace(/\s*h$/i, "h") },
          ]
        : [
            { label: "Phase", value: String(c.number) },
            { label: "Weeks", value: weeksNum },
            { label: "Rides", value: String(prog.workouts ?? "—") },
          ],
      coachName: persona.name,
    };
  }, [plan, persona.name]);
  const { width } = useWindowDimensions();
  const compact = width < 700; // phones scroll; tablets fill

  const [tab, setTab] = React.useState("Overview");
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [availW, setAvailW] = React.useState(0);

  // Action-button modals
  const [showGoals, setShowGoals] = React.useState(false);
  const [showProgress, setShowProgress] = React.useState(false);
  const [showAdaptations, setShowAdaptations] = React.useState(false);
  const [phaseDetail, setPhaseDetail] = React.useState<string | null>(null);
  const [workoutDetail, setWorkoutDetail] = React.useState<KeyWorkout | null>(null);
  const [swapWO, setSwapWO] = React.useState<KeyWorkout | null>(null);
  const [showChat, setShowChat] = React.useState(false);
  const [showCreator, setShowCreator] = React.useState(false);
  const [chatSeed, setChatSeed] = React.useState<string | undefined>(undefined);
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
    const routes: Record<string, string> = { routes: "/virtual-route", progress: "/progress", community: "/community", connections: "/connections", settings: "/settings", help: "/help" };
    if (routes[key]) { router.replace(routes[key] as any); return; }
    showToast(`${key.charAt(0).toUpperCase() + key.slice(1)} — coming soon`);
  };

  const onPhase = (p: PlanPhase) => setPhaseDetail(p.id);
  const onWorkout = (w: KeyWorkout) => setWorkoutDetail(w);
  const activePlanId = (plan as any)?.id ?? "build-and-climb";

  const contentW = availW > 0 ? availW : width - 96;
  const fullW = Math.max(600, contentW - 44); // content minus horizontal padding

  const hero = (
    <View style={styles.rowGap}>
      <View style={styles.heroCol}>
        <PlanHeroCard />
        <PlanGoalsCard onEdit={() => setShowGoals(true)} />
      </View>
      <View style={styles.heroCalendar}>
        <CalendarCard onToast={showToast} onOpenCalendar={() => router.push("/calendar")} scope="week" />
      </View>
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
  const benchmarkGate = <PlanBenchmarkGate planId={activePlanId} coachName={persona.name} coachGender={persona.gender} onReview={() => { setChatSeed("Can we review my benchmark for this plan?"); setShowChat(true); }} />;

  let body: React.ReactNode;
  if (tab === "Phases") {
    body = (<><CurrentPhaseRoadmap onPhase={onPhase} /><PhasesDetailCard onPhase={onPhase} />{tip}</>);
  } else if (tab === "Key Workouts") {
    body = (<><KeyWorkoutsCard onView={() => showToast("View all workouts")} onWorkout={onWorkout} onNext={() => showToast("More workouts")} /><View style={styles.rowGap}><WeeklyLoadCard width={fullW - 460} onFilter={() => showToast("Filter: This Plan")} /><View style={{ width: 440 }}><AlbertoAdaptationsCard persona={persona} width={440} onViewAll={() => setShowAdaptations(true)} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /></View></View>{tip}</>);
  } else if (tab === "Load & Progress") {
    body = (<><WeeklyLoadCard width={fullW} onFilter={() => showToast("Filter: This Plan")} />{progress}{tip}</>);
  } else if (tab === "Adaptations") {
    body = (<><View style={styles.rowGap}><AlbertoAdaptationsCard persona={persona} onViewAll={() => setShowAdaptations(true)} text={adaptation.text} loading={adaptation.loading} onRefresh={adaptation.refresh} /><View style={{ width: 380 }}><AdaptiveTargetsCard targets={adaptiveTargets.targets} loading={adaptiveTargets.loading} width={380} /></View></View>{progress}{tip}</>);
  } else {
    body = (<>{benchmarkGate}{hero}{progress}{roadmapRow}{workoutsRow}{tip}</>);
  }

  if ((displayPlan as any).no_plan) {
    body = (
      <View testID="no-plan-prompt" style={styles.noPlanWrap}>
        <Ionicons name="bicycle" size={30} color={C.yellow} />
        <Text style={styles.noPlanTitle}>Ride your way</Text>
        <Text style={styles.noPlanSub}>You don't need a plan to ride. Browse the workout library and pick whatever you feel like — or add some structure whenever you're ready.</Text>
        <Pressable testID="np-browse" onPress={() => router.push("/workouts")} style={[styles.npBtn, styles.npBtnPrimary]}>
          <Ionicons name="bicycle" size={16} color="#fff" />
          <Text style={styles.npBtnText}>Browse workouts</Text>
        </Pressable>
        <Pressable testID="np-choose" onPress={() => router.push("/onboarding")} style={[styles.npBtn, styles.npBtnGhost]}>
          <Ionicons name="list" size={16} color="#fff" />
          <Text style={styles.npBtnText}>Choose a plan</Text>
        </Pressable>
        <Pressable testID="np-coach" onPress={() => setShowCreator(true)} style={[styles.npBtn, styles.npBtnGhost]}>
          <Ionicons name="sparkles" size={16} color={C.yellow} />
          <Text style={styles.npBtnText}>Ask {persona.name} to build one</Text>
        </Pressable>
      </View>
    );
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
            testID="create-plan-btn"
            onPress={() => setShowCreator(true)}
            accessibilityRole="button"
            accessibilityLabel={`Build a training plan with ${persona.name}`}
            style={({ hovered }: any) => [styles.messageBtn, hovered && styles.messageBtnHover]}
          >
            <Ionicons name="sparkles" size={15} color={C.yellow} />
            <Text style={styles.messageBtnText}>Create plan</Text>
          </Pressable>
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
          <HeaderStatus />
        </View>
      </View>
      <ReadinessGate />
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
        <AdaptationsModal visible={showAdaptations} onClose={() => setShowAdaptations(false)} persona={persona} planId={activePlanId} />
        <PhaseDetailModal
          visible={!!phaseDetail}
          onClose={() => setPhaseDetail(null)}
          phases={(displayPlan.phases ?? []) as PlanPhase[]}
          selectedId={phaseDetail ?? undefined}
        />
        <KeyWorkoutDetailModal
          visible={!!workoutDetail}
          onClose={() => setWorkoutDetail(null)}
          workout={workoutDetail}
          onOpen={(w) => { setWorkoutDetail(null); router.push({ pathname: "/training", params: { workoutId: w.id, title: w.title } } as any); }}
          onSwap={(w) => { setWorkoutDetail(null); setSwapWO(w); }}
        />
        <CoachChatModal visible={showChat} onClose={() => { setShowChat(false); setChatSeed(undefined); }} persona={persona} onPlanUpdated={refreshPlan} seedMessage={chatSeed} onCreatePlan={() => { setShowChat(false); setShowCreator(true); }} />
        <CoachPlanCreatorModal visible={showCreator} onClose={() => setShowCreator(false)} persona={persona} onAccepted={(title) => { showToast(`New plan ready: ${title}`); refreshPlan(); }} />
        <SwapSessionSheet
          visible={!!swapWO}
          onClose={() => setSwapWO(null)}
          day={swapWO ? { title: swapWO.title, zone: swapWO.zone, duration: swapWO.duration, tss: swapWO.tss as any, workout_id: swapWO.id } : null}
          coachName={persona.name}
          coachGender={persona.gender}
          planId={swapWO && typeof swapWO.id === "string" && swapWO.id.startsWith("custom-") ? swapWO.id.split("-ride-")[0] : undefined}
          onSwapped={() => { refreshPlan(); showToast(`Session updated by ${persona.name}`); }}
        />
        <PhaseCelebrationModal
          visible={!!celebration && !completion}
          celebration={celebration}
          persona={persona}
          onClose={dismissCelebration}
          onShare={(c) => setShareData(buildCard(c))}
          onChat={(c) => {
            setChatSeed(`I just finished ${c.name} (${c.weeks}) of my plan. What should I focus on next?`);
            dismissCelebration();
            setShowChat(true);
          }}
        />
        <PhaseCelebrationModal
          visible={!!completion}
          celebration={completion}
          persona={persona}
          onClose={dismissCompletion}
          onShare={(c) => setShareData(buildCard(c))}
          onChat={(c) => {
            setChatSeed(`I just completed the entire ${c.name} programme! What would you suggest for my next goal?`);
            dismissCompletion();
            setShowChat(true);
          }}
        />
        <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: C.bg },
  content: { paddingHorizontal: 22, paddingVertical: 18 },
  gridInner: { gap: 14 },
  noPlanWrap: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  noPlanTitle: { color: C.white, fontSize: 22, fontWeight: "900", marginTop: 4 },
  noPlanSub: { color: C.dim, fontSize: 14, textAlign: "center", maxWidth: 460, lineHeight: 20, marginBottom: 8 },
  npBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 12, paddingHorizontal: 22, minWidth: 260 },
  npBtnPrimary: { backgroundColor: C.rouge },
  npBtnGhost: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  npBtnText: { color: C.white, fontSize: 15, fontWeight: "700" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  messageBtn: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44 },
  messageBtnHover: { borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,255,255,0.05)" },
  messageAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.08)" },
  messageBtnText: { color: C.white, fontSize: 13, fontWeight: "700" },
  calendarPill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44 },
  calendarPillText: { color: C.white, fontSize: 13, fontWeight: "700" },
  syncPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border },
  syncText: { color: C.dim, fontSize: 11, fontWeight: "600" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  rowGap: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  heroCard: { flex: 1, minWidth: 170 },
  heroGoals: { width: 258 },
  heroCol: { flex: 1.4, minWidth: 380, gap: 14 },
  heroCalendar: { flex: 0.82, minWidth: 340 },
  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: C.white, fontSize: 13, fontWeight: "600" },
});
