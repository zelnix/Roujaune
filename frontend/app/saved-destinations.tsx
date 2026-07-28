import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useSavedDestinations, useScenicJourneys, useAllDiscoveries, ScenicJourney, ScenicDiscovery } from "@/src/lib/scenic-routes";
import { DestinationCard } from "@/src/components/today/DestinationCard";
import { ScenicRecapShareModal } from "@/src/components/ScenicRecapShareModal";
import { DiscoveryDetailModal } from "@/src/components/DiscoveryDetailModal";
import { useCoach } from "@/src/lib/coach-persona";

function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDate(at?: string): string {
  if (!at) return "";
  try { return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }); } catch { return ""; }
}
function fmtDist(km?: number | string | null): string {
  if (km == null || km === "") return "—";
  const n = typeof km === "string" ? parseFloat(km) : km;
  if (!isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(n >= 10 ? 0 : 1)} km`;
}

/** Journeys — the rider's completed scenic rides (shareable recaps + saved
 *  discoveries) plus their favourited destinations. */
export default function JourneysScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { routes, loading } = useSavedDestinations();
  const { journeys, loading: jLoading } = useScenicJourneys();
  const { discoveries, loading: dLoading, reload: reloadDiscoveries } = useAllDiscoveries();
  const coach = useCoach();
  const [share, setShare] = React.useState<ScenicJourney | null>(null);
  const [detail, setDetail] = React.useState<ScenicDiscovery | null>(null);
  const [tab, setTab] = React.useState<"rides" | "discoveries">("rides");

  const open = (id: string) => router.push(`/scenic-ride?route=${id}` as any);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const cols = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const gap = 12;
  const cardW = cols === 1 ? undefined : Math.floor((Math.min(width, 1200) - 2 * spacing.lg - gap * (cols - 1)) / cols);

  // Discovery gallery columns (photos are smaller than destination cards).
  const gCols = width >= 1000 ? 4 : width >= 640 ? 3 : 2;
  const gGap = 10;
  const gCardW = Math.floor((Math.min(width, 1200) - 2 * spacing.lg - gGap * (gCols - 1)) / gCols);

  const anyLoading = loading || jLoading || dLoading;
  const nothing = !anyLoading && journeys.length === 0 && discoveries.length === 0 && (!routes || routes.length === 0);

  return (
    <View style={s.root} testID="saved-destinations">
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Pressable onPress={leave} testID="saved-back" style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={s.title}>Journeys</Text>
        </View>

        {/* Tabs */}
        {!nothing && (
          <View style={s.tabs}>
            <Pressable onPress={() => setTab("rides")} style={[s.tab, tab === "rides" && s.tabActive]} testID="tab-rides" accessibilityRole="button" accessibilityState={{ selected: tab === "rides" }}>
              <Ionicons name="bicycle" size={16} color={tab === "rides" ? colors.bg : colors.textDim} />
              <Text style={[s.tabText, tab === "rides" && s.tabTextActive]}>Rides</Text>
            </Pressable>
            <Pressable onPress={() => setTab("discoveries")} style={[s.tab, tab === "discoveries" && s.tabActive]} testID="tab-discoveries" accessibilityRole="button" accessibilityState={{ selected: tab === "discoveries" }}>
              <Ionicons name="bookmark" size={15} color={tab === "discoveries" ? colors.bg : colors.textDim} />
              <Text style={[s.tabText, tab === "discoveries" && s.tabTextActive]}>Discoveries{discoveries.length ? ` · ${discoveries.length}` : ""}</Text>
            </Pressable>
          </View>
        )}

        {anyLoading ? (
          <View style={s.center}><ActivityIndicator color={colors.yellow} /><Text style={s.centerText}>Loading your journeys…</Text></View>
        ) : nothing ? (
          <View style={s.center} testID="saved-empty">
            <View style={s.emptyIcon}><Ionicons name="map-outline" size={30} color={colors.yellow} /></View>
            <Text style={s.emptyTitle}>No journeys yet</Text>
            <Text style={s.centerText}>Ride a scenic route and it will appear here as a shareable recap. Tap the heart on any ride to save it too.</Text>
            <Pressable testID="saved-explore" onPress={() => router.push("/scenic-destinations" as any)} style={s.exploreBtn} accessibilityRole="button">
              <Ionicons name="compass-outline" size={16} color={colors.bg} />
              <Text style={s.exploreText}>Explore destinations</Text>
            </Pressable>
          </View>
        ) : tab === "rides" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Completed rides — shareable recaps */}
            {journeys.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={s.section}>YOUR RIDES</Text>
                <Text style={s.count}>{journeys.length} completed {journeys.length === 1 ? "ride" : "rides"}</Text>
                <View style={{ gap: 12 }}>
                  {journeys.map((j) => (
                    <JourneyRecapCard key={j.id} journey={j} onReride={() => open(j.routeId)} onShare={() => setShare(j)} />
                  ))}
                </View>
              </View>
            )}

            {/* Saved destinations */}
            {routes && routes.length > 0 && (
              <View>
                <Text style={s.section}>SAVED DESTINATIONS</Text>
                <Text style={s.count}>{routes.length} saved {routes.length === 1 ? "ride" : "rides"}</Text>
                <View style={[s.grid, { gap }]}>
                  {routes.map((r) => (
                    <DestinationCard key={r.id} route={r} width={cardW} onPress={() => open(r.id)} />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          /* Discoveries scrapbook */
          discoveries.length === 0 ? (
            <View style={s.center} testID="discoveries-empty">
              <View style={s.emptyIcon}><Ionicons name="bookmark-outline" size={28} color={colors.yellow} /></View>
              <Text style={s.emptyTitle}>No discoveries yet</Text>
              <Text style={s.centerText}>While riding, tap the bookmark on a point of interest to keep its photo and story here in your scrapbook.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
              <Text style={s.section}>YOUR SCRAPBOOK</Text>
              <Text style={s.count}>{discoveries.length} saved {discoveries.length === 1 ? "discovery" : "discoveries"}</Text>
              <View style={[s.grid, { gap: gGap }]}>
                {discoveries.map((d) => (
                  <DiscoveryTile key={d.id} discovery={d} width={gCardW} onPress={() => setDetail(d)} />
                ))}
              </View>
            </ScrollView>
          )
        )}
      </SafeAreaView>

      <ScenicRecapShareModal visible={!!share} journey={share} coachName={coach.name} onClose={() => setShare(null)} />
      <DiscoveryDetailModal
        visible={!!detail}
        discovery={detail}
        onClose={() => setDetail(null)}
        onRide={(rid) => { setDetail(null); open(rid); }}
        onChanged={() => { reloadDiscoveries(); }}
      />
    </View>
  );
}

function DiscoveryTile({ discovery, width, onPress }: { discovery: ScenicDiscovery; width?: number; onPress: () => void }) {
  return (
    <Pressable style={[s.tile, width ? { width } : { flex: 1 }]} onPress={onPress} testID={`discovery-${discovery.id}`} accessibilityRole="button" accessibilityLabel={`Open ${discovery.title}`}>
      {discovery.photo ? (
        <Image source={{ uri: discovery.photo }} style={s.tileImg} contentFit="cover" />
      ) : (
        <View style={[s.tileImg, s.tileFallback]}><Ionicons name="image-outline" size={22} color={colors.textFaint} /></View>
      )}
      <View style={s.tileOverlay}>
        <Text style={s.tileTitle} numberOfLines={1}>{discovery.title}</Text>
        {(discovery.place || discovery.route_name) ? (
          <Text style={s.tileMeta} numberOfLines={1}>{discovery.place || discovery.route_name}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function JourneyRecapCard({ journey, onReride, onShare }: { journey: ScenicJourney; onReride: () => void; onShare: () => void }) {
  const discoveries = journey.discoveries || [];
  return (
    <View style={s.jcard} testID={`journey-${journey.routeId}`}>
      <Pressable style={s.jtop} onPress={onReride} accessibilityRole="button" accessibilityLabel={`Ride ${journey.name} again`}>
        {journey.thumbnail ? (
          <Image source={{ uri: journey.thumbnail }} style={s.jthumb} contentFit="cover" />
        ) : (
          <View style={[s.jthumb, s.jthumbFallback]}><Ionicons name="image-outline" size={22} color={colors.textFaint} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.jname} numberOfLines={1}>{journey.name}</Text>
          <Text style={s.jsub} numberOfLines={1}>{[journey.place, fmtDate(journey.at)].filter(Boolean).join(" · ")}</Text>
          <View style={s.jstats}>
            <JStat icon="navigate-outline" value={fmtDist(journey.distance_km)} />
            <JStat icon="time-outline" value={fmtDur(journey.duration_sec)} />
            <JStat icon="bookmark-outline" value={`${discoveries.length}`} />
          </View>
        </View>
      </Pressable>

      {discoveries.length > 0 && (
        <View style={s.jdisc}>
          {discoveries.slice(0, 3).map((d) => (
            <View key={d.id} style={s.jdiscRow}>
              <Ionicons name="bookmark" size={12} color={colors.yellow} />
              <Text style={s.jdiscText} numberOfLines={1}>{d.title}</Text>
            </View>
          ))}
          {discoveries.length > 3 ? <Text style={s.jdiscMore}>+{discoveries.length - 3} more</Text> : null}
        </View>
      )}

      <View style={s.jactions}>
        <Pressable style={s.jShareBtn} onPress={onShare} testID={`journey-share-${journey.routeId}`} accessibilityRole="button" accessibilityLabel={`Share ${journey.name} recap`}>
          <Ionicons name="share-social-outline" size={16} color={colors.bg} />
          <Text style={s.jShareText}>Share recap</Text>
        </Pressable>
        <Pressable style={s.jRideBtn} onPress={onReride} accessibilityRole="button" accessibilityLabel={`Ride ${journey.name} again`}>
          <Ionicons name="bicycle" size={16} color={colors.yellow} />
          <Text style={s.jRideText}>Ride again</Text>
        </Pressable>
      </View>
    </View>
  );
}

function JStat({ icon, value }: { icon: any; value: string }) {
  return (
    <View style={s.jstat}>
      <Ionicons name={icon} size={13} color={colors.yellow} />
      <Text style={s.jstatText}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border },
  title: { color: colors.white, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: 12 },
  tab: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, minHeight: 40 },
  tabActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  tabText: { color: colors.textDim, fontSize: 13.5, fontWeight: "800" },
  tabTextActive: { color: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  section: { color: colors.yellow, fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginBottom: 4 },
  count: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center", maxWidth: 420, lineHeight: 22 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)" },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: "800", textAlign: "center" },
  exploreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 22, minHeight: 48, marginTop: 4 },
  exploreText: { color: colors.bg, fontSize: 14, fontWeight: "800" },

  // Journey recap card
  jcard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 14, maxWidth: 640, width: "100%", alignSelf: "center" },
  jtop: { flexDirection: "row", gap: 14, alignItems: "center" },
  jthumb: { width: 108, height: 72, borderRadius: radius.md, backgroundColor: "#0E1512" },
  jthumbFallback: { alignItems: "center", justifyContent: "center" },
  jname: { color: colors.white, fontSize: 17, fontWeight: "800" },
  jsub: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  jstats: { flexDirection: "row", gap: 14, marginTop: 8 },
  jstat: { flexDirection: "row", alignItems: "center", gap: 5 },
  jstatText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  jdisc: { marginTop: 12, gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  jdiscRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  jdiscText: { color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: "600", flex: 1 },
  jdiscMore: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  jactions: { flexDirection: "row", gap: 10, marginTop: 14 },
  jShareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 12, minHeight: 46 },
  jShareText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  jRideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 18, minHeight: 46, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,194,10,0.06)" },
  jRideText: { color: colors.yellow, fontSize: 14, fontWeight: "800" },

  // Discovery scrapbook tiles
  tile: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  tileImg: { width: "100%", aspectRatio: 1, backgroundColor: "#0E1512" },
  tileFallback: { alignItems: "center", justifyContent: "center" },
  tileOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(5,6,10,0.68)" },
  tileTitle: { color: colors.white, fontSize: 13, fontWeight: "800" },
  tileMeta: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 1 },
});
