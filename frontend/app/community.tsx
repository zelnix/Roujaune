import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AppScaffold, useApiData, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC, colorOf } from "@/src/components/calendar";

type Community = {
  challenges: { id: string; title: string; sub: string; progress: number; reward: string; color: string }[];
  leaderboard: { rank: number; name: string; points: number; you: boolean }[];
  feed: { id: string; name: string; action: string; title: string; when: string; kudos: number; color: string }[];
};

export default function CommunityScreen() {
  const { data } = useApiData<Community>("/api/community");
  const [kudos, setKudos] = React.useState<Record<string, boolean>>({});
  const d = data;
  return (
    <AppScaffold active="community" title="Community" subtitle="Challenges, rankings and your riding circle.">
      {d ? (
        <>
          <Card testID="challenges">
            <SectionTitle label="ACTIVE CHALLENGES" color={CC.rouge} />
            <View style={s.chalRow}>
              {d.challenges.map((c) => (
                <View key={c.id} testID={`challenge-${c.id}`} style={s.chalCard}>
                  <View style={[s.chalIcon, { backgroundColor: `${colorOf(c.color)}22`, borderColor: `${colorOf(c.color)}55` }]}>
                    <Ionicons name="trophy-outline" size={18} color={colorOf(c.color)} />
                  </View>
                  <Text style={s.chalTitle}>{c.title}</Text>
                  <Text style={s.chalSub}>{c.sub}</Text>
                  <View style={s.chalTrack}><View style={[s.chalFill, { width: `${c.progress}%`, backgroundColor: colorOf(c.color) }]} /></View>
                  <View style={s.chalFoot}>
                    <Text style={s.chalPct}>{c.progress}%</Text>
                    <Text style={s.chalReward}><Ionicons name="ribbon-outline" size={11} color={CC.yellow} /> {c.reward}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          <View style={s.row}>
            <Card style={{ flex: 1 }} testID="leaderboard">
              <SectionTitle label="WEEKLY LEADERBOARD" />
              {d.leaderboard.map((l, i) => (
                <View key={l.rank} style={[s.lbRow, i < d.leaderboard.length - 1 && s.divider, l.you && s.lbYou]}>
                  <View style={[s.lbRank, l.rank <= 3 && { backgroundColor: CC.yellow }]}>
                    <Text style={[s.lbRankText, l.rank <= 3 && { color: "#241B00" }]}>{l.rank}</Text>
                  </View>
                  <Text style={[s.lbName, l.you && { color: CC.yellow, fontWeight: "800" }]}>{l.name}</Text>
                  <Text style={s.lbPoints}>{l.points.toLocaleString()} pts</Text>
                </View>
              ))}
            </Card>
            <Card style={{ flex: 1.2 }} testID="feed">
              <SectionTitle label="ACTIVITY FEED" />
              {d.feed.map((p, i) => {
                const liked = kudos[p.id];
                return (
                  <View key={p.id} style={[s.feedRow, i < d.feed.length - 1 && s.divider]}>
                    <View style={[s.avatar, { backgroundColor: `${colorOf(p.color)}33` }]}>
                      <Text style={[s.avatarText, { color: colorOf(p.color) }]}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.feedText}><Text style={s.feedName}>{p.name}</Text> {p.action} <Text style={s.feedTitle}>{p.title}</Text></Text>
                      <Text style={s.feedWhen}>{p.when}</Text>
                    </View>
                    <Pressable testID={`kudos-${p.id}`} onPress={() => setKudos((k) => ({ ...k, [p.id]: !k[p.id] }))} style={s.kudos} hitSlop={6}>
                      <Ionicons name={liked ? "heart" : "heart-outline"} size={17} color={liked ? CC.rouge : CC.dim} />
                      <Text style={[s.kudosText, liked && { color: CC.rouge }]}>{p.kudos + (liked ? 1 : 0)}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </View>
        </>
      ) : <Text style={s.loading}>Loading community…</Text>}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  chalRow: { flexDirection: "row", gap: 14 },
  chalCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1, borderColor: CC.borderSoft, padding: 14 },
  chalIcon: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chalTitle: { color: CC.white, fontSize: 14.5, fontWeight: "800", marginTop: 10 },
  chalSub: { color: CC.dim, fontSize: 12, marginTop: 2 },
  chalTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 12 },
  chalFill: { height: 7, borderRadius: 4 },
  chalFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  chalPct: { color: CC.white, fontSize: 12.5, fontWeight: "800" },
  chalReward: { color: CC.dim, fontSize: 11 },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  lbRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderRadius: 8 },
  lbYou: { backgroundColor: "rgba(255,194,10,0.08)" },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  lbRank: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  lbRankText: { color: CC.white, fontSize: 12, fontWeight: "800" },
  lbName: { flex: 1, color: CC.white, fontSize: 14, fontWeight: "600" },
  lbPoints: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  feedText: { color: CC.dim, fontSize: 13, lineHeight: 18 },
  feedName: { color: CC.white, fontWeight: "800" },
  feedTitle: { color: CC.white, fontWeight: "700" },
  feedWhen: { color: CC.dim, fontSize: 11, marginTop: 2 },
  kudos: { alignItems: "center", gap: 1 },
  kudosText: { color: CC.dim, fontSize: 11, fontWeight: "700" },
  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 30 },
});
