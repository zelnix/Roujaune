import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors } from "@/src/theme";
import { fetchPmc, fetchRecords, fetchWeeklyDigest, Pmc, PowerRecord, WeeklyDigest } from "@/src/lib/analysis";
import { PmcChart, PmcSummary, RecordsGrid, WeeklyDigestCard, ForecastSummary } from "@/src/components/analysis/FitnessCharts";

export default function FitnessScreen() {
  const [pmc, setPmc] = React.useState<Pmc | null>(null);
  const [records, setRecords] = React.useState<{ records: PowerRecord[]; has_data: boolean }>({ records: [], has_data: false });
  const [digest, setDigest] = React.useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    Promise.all([fetchPmc(90, 14), fetchRecords(), fetchWeeklyDigest()]).then(([p, r, wd]) => {
      if (!alive) return;
      setPmc(p); setRecords(r); setDigest(wd); setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <AppScaffold active="fitness" title="Fitness Trends" subtitle="How your training load is shaping your form.">
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
          {digest && (
            <Card>
              <Text style={s.h}>This Week <Text style={s.hDim}>your recap</Text></Text>
              <WeeklyDigestCard digest={digest} />
            </Card>
          )}

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
            <Text style={s.h}>Personal Records <Text style={s.hDim}>all-time best power</Text></Text>
            <RecordsGrid records={records.records} hasData={records.has_data} />
          </Card>
        </ScrollView>
      )}
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: "center" },
  h: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  hDim: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
