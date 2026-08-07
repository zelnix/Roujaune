import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchClimbLeaderboard, ClimbEntry } from "@/src/lib/analysis";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { AchievementCardData } from "@/src/components/AchievementCard";
import { useCoach } from "@/src/lib/coach-persona";

const mmss = (s?: number | null) => { if (s == null) return "—"; const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };
const dstr = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

/** Tiny map thumbnail of a climb's GPS path, normalised into a fixed box. */
function ClimbMiniMap({ path, w = 84, h = 60 }: { path: [number, number][]; w?: number; h?: number }) {
  if (!path || path.length < 2) {
    return <View style={[mm.box, { width: w, height: h, alignItems: "center", justifyContent: "center" }]}><Ionicons name="map-outline" size={18} color={colors.textFaint} /></View>;
  }
  const pad = 8;
  const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rLat = (maxLat - minLat) || 1e-6, rLng = (maxLng - minLng) || 1e-6;
  // Keep aspect roughly correct: scale both by the larger span.
  const span = Math.max(rLat, rLng);
  const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
  const iw = w - pad * 2, ih = h - pad * 2;
  const pts = path.map(([lat, lng]) => {
    const x = pad + iw / 2 + ((lng - cx) / span) * iw;
    const y = pad + ih / 2 - ((lat - cy) / span) * ih; // flip: north up
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [sx, sy] = pts[0].split(",").map(Number);
  const [ex, ey] = pts[pts.length - 1].split(",").map(Number);
  return (
    <View style={[mm.box, { width: w, height: h }]}>
      <Svg width={w} height={h}>
        <Polyline points={pts.join(" ")} fill="none" stroke={colors.yellow} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={sx} cy={sy} r={3} fill="#3FB68B" />
        <Circle cx={ex} cy={ey} r={3} fill={colors.rouge ?? "#C91727"} />
      </Svg>
    </View>
  );
}

export default function ClimbsScreen() {
  const router = useRouter();
  const coach = useCoach();
  const [data, setData] = React.useState<{ climbs: ClimbEntry[]; has_data: boolean } | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [share, setShare] = React.useState<AchievementCardData | null>(null);

  React.useEffect(() => {
    fetchClimbLeaderboard().then((d) => { setData(d); if (d.climbs[0]) setOpen(d.climbs[0].id); });
  }, []);

  const prClimb = data?.climbs.find((c) => c.new_pr) || null;

  const celebrate = (c: ClimbEntry) => setShare({
    kicker: "NEW PERSONAL BEST",
    title: c.name,
    subtitle: `${Math.round(c.gain_m)} m · ${(c.length_m / 1000).toFixed(1)} km climb`,
    stats: [
      { label: "New PB", value: mmss(c.attempts[0]?.time_s) },
      { label: "Faster by", value: mmss(c.pr_improvement_s) },
      { label: "Attempts", value: `${c.count}` },
    ],
    coachName: coach.name,
  });

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
          {prClimb && (
            <View style={s.celebrate} testID="pr-celebrate">
              <View style={s.celebrateIcon}><Ionicons name="trophy" size={22} color="#241B00" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.celebrateT}>New personal best! 🎉</Text>
                <Text style={s.celebrateS}>You just took {mmss(prClimb.pr_improvement_s)} off your best on {prClimb.name}.</Text>
              </View>
              <Pressable onPress={() => celebrate(prClimb)} style={s.celebrateBtn} testID="pr-share">
                <Ionicons name="share-social" size={15} color="#241B00" />
                <Text style={s.celebrateBtnT}>Share</Text>
              </Pressable>
            </View>
          )}

          {data.climbs.map((c) => {
            const isOpen = open === c.id;
            return (
              <Card key={c.id} testID={`climb-${c.id}`}>
                <Pressable onPress={() => setOpen(isOpen ? null : c.id)} style={s.head} testID={`climb-toggle-${c.id}`}>
                  <ClimbMiniMap path={c.path} />
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                      {c.new_pr && <View style={s.prTag}><Ionicons name="flame" size={11} color="#241B00" /><Text style={s.prTagT}>PB</Text></View>}
                    </View>
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
                    <Pressable onPress={() => router.push(`/climb/${encodeURIComponent(c.id)}`)} style={s.detailLink} testID={`climb-detail-${c.id}`}>
                      <Ionicons name="analytics-outline" size={15} color={colors.yellow} />
                      <Text style={s.detailLinkT}>View elevation & overlay</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.yellow} />
                    </Pressable>
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
      <ShareCardModal visible={!!share} data={share} onClose={() => setShare(null)} />
    </AppScaffold>
  );
}

const mm = StyleSheet.create({
  box: { borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
});

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyT: { color: colors.white, fontSize: 15, fontWeight: "800" },
  emptyS: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 340 },
  celebrate: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.45)", borderRadius: radius.lg, padding: 14 },
  celebrateIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  celebrateT: { color: colors.white, fontSize: 15, fontWeight: "900" },
  celebrateS: { color: colors.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  celebrateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  celebrateBtnT: { color: "#241B00", fontSize: 12.5, fontWeight: "800" },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.white, fontSize: 15.5, fontWeight: "800", flexShrink: 1 },
  prTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.yellow, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  prTagT: { color: "#241B00", fontSize: 10, fontWeight: "900" },
  meta: { color: colors.textFaint, fontSize: 12, marginTop: 3, fontWeight: "600" },
  list: { marginTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  rankPr: { backgroundColor: colors.yellow },
  rankT: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  rowName: { color: colors.white, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  time: { color: colors.white, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  gap: { color: colors.textDim, fontSize: 11.5, fontWeight: "700", marginTop: 1 },
  detailLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 2 },
  detailLinkT: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
});
