import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Svg, { Rect } from "react-native-svg";

import { CC } from "@/src/components/calendar";
import { SideNavigation } from "@/src/components/SideNavigation";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import { useCoach } from "@/src/lib/coach-persona";
import { markPlanSeen } from "@/src/lib/plan-badge";
import { fetchFavorites, toggleFavorite } from "@/src/lib/workout-prefs";
import {
  WORKOUT_TABS, WorkoutTab, WORKOUT_CATEGORIES, POPULAR_THIS_WEEK, QUICK_ACTIONS,
  typesForTab, WorkoutType,
} from "@/src/lib/workouts";

const ROUTE: Record<string, string> = {
  home: "/", training: "/plan", routes: "/virtual-route", calendar: "/calendar",
  progress: "/progress", community: "/community", wellness: "/wellness",
  connections: "/connections", settings: "/settings", help: "/help",
};

/* ── mini power-profile graphic ─────────────────────────────────────────── */
function MiniProfile({ data, color, height = 46 }: { data: number[]; color: string; height?: number }) {
  const n = data.length;
  const gap = 2.5;
  const bw = (100 - gap * (n - 1)) / n;
  return (
    <Svg width="100%" height={height} viewBox="0 0 100 46" preserveAspectRatio="none" accessibilityLabel="Workout power profile">
      {data.map((v, i) => {
        const h = Math.max(2, v * 44);
        return <Rect key={i} x={i * (bw + gap)} y={46 - h} width={bw} height={h} rx={0.8} fill={color} opacity={0.35 + v * 0.55} />;
      })}
    </Svg>
  );
}

/* ── workout-type card ──────────────────────────────────────────────────── */
function WorkoutTypeCard({ t, width, fav, onFav, onView }: { t: WorkoutType; width: number; fav: boolean; onFav: () => void; onView: () => void }) {
  return (
    <View testID={`type-card-${t.id}`} style={[s.typeCard, { width, borderColor: `${t.color}55` }]}>
      <View style={s.typeHead}>
        <View style={[s.typeIcon, { backgroundColor: `${t.color}1F`, borderColor: `${t.color}66` }]}>
          <Ionicons name={t.icon} size={20} color={t.color} />
        </View>
        <Text style={s.typeName}>{t.name}</Text>
        <Pressable testID={`fav-${t.id}`} onPress={onFav} hitSlop={8} accessibilityLabel={`Favorite ${t.name}`} style={s.favBtn}>
          <Ionicons name={fav ? "star" : "star-outline"} size={16} color={fav ? CC.yellow : CC.dim} />
        </Pressable>
      </View>
      <Text style={s.typePurpose}>{t.purpose}</Text>
      <View style={s.profileWrap}><MiniProfile data={t.profile} color={t.color} /></View>
      <Text style={s.bestFor}><Text style={{ color: CC.dim }}>Best for: </Text>{t.bestFor}</Text>
      <Pressable testID={`view-${t.id}`} onPress={onView} accessibilityRole="button"
        style={({ hovered }: any) => [s.viewBtn, { borderColor: `${t.color}88` }, hovered && { backgroundColor: `${t.color}1A` }]}>
        <Text style={[s.viewText, { color: t.color }]}>View Workouts</Text>
        <Ionicons name="chevron-forward" size={14} color={t.color} />
      </Pressable>
    </View>
  );
}

function EmptyState({ icon, title, sub, cta, onCta }: { icon: any; title: string; sub: string; cta?: string; onCta?: () => void }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={30} color={CC.dim} />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
      {cta ? (
        <Pressable testID="empty-cta" onPress={onCta} style={({ hovered }: any) => [s.emptyBtn, hovered && { opacity: 0.9 }]}>
          <Ionicons name="add" size={16} color="#241B00" />
          <Text style={s.emptyBtnText}>{cta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const op = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(op, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [message, op]);
  if (!message) return null;
  return <Animated.View style={[s.toast, { opacity: op, pointerEvents: "none" }]}><Text style={s.toastText}>{message.text}</Text></Animated.View>;
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const persona = useCoach();
  const { width, height } = useWindowDimensions();
  const compact = width < 820;
  const navCompact = height < 560;
  const navWidth = navCompact ? Math.max(72, Math.min(88, width * 0.09)) : Math.max(84, Math.min(104, width * 0.085));

  const [tab, setTab] = React.useState<WorkoutTab>("All Workouts");
  const [favs, setFavs] = React.useState<Set<string>>(new Set());
  const [showChat, setShowChat] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [centerW, setCenterW] = React.useState(760);
  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);
  const openList = (params: Record<string, string>) => router.push({ pathname: "/workout-list", params } as any);

  React.useEffect(() => { fetchFavorites().then((ids) => setFavs(new Set(ids))); }, []);

  const onSelectNav = (key: string) => {
    if (key === "workouts") return;
    if (key === "training") markPlanSeen();
    const to = ROUTE[key];
    if (to) router.replace(to as any);
  };

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    toggleFavorite(id).catch(() => {});
  };

  const onCategory = (id: string) => openList({ type: id });

  const cols = centerW >= 1000 ? 4 : centerW >= 700 ? 3 : centerW >= 460 ? 2 : 1;
  const gridGap = 14;
  const cardW = Math.floor((centerW - gridGap * (cols - 1)) / cols);

  const askLabel = `Ask ${persona.name}`;

  // Which types to show in the grid
  let gridTypes = typesForTab(tab);
  if (tab === "Favorites") gridTypes = typesForTab("All Workouts").filter((t) => favs.has(t.id));

  const renderGrid = () => (
    <View style={s.grid}>
      {gridTypes.map((t) => (
        <WorkoutTypeCard key={t.id} t={t} width={cols === 1 ? centerW : cardW} fav={favs.has(t.id)}
          onFav={() => toggleFav(t.id)} onView={() => openList({ type: t.id })} />
      ))}
    </View>
  );

  const renderBody = () => {
    if (tab === "FB50 Sessions") {
      return (
        <View style={[s.fb50, { borderColor: "rgba(155,216,75,0.4)" }]}>
          <View style={[s.typeIcon, { backgroundColor: "rgba(155,216,75,0.15)", borderColor: "rgba(155,216,75,0.5)", width: 44, height: 44 }]}>
            <Ionicons name="barbell-outline" size={22} color={CC.greenyellow} />
          </View>
          <Text style={s.fb50Title}>FB50 — Fit Beyond 50 for Cyclists</Text>
          <Text style={s.fb50Sub}>34 strength, mobility, balance and activation sessions built to keep you strong, supple and injury-free on the bike. {persona.name} will explain how each one supports your cycling.</Text>
          <View style={s.fb50Tags}>
            {["Strength", "Mobility", "Balance", "Core", "Glute activation", "Pre-ride", "Post-ride mobility"].map((x) => (
              <View key={x} style={s.fb50Tag}><Text style={s.fb50TagText}>{x}</Text></View>
            ))}
          </View>
          <Pressable testID="view-fb50" onPress={() => openList({ type: "fb50" })} style={({ hovered }: any) => [s.fb50Btn, hovered && { opacity: 0.9 }]}>
            <Text style={s.fb50BtnText}>View FB50 Sessions</Text>
            <Ionicons name="chevron-forward" size={15} color="#132200" />
          </Pressable>
        </View>
      );
    }
    if (tab === "My Workouts") {
      return <EmptyState icon="create-outline" title="No custom workouts yet" sub="Build your own sessions and they'll live here for quick access." cta="Create Custom Workout" onCta={() => showToast("Opening workout builder…")} />;
    }
    if (tab === "Favorites" && gridTypes.length === 0) {
      return <EmptyState icon="star-outline" title="No favorites yet" sub="Tap the star on any workout type to pin it here for later." />;
    }
    return renderGrid();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: CC.bg }} edges={["top", "bottom", "left"]}>
        <View style={s.canvas}>
          {!compact && <SideNavigation active="workouts" onSelect={onSelectNav} width={navWidth} compact={navCompact} />}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* header */}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Workouts</Text>
                <Text style={s.subtitle}>Choose your workout. Train with purpose. Ride stronger.</Text>
              </View>
            </View>

            {/* tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
              {WORKOUT_TABS.map((t) => {
                const on = tab === t;
                return (
                  <Pressable key={t} testID={`tab-${t}`} onPress={() => setTab(t)} accessibilityState={{ selected: on }} style={s.tab}>
                    <Text style={[s.tabText, on && { color: CC.white, fontWeight: "800" }]}>{t}</Text>
                    {on ? <View style={s.tabUnderline} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* body: center + right column */}
            <View style={[s.bodyRow, compact && { flexDirection: "column" }]}>
              <View style={{ flex: 1 }} onLayout={(e) => setCenterW(e.nativeEvent.layout.width)}>
                <View style={s.sectionHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sectionTitle}>ALL WORKOUT TYPES</Text>
                    <Text style={s.sectionSub}>Select a workout type below to see examples and recommended uses.</Text>
                  </View>
                  <Pressable testID="compare-types" onPress={() => showToast("Compare workout types")} style={({ hovered }: any) => [s.compareBtn, hovered && s.ghostHover]}>
                    <Text style={s.compareText}>Compare Types</Text>
                    <Ionicons name="copy-outline" size={14} color={CC.white} />
                  </Pressable>
                </View>

                {renderBody()}

                {/* bottom recommendation panel */}
                <View style={s.recPanel}>
                  <View style={s.recLeft}>
                    <View style={s.recIcon}><Ionicons name="happy-outline" size={20} color={CC.yellow} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recTitle}>Not sure what to do today?</Text>
                      <Text style={s.recSub}>Ask {persona.name} to recommend the right workout for how you feel.</Text>
                      <Pressable testID="ask-coach" onPress={() => setShowChat(true)} style={({ hovered }: any) => [s.askBtn, hovered && s.ghostHover]}>
                        <Ionicons name="chatbubble-ellipses-outline" size={15} color={CC.white} />
                        <Text style={s.askText}>{askLabel}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={s.recRight}>
                    <Image source={persona.image} style={s.recPortrait} contentFit="cover" contentPosition="top center" />
                    <View style={s.recQuoteWrap}>
                      <Text style={s.recQuote}>&ldquo;The right workout on the right day makes all the difference.&rdquo;</Text>
                      <Text style={s.recSig}>{persona.signature}</Text>
                    </View>
                  </View>
                </View>

                {/* footer tip */}
                <View style={s.tip}>
                  <Ionicons name="star" size={16} color={CC.yellow} />
                  <Text style={s.tipLabel}>{persona.name}&apos;s Tip</Text>
                  <Text style={s.tipText}>Choose the right workout for your goals, your energy, and your week.</Text>
                  <Text style={s.tipSig}>{persona.signature}</Text>
                </View>
              </View>

              {/* right column */}
              <View style={[s.rightCol, compact && { width: "100%" }]}>
                <View style={s.card}>
                  <Text style={s.cardTitle}>WORKOUT CATEGORIES</Text>
                  {WORKOUT_CATEGORIES.map((c, i) => {
                    const on = false;
                    return (
                      <Pressable key={c.id} testID={`cat-${c.id}`} onPress={() => onCategory(c.id)}
                        style={({ hovered }: any) => [s.catRow, i === WORKOUT_CATEGORIES.length - 1 && { borderTopWidth: 1, borderTopColor: CC.borderSoft, marginTop: 4, paddingTop: 10 }, (hovered || on) && s.catRowOn]}>
                        <Ionicons name={c.icon} size={16} color={c.color} />
                        <Text style={[s.catLabel, on && { color: CC.white, fontWeight: "700" }]}>{c.label}</Text>
                        <Text style={s.catCount}>{c.count}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={s.card}>
                  <Text style={s.cardTitle}>POPULAR THIS WEEK</Text>
                  {POPULAR_THIS_WEEK.map((p, i) => (
                    <Pressable key={p.id} testID={`popular-${p.id}`} onPress={() => openList({ workout: p.workoutId })}
                      style={({ hovered }: any) => [s.popRow, i < POPULAR_THIS_WEEK.length - 1 && s.divider, hovered && s.catRowOn]}>
                      <View style={[s.popIcon, { backgroundColor: `${p.color}1F` }]}><Ionicons name={p.icon} size={15} color={p.color} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.popName}>{p.name}</Text>
                        <Text style={s.popMeta}>{p.duration} · {p.tss} TSS</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable testID="view-all-popular" onPress={() => openList({ type: "all" })} style={({ hovered }: any) => [s.popAll, hovered && s.ghostHover]}>
                    <Text style={s.popAllText}>View All Popular</Text>
                    <Ionicons name="chevron-forward" size={14} color={CC.white} />
                  </Pressable>
                </View>

                <View style={s.card}>
                  <Text style={[s.cardTitle, { color: CC.rouge }]}>QUICK ACTIONS</Text>
                  {QUICK_ACTIONS.map((q, i) => (
                    <Pressable key={q.id} testID={`quick-${q.id}`} onPress={() => showToast(q.label)}
                      style={({ hovered }: any) => [s.quickRow, i < QUICK_ACTIONS.length - 1 && s.divider, hovered && s.catRowOn]}>
                      <Ionicons name={q.icon} size={17} color={CC.rouge} />
                      <Text style={s.quickText}>{q.label}</Text>
                      <Ionicons name="chevron-forward" size={14} color={CC.dim} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
        <Toast message={toast} />
        <CoachChatModal visible={showChat} onClose={() => setShowChat(false)} persona={persona} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: CC.bg },
  content: { paddingHorizontal: 22, paddingVertical: 18, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  title: { color: CC.white, fontSize: 30, fontWeight: "800" },
  subtitle: { color: CC.dim, fontSize: 13, marginTop: 4 },

  tabsRow: { gap: 22, borderBottomWidth: 1, borderBottomColor: CC.borderSoft, paddingRight: 8 },
  tab: { paddingVertical: 10 },
  tabText: { color: CC.dim, fontSize: 13.5, fontWeight: "600" },
  tabUnderline: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2.5, backgroundColor: CC.rouge, borderRadius: 2 },

  bodyRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  sectionTitle: { color: CC.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  sectionSub: { color: CC.dim, fontSize: 12.5, marginTop: 4 },
  compareBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 40 },
  ghostHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  compareText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  typeCard: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1.5, padding: 14 },
  typeHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  typeName: { color: CC.white, fontSize: 16, fontWeight: "800", flex: 1 },
  favBtn: { padding: 2 },
  typePurpose: { color: CC.dim, fontSize: 12.5, lineHeight: 17, marginTop: 10, minHeight: 51 },
  profileWrap: { marginTop: 10, marginBottom: 10, height: 46 },
  bestFor: { color: CC.white, fontSize: 11.5, lineHeight: 16, minHeight: 32 },
  viewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10, marginTop: 12, minHeight: 42 },
  viewText: { fontSize: 12.5, fontWeight: "800" },

  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 48, backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border },
  emptyTitle: { color: CC.white, fontSize: 16, fontWeight: "800" },
  emptySub: { color: CC.dim, fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 18 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: CC.yellow, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, marginTop: 6, minHeight: 44 },
  emptyBtnText: { color: "#241B00", fontSize: 13, fontWeight: "800" },

  fb50: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1.5, padding: 20, gap: 10 },
  fb50Title: { color: CC.white, fontSize: 18, fontWeight: "800", marginTop: 4 },
  fb50Sub: { color: CC.dim, fontSize: 13, lineHeight: 19, maxWidth: 640 },
  fb50Tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  fb50Tag: { borderWidth: 1, borderColor: "rgba(155,216,75,0.35)", borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: "rgba(155,216,75,0.08)" },
  fb50TagText: { color: CC.greenyellow, fontSize: 11.5, fontWeight: "700" },
  fb50Btn: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", backgroundColor: CC.greenyellow, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, marginTop: 8, minHeight: 44 },
  fb50BtnText: { color: "#132200", fontSize: 13, fontWeight: "800" },

  recPanel: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 18, marginTop: 16, overflow: "hidden" },
  recLeft: { flexDirection: "row", gap: 14, flex: 1, alignItems: "flex-start" },
  recIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)" },
  recTitle: { color: CC.yellow, fontSize: 16, fontWeight: "800" },
  recSub: { color: CC.dim, fontSize: 13, marginTop: 3 },
  askBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 12, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 44 },
  askText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  recRight: { flexDirection: "row", alignItems: "center", gap: 14, maxWidth: 380 },
  recPortrait: { width: 92, height: 92, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  recQuoteWrap: { flex: 1 },
  recQuote: { color: CC.white, fontSize: 15, fontWeight: "700", fontStyle: "italic", lineHeight: 21 },
  recSig: { color: CC.yellow, fontSize: 20, fontStyle: "italic", fontWeight: "600", marginTop: 8 },

  tip: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 14, borderWidth: 1, borderColor: CC.borderSoft, paddingVertical: 12, paddingHorizontal: 16, marginTop: 14 },
  tipLabel: { color: CC.yellow, fontSize: 13, fontWeight: "800" },
  tipText: { color: CC.dim, fontSize: 12.5, flex: 1 },
  tipSig: { color: CC.yellow, fontSize: 18, fontStyle: "italic", fontWeight: "600" },

  rightCol: { width: 300, gap: 14 },
  card: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 14 },
  cardTitle: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 9 },
  catRowOn: { backgroundColor: "rgba(255,255,255,0.05)" },
  catLabel: { color: CC.dim, fontSize: 13, flex: 1, fontWeight: "600" },
  catCount: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },

  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  popRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 9 },
  popIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  popName: { color: CC.white, fontSize: 13, fontWeight: "700" },
  popMeta: { color: CC.dim, fontSize: 11.5, marginTop: 1 },
  popAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 10, marginTop: 10, minHeight: 42 },
  popAllText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },

  quickRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 6 },
  quickText: { color: CC.white, fontSize: 13, fontWeight: "600", flex: 1 },

  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
});
