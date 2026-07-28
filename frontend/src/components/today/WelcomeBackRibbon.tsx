import React from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../../theme";
import { consumeRestoreNote, subscribeTodayMode, modeMeta, RiderExperience } from "../../lib/today-mode";
import { useReducedMotionSafe } from "../../lib/use-reduced-motion";

/** Subtle, one-time ribbon shown on the home screen when the app restores a
 *  non-training riding experience from the rider's saved preference (login /
 *  restart). Reinforces continuity for our 50+ riders. Auto-dismisses. */
export function WelcomeBackRibbon() {
  const [exp, setExp] = React.useState<RiderExperience | null>(null);
  const noMotion = useReducedMotionSafe();
  const anim = React.useRef(new Animated.Value(0)).current;

  // Restore hydration is async — try immediately, then on each store change,
  // until the one-time note is available (then it clears itself).
  React.useEffect(() => {
    const tryConsume = () => { const p = consumeRestoreNote(); if (p) setExp(p); };
    tryConsume();
    return subscribeTodayMode(tryConsume);
  }, []);

  const dismiss = React.useCallback(() => {
    if (noMotion) { setExp(null); return; }
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== "web" })
      .start(() => setExp(null));
  }, [anim, noMotion]);

  React.useEffect(() => {
    if (!exp) return;
    if (noMotion) anim.setValue(1);
    else Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== "web" }).start();
    const t = setTimeout(dismiss, 7000);
    return () => clearTimeout(t);
  }, [exp, noMotion, anim, dismiss]);

  if (!exp) return null;
  const meta = modeMeta(exp);
  return (
    <Animated.View
      testID="welcome-back-ribbon"
      style={[styles.ribbon, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={meta.icon} size={16} color={colors.yellow} />
      </View>
      <Text style={styles.text}>
        Welcome back — resuming your <Text style={styles.strong}>{meta.shortLabel}</Text>
      </Text>
      <Pressable testID="welcome-back-dismiss" onPress={dismiss} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={colors.textDim} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(245,179,1,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,179,1,0.35)",
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,179,1,0.14)",
  },
  text: { flex: 1, color: colors.white, fontSize: 14, fontWeight: "600" },
  strong: { color: colors.yellow, fontWeight: "800" },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
