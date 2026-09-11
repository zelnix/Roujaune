import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Polyline } from "react-native-svg";
import { colors } from "@/src/theme";
import { Adaptation, Trend } from "@/src/lib/adaptation";

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return null;
  const W = 64, H = 20;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke={up ? colors.green ?? "#37B24D" : colors.yellow} strokeWidth={1.6} />
    </Svg>
  );
}

function TrendRow({ label, hint, trend, series, betterUp }: { label: string; hint: string; trend: Trend; series: number[]; betterUp: boolean }) {
  if (!trend) return null;
  const improving = betterUp ? trend.late > trend.early : trend.late < trend.early;
  const arrow = trend.late > trend.early ? "arrow-up" : trend.late < trend.early ? "arrow-down" : "remove";
  const color = improving ? (colors.green ?? "#37B24D") : colors.textDim;
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowHint}>{hint}</Text>
      </View>
      <Spark data={series} up={improving} />
      <View style={s.delta}>
        <Ionicons name={arrow as any} size={13} color={color} />
        <Text style={[s.deltaText, { color }]}>{trend.late}</Text>
      </View>
    </View>
  );
}

export function AdaptationCard({ data, onTalkToCoach }: { data: Adaptation; onTalkToCoach?: () => void }) {
  const t = data.trends;
  return (
    <View style={{ gap: 14 }}>
      {data.callouts.length > 0 && (
        <View style={{ gap: 8 }}>
          {data.callouts.map((c, i) => (
            <View key={i} style={[s.callout, { borderColor: (c.good ? (colors.green ?? "#37B24D") : colors.yellow) + "66" }]} testID={`adapt-callout-${c.kind}`}>
              <Ionicons name={c.good ? "trending-up" : "alert-circle"} size={16} color={c.good ? (colors.green ?? "#37B24D") : colors.yellow} />
              <Text style={s.calloutText}>{c.text}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 4 }}>
        <TrendRow label="Aerobic efficiency" hint="Watts per heartbeat (EF)" trend={t.ef_z2 ?? t.ef} series={data.series.ef} betterUp />
        <TrendRow label="Aerobic decoupling" hint="HR drift late in rides — lower is better" trend={t.decoupling} series={data.series.decoupling} betterUp={false} />
        <TrendRow label="Heart-rate recovery" hint="Beats dropped in the last minute" trend={t.hrr} series={data.series.hrr} betterUp />
        <TrendRow label="Anaerobic reserve" hint="W′ left in the tank after hard efforts" trend={t.w_prime} series={data.series.w_prime} betterUp />
      </View>

      <View style={s.loadRow}>
        <View style={s.loadCell}><Text style={s.loadVal}>{Math.round(data.load.ctl ?? 0)}</Text><Text style={s.loadLbl}>Fitness</Text></View>
        <View style={s.loadCell}><Text style={s.loadVal}>{(data.load.tsb ?? 0) > 0 ? `+${Math.round(data.load.tsb ?? 0)}` : Math.round(data.load.tsb ?? 0)}</Text><Text style={s.loadLbl}>Form (TSB)</Text></View>
        <View style={s.loadCell}><Text style={[s.loadVal, { fontSize: 14 }]}>{data.load.form_state ?? "—"}</Text><Text style={s.loadLbl}>{(data.load.ramp_rate ?? 0) >= 0 ? `+${data.load.ramp_rate ?? 0}` : data.load.ramp_rate}/wk ramp</Text></View>
      </View>

      {data.coach_actions.auto_apply.map((a, i) => (
        <View key={`aa-${i}`} style={s.autoNote} testID="adapt-auto-apply">
          <Ionicons name="checkmark-circle" size={15} color={colors.green ?? "#37B24D"} />
          <Text style={s.autoText}>{a}</Text>
        </View>
      ))}

      {data.coach_actions.confirm.map((c, i) => (
        <View key={`cf-${i}`} style={s.confirm} testID={`adapt-confirm-${c.kind}`}>
          <Text style={s.confirmText}>{c.text}</Text>
          <Pressable onPress={onTalkToCoach} style={s.confirmBtn} accessibilityRole="button" accessibilityLabel="Talk to coach about this">
            <Ionicons name="chatbubble-ellipses" size={14} color="#180a0a" />
            <Text style={s.confirmBtnText}>Talk to coach</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  callout: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 12, padding: 11, backgroundColor: "rgba(255,255,255,0.03)" },
  calloutText: { flex: 1, color: colors.white, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rowLabel: { color: colors.white, fontSize: 13, fontWeight: "700" },
  rowHint: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 1 },
  delta: { flexDirection: "row", alignItems: "center", gap: 3, minWidth: 48, justifyContent: "flex-end" },
  deltaText: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  loadRow: { flexDirection: "row", gap: 8 },
  loadCell: { flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingVertical: 12 },
  loadVal: { color: colors.yellow, fontSize: 20, fontWeight: "900" },
  loadLbl: { color: colors.textDim, fontSize: 10.5, fontWeight: "700", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  autoNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(55,178,77,0.10)", borderRadius: 10, padding: 10 },
  autoText: { flex: 1, color: colors.white, fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
  confirm: { gap: 9, borderWidth: 1, borderColor: colors.yellow + "55", borderRadius: 12, padding: 12, backgroundColor: colors.yellow + "10" },
  confirmText: { color: colors.white, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, alignSelf: "flex-start", backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  confirmBtnText: { color: "#180a0a", fontSize: 13, fontWeight: "900" },
});
