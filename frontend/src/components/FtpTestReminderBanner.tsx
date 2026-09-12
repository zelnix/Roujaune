import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors, radius, spacing } from "../theme";
import { FtpTestReminder } from "../lib/home-notices";

/**
 * Coach nudge shown the morning of a booked FTP re-test (scheduled via chat,
 * "hey coach, schedule an FTP test"). Structured-plan benchmark weeks already
 * get their own reminder; this covers the ad-hoc chat-booked case that had none.
 */
export function FtpTestReminderBanner({ reminder }: { reminder: FtpTestReminder }) {
  const router = useRouter();
  if (!reminder.available) return null;

  return (
    <Pressable
      testID="ftp-test-reminder-banner"
      onPress={() => router.push("/plan")}
      accessibilityRole="button"
      accessibilityLabel="FTP re-test today. Warm up well, then go steady-hard."
      style={({ hovered }: any) => [styles.wrap, hovered && styles.wrapHover]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="speedometer" size={20} color={colors.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{reminder.title || "FTP re-test today"}</Text>
        <Text style={styles.sub} numberOfLines={2}>Warm up well, then go steady-hard for the full effort. We&apos;ll recalibrate your zones right after.</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.yellow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255,194,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,194,10,0.5)",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  wrapHover: { borderColor: "rgba(255,194,10,0.8)" },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.yellow, borderColor: colors.yellow, borderWidth: 1,
  },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 1, lineHeight: 17 },
});
