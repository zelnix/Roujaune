import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polygon } from "react-native-svg";
import { C } from "./plan";
import { CoachPersona } from "../lib/coach-persona";
import type { CelebrationData } from "../lib/phase-complete";
import { useReducedMotionSafe } from "../lib/use-reduced-motion";

function Sparkle({ style, delay }: { style?: any; delay: number }) {
  const a = React.useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotionSafe();
  React.useEffect(() => {
    if (reduceMotion) { a.setValue(0.9); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, delay, reduceMotion]);
  return (
    <Animated.View style={[{ position: "absolute", opacity: a, transform: [{ scale: a }] }, style]}>
      <Ionicons name="sparkles" size={16} color={C.yellow} />
    </Animated.View>
  );
}

/** Celebration modal shown once when a rider finishes a plan phase.
 * Renders the authored badge heading, achievement summary and the coach's
 * personal message. */
export function PhaseCelebrationModal({
  visible, celebration, persona, onClose, onChat, onShare,
}: {
  visible: boolean;
  celebration: CelebrationData | null;
  persona: CoachPersona;
  onClose: () => void;
  onChat?: (c: CelebrationData) => void;
  onShare?: (c: CelebrationData) => void;
}) {
  const pop = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (visible) {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    }
  }, [visible, pop]);

  if (!celebration) return null;
  const { number, name, weeks, complete, isPlanEnd, endMessage } = celebration;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          {/* Badge header */}
          <LinearGradient colors={["rgba(255,194,10,0.18)", "rgba(20,22,21,0)"]} style={s.headerGlow} />
          <Sparkle delay={0} style={{ top: 20, left: 34 }} />
          <Sparkle delay={300} style={{ top: 44, right: 42 }} />
          <Sparkle delay={600} style={{ top: 96, left: 60 }} />
          <Sparkle delay={450} style={{ top: 80, right: 70 }} />

          <Animated.View style={[s.badge, { transform: [{ scale }] }]}>
            <Svg width={116} height={116} viewBox="0 0 116 116">
              <Circle cx={58} cy={58} r={54} fill="#241B00" stroke={C.yellow} strokeWidth={3} />
              <Circle cx={58} cy={58} r={44} fill="none" stroke="rgba(255,194,10,0.35)" strokeWidth={1.5} />
              {!isPlanEnd ? (
                <Polygon points="58,26 66,50 92,50 71,66 79,92 58,76 37,92 45,66 24,50 50,50" fill={C.yellow} opacity={0.95} />
              ) : null}
            </Svg>
            <View style={s.badgeNumberWrap}>
              {isPlanEnd ? (
                <Ionicons name="trophy" size={46} color={C.yellow} />
              ) : (
                <Text style={s.badgeNumber}>{number}</Text>
              )}
            </View>
          </Animated.View>

          <Text style={s.kicker}>{isPlanEnd ? "PROGRAMME COMPLETE" : `PHASE ${number} COMPLETE`}</Text>
          <Text style={s.heading}>{isPlanEnd ? `You Completed ${name}` : complete.heading}</Text>
          <Text style={s.weeks}>{isPlanEnd ? `${weeks} · Your strongest ride is your own` : `${name} · ${weeks}`}</Text>

          <ScrollView style={{ maxHeight: 280, alignSelf: "stretch" }} contentContainerStyle={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
            <View style={s.summaryBox}>
              {complete.summary.map((line, i) => (
                <View key={i} style={s.summaryRow}>
                  <Ionicons name="checkmark-circle" size={16} color={C.green} style={{ marginTop: 1 }} />
                  <Text style={s.summaryText}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={s.coachCard}>
              <View style={s.coachHead}>
                <Image source={persona.image} style={s.coachAvatar} contentFit="cover" contentPosition="top center" />
                <View style={{ flex: 1 }}>
                  <Text style={s.coachName}>{persona.name}</Text>
                  <Text style={s.coachRole}>Your Companion Coach</Text>
                </View>
                <Ionicons name="chatbubble-ellipses" size={16} color={C.yellow} />
              </View>
              <Text style={s.coachMessage}>{isPlanEnd && endMessage ? endMessage : complete.coachMessage}</Text>
            </View>
          </ScrollView>

          <View style={s.actionRow}>
            <Pressable
              testID="phase-celebration-continue"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={isPlanEnd ? "Finish" : "Continue"}
              style={({ hovered, pressed }: any) => [s.continueBtn, { flex: 1 }, hovered && { opacity: 0.92 }, pressed && { opacity: 0.8 }]}
            >
              <Text style={s.continueText}>{isPlanEnd ? "Celebrate" : "Continue"}</Text>
              <Ionicons name={isPlanEnd ? "sparkles" : "arrow-forward"} size={17} color="#241B00" />
            </Pressable>
            {onShare ? (
              <Pressable
                testID="phase-celebration-share"
                onPress={() => onShare(celebration)}
                accessibilityRole="button"
                accessibilityLabel="Share your achievement card"
                style={({ hovered, pressed }: any) => [s.shareBtn, hovered && s.chatBtnHover, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="share-social" size={17} color={C.yellow} />
                <Text style={s.shareBtnText}>Share</Text>
              </Pressable>
            ) : null}
          </View>

          {onChat ? (
            <Pressable
              testID="phase-celebration-chat"
              onPress={() => onChat(celebration)}
              accessibilityRole="button"
              accessibilityLabel={`Talk to ${persona.name} about this phase`}
              style={({ hovered, pressed }: any) => [s.chatBtn, hovered && s.chatBtnHover, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="chatbubble-ellipses" size={15} color={C.yellow} />
              <Text style={s.chatBtnText}>Talk to {persona.name} about this phase</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,7,7,0.82)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: {
    width: "100%", maxWidth: 560, backgroundColor: "#141615", borderRadius: 24, borderWidth: 1,
    borderColor: "rgba(255,194,10,0.35)", paddingTop: 30, paddingBottom: 22, alignItems: "center", overflow: "hidden",
  },
  headerGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 200 },
  badge: { alignItems: "center", justifyContent: "center", marginBottom: 14 },
  badgeNumberWrap: { position: "absolute", alignItems: "center", justifyContent: "center", width: 116, height: 116 },
  badgeNumber: { color: "#241B00", fontSize: 30, fontWeight: "900" },
  kicker: { color: C.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  heading: { color: C.white, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 8, paddingHorizontal: 26 },
  weeks: { color: C.dim, fontSize: 13, fontWeight: "600", marginTop: 6, marginBottom: 16 },
  summaryBox: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 9 },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  summaryText: { color: "#D7D8D5", fontSize: 13, lineHeight: 18, flex: 1 },
  coachCard: { backgroundColor: "rgba(255,194,10,0.06)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,194,10,0.28)", padding: 14, marginTop: 12, marginBottom: 6 },
  coachHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  coachAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)" },
  coachName: { color: C.white, fontSize: 14, fontWeight: "800" },
  coachRole: { color: C.dim, fontSize: 11, fontWeight: "600" },
  coachMessage: { color: "#E7E8E5", fontSize: 13.5, lineHeight: 20, fontStyle: "italic" },
  continueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.yellow,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40, minHeight: 48, alignSelf: "center",
  },
  continueText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, alignSelf: "stretch", paddingHorizontal: 24 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 14, minHeight: 48, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,194,10,0.06)" },
  shareBtnText: { color: C.yellow, fontSize: 15, fontWeight: "800" },
  chatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, minHeight: 40, alignSelf: "center", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", backgroundColor: "rgba(255,194,10,0.06)" },
  chatBtnHover: { borderColor: "rgba(255,194,10,0.55)", backgroundColor: "rgba(255,194,10,0.1)" },
  chatBtnText: { color: C.yellow, fontSize: 13, fontWeight: "700" },
});
