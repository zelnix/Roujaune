import React from "react";
import { View, StyleSheet } from "react-native";
import { AvatarInputs, Appearance, avatarById, AVATARS } from "./avatarConfigs";
import { CyclistAvatar } from "./CyclistAvatar";

export { AvatarSelector } from "./AvatarSelector";
export { AvatarCustomizer } from "./AvatarCustomizer";
export { CyclistAvatar } from "./CyclistAvatar";
export { useAvatarAnimation } from "./useAvatarAnimation";
export * from "./avatarConfigs";

/** Persisted avatar choice: which avatar + any appearance overrides. */
export type AvatarChoice = { avatarId: string; appearance: Partial<Appearance> };

export const DEFAULT_CHOICE: AvatarChoice = { avatarId: AVATARS[0].id, appearance: {} };

/** Transparent, drop-in overlay for the workout video screen.
 * Renders only the animated rider (no background) driven by live trainer data. */
export function CyclistAvatarOverlay({ choice, inputs, size = 170, style }: {
  choice: AvatarChoice; inputs: AvatarInputs; size?: number; style?: object;
}) {
  const config = avatarById(choice.avatarId);
  return (
    <View pointerEvents="none" style={[styles.overlay, style]}>
      <CyclistAvatar config={config} appearance={choice.appearance} inputs={inputs} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "transparent" },
});
