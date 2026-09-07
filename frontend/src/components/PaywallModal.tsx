import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius } from "@/src/theme";
import { useStore, StoreProduct } from "@/src/hooks/useStore";
import { useEntitlement } from "@/src/lib/entitlement";

const BENEFITS = [
  "Unlimited rides — no 3-ride limit",
  "Full-length rides — no 30-minute cap",
  "Every scenic route & POV ride",
  "AI coach chat & post-ride debriefs",
  "Full multi-week training plans",
];

export function PaywallModal({ visible, onClose, reason }: { visible: boolean; onClose: () => void; reason?: string }) {
  const store = useStore();
  const { premium, refresh } = useEntitlement();
  const [selected, setSelected] = React.useState<string>("premium_yearly");
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Default-select the flagged default plan (yearly) once products load.
    const def = store.products.find((p) => p.isDefault) || store.products[0];
    if (def) setSelected(def.id);
  }, [store.products.length]);

  React.useEffect(() => { if (premium && visible) onClose(); }, [premium, visible]);

  const onSubscribe = async () => {
    setMsg(null);
    const res = await store.purchase(selected);
    if (!res.ok) setMsg(res.error || "Couldn't start the purchase.");
    else { await refresh(); }
  };

  const onRestore = async () => {
    setMsg(null);
    const res = await store.restore();
    await refresh();
    if (!res.ok) setMsg(res.error || "Couldn't restore purchases.");
    else if (!res.restored) setMsg("No previous purchases found for this account.");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card} testID="paywall-modal">
          <Pressable style={s.close} onPress={onClose} hitSlop={10} testID="paywall-close" accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
            <View style={s.crownWrap}>
              <LinearGradient colors={["#F2392E", "#F5B301", "#FFC418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.crown}>
                <Ionicons name="star" size={26} color={colors.bg} />
              </LinearGradient>
            </View>
            <Text style={s.title}>ROUJAUNE Premium</Text>
            <Text style={s.sub}>{reason || "Unlock the full ride — everything, unlimited."}</Text>

            <View style={s.benefits}>
              {BENEFITS.map((b) => (
                <View key={b} style={s.benefitRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
                  <Text style={s.benefitText}>{b}</Text>
                </View>
              ))}
            </View>

            {store.loading ? (
              <ActivityIndicator color={colors.yellow} style={{ marginVertical: 20 }} />
            ) : (
              <View style={s.plans}>
                {store.products.map((p) => (
                  <PlanCard key={p.id} product={p} selected={selected === p.id} onSelect={() => setSelected(p.id)} />
                ))}
              </View>
            )}

            {msg && <Text style={s.msg}>{msg}</Text>}

            <Pressable
              style={[s.subscribe, store.purchasing && { opacity: 0.6 }]}
              onPress={onSubscribe}
              disabled={store.purchasing}
              testID="paywall-subscribe"
              accessibilityRole="button"
              accessibilityLabel="Subscribe to Premium"
            >
              {store.purchasing
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={s.subscribeText}>{store.supported ? "Start Premium" : "Continue"}</Text>}
            </Pressable>

            {!store.supported && (
              <Text style={s.webNote}>
                {Platform.OS === "web"
                  ? "Premium is purchased in the ROUJAUNE iOS or Android app."
                  : "Purchases require a full app build (not available in Expo Go)."}
              </Text>
            )}

            <Pressable onPress={onRestore} style={s.restore} testID="paywall-restore" accessibilityRole="button" accessibilityLabel="Restore purchases">
              <Text style={s.restoreText}>Restore purchases</Text>
            </Pressable>

            <Text style={s.legal}>
              Subscriptions auto-renew until cancelled. Manage or cancel anytime in your {Platform.OS === "ios" ? "App Store" : Platform.OS === "android" ? "Google Play" : "app store"} account settings.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({ product, selected, onSelect }: { product: StoreProduct; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable style={[s.plan, selected && s.planOn]} onPress={onSelect} testID={`plan-${product.id}`} accessibilityRole="button" accessibilityState={{ selected }}>
      {product.isDefault && (
        <View style={s.badge}><Text style={s.badgeText}>BEST VALUE</Text></View>
      )}
      <View style={s.radio}>{selected && <View style={s.radioDot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.planTitle}>{product.period === "yearly" ? "Yearly" : "Monthly"}</Text>
        <Text style={s.planSub}>{product.period === "yearly" ? "Billed once a year" : "Billed monthly"}</Text>
      </View>
      <Text style={s.planPrice}>{product.price}</Text>
    </Pressable>
  );
}

const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,4,5,0.78)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 440, maxHeight: "92%", backgroundColor: "#0C0F0E", borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", overflow: "hidden" },
  close: { position: "absolute", top: 12, right: 12, zIndex: 5, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  crownWrap: { alignItems: "center", marginTop: 4 },
  crown: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  title: { color: colors.white, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 14 },
  sub: { color: colors.textDim, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },
  benefits: { marginTop: 20, gap: 11 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  benefitText: { color: colors.white, fontSize: 14.5, fontWeight: "600", flex: 1 },
  plans: { marginTop: 22, gap: 12 },
  plan: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.03)", padding: 16, minHeight: 64 },
  planOn: { borderColor: colors.yellow, backgroundColor: "rgba(255,194,10,0.08)" },
  badge: { position: "absolute", top: -9, right: 14, backgroundColor: colors.yellow, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { color: colors.bg, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.yellow },
  planTitle: { color: colors.white, fontSize: 16, fontWeight: "800" },
  planSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  planPrice: { color: colors.yellow, fontSize: 17, fontWeight: "900" },
  msg: { color: "#F0A24B", fontSize: 13, textAlign: "center", marginTop: 14, fontWeight: "600" },
  subscribe: { backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: 20, minHeight: 54 },
  subscribeText: { color: colors.bg, fontSize: 16, fontWeight: "900" },
  webNote: { color: colors.textDim, fontSize: 12.5, textAlign: "center", marginTop: 12, lineHeight: 18 },
  restore: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  restoreText: { color: colors.textDim, fontSize: 13.5, fontWeight: "700", textDecorationLine: "underline" },
  legal: { color: colors.textFaint, fontSize: 10.5, textAlign: "center", lineHeight: 15, marginTop: 4 },
});
