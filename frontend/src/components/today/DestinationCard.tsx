import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../../theme";
import { ScenicRoute, ytThumb, useScenicFavourites } from "../../lib/scenic-routes";

export function regionIcon(region: string): any {
  switch (region) {
    case "Alps": return "triangle-outline";
    case "Lakes": return "water-outline";
    case "Safari": return "paw-outline";
    case "Countryside": return "leaf-outline";
    default: return "sparkles-outline";
  }
}

/** A scenic destination card with a favourite (Saved Destinations) heart.
 *  Shared by Explore Destinations and the Saved Destinations screen. */
export function DestinationCard({ route, width, onPress }: { route: ScenicRoute; width?: number; onPress: () => void }) {
  const fav = useScenicFavourites();
  const saved = fav.has(route.id);
  return (
    <View style={[styles.outer, width ? { width } : { alignSelf: "stretch" }]}>
      <Pressable
        testID={`destination-card-${route.id}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${route.name}, ${route.place}${route.duration_min ? `, ${route.duration_min} minutes` : ""}`}
        style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}
      >
        <View style={styles.thumb}>
          <Image source={{ uri: route.thumbnail || ytThumb(route.youtube_id) }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          {!!route.region && (
            <View style={styles.regionBadge}>
              <Ionicons name={regionIcon(route.region)} size={11} color={colors.bg} />
              <Text style={styles.regionBadgeText}>{route.region}</Text>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{route.name}</Text>
          <Text style={styles.place} numberOfLines={1}>{route.place}{route.country ? ` · ${route.country}` : ""}</Text>
          <View style={styles.meta}>
            {route.duration_min ? <Meta icon="time-outline" label={`${route.duration_min}m`} /> : null}
            {route.distance_km ? <Meta icon="navigate-outline" label={`${route.distance_km}km`} /> : null}
            <View style={styles.tagPill}><Text style={styles.tagPillText}>{route.tag}</Text></View>
          </View>
        </View>
      </Pressable>
      {/* Heart is a sibling of the card button (not nested) to avoid a
          <button> inside <button> on web. */}
      <Pressable
        testID={`fav-toggle-${route.id}`}
        onPress={() => fav.toggle(route.id)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? `Remove ${route.name} from saved` : `Save ${route.name}`}
        style={styles.heart}
      >
        <Ionicons name={saved ? "heart" : "heart-outline"} size={18} color={saved ? colors.red : "#fff"} />
      </Pressable>
    </View>
  );
}

function Meta({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={12} color={colors.textFaint} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: "relative" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardHover: { borderColor: "rgba(255,255,255,0.24)" },
  thumb: { height: 150, backgroundColor: "rgba(255,255,255,0.05)" },
  regionBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  regionBadgeText: { color: colors.bg, fontSize: 10.5, fontWeight: "800" },
  heart: { position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  body: { padding: 12, gap: 3 },
  title: { color: colors.white, fontSize: 15.5, fontWeight: "800" },
  place: { color: colors.yellow, fontSize: 12.5, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.textDim, fontSize: 12 },
  tagPill: { backgroundColor: "rgba(245,179,1,0.14)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  tagPillText: { color: colors.yellow, fontSize: 10.5, fontWeight: "700" },
});
