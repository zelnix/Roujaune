import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { modeMeta, RiderExperience } from "@/src/lib/today-mode";
import { PREVIEW } from "@/src/components/today/FutureActivityTodayView";
import { ExperienceHero } from "@/src/components/today/ExperienceHero";
import { useModeInterest } from "@/src/lib/mode-interest";

/** Friendly teaser landing for a roadmap ("coming soon") activity: a single
 *  hero with what's coming, plus a "Notify me when this launches" action so a
 *  tap feels intentional and gives us a demand signal for what to build next. */
export default function ComingSoonScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { height } = useWindowDimensions();
  const compact = height < 560;
  const interest = useModeInterest();
  const id = (mode || "gravel") as RiderExperience;
  const meta = modeMeta(id);
  const p = PREVIEW[id] ?? { heading: "COMING SOON", blurb: "This experience is on the Roujaune roadmap.", bullets: [] };
  const notified = interest.has(id);

  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  return (
    <View style={s.root} testID={`coming-soon-${id}`}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Pressable onPress={leave} testID="coming-soon-back" style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <ExperienceHero compact={compact} descriptor={`${meta.description}.`} minHeight={600} testID={`coming-soon-hero-${id}`}>
            <View style={s.hero}>
              <View style={s.iconWrap}>
                <Ionicons name={meta.icon} size={40} color={colors.yellow} />
              </View>
              <View style={s.soonPill}><Text style={s.soonPillText}>COMING SOON</Text></View>
              <Text style={s.heading}>{p.heading}</Text>
              <Text style={s.blurb}>{p.blurb}</Text>

              {p.bullets.length > 0 && (
                <View style={s.bullets}>
                  {p.bullets.map((b) => (
                    <View key={b} style={s.bulletRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.yellow} />
                      <Text style={s.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}

              {notified ? (
                <View style={s.notified} testID="coming-soon-notified">
                  <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
                  <Text style={s.notifiedText}>We’ll let you know when {meta.shortLabel} launches</Text>
                </View>
              ) : (
                <Pressable
                  testID="coming-soon-notify"
                  onPress={() => interest.register(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Notify me when ${meta.shortLabel} launches`}
                  style={({ pressed }) => [s.notifyBtn, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="notifications-outline" size={18} color="#fff" />
                  <Text style={s.notifyText}>Notify me when this launches</Text>
                </Pressable>
              )}

              {notified && (
                <Pressable testID="coming-soon-undo" onPress={() => interest.unregister(id)} style={s.undo} accessibilityRole="button">
                  <Text style={s.undoText}>Undo</Text>
                </Pressable>
              )}

              <Text style={s.footnote}>Your interest helps us decide what to build next for riders like you.</Text>
            </View>
          </ExperienceHero>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  hero: { width: "100%", maxWidth: 620, alignSelf: "center", backgroundColor: "rgba(10,14,12,0.68)", borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 30, alignItems: "center", gap: 14 },
  iconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.10)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)" },
  soonPill: { borderWidth: 1, borderColor: "rgba(245,179,1,0.45)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  soonPillText: { color: colors.yellow, fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
  heading: { color: colors.white, fontSize: 24, fontWeight: "900", textAlign: "center", letterSpacing: 0.3 },
  blurb: { color: colors.textDim, fontSize: 15, textAlign: "center", lineHeight: 22, maxWidth: 520 },
  bullets: { gap: 10, marginTop: 4, alignSelf: "stretch", maxWidth: 440, alignItems: "flex-start", marginHorizontal: "auto" as any },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletText: { color: colors.text, fontSize: 14.5 },

  notifyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 28, minHeight: 52, alignSelf: "stretch", maxWidth: 380 },
  notifyText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.4 },
  notified: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.4)", borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 22 },
  notifiedText: { color: colors.white, fontSize: 14, fontWeight: "700", textAlign: "center" },
  undo: { minHeight: 40, justifyContent: "center" },
  undoText: { color: colors.textDim, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  footnote: { color: colors.textFaint, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 4, maxWidth: 420 },
});
