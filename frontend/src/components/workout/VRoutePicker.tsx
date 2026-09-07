import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { VIRTUAL_ROUTES } from "@/src/lib/vroutes";

export type VRoutePickerProps = {
  vRouteId: string;
  favRouteId: string | null;
  auto: boolean;
  workoutTypeName: string;
  onSelect: (id: string) => void;
  onAuto: () => void;
  onShuffle: () => void;
  onPin: (id: string) => void;
  onClose: () => void;
};

/** Route chooser for the Live Workout — pick scenic route, auto-match, shuffle,
 *  or pin a favourite route for the current workout type (persisted). */
export function VRoutePicker({ vRouteId, favRouteId, auto, workoutTypeName, onSelect, onAuto, onShuffle, onPin, onClose }: VRoutePickerProps) {
  return (
    <Pressable style={p.overlay} testID="vroute-picker-overlay" onPress={onClose}>
      <Pressable style={p.panel} onPress={(e) => e.stopPropagation()}>
        <View style={p.head}>
          <Text style={p.title}>Choose your route</Text>
          <Pressable testID="vroute-picker-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.white} /></Pressable>
        </View>
        <Text style={p.sub}>Pinned routes auto-load for your {workoutTypeName.toLowerCase()} workouts.</Text>

        <View style={p.actions}>
          <Pressable onPress={onAuto} style={[p.actionBtn, auto && p.actionOn]} testID="vroute-auto">
            <Ionicons name="sparkles-outline" size={15} color={auto ? colors.bg : colors.yellow} />
            <Text style={[p.actionText, auto && { color: colors.bg }]}>Auto-match</Text>
          </Pressable>
          <Pressable onPress={onShuffle} style={p.actionBtn} testID="vroute-shuffle">
            <Ionicons name="shuffle-outline" size={15} color={colors.yellow} />
            <Text style={p.actionText}>Shuffle</Text>
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          {VIRTUAL_ROUTES.map((rt) => {
            const sel = rt.id === vRouteId;
            const pinned = rt.id === favRouteId;
            return (
              <Pressable key={rt.id} onPress={() => onSelect(rt.id)} testID={`vroute-${rt.id}`} style={[p.opt, sel && p.optSel]}>
                <Image source={rt.backdrop} style={p.thumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={p.name} numberOfLines={1}>{rt.name}</Text>
                  <Text style={p.meta} numberOfLines={1}>{rt.place} · {rt.distanceKm} km · {rt.tag}</Text>
                </View>
                <Pressable
                  onPress={() => onPin(rt.id)}
                  hitSlop={10}
                  testID={`vroute-pin-${rt.id}`}
                  style={[p.pin, pinned && p.pinOn]}
                  accessibilityRole="button"
                  accessibilityLabel={pinned ? `Unpin ${rt.name}` : `Pin ${rt.name} as favourite`}
                >
                  <Ionicons name={pinned ? "star" : "star-outline"} size={18} color={pinned ? colors.bg : colors.textFaint} />
                </Pressable>
                <Ionicons name={sel ? "checkmark-circle" : "chevron-forward"} size={20} color={sel ? colors.yellow : colors.textFaint} />
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const p = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg, zIndex: 50 },
  panel: { width: 560, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...(shadow.card as any) },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  sub: { color: colors.textFaint, fontSize: 12, fontWeight: "600", marginTop: 4, marginBottom: spacing.md },
  actions: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.yellow + "88", backgroundColor: colors.yellow + "18" },
  actionOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  actionText: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 },
  optSel: { borderColor: colors.yellow, backgroundColor: colors.cardElevated },
  thumb: { width: 84, height: 52, borderRadius: radius.sm, backgroundColor: "#0d0f14" },
  name: { color: colors.white, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.textFaint, fontSize: 12, fontWeight: "600", marginTop: 2 },
  pin: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)" },
  pinOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
