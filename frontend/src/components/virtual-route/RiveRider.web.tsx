import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";
import type { RiderArtboard } from "@/src/lib/rider-animation";

/**
 * Web / Expo Go fallback: Rive only renders in a native build, so here we show
 * the existing chroma-keyed rider sprite. Accepts the full production prop set
 * (ignored on web) so the call site stays identical across platforms.
 */
export type RiveRiderProps = {
  sprite: any;
  riderArtboard?: RiderArtboard;
  cadenceRpm?: number;
  powerWatts?: number;
  speedKph?: number;
  heartRateBpm?: number;
  gradientPct?: number;
  curve?: number;
  leanDeg?: number;
  ftp?: number;
  isConnected?: boolean;
  isPaused?: boolean;
  isSimulation?: boolean;
  isPedalling?: boolean;
  signalLost?: boolean;
  emergencyStop?: boolean;
  reducedMotion?: boolean;
  style?: StyleProp<ImageStyle>;
};

export function RiveRider({ sprite, style }: RiveRiderProps) {
  return <Image source={sprite} style={style} resizeMode="contain" />;
}
