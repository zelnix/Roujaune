import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchMilestoneWall, MilestoneWall } from "@/src/lib/analysis";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { AchievementCardData } from "@/src/components/AchievementCard";
import { useCoach } from "@/src/lib/coach-persona";

export default function MilestoneWallScreen() {
  const [wall, setWall] = React.useState<MilestoneWall | null>(null);
  const [shareData, setShareData] = React.useState<AchievementCardData | null>(null);
  const coach = useCoach();

  React.useEffect(() => { fetchMilestoneWall().then(setWall); }, []);

  const shareBadge = (cat: MilestoneWall["categories"][number], value: number, label: string) => {
    const title = cat.key === "distance" ? `${value.toLocaleString()} km`
      : cat.key === "hours" ? `${value.toLocaleString()} hours`
      : `${value.toLocaleString()} rides`;
    const unit = cat.key === "distance" ? " km" : cat.key === "hours" ? " h" : "";
    setShareData({
      kicker: "MILESTONE UNLOCKED",
      title,
      subtitle: `${cat.title} milestone · ROUJAUNE`,
      stats: [{ label: `Total ${cat.title.toLowerCase()}`, value: `${cat.current.toLocaleString()}${unit}` }],
      coachName: coach.name,
    });
  };

  return (
    <AppScaffold active="fitness" title="Milestone Wall" subtitle="Every badge you've earned — and what's next.">
      {!wall ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
          <Card>
            <View style={s.summaryRow}>
              <View style={s.summaryBadge}><Ionicons name="ribbon" size={24} color="#241B00" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryTitle}>{wall.earned} of {wall.total} milestones earned</Text>
                <Text style={s.summarySub}>Keep riding to unlock the rest of the wall.</Text>
              </View>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${wall.total ? (wall.earned / wall.total) * 100 : 0}%` }]} />
            </View>
          </Card>

          {wall.categories.map((cat) => (
            <Card key={cat.key}>
              <View style={s.catHead}>
                <Ionicons name={cat.icon as any} size={17} color={colors.yellow} />
                <Text style={s.catTitle}>{cat.title}</Text>
                <Text style={s.catCurrent}>{cat.current.toLocaleString()} so far</Text>
              </View>
              <View style={s.badgeGrid}>
                {cat.rows.map((r) => (
                  <Pressable key={r.value} disabled={!r.reached} onPress={() => shareBadge(cat, r.value, r.label)}
                    style={[s.badge, r.reached ? s.badgeOn : s.badgeOff]} testID={`badge-${cat.key}-${r.value}`}
                    accessibilityRole="button"
                    accessibilityLabel={r.reached ? `Share your ${r.label} ${cat.title} milestone` : `${r.label} ${cat.title} — locked`}>
                    <Ionicons
                      name={r.reached ? "checkmark-circle" : "lock-closed"}
                      size={16}
                      color={r.reached ? "#241B00" : colors.textFaint}
                    />
                    <Text style={[s.badgeLabel, r.reached ? { color: "#241B00" } : { color: colors.textDim }]}>{r.label}</Text>
                    {r.reached ? <Ionicons name="share-social" size={13} color="#241B00" style={{ marginLeft: 2 }} /> : null}
                  </Pressable>
                ))}
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
      <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  summaryTitle: { color: colors.white, fontSize: 16, fontWeight: "900" },
  summarySub: { color: colors.textDim, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  catHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  catTitle: { color: colors.white, fontSize: 15, fontWeight: "800", flex: 1 },
  catCurrent: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14 },
  badgeOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  badgeOff: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: colors.border },
  badgeLabel: { fontSize: 13, fontWeight: "800" },
});
