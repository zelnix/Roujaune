import React from "react";
import { Text, StyleSheet, Platform, TextStyle, StyleProp } from "react-native";
import Constants from "expo-constants";
import { textShadow } from "../theme";

/** "v1.0.0 · Build 1" — reads the version from app config and the platform
 *  build number (ios.buildNumber / android.versionCode), falling back to the
 *  native build version on a real device. */
export function versionLabel(): string {
  const cfg: any = Constants.expoConfig ?? {};
  const v = cfg.version ?? "1.0.0";
  const b = Platform.OS === "ios" ? cfg.ios?.buildNumber : cfg.android?.versionCode;
  const build = b ?? (Constants as any).nativeBuildVersion ?? "1";
  return `v${v} · Build ${build}`;
}

export function AppVersionTag({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.text, style]} testID="app-version-tag" accessibilityRole="text">
      {versionLabel()}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginTop: 6,
    ...textShadow("rgba(0,0,0,0.6)", 5),
  },
});
