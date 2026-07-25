import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

/**
 * Web / Expo Go fallback: Rive only renders in a native build, so here we show
 * the existing chroma-keyed rider sprite. Keeps the preview fully functional.
 */
export function RiveRider({ sprite, style }: {
  sprite: any;
  cadence?: number;
  speed?: number;
  effort?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={sprite} style={style} resizeMode="contain" />;
}
