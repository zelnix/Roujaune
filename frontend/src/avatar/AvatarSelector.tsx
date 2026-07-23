import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { AVATARS, DEFAULT_INPUTS, AvatarConfig } from "./avatarConfigs";
import { CyclistAvatar } from "./CyclistAvatar";

const C = { card: "#161616", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230" };

/** Pick one of the 4 built-in avatars (identity is fixed per avatar). */
export function AvatarSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {AVATARS.map((cfg: AvatarConfig) => {
        const active = cfg.id === value;
        return (
          <Pressable key={cfg.id} testID={`avatar-${cfg.id}`} onPress={() => onChange(cfg.id)} style={[styles.tile, active && styles.tileActive]}>
            <View style={styles.thumb} pointerEvents="none">
              <CyclistAvatar config={cfg} inputs={{ ...DEFAULT_INPUTS, isPaused: true }} size={92} />
            </View>
            <Text style={[styles.name, active && { color: C.accent }]} numberOfLines={1}>{cfg.name}</Text>
            <Text style={styles.sub}>{cfg.identity.sex === "male" ? "Male" : "Female"}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  tile: { width: 116, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, padding: 8, alignItems: "center" },
  tileActive: { borderColor: C.accent, backgroundColor: "rgba(242,194,48,0.08)" },
  thumb: { height: 92, alignItems: "center", justifyContent: "center" },
  name: { color: C.text, fontSize: 12.5, fontWeight: "800", marginTop: 4 },
  sub: { color: C.dim, fontSize: 10.5, marginTop: 1 },
});
