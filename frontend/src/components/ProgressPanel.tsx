import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "./calendar";
import { useRiderSeason } from "../lib/rider-profile";

const PERIODS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
];

function Row({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={s.row}>
      <View style={[s.icon, { borderColor: color }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.label}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

/** Period-filtered progress stats (rides/distance/elevation/time/streak).
 * Fetches real aggregates from the backend for the chosen window. */
export function ProgressPanel() {
  const [idx, setIdx] = React.useState(0);
  const season = useRiderSeason(PERIODS[idx].days);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} testID="period-scroll">
        {PERIODS.map((p, i) => {
          const on = i === idx;
          return (
            <Pressable key={p.key} testID={`period-${p.days}`} onPress={() => setIdx(i)} style={[s.pill, on && s.pillOn]}>
              <Text style={[s.pillText, on && s.pillTextOn]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Row icon="bicycle" label="Rides completed" value={season ? `${season.rides}` : "—"} color={CC.rouge} />
      <Row icon="navigate" label="Distance" value={season ? `${season.distance_km.toLocaleString()} km` : "—"} color={CC.yellow} />
      <Row icon="trending-up" label="Elevation" value={season ? `${season.elevation_m.toLocaleString()} m` : "—"} color={CC.green} />
      <Row icon="time" label="Time in the saddle" value={season ? `${season.hours} h` : "—"} color="#40A9C6" />
      <Row icon="flame" label="Current streak" value={season ? `${season.streak} ${season.streak === 1 ? "day" : "days"}` : "—"} color="#E8631C" />
    </View>
  );
}

const s = StyleSheet.create({
  pills: { gap: 8, paddingBottom: 12 },
  pill: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", justifyContent: "center" },
  pillOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  pillText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  pillTextOn: { color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  icon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  label: { color: CC.white, fontSize: 14, fontWeight: "600" },
  value: { color: CC.white, fontSize: 15, fontWeight: "800" },
});
