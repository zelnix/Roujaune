import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

import { colors, radius, spacing } from "../theme";
import { MissedWorkouts, resolveMissed } from "../lib/home-notices";
import { PickRescheduleDateModal } from "./PickRescheduleDateModal";

function prettyDate(iso?: string): string {
  if (!iso) return "a free day";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const SKIP_REASONS = ["Sick", "Sore / tired", "Too busy", "Travel", "Just needed rest"];

/** Friendly "skip or reschedule?" card for a missed session. Skip offers a
 * quick, optional reason chip so the coach can factor it in later. Reschedule
 * opens a full calendar so riders pick exactly which day (pre-filled with the
 * coach's suggestion) — actions apply immediately and refresh the plan. */
export function MissedWorkoutBanner({ data }: { data: MissedWorkouts }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "skip" | "reschedule">(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [pickingReason, setPickingReason] = React.useState(false);

  if (!data || data.count <= 0) return null;
  const item = data.missed[0];
  const rescheduleTo = item?.suggested_date || data.suggested_date;

  const act = async (action: "skip" | "reschedule", date?: string, reason?: string) => {
    if (!item?.id || busy) return;
    setBusy(action);
    const ok = await resolveMissed(item.id, action, action === "reschedule" ? (date || rescheduleTo) : undefined, reason);
    setBusy(null);
    if (ok) {
      setDone(action === "skip"
        ? `Skipped “${item.title}”${reason ? ` (${reason})` : ""} — plan continues.`
        : `Moved “${item.title}” to ${prettyDate(date || rescheduleTo)}.`);
      setTimeout(() => data.refresh?.(), 1400);
    }
  };

  if (done) {
    return (
      <View style={styles.card} testID="missed-workout-done">
        <View style={styles.icon}><Ionicons name="checkmark-circle" size={18} color={colors.green} /></View>
        <Text style={[styles.title, { flex: 1 }]}>{done}</Text>
      </View>
    );
  }

  return (
    <View testID="missed-workout-banner" style={styles.card}>
      <View style={styles.icon}><Ionicons name="calendar-outline" size={18} color={colors.yellow} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {data.count > 1 ? `${data.count} missed rides` : "Missed ride"}
          {item?.title ? ` — ${item.title}` : ""}
        </Text>
        {pickingReason ? (
          <>
            <Text style={styles.sub}>Mind sharing why? Helps your coach adjust.</Text>
            <View style={styles.actions}>
              {SKIP_REASONS.map((r) => (
                <Pressable key={r} testID={`missed-skip-reason-${r.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                  onPress={() => act("skip", undefined, r)} disabled={!!busy} style={styles.ghostBtn}>
                  <Text style={styles.ghostText}>{r}</Text>
                </Pressable>
              ))}
              <Pressable testID="missed-skip-no-reason" onPress={() => act("skip")} disabled={!!busy} style={styles.ghostBtn}>
                {busy === "skip" ? <ActivityIndicator size="small" color={colors.textDim} /> : <Text style={styles.ghostText}>Skip anyway</Text>}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sub} numberOfLines={2}>
              {data.guidance || "No stress — skip it, or reschedule to a free day. Your plan adjusts and your event date stays fixed."}
            </Text>
            <View style={styles.actions}>
              <Pressable testID="missed-skip" onPress={() => setPickingReason(true)} disabled={!!busy} style={styles.ghostBtn}>
                <Text style={styles.ghostText}>Skip</Text>
              </Pressable>
              <Pressable testID="missed-reschedule" onPress={() => setPicking(true)} disabled={!!busy} style={styles.primaryBtn}>
                {busy === "reschedule"
                  ? <ActivityIndicator size="small" color="#241B00" />
                  : <Text style={styles.primaryText}>Reschedule…</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
      <Pressable testID="missed-view-plan" onPress={() => router.push("/plan")} hitSlop={8}>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </Pressable>

      <PickRescheduleDateModal
        visible={picking}
        onClose={() => setPicking(false)}
        title={item?.title}
        suggestedDate={rescheduleTo}
        onConfirm={(dateISO) => { setPicking(false); act("reschedule", dateISO); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "rgba(255,194,10,0.08)", borderColor: "rgba(255,194,10,0.30)",
    borderWidth: 1, borderRadius: radius.lg, padding: spacing.md,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.14)" },
  title: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  sub: { color: colors.textDim, fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  ghostBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, minHeight: 36, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  primaryBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.yellow, minHeight: 36, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#241B00", fontSize: 12.5, fontWeight: "800" },
});
