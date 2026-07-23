import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { CC } from "@/src/components/calendar";
import { SideNavigation } from "@/src/components/SideNavigation";
import { useCoach } from "@/src/lib/coach-persona";
import { markPlanSeen } from "@/src/lib/plan-badge";
import { WORKOUT_TYPES } from "@/src/lib/workouts";
import { fetchFavorites, toggleFavorite, scheduleWorkout } from "@/src/lib/workout-prefs";
import {
  Workout, getWorkout, workoutsByType, sortWorkouts, SORTS, SortKey,
  DURATION_BANDS, DurationBand, inDurationBand, fmtDuration, DIFFICULTY_COLOR,
} from "@/src/lib/workout-catalog";

const ROUTE: Record<string, string> = {
  home: "/", training: "/plan", routes: "/routes", calendar: "/calendar",
  progress: "/progress", community: "/community", wellness: "/wellness",
  connections: "/connections", settings: "/settings", help: "/help",
};

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  ...WORKOUT_TYPES.map((t) => ({ id: t.id, label: t.name })),
  { id: "fb50", label: "FB50" },
];

function ZoneBar({ zones }: { zones: Workout["zones"] }) {
  const active = zones.filter((z) => z.pct > 0);
  return (
    <View>
      <View style={s.zoneBar}>
        {active.map((z) => (
          <View key={z.label} style={{ flex: z.pct, backgroundColor: z.color }} />
        ))}
      </View>
      <View style={s.zoneLegend}>
        {active.map((z) => (
          <View key={z.label} style={s.zoneLegItem}>
            <View style={[s.zoneDot, { backgroundColor: z.color }]} />
            <Text style={s.zoneLegText}>{z.label} · {z.pct}%</Text>
          </View>
        ))}
      </View>
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

function Stat({ label, value, color = CC.white }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

export default function WorkoutListScreen() {
  const router = useRouter();
  const persona = useCoach();
  const params = useLocalSearchParams<{ type?: string; workout?: string }>();
  const { width, height } = useWindowDimensions();
  const compact = width < 900;
  const navCompact = height < 560;
  const navWidth = navCompact ? Math.max(72, Math.min(88, width * 0.09)) : Math.max(84, Math.min(104, width * 0.085));

  const [typeFilter, setTypeFilter] = React.useState<string>(params.type ?? "all");
  const [band, setBand] = React.useState<DurationBand>("any");
  const [sort, setSort] = React.useState<SortKey>("recommended");
  const [selectedId, setSelectedId] = React.useState<string | null>(params.workout ?? null);
  const [favs, setFavs] = React.useState<Set<string>>(new Set());
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);

  React.useEffect(() => { fetchFavorites().then((ids) => setFavs(new Set(ids))); }, []);

  // If arriving with a specific workout, align the type filter to it.
  React.useEffect(() => {
    if (params.workout) {
      const w = getWorkout(params.workout);
      if (w) { setTypeFilter(w.typeId); setSelectedId(w.id); }
    } else if (params.type) {
      setTypeFilter(params.type);
    }
  }, [params.type, params.workout]);

  const filtered = React.useMemo(() => {
    const list = workoutsByType(typeFilter).filter((w) => inDurationBand(w, band));
    return sortWorkouts(list, sort);
  }, [typeFilter, band, sort]);

  const selected = getWorkout(selectedId) ?? filtered[0];
  const selectedValid = selected && filtered.some((w) => w.id === selected.id);
  const detail = selectedValid ? selected : filtered[0];

  React.useEffect(() => {
    if (detail && detail.id !== selectedId) setSelectedId(detail.id);
  }, [detail, selectedId]);

  const onSelectNav = (key: string) => {
    if (key === "workouts") { router.replace("/workouts"); return; }
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

  const addToCalendar = (w: Workout) => {
    const mainZone = w.zones.reduce((a, b) => (b.pct > a.pct ? b : a), w.zones[0]);
    scheduleWorkout({
      workout_id: w.id, workout_name: w.name,
      duration: fmtDuration(w.duration), tss: w.tss ? `${w.tss} TSS` : "",
      zone: mainZone?.label ?? "", color: w.color,
    }).then(() => showToast(`Added ${w.name} to your calendar`))
      .catch(() => showToast("Couldn't add to calendar — try again"));
  };

  const title = typeFilter === "all" ? "All Workouts"
    : typeFilter === "fb50" ? "FB50 Sessions"
    : `${WORKOUT_TYPES.find((t) => t.id === typeFilter)?.name ?? ""} Workouts`;

  const startWorkout = (w: Workout) => {
    if (w.duration <= 0) { showToast("Enjoy your rest day 💤"); return; }
    router.push({ pathname: "/workout", params: { title: w.name, workoutId: w.id } } as any);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: CC.bg }} edges={["top", "bottom", "left"]}>
        <View style={s.canvas}>
          {!compact && <SideNavigation active="workouts" onSelect={onSelectNav} width={navWidth} compact={navCompact} />}

          <View style={{ flex: 1 }}>
            {/* header */}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }}>
                <Pressable testID="back-to-catalog" onPress={() => router.replace("/workouts")} hitSlop={8} style={s.crumb}>
                  <Ionicons name="chevron-back" size={16} color={CC.dim} />
                  <Text style={s.crumbText}>Workouts</Text>
                </Pressable>
                <Text style={s.title}>{title}</Text>
                <Text style={s.subtitle}>{filtered.length} session{filtered.length === 1 ? "" : "s"} · pick one and launch it straight away.</Text>
              </View>
            </View>

            {/* filter bar */}
            <View style={s.filters}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {TYPE_FILTERS.map((t) => {
                  const on = typeFilter === t.id;
                  return (
                    <Pressable key={t.id} testID={`type-filter-${t.id}`} onPress={() => setTypeFilter(t.id)} accessibilityState={{ selected: on }}
                      style={[s.chip, on && s.chipOn]}>
                      <Text style={[s.chipText, on && { color: "#241B00", fontWeight: "800" }]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={s.filterMeta}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {DURATION_BANDS.map((b) => {
                    const on = band === b.id;
                    return (
                      <Pressable key={b.id} testID={`band-${b.id}`} onPress={() => setBand(b.id)} accessibilityState={{ selected: on }}
                        style={[s.miniChip, on && s.miniChipOn]}>
                        <Text style={[s.miniChipText, on && { color: CC.white, fontWeight: "700" }]}>{b.label}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={s.sortDivider} />
                  <Ionicons name="swap-vertical" size={14} color={CC.dim} style={{ marginRight: 2 }} />
                  {SORTS.map((so) => {
                    const on = sort === so.id;
                    return (
                      <Pressable key={so.id} testID={`sort-${so.id}`} onPress={() => setSort(so.id)} accessibilityState={{ selected: on }}
                        style={[s.miniChip, on && s.miniChipOn]}>
                        <Text style={[s.miniChipText, on && { color: CC.white, fontWeight: "700" }]}>{so.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* master-detail */}
            <View style={[s.body, compact && { flexDirection: "column" }]}>
              <ScrollView style={[s.listCol, compact && { maxHeight: 260 }]} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                {filtered.length === 0 ? (
                  <View style={s.emptyList}><Ionicons name="search-outline" size={24} color={CC.dim} /><Text style={s.emptyText}>No workouts match these filters.</Text></View>
                ) : filtered.map((w) => {
                  const on = detail?.id === w.id;
                  return (
                    <Pressable key={w.id} testID={`workout-${w.id}`} onPress={() => setSelectedId(w.id)} accessibilityState={{ selected: on }}
                      style={[s.listItem, on && { borderColor: `${w.color}99`, backgroundColor: "rgba(255,255,255,0.04)" }]}>
                      <View style={[s.listIcon, { backgroundColor: `${w.color}1F`, borderColor: `${w.color}66` }]}>
                        <Ionicons name={w.icon} size={17} color={w.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{w.name}</Text>
                        <Text style={s.listMeta}>{fmtDuration(w.duration)} · {w.tss} TSS · IF {w.if.toFixed(2)}</Text>
                      </View>
                      <View style={[s.diffBadge, { borderColor: `${DIFFICULTY_COLOR[w.difficulty]}66` }]}>
                        <Text style={[s.diffText, { color: DIFFICULTY_COLOR[w.difficulty] }]}>{w.difficulty}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {detail ? (
                <ScrollView style={s.detailCol} contentContainerStyle={{ padding: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
                  <View style={s.detailHead}>
                    <View style={[s.detailIcon, { backgroundColor: `${detail.color}1F`, borderColor: `${detail.color}66` }]}>
                      <Ionicons name={detail.icon} size={22} color={detail.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailName}>{detail.name}</Text>
                      <Text style={[s.detailType, { color: detail.color }]}>{detail.typeName} · {detail.focus}</Text>
                    </View>
                    <Pressable testID="detail-fav" onPress={() => toggleFav(detail.id)} hitSlop={8} style={s.favBtn}>
                      <Ionicons name={favs.has(detail.id) ? "star" : "star-outline"} size={18} color={favs.has(detail.id) ? CC.yellow : CC.dim} />
                    </Pressable>
                  </View>

                  <View style={s.statsRow}>
                    <Stat label="Duration" value={fmtDuration(detail.duration)} />
                    <Stat label="TSS" value={String(detail.tss)} color={CC.yellow} />
                    <Stat label="Intensity" value={detail.if ? detail.if.toFixed(2) : "—"} />
                    <Stat label="Difficulty" value={detail.difficulty} color={DIFFICULTY_COLOR[detail.difficulty]} />
                  </View>

                  <Text style={s.detailDesc}>{detail.description}</Text>

                  <Text style={s.detailSection}>{detail.typeId === "fb50" ? "SESSION FOCUS" : "TRAINING ZONES"}</Text>
                  {detail.typeId === "fb50" ? (
                    <Text style={s.detailDesc}>Strength & mobility session — no power zones. {persona.name} will guide your form throughout.</Text>
                  ) : (
                    <ZoneBar zones={detail.zones} />
                  )}

                  <View style={s.actions}>
                    <Pressable testID="start-workout" onPress={() => startWorkout(detail)}
                      style={({ hovered }: any) => [s.startBtn, hovered && { opacity: 0.92 }]}>
                      <Ionicons name={detail.duration > 0 ? "play" : "bed-outline"} size={18} color="#241B00" />
                      <Text style={s.startText}>{detail.duration > 0 ? "Start Workout" : "Rest Day"}</Text>
                    </Pressable>
                    <Pressable testID="add-calendar" onPress={() => addToCalendar(detail)}
                      style={({ hovered }: any) => [s.secBtn, hovered && s.secHover]}>
                      <Ionicons name="calendar-outline" size={16} color={CC.white} />
                      <Text style={s.secText}>Add to Calendar</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              ) : null}
            </View>
          </View>
        </View>
        <Toast message={toast} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: CC.bg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingHorizontal: 22, paddingTop: 16 },
  crumb: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 4 },
  crumbText: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  title: { color: CC.white, fontSize: 28, fontWeight: "800" },
  subtitle: { color: CC.dim, fontSize: 13, marginTop: 3 },

  filters: { paddingHorizontal: 22, paddingTop: 14, gap: 10 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 15, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  chipOn: { backgroundColor: CC.yellow, borderColor: CC.yellow },
  chipText: { color: CC.white, fontSize: 12.5, fontWeight: "600" },
  filterMeta: {},
  miniChip: { borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: "rgba(255,255,255,0.02)", minHeight: 32, justifyContent: "center" },
  miniChipOn: { borderColor: CC.rouge, backgroundColor: "rgba(201,23,39,0.1)" },
  miniChipText: { color: CC.dim, fontSize: 11.5, fontWeight: "600" },
  sortDivider: { width: 1, backgroundColor: CC.borderSoft, marginHorizontal: 6, alignSelf: "stretch" },

  body: { flex: 1, flexDirection: "row", gap: 16, paddingHorizontal: 22, paddingTop: 16 },
  listCol: { width: 380, flexGrow: 0 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CC.card, borderRadius: 14, borderWidth: 1.5, borderColor: CC.border, padding: 12 },
  listIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  listName: { color: CC.white, fontSize: 14.5, fontWeight: "700" },
  listMeta: { color: CC.dim, fontSize: 11.5, marginTop: 2 },
  diffBadge: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  diffText: { fontSize: 10.5, fontWeight: "800" },
  emptyList: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyText: { color: CC.dim, fontSize: 13 },

  detailCol: { flex: 1, backgroundColor: CC.card, borderRadius: 18, borderWidth: 1, borderColor: CC.border, marginBottom: 18 },
  detailHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  detailName: { color: CC.white, fontSize: 20, fontWeight: "800" },
  detailType: { fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  favBtn: { padding: 4 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 22, marginTop: 18, marginBottom: 4 },
  stat: {},
  statVal: { fontSize: 20, fontWeight: "800" },
  statLbl: { color: CC.dim, fontSize: 11, marginTop: 2 },
  detailDesc: { color: CC.dim, fontSize: 13.5, lineHeight: 20, marginTop: 14 },
  detailSection: { color: CC.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginTop: 20, marginBottom: 12 },
  zoneBar: { flexDirection: "row", height: 16, borderRadius: 6, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  zoneLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  zoneLegItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  zoneDot: { width: 9, height: 9, borderRadius: 3 },
  zoneLegText: { color: CC.dim, fontSize: 11.5 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24, flexWrap: "wrap" },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: CC.yellow, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, minHeight: 48 },
  startText: { color: "#241B00", fontSize: 14, fontWeight: "800" },
  secBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 48 },
  secHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  secText: { color: CC.white, fontSize: 13, fontWeight: "700" },

  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
});
