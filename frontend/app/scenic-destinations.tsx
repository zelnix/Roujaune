import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useScenicRoutes, ScenicRoute } from "@/src/lib/scenic-routes";
import { DestinationCard, regionIcon } from "@/src/components/today/DestinationCard";
import { RideStatusBanner } from "@/src/components/RideStatusBanner";

const REGION_ORDER = ["Alps", "Lakes", "Safari", "Countryside"];

/** Explore Destinations — the full scenic catalogue with a lightweight search
 *  (name / place / country) and a region filter, so riders can quickly find a
 *  ride that matches their mood. Opens the scenic player. */
export default function ScenicDestinationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { routes, loading } = useScenicRoutes();
  const [query, setQuery] = React.useState("");
  const [region, setRegion] = React.useState("All");

  const open = (id: string) => router.push(`/scenic-ride?route=${id}` as any);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const present = Array.from(new Set((routes ?? []).map((r) => r.region).filter(Boolean))) as string[];
  const regions = [
    ...REGION_ORDER.filter((r) => present.includes(r)),
    ...present.filter((r) => !REGION_ORDER.includes(r)).sort(),
  ];

  const q = query.trim().toLowerCase();
  const results = (routes ?? []).filter((r) => {
    if (region !== "All" && r.region !== region) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      (r.place || "").toLowerCase().includes(q) ||
      (r.country || "").toLowerCase().includes(q) ||
      (r.tag || "").toLowerCase().includes(q)
    );
  });

  // Responsive columns: phones 1, tablets 2–3.
  const cols = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const gap = 12;
  const cardW = cols === 1 ? undefined : Math.floor((Math.min(width, 1200) - 2 * spacing.lg - gap * (cols - 1)) / cols);

  return (
    <View style={styles.root} testID="scenic-destinations">
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={leave} testID="destinations-back" style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Explore Destinations</Text>
          <Pressable
            testID="surprise-me"
            onPress={() => {
              if (!routes || routes.length === 0) return;
              const pick = routes[Math.floor(Math.random() * routes.length)];
              open(pick.id);
            }}
            style={styles.surpriseBtn}
            accessibilityRole="button"
            accessibilityLabel="Surprise me with a random scenic ride"
            hitSlop={8}
          >
            <Ionicons name="shuffle" size={16} color={colors.yellow} />
            <Text style={styles.surpriseText}>Surprise me</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textDim} />
          <TextInput
            testID="scenic-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, place or country"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search scenic destinations"
          />
          {query.length > 0 && (
            <Pressable testID="scenic-search-clear" onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </Pressable>
          )}
        </View>

        <RideStatusBanner style={styles.statusBanner} />

        {/* Region filter */}
        {regions.length > 0 && (
          <View style={styles.filterBand}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filterRow} testID="destinations-region-filter">
              {["All", ...regions].map((r) => {
                const sel = region === r;
                return (
                  <Pressable key={r} testID={`destinations-region-${r}`} onPress={() => setRegion(r)}
                    accessibilityRole="button" accessibilityState={{ selected: sel }}
                    style={[styles.chip, sel && styles.chipSel]}>
                    <Ionicons name={regionIcon(r)} size={14} color={sel ? colors.bg : colors.yellow} />
                    <Text style={[styles.chipText, sel && styles.chipTextSel]}>{r}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.yellow} /><Text style={styles.centerText}>Loading destinations…</Text></View>
        ) : results.length === 0 ? (
          <View style={styles.center} testID="destinations-empty">
            <Ionicons name="search-outline" size={34} color={colors.textFaint} />
            <Text style={styles.centerText}>No rides match “{query}”.</Text>
            <Pressable onPress={() => { setQuery(""); setRegion("All"); }} style={styles.resetBtn} accessibilityRole="button">
              <Text style={styles.resetText}>Clear filters</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={styles.results} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.count}>{results.length} {results.length === 1 ? "ride" : "rides"}</Text>
            <View style={[styles.grid, { gap }]}>
              {results.map((r) => (
                <DestinationCard key={r.id} route={r} width={cardW} onPress={() => open(r.id)} />
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border },
  title: { color: colors.white, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  surpriseBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" as any, borderWidth: 1, borderColor: "rgba(245,179,1,0.4)", borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, minHeight: 44, backgroundColor: "rgba(245,179,1,0.1)" },
  surpriseText: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: spacing.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 48 },
  searchInput: { flex: 1, color: colors.white, fontSize: 15, paddingVertical: 12 },

  filterBand: { flexGrow: 0, flexShrink: 0 },
  statusBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,179,1,0.10)", borderWidth: 1, borderColor: "rgba(245,179,1,0.30)", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40 },
  chipSel: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  chipText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  chipTextSel: { color: colors.bg, fontWeight: "800" },

  results: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  count: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center" },
  resetBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  resetText: { color: colors.white, fontSize: 14, fontWeight: "700" },
});
