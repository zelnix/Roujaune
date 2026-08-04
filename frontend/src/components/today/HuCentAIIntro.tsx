import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { useCoach } from "@/src/lib/coach-persona";

const KEY = "hucentai_intro_seen";

/** One-time, dismissible explainer of the "HuCentAI" companion concept.
 *  Shown on the Today screen the first time the rider opens the app. */
export function HuCentAIIntro() {
  const persona = useCoach();
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY).then((v) => { if (alive && !v) setShow(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const dismiss = React.useCallback(() => {
    setShow(false);
    AsyncStorage.setItem(KEY, "1").catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <View style={s.wrap} testID="hucentai-intro">
      <View style={s.iconWrap}>
        <Ionicons name="sparkles" size={20} color={colors.bg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>Meet {persona.name}, your HuCentAI Companion</Text>
        <Text style={s.body}>
          HuCentAI — <Text style={s.em}>Human-Centred Artificial Intelligence</Text> (say “Hyoo-cent-eye”). Guidance built around you: your pace, your goals, your ride.
        </Text>
      </View>
      <Pressable style={s.cta} onPress={dismiss} testID="hucentai-intro-dismiss" accessibilityRole="button" accessibilityLabel="Got it">
        <Text style={s.ctaText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "rgba(245,179,1,0.08)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: "rgba(245,179,1,0.35)", padding: 16,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellow },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  body: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  em: { color: colors.yellow, fontWeight: "700" },
  cta: {
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999,
    backgroundColor: colors.yellow, minHeight: 44, alignItems: "center", justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } as any : null),
  },
  ctaText: { color: colors.bg, fontSize: 13.5, fontWeight: "800" },
});
