import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";
import { fetchMilestones } from "../lib/analysis";

export type MilestoneNudge = {
  show: boolean;
  kind: "rides" | "km";
  remaining: number;
  target: number;
};

const RIDES_THRESHOLD = 3;   // nudge when within 3 rides of the next badge
const KM_THRESHOLD = 25;     // or within 25 km

/** Decides whether the rider is close enough to a milestone to nudge them, and
 *  which one (whichever is nearer). Returns {show:false} otherwise. */
export function useMilestoneNudge(): MilestoneNudge {
  const [nudge, setNudge] = React.useState<MilestoneNudge>({ show: false, kind: "rides", remaining: 0, target: 0 });
  React.useEffect(() => {
    let alive = true;
    fetchMilestones().then((m) => {
      if (!alive || !m) return;
      const ridesClose = m.next_rides != null && m.rides_to_next != null && m.rides_to_next > 0 && m.rides_to_next <= RIDES_THRESHOLD;
      const kmClose = m.next_km != null && m.km_to_next != null && m.km_to_next > 0 && m.km_to_next <= KM_THRESHOLD;
      // Prefer whichever badge is proportionally closer to completion.
      if (ridesClose && (!kmClose || m.rides_progress >= m.km_progress)) {
        setNudge({ show: true, kind: "rides", remaining: Math.ceil(m.rides_to_next as number), target: m.next_rides as number });
      } else if (kmClose) {
        setNudge({ show: true, kind: "km", remaining: Math.ceil(m.km_to_next as number), target: m.next_km as number });
      }
    });
    return () => { alive = false; };
  }, []);
  return nudge;
}

export function MilestoneNudgeBanner({ nudge }: { nudge: MilestoneNudge }) {
  const router = useRouter();
  if (!nudge.show) return null;
  const msg = nudge.kind === "rides"
    ? `Just ${nudge.remaining} ride${nudge.remaining === 1 ? "" : "s"} to your ${nudge.target.toLocaleString()}-ride badge`
    : `Just ${nudge.remaining} km to your ${nudge.target.toLocaleString()} km badge`;
  return (
    <Pressable testID="milestone-nudge" onPress={() => router.push("/milestones")} accessibilityRole="button"
      style={({ hovered }: any) => [s.banner, hovered && { borderColor: "rgba(255,194,10,0.6)" }]}>
      <View style={s.iconWrap}><Ionicons name="ribbon" size={18} color="#241B00" /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{msg}</Text>
        <Text style={s.sub}>You're almost there — tap to see the Milestone Wall.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.yellow} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,194,10,0.1)", borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", borderRadius: radius.lg, padding: 14 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  title: { color: colors.white, fontSize: 14, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2, fontWeight: "600" },
});
