import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { RideRouteMap, RouteMapPoint } from "@/src/components/RideRouteMap";
import { ConfettiBurst } from "@/src/components/ConfettiBurst";
import { clock } from "./hud-widgets";

type Props = {
  routeId: string;
  routeName: string;
  routePlace?: string;
  elapsed: number;
  km: string;
  savedCount: number;
  discoveries: RouteMapPoint[];
  caption: string;
  cardWidth: number;
  mapWidth: number;
  onShare: () => void;
  onHome: () => void;
};

/** End-of-ride landscape recap: stats, animated route map, celebration + CTAs. */
export function RideCompleteOverlay({
  routeId, routeName, routePlace, elapsed, km, savedCount,
  discoveries, caption, cardWidth, mapWidth, onShare, onHome,
}: Props) {
  return (
    <View style={s.completeWrap} testID="ride-complete">
      <View style={[s.recapCard, { width: cardWidth }]}>
        <View style={s.recapHeader}>
          <View style={s.completeIcon}><Ionicons name="checkmark" size={26} color={colors.bg} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.recapTitle}>Ride Complete!</Text>
            <Text style={s.recapSub} numberOfLines={1}>{routeName}{routePlace ? ` · ${routePlace}` : ""}</Text>
          </View>
          <View style={s.recapStatsRow}>
            <View style={s.cStat}><Text style={s.cStatVal}>{clock(elapsed)}</Text><Text style={s.cStatLbl}>TIME</Text></View>
            <View style={s.cStatDivider} />
            <View style={s.cStat}><Text style={s.cStatVal}>{km}</Text><Text style={s.cStatLbl}>KM</Text></View>
            <View style={s.cStatDivider} />
            <View style={s.cStat}><Text style={s.cStatVal}>{savedCount}</Text><Text style={s.cStatLbl}>SAVED</Text></View>
          </View>
        </View>

        <View style={s.mapWrap}>
          <RideRouteMap width={mapWidth} height={182} seed={routeId} points={discoveries} />
        </View>

        <View style={s.recapFooter}>
          <View style={{ flex: 1, minWidth: 180 }}>
            {savedCount >= 3 ? (
              <View style={s.explorerBadge} testID="explorer-badge">
                <Ionicons name="sparkles" size={15} color={colors.bg} />
                <Text style={s.explorerText}>Great explorer! {savedCount} discoveries this ride</Text>
              </View>
            ) : savedCount > 0 ? (
              <Text style={s.completeNote}>{savedCount} discover{savedCount === 1 ? "y" : "ies"} saved to your scrapbook.</Text>
            ) : (
              <Text style={s.completeNote}>Tip: bookmark points of interest next time to build your scrapbook.</Text>
            )}
            <Text style={s.recapCaption} numberOfLines={2}>&ldquo;{caption}&rdquo;</Text>
          </View>
          <View style={s.recapCtas}>
            <Pressable style={[s.dialogBtn, s.completePrimary]} testID="complete-journeys" onPress={onShare} accessibilityRole="button" accessibilityLabel="View and share my journey">
              <Ionicons name="share-social" size={17} color={colors.bg} />
              <Text style={s.completePrimaryText}>View &amp; share</Text>
            </Pressable>
            <Pressable style={[s.dialogBtn, s.dialogGhost]} testID="complete-home" onPress={onHome} accessibilityRole="button" accessibilityLabel="Back home">
              <Text style={[s.dialogBtnText, { color: colors.white }]}>Back home</Text>
            </Pressable>
          </View>
        </View>
        {savedCount >= 3 && <ConfettiBurst width={cardWidth} height={360} count={36} originY={26} />}
      </View>
    </View>
  );
}

const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  completeWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,5,6,0.85)", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 16 },
  recapCard: { maxWidth: 820, backgroundColor: "#0B120F", borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,194,10,0.35)", padding: 18 },
  recapHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  recapTitle: { color: colors.white, fontSize: 22, fontWeight: "900" },
  recapSub: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: 2 },
  recapStatsRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.lg, borderWidth: 1, borderColor: BORDER, paddingVertical: 8, paddingHorizontal: 6 },
  mapWrap: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,194,10,0.22)" },
  recapFooter: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14, flexWrap: "wrap" },
  recapCaption: { color: colors.white, fontSize: 12.5, fontStyle: "italic", fontWeight: "600", opacity: 0.9, marginTop: 8, lineHeight: 18 },
  recapCtas: { flexDirection: "row", alignItems: "center", gap: 10 },
  completeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  cStat: { alignItems: "center", paddingHorizontal: 12 },
  cStatVal: { color: colors.yellow, fontSize: 17, fontWeight: "900" },
  cStatLbl: { color: colors.white, fontSize: 9, fontWeight: "700", marginTop: 2, opacity: 0.8, letterSpacing: 1 },
  cStatDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.14)" },
  explorerBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, alignSelf: "flex-start", backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  explorerText: { color: colors.bg, fontSize: 13, fontWeight: "900" },
  completeNote: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  dialogBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 14, minHeight: 50 },
  completePrimary: { backgroundColor: colors.yellow, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  completePrimaryText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  dialogGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: BORDER },
  dialogBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
