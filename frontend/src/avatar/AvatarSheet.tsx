import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AvatarSelector } from "./AvatarSelector";
import { AvatarCustomizer } from "./AvatarCustomizer";
import { avatarById, Appearance, AvatarChoice } from "./CyclistAvatarSystem";

const C = { overlay: "rgba(0,0,0,0.55)", card: "#141414", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230" };

/** Rider selector + live kit/glasses customiser as a modal sheet. */
export function AvatarSheet({ choice, onChange, onClose }: {
  choice: AvatarChoice; onChange: (c: AvatarChoice) => void; onClose: () => void;
}) {
  const config = avatarById(choice.avatarId);
  const appearance: Appearance = { ...config.defaults, ...choice.appearance };
  return (
    <Pressable style={styles.overlay} onPress={onClose} testID="avatar-sheet">
      <Pressable style={styles.panel} onPress={() => {}}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your rider</Text>
            <Text style={styles.sub}>Pick an avatar and customise the kit</Text>
          </View>
          <Pressable onPress={onClose} testID="avatar-sheet-close" hitSlop={10}><Ionicons name="close" size={22} color={C.text} /></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
          <AvatarSelector value={choice.avatarId} onChange={(avatarId) => onChange({ avatarId, appearance: {} })} />
          <AvatarCustomizer appearance={appearance} onChange={(patch) => onChange({ ...choice, appearance: { ...choice.appearance, ...patch } })} />
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay, alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 },
  panel: { width: "100%", maxWidth: 620, maxHeight: "88%", backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  head: { flexDirection: "row", alignItems: "center" },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  sub: { color: C.dim, fontSize: 12.5, marginTop: 2 },
});
