import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { metrics } from "../data";
import { ReadinessScale } from "./ui";

export function MetricSummaryStrip() {
  return (
    <View style={styles.strip} testID="metric-summary-strip">
      {metrics.map((m, i) => (
        <View key={m.key} style={styles.cell}>
          {i > 0 && <View style={styles.divider} />}
          <Ionicons name={m.icon} size={26} color={m.iconColor} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{m.label}</Text>
            <Text style={styles.value}>{m.value}</Text>
            <Text style={styles.status}>{m.status}</Text>
          </View>
          {m.scale && <ReadinessScale />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cell: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md },
  divider: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: colors.borderSoft,
  },
  label: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  value: { color: colors.white, fontSize: 21, fontWeight: "800", marginTop: 2 },
  status: { color: colors.greenText, fontSize: 11.5, fontWeight: "600", marginTop: 1 },
});
