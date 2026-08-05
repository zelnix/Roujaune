import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { fetchActivities, uploadActivity, RideListItem } from "@/src/lib/activities";

const hms = (s?: number) => {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const dateStr = (iso?: string) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; }
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const [items, setItems] = React.useState<RideListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const a = await fetchActivities();
    setItems(a); setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const onUpload = async () => {
    setMsg(null); setUploading(true);
    const res = await uploadActivity();
    setUploading(false);
    if (res.ok) { setMsg(`Imported "${res.name}"`); await load(); if (res.activity_id) router.push(`/activity/${res.activity_id}`); }
    else if (res.error && res.error !== "cancelled") setMsg(res.error);
  };

  return (
    <AppScaffold active="activities" title="Rides & Analysis" subtitle="Indoor + outdoor rides in one place.">
      <View style={s.headerRow}>
        <Text style={s.count}>{items.length} ride{items.length === 1 ? "" : "s"}</Text>
        <Pressable style={[s.upload, uploading && { opacity: 0.6 }]} onPress={onUpload} disabled={uploading} testID="upload-ride" accessibilityRole="button" accessibilityLabel="Upload a ride file">
          {uploading ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons name="cloud-upload" size={17} color={colors.bg} />}
          <Text style={s.uploadText}>{uploading ? "Importing…" : "Upload ride"}</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>Import a <Text style={s.b}>.fit</Text>, <Text style={s.b}>.gpx</Text> or <Text style={s.b}>.tcx</Text> file from your bike computer, watch or power meter.</Text>
      {msg && <Text style={s.msg}>{msg}</Text>}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>
      ) : items.length === 0 ? (
        <Card><Text style={s.empty}>No rides yet. Upload an outdoor ride file, or finish a ride in the app.</Text></Card>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.yellow} />}>
          {items.map((it) => (
            <Pressable key={it.id} style={s.row} onPress={() => router.push(`/activity/${it.cycling_activity_id || it.id}`)} testID={`ride-${it.id}`} accessibilityRole="button" accessibilityLabel={`Open ${it.name}`}>
              <View style={[s.badge, it.indoor_outdoor === "outdoor" ? s.badgeOut : s.badgeIn]}>
                <Ionicons name={it.indoor_outdoor === "outdoor" ? "map" : "home"} size={16} color={it.indoor_outdoor === "outdoor" ? "#3FB68B" : colors.yellow} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{it.name}</Text>
                <Text style={s.sub}>{dateStr(it.created_at)}{it.imported ? ` · ${it.source}` : ""}</Text>
              </View>
              <View style={s.stats}>
                {it.distance_km != null && <Stat v={`${it.distance_km}`} u="km" />}
                <Stat v={hms(it.duration_sec)} u="" />
                {it.tss ? <Stat v={String(it.tss)} u="TSS" c={colors.red} /> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </AppScaffold>
  );
}

function Stat({ v, u, c }: { v: string; u: string; c?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statV, c ? { color: c } : null]}>{v}</Text>
      {u ? <Text style={s.statU}>{u}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  count: { color: colors.white, fontSize: 15, fontWeight: "800" },
  upload: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
  uploadText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  b: { color: colors.yellow, fontWeight: "800" },
  msg: { color: colors.yellow, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  center: { paddingVertical: 50, alignItems: "center" },
  empty: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, minHeight: 64 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badgeOut: { backgroundColor: "rgba(63,182,139,0.14)" },
  badgeIn: { backgroundColor: "rgba(245,179,1,0.14)" },
  name: { color: colors.white, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.textFaint, fontSize: 12, marginTop: 2, fontWeight: "600" },
  stats: { flexDirection: "row", alignItems: "center", gap: 16 },
  stat: { alignItems: "center", minWidth: 34 },
  statV: { color: colors.white, fontSize: 15, fontWeight: "800" },
  statU: { color: colors.textFaint, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5 },
});
