import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useSavedDestinations } from "@/src/lib/scenic-routes";
import { DestinationCard } from "@/src/components/today/DestinationCard";

/** Saved Destinations — the rider's favourited scenic rides. Tapping the heart
 *  on any destination adds/removes it here. */
export default function SavedDestinationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { routes, loading } = useSavedDestinations();

  const open = (id: string) => router.push(`/scenic-ride?route=${id}` as any);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const cols = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const gap = 12;
  const cardW = cols === 1 ? undefined : Math.floor((Math.min(width, 1200) - 2 * spacing.lg - gap * (cols - 1)) / cols);

  return (
    <View style={s.root} testID="saved-destinations">
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Pressable onPress={leave} testID="saved-back" style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={s.title}>Saved Destinations</Text>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={colors.yellow} /><Text style={s.centerText}>Loading your saved rides…</Text></View>
        ) : !routes || routes.length === 0 ? (
          <View style={s.center} testID="saved-empty">
            <View style={s.emptyIcon}><Ionicons name="heart-outline" size={30} color={colors.yellow} /></View>
            <Text style={s.emptyTitle}>No saved destinations yet</Text>
            <Text style={s.centerText}>Tap the heart on any scenic ride to save it here for quick access.</Text>
            <Pressable testID="saved-explore" onPress={() => router.push("/scenic-destinations" as any)} style={s.exploreBtn} accessibilityRole="button">
              <Ionicons name="compass-outline" size={16} color={colors.bg} />
              <Text style={s.exploreText}>Explore destinations</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            <Text style={s.count}>{routes.length} saved {routes.length === 1 ? "ride" : "rides"}</Text>
            <View style={[s.grid, { gap }]}>
              {routes.map((r) => (
                <DestinationCard key={r.id} route={r} width={cardW} onPress={() => open(r.id)} />
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border },
  title: { color: colors.white, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  count: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center", maxWidth: 420, lineHeight: 22 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)" },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: "800", textAlign: "center" },
  exploreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 22, minHeight: 48, marginTop: 4 },
  exploreText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
});
