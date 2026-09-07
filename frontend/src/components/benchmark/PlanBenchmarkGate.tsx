// ─────────────────────────────────────────────────────────────────────────
// WP-G: Plan-start benchmark gate. On Intermediate/Advanced plans the coach
// decides whether a fresh benchmark is needed or an existing one carries
// forward. Explains the decision and offers clear, non-forced rider actions.
// Training zones are never changed here — only a benchmark may be started.
// ─────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CC } from "@/src/components/calendar";
import { getBenchmarkTest } from "@/src/lib/benchmark/catalog";

function apiBase() { return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, ""); }

const STATUS_STYLE: Record<string, { color: string; icon: any }> = {
  required: { color: "#FFC20A", icon: "flag" },
  recommended: { color: "#7FB2FF", icon: "sparkles" },
  approved: { color: "#7FD98A", icon: "checkmark-circle" },
  submaximal: { color: "#7FB2FF", icon: "pulse" },
  deferred: { color: "#8A8F98", icon: "time" },
  coach_review: { color: "#FFC20A", icon: "chatbubbles" },
};

interface Gate {
  status: string; statusLabel: string; message: string; coachMessage: string;
  reasons: string[]; recommendedTestId: string; recommendedTestName?: string;
  requiresBenchmark: boolean; planLevel: string;
}

export default function PlanBenchmarkGate({ planId, coachName = "Alberto", coachGender = "male", onReview }: {
  planId: string; coachName?: string; coachGender?: string; onReview?: () => void;
}) {
  const router = useRouter();
  const [gate, setGate] = React.useState<Gate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await AsyncStorage.getItem(`bm:plangate:dismissed:${planId}`);
        if (d === "1" && alive) { setDismissed(true); setLoading(false); return; }
        const res = await fetch(`${apiBase()}/api/benchmark/plan-gate?plan_id=${encodeURIComponent(planId)}&coach_name=${encodeURIComponent(coachName)}&coach_gender=${coachGender}`);
        if (res.ok && alive) setGate(await res.json());
      } catch { /* silent — non-blocking card */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [planId, coachName, coachGender]);

  const useExisting = async () => {
    await AsyncStorage.setItem(`bm:plangate:dismissed:${planId}`, "1").catch(() => {});
    setDismissed(true);
  };

  if (loading) return <View style={s.card} testID="plan-gate-loading"><ActivityIndicator color={CC.rouge} /></View>;
  if (dismissed || !gate) return null;

  const st = STATUS_STYLE[gate.status] ?? STATUS_STYLE.recommended;
  const recTest = getBenchmarkTest(gate.recommendedTestId);
  const isApproved = gate.status === "approved" || gate.status === "deferred";

  return (
    <View style={[s.card, { borderColor: `${st.color}55` }]} testID="plan-gate">
      <View style={s.head}>
        <View style={[s.iconWrap, { backgroundColor: `${st.color}22` }]}>
          <Ionicons name={st.icon} size={18} color={st.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.statusLabel, { color: st.color }]}>{gate.statusLabel.toUpperCase()}</Text>
          <Text style={s.planLevel}>{gate.planLevel} plan</Text>
        </View>
      </View>

      <Text style={s.coachMsg} testID="plan-gate-message">{gate.coachMessage}</Text>

      {gate.reasons.length > 0 && !isApproved && (
        <View style={s.reasons}>
          {gate.reasons.map((r, i) => <Text key={i} style={s.reason}>• {r}</Text>)}
        </View>
      )}

      {isApproved ? (
        <View style={s.approvedRow}>
          <Pressable testID="plan-gate-review" onPress={onReview} style={s.ghostBtn}><Text style={s.ghostText}>Review with {coachName}</Text></Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Pressable testID="plan-gate-start" onPress={() => router.push(`/benchmark/setup/${gate.recommendedTestId}` as any)} style={[s.primaryBtn, { backgroundColor: CC.rouge }]}>
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={s.primaryText}>Start {recTest?.name ?? gate.recommendedTestName ?? "recommended benchmark"}</Text>
          </Pressable>
          <View style={s.actionRow}>
            <Pressable testID="plan-gate-schedule" onPress={() => router.push("/benchmark" as any)} style={s.ghostBtn}><Text style={s.ghostText}>Schedule</Text></Pressable>
            {gate.status === "recommended" && (
              <Pressable testID="plan-gate-use-existing" onPress={useExisting} style={s.ghostBtn}><Text style={s.ghostText}>Use existing</Text></Pressable>
            )}
            <Pressable testID="plan-gate-review" onPress={onReview} style={s.ghostBtn}><Text style={s.ghostText}>Review with {coachName}</Text></Pressable>
          </View>
          <Pressable testID="plan-gate-other" onPress={() => router.push("/benchmark/library" as any)} style={s.linkBtn}>
            <Text style={s.linkText}>Choose another test or a submaximal option</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 16, gap: 12, marginBottom: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  planLevel: { color: CC.dim, fontSize: 12, fontWeight: "700", marginTop: 2, textTransform: "capitalize" },
  coachMsg: { color: CC.white, fontSize: 14, lineHeight: 21 },
  reasons: { gap: 3 },
  reason: { color: CC.dim, fontSize: 12.5, lineHeight: 18 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13, minHeight: 48 },
  primaryText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  approvedRow: { flexDirection: "row", gap: 10 },
  ghostBtn: { flex: 1, minWidth: 120, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 11, minHeight: 44, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  linkBtn: { alignItems: "center", paddingVertical: 4 },
  linkText: { color: CC.rouge, fontSize: 12.5, fontWeight: "700" },
});
