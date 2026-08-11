import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radius } from "../theme";
import { fetchWeeklyDigest, WeeklyDigest } from "../lib/analysis";

const GREEN = "#3FB68B";

/** A compact in-app rendering of the weekly recap email, so riders can see what
 *  they'll receive before opting in. Mirrors the real email's layout. */
export function WeeklyEmailPreview() {
  const [digest, setDigest] = React.useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { fetchWeeklyDigest().then((d) => { setDigest(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const tw = digest?.this_week;
  const d = digest?.deltas;

  const delta = (v?: number, unit = "") => {
    if (!v) return <Text style={[s.delta, { color: colors.textFaint }]}>±0 vs last wk</Text>;
    return <Text style={[s.delta, { color: v > 0 ? GREEN : colors.textDim }]}>{v > 0 ? "+" : ""}{v}{unit} vs last wk</Text>;
  };

  const tile = (val: string, label: string, dl: React.ReactNode) => (
    <View style={s.tile}>
      <Text style={s.tileVal}>{val}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {dl}
    </View>
  );

  return (
    <View style={s.wrap} testID="email-preview">
      <View style={s.subjectBar}>
        <Text style={s.from}>Harmony Wellness Group</Text>
        <Text style={s.subject}>Your week in review</Text>
      </View>
      <View style={s.body}>
        <Text style={s.brand}>ROU<Text style={{ color: colors.yellow }}>JAUNE</Text></Text>
        {loading ? (
          <ActivityIndicator color={colors.yellow} style={{ marginVertical: 18 }} />
        ) : !tw ? (
          <Text style={s.hint}>Ride this week and your recap will fill in with your stats.</Text>
        ) : (
          <>
            <Text style={s.greeting}>Hi there, here's your training recap for the week.</Text>
            <View style={s.grid}>
              {tile(`${tw.tss ?? 0}`, "TSS", delta(d?.tss))}
              {tile(`${tw.hours ?? 0} h`, "TIME", delta(d?.hours, "h"))}
            </View>
            <View style={s.grid}>
              {tile(`${tw.rides ?? 0}`, "RIDES", delta(d?.rides))}
              {tile(`${tw.distance_km ?? 0} km`, "DISTANCE", delta(d?.distance_km, "km"))}
            </View>
            {digest?.new_records && digest.new_records.length > 0 ? (
              <Text style={s.records}>🏆 New power records: {digest.new_records.map((r) => `${r.watts} W`).join(", ")}</Text>
            ) : null}
          </>
        )}
        <Text style={s.footer}>You can unsubscribe anytime from a link in the email footer.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#141615" },
  subjectBar: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "rgba(255,255,255,0.03)" },
  from: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700" },
  subject: { color: colors.white, fontSize: 13.5, fontWeight: "800", marginTop: 2 },
  body: { padding: 16 },
  brand: { color: colors.white, fontSize: 16, fontWeight: "900", letterSpacing: 1, marginBottom: 10 },
  greeting: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginVertical: 6 },
  grid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tile: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,194,10,0.22)", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  tileVal: { color: colors.white, fontSize: 20, fontWeight: "900" },
  tileLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  delta: { fontSize: 10.5, fontWeight: "700", marginTop: 5 },
  records: { color: colors.yellow, fontSize: 12, fontWeight: "700", marginTop: 6 },
  footer: { color: colors.textFaint, fontSize: 11, marginTop: 14, lineHeight: 16 },
});
