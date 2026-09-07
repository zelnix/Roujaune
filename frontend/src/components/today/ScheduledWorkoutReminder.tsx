import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius } from "../../theme";

/** Calm, non-judgemental confirmation shown when the rider picks a non-training
 *  activity — reassures them their plan is safe. Never a warning. */
export function ScheduledWorkoutReminder() {
  return (
    <View style={styles.wrap} testID="scheduled-workout-reminder" accessibilityRole="summary">
      <Ionicons name="bookmark" size={16} color={colors.yellow} />
      <Text style={styles.text}>
        Your planned workout will remain on your calendar. You can return to it whenever you’re ready.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(245,179,1,0.08)", borderWidth: 1, borderColor: "rgba(245,179,1,0.28)",
    borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14,
  },
  text: { color: colors.textDim, fontSize: 12.5, flex: 1, lineHeight: 17 },
});
