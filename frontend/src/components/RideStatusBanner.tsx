import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { useEntitlement } from "@/src/lib/entitlement";

/**
 * Subtle, glanceable subscription status shown before a rider starts a ride:
 *   - Free:    "N free rides left" pill → taps through to Upgrade.
 *   - Premium: a quiet gold "Premium" badge.
 * Refreshes entitlement on mount so the count is always current.
 */
export function RideStatusBanner({ style, hidePremium }: { style?: any; hidePremium?: boolean }) {
  const router = useRouter();
  const ent = useEntitlement();

  React.useEffect(() => { ent.refresh(); /* eslint-disable-next-line */ }, []);

  if (!ent.loaded) return null;

  if (ent.premium) {
    if (hidePremium) return null;
    return (
      <Pressable onPress={() => router.push("/upgrade")} style={[s.premium, style]} testID="ride-status-premium" accessibilityRole="button" accessibilityLabel="You're a Premium member">
        <Ionicons name="star" size={14} color={colors.bg} />
        <Text style={s.premiumText}>Premium · unlimited rides</Text>
      </Pressable>
    );
  }

  const left = ent.freeRidesRemaining;
  const out = left <= 0;
  return (
    <Pressable onPress={() => router.push("/upgrade")} style={[s.free, out && s.freeOut, style]} testID="ride-status-free" accessibilityRole="button" accessibilityLabel={out ? "No free rides left, go Premium" : `${left} free rides left, upgrade to Premium`}>
      <Ionicons name={out ? "lock-closed" : "bicycle"} size={15} color={colors.yellow} />
      <Text style={s.freeText}>
        {out ? "Free rides used up" : `${left} free ride${left === 1 ? "" : "s"} left`}
      </Text>
      <View style={s.spacer} />
      <Text style={s.cta}>{out ? "Go Premium" : "Upgrade"}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  free: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: "rgba(255,194,10,0.07)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)",
    borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40,
  },
  freeOut: { backgroundColor: "rgba(224,30,43,0.08)", borderColor: "rgba(224,30,43,0.35)" },
  freeText: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  spacer: { flex: 1 },
  cta: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
  premium: {
    flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13, minHeight: 34,
  },
  premiumText: { color: colors.bg, fontSize: 12.5, fontWeight: "900" },
});
