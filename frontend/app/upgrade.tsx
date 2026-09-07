import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { AppScaffold, Card } from "@/src/components/app-scaffold";
import { colors, radius } from "@/src/theme";
import { PaywallModal } from "@/src/components/PaywallModal";
import { useEntitlement } from "@/src/lib/entitlement";

const BENEFITS = [
  { icon: "infinite", text: "Unlimited rides — no 3-ride limit" },
  { icon: "time", text: "Full-length rides — no 30-minute cap" },
  { icon: "map", text: "Every scenic route & POV ride" },
  { icon: "chatbubbles", text: "AI coach chat & post-ride debriefs" },
  { icon: "calendar", text: "Full multi-week training plans" },
];

export default function UpgradeScreen() {
  const ent = useEntitlement();
  const [showPaywall, setShowPaywall] = React.useState(false);

  React.useEffect(() => { ent.refresh(); /* eslint-disable-next-line */ }, []);

  const expires = ent.expiresAt ? new Date(ent.expiresAt).toLocaleDateString() : null;

  return (
    <AppScaffold active="settings" title="ROUJAUNE Premium" subtitle="Membership & billing.">
      <View style={s.wrap}>
        {ent.premium ? (
          <Card testID="premium-active">
            <View style={s.heroRow}>
              <LinearGradient colors={["#F2392E", "#F5B301", "#FFC418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.crown}>
                <Ionicons name="star" size={24} color={colors.bg} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={s.activeTitle}>You’re Premium</Text>
                <Text style={s.activeSub}>
                  {ent.plan === "yearly" ? "Yearly" : "Monthly"} plan{expires ? ` · renews ${expires}` : ""}
                </Text>
              </View>
            </View>
            <View style={s.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.text} style={s.benefitRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
                  <Text style={s.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>
            <Text style={s.manageNote}>Manage or cancel your subscription anytime in your App Store / Google Play account settings.</Text>
          </Card>
        ) : (
          <Card testID="premium-offer">
            <View style={s.heroRow}>
              <LinearGradient colors={["#F2392E", "#F5B301", "#FFC418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.crown}>
                <Ionicons name="star" size={24} color={colors.bg} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={s.activeTitle}>Unlock everything</Text>
                <Text style={s.activeSub}>
                  You’ve used {ent.freeRidesUsed} of {ent.freeRidesLimit} free rides.
                </Text>
              </View>
            </View>
            <View style={s.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.text} style={s.benefitRow}>
                  <View style={s.bIcon}><Ionicons name={b.icon as any} size={15} color={colors.yellow} /></View>
                  <Text style={s.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>
            <Pressable style={s.cta} onPress={() => setShowPaywall(true)} testID="upgrade-cta" accessibilityRole="button" accessibilityLabel="See Premium plans">
              <Ionicons name="star" size={17} color={colors.bg} />
              <Text style={s.ctaText}>See Premium plans</Text>
            </Pressable>
          </Card>
        )}
      </View>

      <PaywallModal visible={showPaywall} onClose={() => { setShowPaywall(false); ent.refresh(); }} />
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16, maxWidth: 640 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  crown: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  activeTitle: { color: colors.white, fontSize: 20, fontWeight: "900" },
  activeSub: { color: colors.textDim, fontSize: 13.5, marginTop: 3, fontWeight: "600" },
  benefits: { marginTop: 18, gap: 11 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  bIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.14)" },
  benefitText: { color: colors.white, fontSize: 14.5, fontWeight: "600", flex: 1 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 15, marginTop: 20, minHeight: 52 },
  ctaText: { color: colors.bg, fontSize: 15.5, fontWeight: "900" },
  manageNote: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 16 },
});
