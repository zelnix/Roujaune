import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchClimbLeaderboard, ClimbEntry } from "@/src/lib/analysis";

const mmss = (s?: number | null) => { if (s == null) return "—"; const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };
const dstr = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

export default function ClimbsScreen() {
  const router = useRouter();
  const [data, setData] = React.useState<{ climbs: ClimbEntry[]; has_data: boolean } | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchClimbLeaderboard().then((d) => { setData(d); if (d.climbs[0]) setOpen(d.climbs[0].id); });
  }, []);

  return (
    <AppScaffold active="fitness" title="Climb Leaderboard" subtitle="Every attempt at your repeated climbs, ranked fastest first.">
      {!data ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : !data.has_data ? (
        <Card>
          <View style={s.empty}>
            <Ionicons name="trending-up" size={30} color={colors.textFaint} />
            <Text style={s.emptyT}>No repeated climbs yet</Text>
            <Text style={s.emptyS}>Ride the same GPS climb on two or more outdoor rides and it'll show up here, ranked with your personal best on top.</Text>
          </View>
        </Card>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
          {data.climbs.map((c) => {
            const isOpen = open === c.id;
            return (
              <Card key={c.id} testID={`climb-${c.id}`}>
                <Pressable onPress={() => setOpen(isOpen ? null : c.id)} style={s.head} testID={`climb-toggle-${c.id}`}>
                  <View style={s.badge}><Ionicons name="trending-up" size={18} color={colors.yellow} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.meta}>{Math.round(c.gain_m)} m · {(c.length_m / 1000).toFixed(1)} km · {c.grad_pct}% · {c.count} attempts</Text>
                  </View>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textDim} />
                </Pressable>

                {isOpen && (
                  <View style={s.list}>
                    {c.attempts.map((a, i) => (
                      <Pressable key={a.activity_id + i} onPress={() => router.push(`/activity/${a.activity_id}`)} style={s.row} testID={`attempt-${c.id}-${i}`}>
                        <View style={[s.rank, a.pr && s.rankPr]}>
                          {a.pr ? <Ionicons name="trophy" size={14} color="#241B00" /> : <Text style={s.rankT}>{i + 1}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowName} numberOfLines={1}>{a.pr ? "Personal best" : `Attempt ${i + 1}`}</Text>
                          <Text style={s.rowSub}>{dstr(a.date)}{a.avg_speed_kmh ? ` · ${a.avg_speed_kmh} km/h` : ""}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[s.time, a.pr && { color: colors.yellow }]}>{mmss(a.time_s)}</Text>
                          {!a.pr && a.gap_s != null && a.gap_s > 0 ? <Text style={s.gap}>+{mmss(a.gap_s)}</Text> : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyT: { color: colors.white, fontSize: 15, fontWeight: "800" },
  emptyS: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 340 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,194,10,0.14)", alignItems: "center", justifyContent: "center" },
  name: { color: colors.white, fontSize: 15.5, fontWeight: "800" },
  meta: { color: colors.textFaint, fontSize: 12, marginTop: 2, fontWeight: "600" },
  list: { marginTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  rankPr: { backgroundColor: colors.yellow },
  rankT: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  rowName: { color: colors.white, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  time: { color: colors.white, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  gap: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", marginTop: 1 },
});
