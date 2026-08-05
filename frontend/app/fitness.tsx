import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors } from "@/src/theme";
import { fetchPmc, fetchRecords, Pmc, PowerRecord } from "@/src/lib/analysis";
import { PmcChart, PmcSummary, RecordsGrid } from "@/src/components/analysis/FitnessCharts";

export default function FitnessScreen() {
  const [pmc, setPmc] = React.useState<Pmc | null>(null);
  const [records, setRecords] = React.useState<{ records: PowerRecord[]; has_data: boolean }>({ records: [], has_data: false });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    Promise.all([fetchPmc(90), fetchRecords()]).then(([p, r]) => {
      if (!alive) return;
      setPmc(p); setRecords(r); setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <AppScaffold active="fitness" title="Fitness Trends" subtitle="How your training load is shaping your form.">
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
          <Card>
            {pmc && <PmcSummary fitness={pmc.fitness} fatigue={pmc.fatigue} form={pmc.form} state={pmc.form_state} ramp={pmc.ramp_rate} weeklyTss={pmc.weekly_tss} />}
          </Card>

          <Card>
            <Text style={s.h}>Performance Management <Text style={s.hDim}>last 90 days</Text></Text>
            {pmc && <PmcChart series={pmc.series} />}
            <Text style={s.note}>Fitness rises with consistent training; Form goes positive when you rest (fresh) and negative when you push (building). Aim for positive Form on event day.</Text>
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
