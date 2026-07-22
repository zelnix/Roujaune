import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";
import { brand } from "../data";

const wordmark = require("../../assets/images/wordmark_t.png");

export function BrandHeader() {
  return (
    <View testID="brand-header">
      <Image source={wordmark} style={styles.wordmark} contentFit="contain" accessibilityLabel="ROUJAUNE" />
      <Text style={styles.tagline}>{brand.tagline}</Text>
      <Text style={styles.descriptor}>{brand.descriptor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 1819x222 source -> ~8.19:1 aspect
  wordmark: { width: 385, height: 47 },
  tagline: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 10,
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
