import React from "react";
import { View, StyleSheet, ScrollView, Animated, useWindowDimensions, Platform, Text, LayoutChangeEvent, TextInput, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import { colors, radius, spacing, shadow } from "@/src/theme";
import { useSummary, useCoachDebrief, useIntervals } from "@/src/lib/summary";
import { autoPushCompletedRide } from "@/src/lib/health";
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

  const { stats, route, needsManual, saved, submitManual, recordedElapsed, adjustments } = useSummary();
  const { debrief, loading: debriefLoading } = useCoachDebrief(stats, route);
  const { intervals, overall: intervalOverall, hasData: intervalHasData, ftp: intervalFtp } = useIntervals();
  const persona = useCoach();
  const [showChat, setShowChat] = React.useState(false);
  const [showAnalysis, setShowAnalysis] = React.useState(false);
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const [mainW, setMainW] = React.useState(600);
  const showToast = React.useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  const cardRef = React.useRef<View>(null);

  // Capture the summary card exactly as shown and open the native share sheet
  // with it as an image ("ride card"). Native only — web preview can't share.
  const shareRideCard = React.useCallback(async () => {
    try {
      if (Platform.OS === "web") { showToast("Sharing a ride card works on the app"); return; }
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your Roujaune ride" });
      } else {
        showToast("Sharing isn't available on this device");
      }
    } catch {
      showToast("Couldn't create the ride card");
    }
  }, [showToast]);

  const onMainLayout = (e: LayoutChangeEvent) => setMainW(e.nativeEvent.layout.width);

  // Auto-push the completed ride into Apple Health / Health Connect (once, if
  // the rider linked it and left auto-push on). Best-effort, silent on preview.
  const pushedRef = React.useRef(false);
  React.useEffect(() => {
    if (!saved || pushedRef.current) return;
    if (!stats?.duration_sec) return;
    pushedRef.current = true;
    const end = new Date();
    const start = new Date(end.getTime() - stats.duration_sec * 1000);
    autoPushCompletedRide({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      durationSec: stats.duration_sec,
      distanceMeters: stats.distance_km ? Math.round(stats.distance_km * 1000) : undefined,
      calories: stats.calories || undefined,
      avgHr: stats.avg_hr || undefined,
      title: route?.name ? `${route.name} ride` : "Roujaune ride",
      indoorOutdoor: "indoor",
    }).then((ok) => { if (ok) showToast(`Saved to your health app`); });
  }, [saved, stats, route, showToast]);

  const onClose = () => router.replace("/");

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050506" }}>
      <StatusBar hidden />
      <SafeAreaView style={styles.backdrop} edges={["top", "bottom", "left", "right"]}>
        <View ref={cardRef} collapsable={false} style={[styles.modalCard, { padding: pad }]} testID="summary-modal">
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
              saved={saved}
              onView={() => setShowAnalysis(true)}
              onSave={() => router.replace("/")}
              onShare={shareRideCard}
            />
          </View>
        </View>
      </SafeAreaView>

      {showAnalysis && (
        <FullAnalysisModal
          stats={stats}
          intervals={intervals}
          overall={intervalOverall}
          hasData={intervalHasData}
          ftp={intervalFtp}
          adjustments={adjustments}
          routeName={route.name}
          onClose={() => setShowAnalysis(false)}
        />
      )}

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

// Deeper post-ride analysis: full-ride power/HR curves, time-in-zones and a
// lap-by-lap interval breakdown — for data-focused riders.
function FullAnalysisModal({ stats, intervals, overall, hasData, ftp, adjustments = [], routeName, onClose }: { stats: any; intervals: any[]; overall: number | null; hasData: boolean; ftp: number; adjustments?: { t: string; label: string }[]; routeName?: string; onClose: () => void }) {
  const [w, setW] = React.useState(600);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <View style={styles.overlay}>
      <View style={styles.analysisCard} testID="full-analysis-modal">
        <View style={styles.analysisHead}>
          <View style={styles.analysisTitleRow}>
            <Ionicons name="analytics" size={20} color={colors.yellow} />
            <Text style={styles.analysisTitle}>Full Ride Analysis</Text>
          </View>
          <Pressable testID="analysis-close" onPress={onClose} style={styles.closeBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close analysis">
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.analysisScroll}
          showsVerticalScrollIndicator={false}
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        >
          <MetricsGrid stats={stats} routeName={routeName} />
          <ChartsRow stats={stats} width={w} vertical />
          <IntervalTargetsCard intervals={intervals} overall={overall} hasData={hasData} />

          <View style={styles.lapCard} testID="lap-split-table">
            <View style={styles.lapHeadRow}>
              <Ionicons name="list" size={15} color={colors.yellow} />
              <Text style={styles.lapTitle}>Lap Splits</Text>
              <Text style={styles.lapHint}>Where did you fade?</Text>
              <View style={{ flex: 1 }} />
              <View style={styles.legendItem}><View style={[styles.compDot, { backgroundColor: colors.green }]} /><Text style={styles.legendText}>On target</Text></View>
              <View style={styles.legendItem}><View style={[styles.compDot, { backgroundColor: colors.yellow }]} /><Text style={styles.legendText}>Slipping</Text></View>
              <View style={styles.legendItem}><View style={[styles.compDot, { backgroundColor: colors.red }]} /><Text style={styles.legendText}>Faded</Text></View>
            </View>
            <View style={[styles.lapRow, styles.lapHeaderRow]}>
              <View style={styles.lapAccentSpacer} />
              <Text style={[styles.lapCell, styles.lapCol0, styles.lapHeadText]}>LAP</Text>
              <Text style={[styles.lapCell, styles.lapHeadText]}>TIME</Text>
              <Text style={[styles.lapCell, styles.lapHeadText]}>AVG W</Text>
              <Text style={[styles.lapCell, styles.lapHeadText]}>% FTP</Text>
              <Text style={[styles.lapCell, styles.lapHeadText]}>AVG HR</Text>
              <Text style={[styles.lapCell, styles.lapHeadText]}>TARGET</Text>
            </View>
            {intervals.map((it, i) => {
              const pctFtp = it.avgW != null && ftp > 0 ? Math.round((it.avgW / ftp) * 100) : null;
              const tone = it.compliance == null ? colors.textFaint : it.compliance >= 80 ? colors.green : it.compliance >= 50 ? colors.yellow : colors.red;
              return (
                <View key={i} style={[styles.lapRow, i % 2 === 1 && styles.lapRowAlt]}>
                  <View style={[styles.lapAccent, { backgroundColor: tone }]} />
                  <View style={[styles.lapCell, styles.lapCol0, styles.lapNameCell]}>
                    <View style={[styles.lapDot, { backgroundColor: it.color }]} />
                    <Text style={styles.lapName} numberOfLines={1}>{i + 1}. {it.label}</Text>
                  </View>
                  <Text style={[styles.lapCell, styles.lapVal]}>{mmss(it.durationSec)}</Text>
                  <Text style={[styles.lapCell, styles.lapVal]}>{it.avgW != null ? `${it.avgW}` : "—"}</Text>
                  <Text style={[styles.lapCell, styles.lapVal, pctFtp != null && { color: colors.yellow }]}>{pctFtp != null ? `${pctFtp}%` : "—"}</Text>
                  <Text style={[styles.lapCell, styles.lapVal]}>{it.avgHr != null ? `${it.avgHr}` : "—"}</Text>
                  <View style={[styles.lapCell, styles.lapCompCell]}>
                    <View style={[styles.compPill, { borderColor: tone + "88", backgroundColor: tone + "22" }]}>
                      <View style={[styles.compDot, { backgroundColor: tone }]} />
                      <Text style={[styles.compText, { color: tone }]}>{it.compliance != null ? `${it.compliance}%` : "—"}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {adjustments.length > 0 && (
            <View style={styles.lapCard} testID="adjustments-log">
              <View style={styles.lapHeadRow}>
                <Ionicons name="options" size={15} color={colors.yellow} />
                <Text style={styles.lapTitle}>Ride Adjustments</Text>
                <Text style={styles.lapHint}>What you changed mid-ride</Text>
              </View>
              {adjustments.map((a, i) => (
                <View key={i} style={[styles.adjRow, i % 2 === 1 && styles.lapRowAlt]}>
                  <Text style={styles.adjTime}>{a.t}</Text>
                  <Text style={styles.adjLabel}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,4,6,0.82)", alignItems: "center", justifyContent: "center", padding: spacing.md, zIndex: 40 },
  analysisCard: { width: "100%", maxWidth: 980, flex: 1, maxHeight: "100%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", padding: spacing.lg, ...shadow.card },
  analysisHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  analysisTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  analysisTitle: { color: colors.white, fontSize: 20, fontWeight: "900" },
  analysisScroll: { paddingBottom: spacing.md, gap: spacing.md },
  lapCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  lapHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  lapTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  lapHint: { color: colors.textFaint, fontSize: 11, fontWeight: "600", marginLeft: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: 12 },
  legendText: { color: colors.textDim, fontSize: 10.5, fontWeight: "700" },
  lapRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingRight: 8, borderRadius: radius.sm },
  lapRowAlt: { backgroundColor: "rgba(255,255,255,0.03)" },
  lapHeaderRow: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingBottom: 8, marginBottom: 2 },
  lapAccent: { width: 4, alignSelf: "stretch", borderRadius: 2, marginRight: 8, minHeight: 24 },
  lapAccentSpacer: { width: 4, marginRight: 8 },
  lapCell: { flex: 1, textAlign: "right" },
  lapCol0: { flex: 2.4, textAlign: "left" },
  lapHeadText: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  lapNameCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  lapDot: { width: 9, height: 9, borderRadius: 5 },
  lapName: { color: colors.white, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  lapVal: { color: colors.white, fontSize: 13.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  lapCompCell: { alignItems: "flex-end" },
  adjRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm },
  adjTime: { color: colors.yellow, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"], minWidth: 48 },
  adjLabel: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  compPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  compDot: { width: 8, height: 8, borderRadius: 4 },
  compText: { fontSize: 11.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
