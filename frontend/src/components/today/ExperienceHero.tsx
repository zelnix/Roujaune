import React from "react";
import { View, StyleSheet, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radius, spacing } from "../../theme";
import { BrandHeader } from "../BrandHeader";
import { HeaderStatus } from "../HeaderStatus";

export const experienceHeroBg = require("../../../assets/images/scenic_hero_bg.png");

/** Frames the hero photo — zoomed + panned up and biased toward the rider on
 *  the right so the lake, road and rider all read clearly under the overlay. */
export const HERO_IMAGE_TRANSFORM = { transform: [{ scale: 1.55 }, { translateY: -95 }, { translateX: -55 }] };

/**
 * Shared Today hero used by every ride-experience screen — the same treatment
 * as the Training Today screen: a full-bleed background photo with the 3D
 * ROUJAUNE wordmark + tagline + experience-specific descriptor overlaid, the
 * standard status cluster top-right, and any content cards overlaid at the
 * bottom (sitting on the photo).
 */
export function ExperienceHero({
  compact,
  source = experienceHeroBg,
  descriptor,
  imageTransform = HERO_IMAGE_TRANSFORM,
  minHeight = 560,
  children,
  testID = "experience-hero",
}: {
  compact: boolean;
  source?: any;
  descriptor?: string;
  imageTransform?: any;
  minHeight?: number;
  children?: React.ReactNode;
  testID?: string;
}) {
  return (
    <ImageBackground
      source={source}
      style={[styles.hero, { minHeight }, compact && { minHeight: undefined, padding: 16 }]}
      imageStyle={[styles.heroImg, imageTransform]}
      resizeMode="cover"
      testID={testID}
      accessibilityLabel="Scenic cycling destination"
    >
      <LinearGradient
        colors={["rgba(5,7,6,0.86)", "rgba(5,7,6,0.4)", "rgba(5,7,6,0.05)", "rgba(5,7,6,0.15)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.15 }}
        style={StyleSheet.absoluteFill as any}
      />
      <LinearGradient
        colors={["transparent", "rgba(5,7,6,0.15)", "rgba(5,7,6,0.72)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill as any}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <BrandHeader compact={compact} descriptor={descriptor} showVersion />
        </View>
        <HeaderStatus />
      </View>
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, overflow: "hidden", padding: 22, paddingTop: 20, justifyContent: "flex-start", backgroundColor: "#0E1512" },
  heroImg: { borderRadius: radius.xl },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  overlay: { marginTop: "auto", gap: spacing.md, paddingTop: spacing.lg },
});
