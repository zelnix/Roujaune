import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";
import { brand } from "../data";

const logoIcon = require("../../assets/images/logo_glyph_t.png");

export function BrandHeader() {
  return (
    <View testID="brand-header">
      <View style={styles.row}>
        <Image source={logoIcon} style={styles.icon} contentFit="contain" accessibilityLabel="ROUJAUNE cyclist logo" />
        <Text style={styles.wordmark} accessibilityLabel="ROUJAUNE">
          <Text style={{ color: colors.red }}>ROU</Text>
          <Text style={{ color: colors.yellow }}>JAUNE</Text>
        </Text>
      </View>
      <Text style={styles.tagline}>{brand.tagline}</Text>
      <Text style={styles.descriptor}>{brand.descriptor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 58, height: 58 },
  wordmark: {
    fontSize: 44,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 8,
  },
  tagline: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 8,
  },
  descriptor: {
    color: colors.yellow,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
});
