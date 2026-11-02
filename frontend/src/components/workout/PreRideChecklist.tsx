/**
 * Pre-ride checklist shown the first time a workout opens with a trainer
 * connected (or when ERG mode is active). Surfaces the setup tips that
 * prevent common frustration: trainer pairing mode, gearing, calibration.
 *
 * Remembers dismissal for 7 days so it doesn't nag every ride.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radius, spacing } from "@/src/theme";
import type { IoniconName } from "@/src/lib/icon-types";

const DISMISS_KEY = "roujaune:preride:dismissed";
const DISMISS_DAYS = 7;

type Tip = { icon: IoniconName; title: string; body: string };

const SETUP_TIPS: Tip[] = [
  {
    icon: "bluetooth",
    title: "Trainer Pairing",
    body: "Ensure your smart trainer is connected as 'Controllable' (FE-C or Bluetooth FTMS). If it's only paired as a power meter, ERG mode won't engage.",
  },
  {
    icon: "cog-outline",
    title: "Optimal Gearing",
    body: "In ERG mode you don\u2019t need to shift. Park your chain in the small front ring and the middle of the rear cassette for a straight, quiet chainline.",
  },
  {
    icon: "speedometer-outline",
    title: "Warm-Up & Calibration",
    body: "Warm up the trainer for 10 minutes, then perform a spindown calibration to ensure accurate power reporting.",
  },
];

const MID_RIDE_TIPS: Tip[] = [
  {
    icon: "lock-closed-outline",
    title: "Trust the System",
    body: "Don't chase the target wattage. Hold a steady cadence and let the software adjust the resistance automatically.",
  },
  {
    icon: "arrow-up-circle-outline",
    title: "Interval Anticipation",
    body: "Spin your legs up 2–3 seconds before a hard interval begins. Hitting a high-wattage block with a fast cadence prevents the trainer from stalling your momentum.",
  },
  {
    icon: "flash-outline",
    title: "Breaking the Spiral",
    body: "If resistance becomes impossibly heavy, stand up and force a 3-second surge. The speed increase will force the software to release the brake.",
  },
  {
    icon: "analytics-outline",
    title: "Power Smoothing",
    body: "The power display shows a 3-second rolling average to filter natural pedal-stroke micro-fluctuations — the trainer IS holding your target.",
  },
];

export function PreRideChecklist({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) { setShow(false); return; }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISMISS_KEY);
        if (raw) {
          const ts = parseInt(raw, 10);
          if (Date.now() - ts < DISMISS_DAYS * 86400000) return; // still within grace
        }
      } catch { /* show it */ }
      setShow(true);
    })();
  }, [visible]);

  const dismiss = async () => {
    setShow(false);
    onDismiss();
    try { await AsyncStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* best effort */ }
  };

  if (!show) return null;

  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Header */}
          <View style={s.header}>
            <Ionicons name="checkmark-circle" size={22} color={colors.yellow} />
            <Text style={s.title}>Pre-Ride Checklist</Text>
          </View>
          <Text style={s.subtitle}>Quick checks before your ERG workout</Text>

          {/* Setup tips */}
          <Text style={s.sectionLabel}>SETUP</Text>
          {SETUP_TIPS.map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipIconWrap}>
                <Ionicons name={tip.icon as any} size={18} color={colors.yellow} />
              </View>
              <View style={s.tipBody}>
                <Text style={s.tipTitle}>{tip.title}</Text>
                <Text style={s.tipText}>{tip.body}</Text>
              </View>
            </View>
          ))}

          {/* Mid-ride tips */}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>DURING YOUR RIDE</Text>
          {MID_RIDE_TIPS.map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipIconWrap}>
                <Ionicons name={tip.icon as any} size={18} color={colors.green} />
              </View>
              <View style={s.tipBody}>
                <Text style={s.tipTitle}>{tip.title}</Text>
                <Text style={s.tipText}>{tip.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable onPress={dismiss} style={s.button} testID="preride-dismiss">
          <Ionicons name="bicycle" size={18} color={colors.bg} />
          <Text style={s.buttonText}>Got it — let&apos;s ride</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Retrieve a random mid-ride ERG tip text for contextual coaching. */
export function getErgCoachTip(kind: "trust" | "anticipate" | "spiral" | "smoothing" | "random"): string {
  if (kind === "trust") return MID_RIDE_TIPS[0].body;
  if (kind === "anticipate") return MID_RIDE_TIPS[1].body;
  if (kind === "spiral") return MID_RIDE_TIPS[2].body;
  if (kind === "smoothing") return MID_RIDE_TIPS[3].body;
  return MID_RIDE_TIPS[Math.floor(Math.random() * MID_RIDE_TIPS.length)].body;
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill as object,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 900,
  },
  card: {
    width: 480,
    maxWidth: "92%",
    maxHeight: "88%",
    backgroundColor: colors.cardElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  scroll: { paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.white, fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  subtitle: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: 4, marginBottom: 16 },
  sectionLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 10 },
  tipRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  tipIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  tipBody: { flex: 1 },
  tipTitle: { color: colors.white, fontSize: 14, fontWeight: "800", marginBottom: 3 },
  tipText: { color: colors.textDim, fontSize: 12.5, fontWeight: "500", lineHeight: 18 },
  button: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.yellow, borderRadius: radius.md,
    paddingVertical: 14, marginTop: 14,
  },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
});
