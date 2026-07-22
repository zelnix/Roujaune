import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";
import { brand } from "../data";

const wordmark = require("../../assets/images/wordmark_t.png");

// 1819x222 source -> ~8.19:1 aspect
const W = 400;
const H = 49;
const DEPTH = 7;
const STEP_Y = 1.5;
const STEP_X = 0.7;

/** Faux-3D extruded wordmark: stacked dark copies behind + full-colour top + gloss highlight. */
function Wordmark3D() {
  return (
    <View style={{ width: W + DEPTH * STEP_X, height: H + DEPTH * STEP_Y }} testID="brand-wordmark">
      {Array.from({ length: DEPTH }).map((_, i) => {
        const d = DEPTH - i; // deepest (largest offset) drawn first
        // shade fades from dark maroon (far) to mid (near) for a lit-edge look
        const t = i / (DEPTH - 1);
        const r = Math.round(40 + t * 55);
        const g = Math.round(6 + t * 12);
        const b = Math.round(7 + t * 12);
        return (
          <Image
            key={i}
            source={wordmark}
            tintColor={`rgb(${r},${g},${b})`}
            contentFit="contain"
            style={{ position: "absolute", left: d * STEP_X, top: d * STEP_Y, width: W, height: H }}
          />
        );
      })}
      {/* light rim behind face, offset up-left -> lit top edge */}
      <Image
        source={wordmark}
        tintColor="rgb(255,236,180)"
        contentFit="contain"
        style={{ position: "absolute", left: -1.2, top: -1.4, width: W, height: H }}
      />
      {/* full-colour face on top */}
      <Image source={wordmark} contentFit="contain" style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} accessibilityLabel="ROUJAUNE" />
    </View>
  );
}

export function BrandHeader() {
  return (
    <View testID="brand-header">
      <Wordmark3D />
      <Text style={styles.tagline}>{brand.tagline}</Text>
      <Text style={styles.descriptor}>{brand.descriptor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 8,
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
