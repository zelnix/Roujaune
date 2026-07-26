// ─────────────────────────────────────────────────────────────────────────
// WP-E: Training Plan review. When an accepted benchmark differs from the
// rider's current training FTP, propose the change explicitly — old → new,
// zone preview, affected areas — and let the rider Apply, Keep current, or
// Review with their coach. Nothing changes until the rider approves.
// ─────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "@/src/components/calendar";
import { useBenchmarkPlanReview, applyPlanReview, dismissPlanReview } from "@/src/lib/benchmark/api";

export default function PlanReviewCard({ coachName = "Alberto", onReview, onApplied }: {
  coachName?: string; onReview?: () => void; onApplied?: () => void;
}) {
  const { review, setReview, loading } = useBenchmarkPlanReview();
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<null | "applied" | "kept">(null);

  if (loading || !review.hasProposal || done) return done ? (
    <View style={s.doneCard} testID="plan-review-done">
      <Ionicons name={done === "applied" ? "checkmark-circle" : "shield-checkmark"} size={18} color="#7FD98A" />
      <Text style={s.doneText}>{done === "applied" ? "Your training targets have been updated." : "Your current plan is unchanged."}</Text>
    </View>
  ) : null;

  const up = (review.delta ?? 0) >= 0;
  const apply = async () => { setBusy(true); if (await applyPlanReview()) { setReview({ hasProposal: false }); setDone("applied"); onApplied?.(); } setBusy(false); };
  const keep = async () => { setBusy(true); await dismissPlanReview(); setReview({ hasProposal: false }); setDone("kept"); setBusy(false); };

  return (
    <View style={s.card} testID="plan-review">
      <View style={s.head}>
        <Ionicons name="git-compare-outline" size={18} color={CC.rouge} />
        <Text style={s.title}>Proposed training change</Text>
      </View>
      <Text style={s.reason}>{review.reason}</Text>

      <View style={s.deltaRow}>
        <View style={s.deltaBox}><Text style={s.deltaLabel}>CURRENT {review.metric}</Text><Text style={s.deltaOld}>{review.previous} W</Text></View>
        <Ionicons name="arrow-forward" size={18} color={CC.dim} />
        <View style={s.deltaBox}>
          <Text style={s.deltaLabel}>PROPOSED {review.metric}</Text>
          <Text style={[s.deltaNew, { color: up ? "#7FD98A" : "#FF7A66" }]}>{review.next} W</Text>
          <Text style={[s.deltaPct, { color: up ? "#7FD98A" : "#FF7A66" }]}>{up ? "▲" : "▼"} {Math.abs(review.deltaPct ?? 0)}%</Text>
        </View>
      </View>

      {!!review.affected?.length && (
        <View style={s.affected}>
          <Text style={s.affectedLabel}>WHAT THIS AFFECTS</Text>
          {review.affected.map((a, i) => <Text key={i} style={s.affectedItem}>• {a}</Text>)}
        </View>
      )}

      {!!review.zonesPreview?.length && (
        <View style={s.zones}>
          <Text style={s.affectedLabel}>ZONE PREVIEW</Text>
          {review.zonesPreview.slice(0, 5).map((z) => (
            <View key={z.key} style={s.zoneRow}>
              <Text style={s.zoneKey}>{z.key}</Text>
              <Text style={s.zoneOld}>{z.oldLow}{z.oldHigh ? `–${z.oldHigh}` : "+"} W</Text>
              <Ionicons name="arrow-forward" size={12} color={CC.dim} />
              <Text style={s.zoneNew}>{z.newLow}{z.newHigh ? `–${z.newHigh}` : "+"} W</Text>
            </View>
          ))}
        </View>
      )}

      {!!review.effectiveDate && <Text style={s.effective}>Effective {new Date(review.effectiveDate).toLocaleDateString()}</Text>}

      <Pressable testID="plan-review-apply" onPress={apply} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.primaryText}>Apply changes</Text></>}
      </Pressable>
      <View style={s.altRow}>
        <Pressable testID="plan-review-keep" onPress={keep} disabled={busy} style={s.ghostBtn}><Text style={s.ghostText}>Keep current plan</Text></Pressable>
        <Pressable testID="plan-review-coach" onPress={onReview} style={s.ghostBtn}><Text style={s.ghostText}>Review with {coachName}</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: "rgba(201,23,39,0.35)", padding: 16, gap: 12 },
  doneCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(127,217,138,0.08)", borderWidth: 1, borderColor: "rgba(127,217,138,0.3)", borderRadius: 12, padding: 14 },
  doneText: { color: CC.white, fontSize: 13.5, flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: CC.white, fontSize: 15.5, fontWeight: "800" },
  reason: { color: CC.dim, fontSize: 13, lineHeight: 19 },
  deltaRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  deltaBox: { alignItems: "center", flex: 1 },
  deltaLabel: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  deltaOld: { color: CC.white, fontSize: 24, fontWeight: "800", marginTop: 3 },
  deltaNew: { fontSize: 28, fontWeight: "900", marginTop: 3 },
  deltaPct: { fontSize: 12, fontWeight: "800", marginTop: 1 },
  affected: { gap: 3 },
  affectedLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, marginBottom: 2 },
  affectedItem: { color: CC.white, fontSize: 12.5, lineHeight: 18 },
  zones: { gap: 4 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoneKey: { color: CC.rouge, fontSize: 12, fontWeight: "900", width: 26 },
  zoneOld: { color: CC.dim, fontSize: 12 },
  zoneNew: { color: CC.white, fontSize: 12, fontWeight: "700" },
  effective: { color: CC.dim, fontSize: 12, fontStyle: "italic" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 13, minHeight: 48 },
  primaryText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  altRow: { flexDirection: "row", gap: 10 },
  ghostBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 11, minHeight: 44, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 13, fontWeight: "700" },
});
