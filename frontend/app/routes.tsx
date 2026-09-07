import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AppScaffold, useApiData, Card, Pill } from "@/src/components/app-scaffold";
import { CC, colorOf } from "@/src/components/calendar";

type Route = { id: string; name: string; place: string; distance: string; elevation: string; tag: string; difficulty: string; color: string };
type RoutesData = {
  featured: { id: string; name: string; place: string; distance: string; elevation: string; grade: string; tag: string; difficulty: string };
  categories: string[];
  routes: Route[];
};

export default function RoutesScreen() {
  const router = useRouter();
  const { data } = useApiData<RoutesData>("/api/routes");
  const [cat, setCat] = React.useState("All");
  const d = data;

  const filtered = React.useMemo(() => {
    if (!d) return [];
    if (cat === "All") return d.routes;
    const map: Record<string, string> = { Climbs: "Climb", Flat: "Flat", Rolling: "Rolling", Gravel: "Gravel" };
    return d.routes.filter((r) => r.tag === map[cat]);
  }, [d, cat]);

  const ride = () => router.push("/workout");

  return (
    <AppScaffold active="routes" title="Virtual Routes" subtitle="Choose your road. Ride the world's iconic climbs.">
      {d ? (
        <>
          <Card testID="featured-route" style={s.featured}>
            <LinearGradient colors={["rgba(201,23,39,0.35)", "rgba(16,18,17,0.2)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
            <View style={s.featTag}><Ionicons name="star" size={12} color={CC.yellow} /><Text style={s.featTagText}>{d.featured.tag}</Text></View>
            <Text style={s.featTitle}>{d.featured.name}</Text>
            <Text style={s.featPlace}>{d.featured.place}</Text>
            <View style={s.featMeta}>
              <FeatStat icon="navigate-outline" v={d.featured.distance} l="Distance" />
              <FeatStat icon="trending-up-outline" v={d.featured.elevation} l="Climb" />
              <FeatStat icon="analytics-outline" v={d.featured.grade} l="Avg Grade" />
              <FeatStat icon="speedometer-outline" v={d.featured.difficulty} l="Difficulty" />
            </View>
            <Pressable testID="ride-featured" onPress={ride} style={({ pressed }) => [s.rideBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={s.rideBtnText}>Ride This Route</Text>
            </Pressable>
          </Card>

          <Pressable testID="start-virtual-ride" onPress={() => router.push("/virtual-route")}
            style={({ pressed }) => [s.vrLaunch, pressed && { opacity: 0.9 }]}>
            <LinearGradient colors={["rgba(245,179,1,0.22)", "rgba(16,18,17,0.1)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
            <View style={s.vrLaunchIcon}><Ionicons name="bicycle" size={22} color={CC.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.vrLaunchTitle}>Start a Virtual Ride</Text>
              <Text style={s.vrLaunchSub}>Immersive 2.5D routes · ride with a companion · no equipment needed</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={CC.dim} />
          </Pressable>

          <View style={s.cats}>
            {d.categories.map((c) => <Pill key={c} testID={`cat-${c}`} label={c} active={cat === c} onPress={() => setCat(c)} />)}
          </View>

          <View style={s.grid}>
            {filtered.map((r) => (
              <Pressable key={r.id} testID={`route-${r.id}`} onPress={ride}
                style={({ hovered, pressed }: any) => [s.routeCard, hovered && s.routeHover, pressed && { opacity: 0.9 }]}>
                <View style={s.routeThumb}>
                  <LinearGradient colors={[colorOf(r.color), "rgba(8,9,9,0.9)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
                  <Ionicons name="bicycle" size={26} color="rgba(255,255,255,0.85)" style={s.routeThumbIcon} />
                  <View style={s.diffTag}><Text style={s.diffText}>{r.difficulty}</Text></View>
                </View>
                <View style={s.routeBody}>
                  <Text style={s.routeName} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.routePlace}>{r.place} · {r.tag}</Text>
                  <View style={s.routeStats}>
                    <Text style={s.routeStat}><Ionicons name="navigate-outline" size={11} color={CC.dim} /> {r.distance}</Text>
                    <Text style={s.routeStat}><Ionicons name="trending-up-outline" size={11} color={CC.dim} /> {r.elevation}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : <Text style={s.loading}>Loading routes…</Text>}
    </AppScaffold>
  );
}

function FeatStat({ icon, v, l }: { icon: any; v: string; l: string }) {
  return (
    <View style={s.featStat}>
      <Ionicons name={icon} size={16} color={CC.yellow} />
      <View><Text style={s.featStatV}>{v}</Text><Text style={s.featStatL}>{l}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  featured: { overflow: "hidden", minHeight: 210, justifyContent: "center", padding: 24 },
  featTag: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  featTagText: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4 },
  featTitle: { color: CC.white, fontSize: 34, fontWeight: "900", fontStyle: "italic", marginTop: 12 },
  featPlace: { color: CC.dim, fontSize: 14, marginTop: 2 },
  featMeta: { flexDirection: "row", gap: 34, marginTop: 20, flexWrap: "wrap" },
  featStat: { flexDirection: "row", alignItems: "center", gap: 8 },
  featStatV: { color: CC.white, fontSize: 15, fontWeight: "800" },
  featStatL: { color: CC.dim, fontSize: 11 },
  rideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start", marginTop: 22, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, minHeight: 46 },
  rideBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  cats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  vrLaunch: { flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: "rgba(245,179,1,0.35)", backgroundColor: "rgba(16,18,17,0.6)", paddingHorizontal: 16, paddingVertical: 16, marginBottom: 4 },
  vrLaunchIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.14)", borderWidth: 1, borderColor: "rgba(245,179,1,0.4)" },
  vrLaunchTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  vrLaunchSub: { color: CC.dim, fontSize: 12, fontWeight: "600", marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  routeCard: { width: 300, borderRadius: 16, borderWidth: 1, borderColor: CC.border, backgroundColor: CC.card, overflow: "hidden" },
  routeHover: { borderColor: "rgba(255,255,255,0.28)" },
  routeThumb: { height: 110, justifyContent: "center", alignItems: "center" },
  routeThumbIcon: { opacity: 0.9 },
  diffTag: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  diffText: { color: "#fff", fontSize: 10.5, fontWeight: "700" },
  routeBody: { padding: 14 },
  routeName: { color: CC.white, fontSize: 16, fontWeight: "800" },
  routePlace: { color: CC.dim, fontSize: 12, marginTop: 2 },
  routeStats: { flexDirection: "row", gap: 16, marginTop: 10 },
  routeStat: { color: CC.dim, fontSize: 12, fontWeight: "600" },
  loading: { color: CC.dim, fontSize: 13, textAlign: "center", marginTop: 30 },
});
