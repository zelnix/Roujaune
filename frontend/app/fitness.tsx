import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors } from "@/src/theme";
import {
  fetchPmc, fetchRecords, fetchWeeklyDigest, fetchFormTarget, fetchWeeklyNote, fetchStreak, fetchMilestones, fetchSeasonRecap,
  Pmc, PowerRecord, WeeklyDigest, FormTarget, WeeklyNote, Streak, Milestones, SeasonRecap,
} from "@/src/lib/analysis";
import { PmcChart, PmcSummary, RecordsGrid, WeeklyDigestCard, ForecastSummary, FormTargetCard, CoachWeeklyNote, StreakCard, MilestonesCard, SeasonRecapCard } from "@/src/components/analysis/FitnessCharts";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { AchievementCardData } from "@/src/components/AchievementCard";
import { useCoach } from "@/src/lib/coach-persona";

export default function FitnessScreen() {
  const router = useRouter();
  const coach = useCoach();
  const [pmc, setPmc] = React.useState<Pmc | null>(null);
  const [records, setRecords] = React.useState<{ records: PowerRecord[]; has_data: boolean }>({ records: [], has_data: false });
  const [digest, setDigest] = React.useState<WeeklyDigest | null>(null);
  const [target, setTarget] = React.useState<FormTarget | null>(null);
  const [note, setNote] = React.useState<WeeklyNote | null>(null);
  const [streak, setStreak] = React.useState<Streak | null>(null);
  const [milestones, setMilestones] = React.useState<Milestones | null>(null);
  const [season, setSeason] = React.useState<SeasonRecap | null>(null);
  const [noteLoading, setNoteLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [shareData, setShareData] = React.useState<AchievementCardData | null>(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([fetchPmc(90, 14), fetchRecords(), fetchWeeklyDigest(), fetchFormTarget(), fetchStreak(), fetchMilestones(), fetchSeasonRecap()]).then(([p, r, wd, ft, st, ms, sr]) => {
      if (!alive) return;
      setPmc(p); setRecords(r); setDigest(wd); setTarget(ft); setStreak(st); setMilestones(ms); setSeason(sr); setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const loadNote = React.useCallback((refresh = false) => {
    setNoteLoading(true);
    fetchWeeklyNote(coach.name, coach.gender, refresh).then((n) => { setNote(n); setNoteLoading(false); });
  }, [coach.name, coach.gender]);

  React.useEffect(() => { loadNote(false); }, [loadNote]);

  const reloadTarget = React.useCallback(() => { fetchFormTarget().then(setTarget); }, []);

  const shareDigest = () => {
    if (!digest) return;
    setShareData({
      kicker: "WEEKLY RECAP",
      title: `${digest.this_week.tss} TSS this week`,
      subtitle: `Week of ${new Date(digest.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      stats: [
        { label: "Rides", value: `${digest.this_week.rides}` },
        { label: "Hours", value: `${digest.this_week.hours}` },
        { label: "Distance", value: `${digest.this_week.distance_km} km` },
      ],
      coachName: coach.name,
    });
  };

  const shareStreak = () => {
    if (!streak) return;
    setShareData({
      kicker: "CONSISTENCY STREAK",
      title: `${streak.current_weeks} week${streak.current_weeks === 1 ? "" : "s"} in a row`,
      subtitle: "Every week, another ride in the bank",
      stats: [
        { label: "Current", value: `${streak.current_weeks} wk` },
        { label: "Best", value: `${streak.best_weeks} wk` },
        { label: "This week", value: `${streak.this_week_rides} rides` },
      ],
      coachName: coach.name,
    });
  };

  const shareMilestone = () => {
    if (!milestones?.recent) return;
    setShareData({
      kicker: "MILESTONE",
      title: milestones.recent.label,
      subtitle: milestones.recent.blurb,
      stats: [
        { label: "Rides", value: `${milestones.total_rides}` },
        { label: "Distance", value: `${Math.round(milestones.total_km).toLocaleString()} km` },
        { label: "Hours", value: `${Math.round(milestones.total_hours)}` },
      ],
      coachName: coach.name,
    });
  };

  const shareSeason = () => {
    if (!season) return;
    setShareData({
      kicker: `${season.year} SEASON`,
      title: `${season.distance_km.toLocaleString()} km conquered`,
      subtitle: `${season.rides} rides · ${season.hours} hours in the saddle`,
      stats: [
        { label: "Climbs", value: `${season.climbs_conquered}` },
        { label: "Records", value: `${season.records_set}` },
        { label: "Biggest climb", value: `${season.biggest_climb_m.toLocaleString()} m` },
      ],
      coachName: coach.name,
    });
  };

  return (
    <AppScaffold active="fitness" title="Fitness Trends" subtitle="How your training load is shaping your form.">
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
          {digest && (
            <Card>
              <Text style={s.h}>This Week <Text style={s.hDim}>your recap</Text></Text>
              <WeeklyDigestCard digest={digest} onShare={shareDigest} />
            </Card>
          )}

          {streak && (
            <Card>
              <Text style={s.h}>Consistency Streak <Text style={s.hDim}>keep it alive</Text></Text>
              <StreakCard streak={streak} onShare={shareStreak} onFrozen={() => fetchStreak().then(setStreak)} />
            </Card>
          )}

          {milestones && (
            <Card>
              <View style={s.recHead}>
                <Text style={s.h}>Milestones <Text style={s.hDim}>your journey so far</Text></Text>
                <Pressable onPress={() => router.push("/milestones")} style={s.climbLink} testID="milestone-wall-link" hitSlop={8}>
                  <Ionicons name="ribbon-outline" size={14} color={colors.yellow} />
                  <Text style={s.climbLinkT}>Milestone wall</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.yellow} />
                </Pressable>
              </View>
              <MilestonesCard data={milestones} onShare={shareMilestone} />
            </Card>
          )}

          {season && season.has_data && (
            <Card>
              <SeasonRecapCard data={season} onShare={shareSeason} />
            </Card>
          )}

          <Card>
            <Text style={s.h}>Coach's Weekly Note <Text style={s.hDim}>recap + one focus</Text></Text>
            <CoachWeeklyNote note={note} loading={noteLoading} onRefresh={() => loadNote(true)} />
          </Card>

          <Card>
            <Text style={s.h}>Form Target <Text style={s.hDim}>arrive fresh on event day</Text></Text>
            <FormTargetCard target={target} onChanged={reloadTarget} />
          </Card>

          <Card>
            {pmc && <PmcSummary fitness={pmc.fitness} fatigue={pmc.fatigue} form={pmc.form} state={pmc.form_state} ramp={pmc.ramp_rate} weeklyTss={pmc.weekly_tss} />}
          </Card>

          <Card>
            <Text style={s.h}>Performance Management <Text style={s.hDim}>last 90 days + 2-week forecast</Text></Text>
            {pmc && <PmcChart series={pmc.series} forecast={pmc.forecast} />}
            {pmc && pmc.forecast.length > 0 && (
              <ForecastSummary fitness={pmc.forecast_fitness} form={pmc.forecast_form} state={pmc.forecast_state} dailyTss={pmc.projected_daily_tss} />
            )}
            <Text style={s.note}>Fitness rises with consistent training; Form goes positive when you rest (fresh) and negative when you push (building). The dashed line projects the next 2 weeks if you keep your recent rhythm.</Text>
          </Card>

          <Card>
            <View style={s.recHead}>
              <Text style={s.h}>Personal Records <Text style={s.hDim}>all-time best power</Text></Text>
              <Pressable onPress={() => router.push("/climbs")} style={s.climbLink} testID="climbs-link" hitSlop={8}>
                <Ionicons name="trophy-outline" size={14} color={colors.yellow} />
                <Text style={s.climbLinkT}>Climb leaderboard</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.yellow} />
              </Pressable>
            </View>
            <RecordsGrid records={records.records} hasData={records.has_data} />
          </Card>
        </ScrollView>
      )}
      <ShareCardModal visible={!!shareData} data={shareData} onClose={() => setShareData(null)} />
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  h: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  hDim: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 12 },
  recHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  climbLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 },
  climbLinkT: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
});
