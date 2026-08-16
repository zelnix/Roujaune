import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useEntitlement } from "@/src/lib/entitlement";

/** Soft, dismissible nudge shown a few days before a gifted / admin-granted
 * Premium month runs out, inviting the rider to keep Premium (→ /upgrade).
 * Only appears when the backend flags `expiringSoon` (non-renewing access). */
export function usePremiumExpiry() {
  const ent = useEntitlement();
  return {
    show: ent.expiringSoon,
    daysLeft: ent.daysLeft ?? 0,
    gifted: ent.source === "admin_gift",
  };
}

export function PremiumExpiryBanner() {
  const { show, daysLeft, gifted } = usePremiumExpiry();
  const [dismissed, setDismissed] = React.useState(false);
  if (!show || dismissed) return null;

  const when =
    daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  const sub = gifted
    ? `Your gifted Premium month ends ${when}. Keep everything unlocked.`
    : `Your Premium ends ${when}. Renew to stay Premium.`;

  return (
    <View style={styles.wrap} testID="premium-expiry-banner">
      <View style={styles.iconWrap}>
        <Ionicons name="time-outline" size={18} color={colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Premium ending {when}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Pressable
        onPress={() => router.push("/upgrade")}
        style={styles.btn}
        testID="premium-expiry-cta"
        accessibilityRole="button"
        accessibilityLabel="Keep Premium"
      >
        <Text style={styles.btnText}>Keep Premium</Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        style={styles.close}
        hitSlop={8}
        testID="premium-expiry-dismiss"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.35)",
    borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: spacing.md,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.12)" },
  title: { color: colors.white, fontSize: 14, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  btn: { backgroundColor: colors.yellow, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#241B00", fontSize: 13, fontWeight: "800" },
  close: { padding: 4 },
});
