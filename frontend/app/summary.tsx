import React from "react";
import { View, StyleSheet, ScrollView, Animated, useWindowDimensions, Platform, Text, LayoutChangeEvent, TextInput, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useSummary, useCoachDebrief, useIntervals } from "@/src/lib/summary";
import { useCoach } from "@/src/lib/coach-persona";
import { CoachChatModal } from "@/src/components/CoachChatModal";
import {
  SummaryHeader, HeroSummaryCard, MetricsGrid, ComplianceCard,
  ChartsRow, SyncExportRow, RouteSummaryCard, AchievementsCard, RecoveryCard, BottomActionBar,
  IntervalTargetsCard,
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
  const { height } = useWindowDimensions();
  const router = useRouter();
  const phone = height < 500;             // phone landscape
  const compact = height < 620;           // small tablet / large phone
  const navW = phone ? 58 : compact ? 132 : 176;
  const rightW = compact ? 300 : 344;
  const pad = phone ? spacing.sm : compact ? spacing.md : spacing.lg;

  const { stats, route, needsManual, submitManual, recordedElapsed } = useSummary();
  const { debrief, loading: debriefLoading } = useCoachDebrief(stats, route);
  const { intervals, overall: intervalOverall, hasData: intervalHasData } = useIntervals();
  const persona = useCoach();
  const [showChat, setShowChat] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [mainW, setMainW] = React.useState(600);
  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const onMainLayout = (e: LayoutChangeEvent) => setMainW(e.nativeEvent.layout.width);

  const onClose = () => router.replace("/");

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050506" }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.backdrop} edges={["top", "bottom", "left", "right"]}>
        <View style={[styles.modalCard, { padding: pad }]} testID="summary-modal">
          <View style={styles.modalHead}>
            <SummaryHeader brandWidth={navW} phone={phone} onToast={showToast} />
            <Pressable testID="summary-close" onPress={onClose} style={styles.closeBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close summary">
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            testID="summary-scroll"
          >
            <View style={[styles.contentRow, phone && styles.contentCol]}>
              {needsManual ? (
                <ManualEntryCard recordedElapsed={recordedElapsed} onSubmit={submitManual} onToast={showToast} />
              ) : (
              <>
              <View style={styles.mainCol} onLayout={onMainLayout}>
                <HeroSummaryCard compact={phone} recap={debrief} recapLoading={debriefLoading} onChat={() => setShowChat(true)} />
                <MetricsGrid stats={stats} compact={compact} routeName={route.name} />
                <ComplianceCard stats={stats} compact={phone} />
                <IntervalTargetsCard intervals={intervals} overall={intervalOverall} hasData={intervalHasData} compact={phone} />
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
              </>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <BottomActionBar
              compact={phone}
              onView={() => showToast("Opening full analysis")}
              onSave={() => router.replace("/")}
              onShare={() => showToast("Preparing shareable ride card")}
            />
          </View>
        </View>
      </SafeAreaView>

      <Toast message={toast} />
      <CoachChatModal visible={showChat} onClose={() => setShowChat(false)} persona={persona} />
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

// Shown when the ride finished with no telemetry from the smart trainer or
// wearables — lets the rider enter their workout data manually so it still
// feeds progress, the plan and the calendar.
function ManualEntryCard({ recordedElapsed, onSubmit, onToast }: { recordedElapsed: number; onSubmit: (fields: Record<string, any>) => Promise<boolean>; onToast: (m: string) => void }) {
  const [duration, setDuration] = React.useState(recordedElapsed > 0 ? String(Math.round(recordedElapsed / 60)) : "");
  const [distance, setDistance] = React.useState("");
  const [elevation, setElevation] = React.useState("");
  const [power, setPower] = React.useState("");
  const [hr, setHr] = React.useState("");
  const [cadence, setCadence] = React.useState("");
  const [rpe, setRpe] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  const fields: { key: string; label: string; unit: string; value: string; set: (v: string) => void; hint?: string }[] = [
    { key: "duration", label: "Duration", unit: "min", value: duration, set: setDuration },
    { key: "distance", label: "Distance", unit: "km", value: distance, set: setDistance },
    { key: "elevation", label: "Elevation", unit: "m", value: elevation, set: setElevation },
    { key: "power", label: "Avg Power", unit: "W", value: power, set: setPower, hint: "optional" },
    { key: "hr", label: "Avg Heart Rate", unit: "bpm", value: hr, set: setHr, hint: "optional" },
    { key: "cadence", label: "Avg Cadence", unit: "rpm", value: cadence, set: setCadence, hint: "optional" },
  ];

  const submit = async () => {
    if (!duration || Number(duration) <= 0) { onToast("Enter a duration to save"); return; }
    setSaving(true);
    const ok = await onSubmit({
      duration_sec: Math.round(Number(duration) * 60),
      distance_km: distance ? Number(distance) : 0,
      elevation_m: elevation ? Number(elevation) : 0,
      avg_power: power ? Number(power) : 0,
      avg_hr: hr ? Number(hr) : 0,
      avg_cadence: cadence ? Number(cadence) : 0,
      rpe,
    });
    setSaving(false);
    if (!ok) onToast("Couldn't save — try again");
  };

  return (
    <View style={mStyles.card} testID="manual-entry-card">
      <View style={mStyles.head}>
        <Ionicons name="create-outline" size={22} color={colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={mStyles.title}>Enter your ride manually</Text>
          <Text style={mStyles.sub}>No data was received from a smart trainer or wearable. Add what you can — it will update your progress, plan and calendar.</Text>
        </View>
      </View>

      <View style={mStyles.grid}>
        {fields.map((f) => (
          <View key={f.key} style={mStyles.field}>
            <Text style={mStyles.fieldLabel}>{f.label}{f.hint ? <Text style={mStyles.hint}>  {f.hint}</Text> : null}</Text>
            <View style={mStyles.inputRow}>
              <TextInput
                testID={`manual-${f.key}`}
                value={f.value}
                onChangeText={f.set}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                style={mStyles.input}
              />
              <Text style={mStyles.unit}>{f.unit}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={mStyles.fieldLabel}>Perceived Effort (RPE)</Text>
      <View style={mStyles.rpeRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <Pressable key={n} testID={`manual-rpe-${n}`} onPress={() => setRpe(n)} style={[mStyles.rpe, rpe === n && mStyles.rpeActive]}>
            <Text style={[mStyles.rpeText, rpe === n && mStyles.rpeTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={mStyles.rpeHint}>Used to estimate training load when power isn&apos;t available.</Text>

      <Pressable testID="manual-save" onPress={submit} disabled={saving} style={({ hovered }: any) => [mStyles.saveBtn, hovered && { opacity: 0.9 }, saving && { opacity: 0.6 }]}>
        <Ionicons name="checkmark-circle" size={18} color="#fff" />
        <Text style={mStyles.saveText}>{saving ? "Saving…" : "Save Workout"}</Text>
      </Pressable>
    </View>
  );
}

const mStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { flexBasis: "31%", flexGrow: 1, minWidth: 150 },
  fieldLabel: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, marginBottom: 6 },
  hint: { color: colors.textFaint, fontSize: 10.5, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.sm, paddingHorizontal: 12, minHeight: 46 },
  input: { flex: 1, color: colors.white, fontSize: 17, fontWeight: "700", paddingVertical: 10 },
  unit: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginLeft: 6 },
  rpeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  rpe: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderSoft },
  rpeActive: { backgroundColor: colors.red, borderColor: colors.red },
  rpeText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  rpeTextActive: { color: "#fff" },
  rpeHint: { color: colors.textFaint, fontSize: 11, marginTop: -4 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 14, marginTop: 4, ...shadow.glow },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backdrop: { flex: 1, backgroundColor: "rgba(4,4,6,0.82)", alignItems: "center", justifyContent: "center", padding: spacing.md },
  modalCard: { width: "100%", maxWidth: 1060, flex: 1, maxHeight: "100%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card },
  modalHead: { position: "relative" },
  closeBtn: { position: "absolute", top: 0, right: 0, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border },
  modalBody: { flex: 1 },
  modalFooter: { paddingTop: spacing.xs },
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
