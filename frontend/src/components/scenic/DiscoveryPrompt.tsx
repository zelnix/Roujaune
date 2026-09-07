import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { colors } from "@/src/theme";
import { ScenicPoi } from "@/src/lib/scenic-routes";

/** Effortless "save discovery" prompt shown when the rider reaches a POI. */
export function DiscoveryPrompt({ poi, onSave, onDismiss }: { poi: ScenicPoi; onSave: () => void; onDismiss: () => void }) {
  return (
    <View style={[s.promptWrap, { pointerEvents: "box-none" }]}>
      <View style={s.prompt}>
        {poi.image ? (
          <Image source={{ uri: poi.image }} style={s.promptImg} contentFit="cover" />
        ) : (
          <View style={[s.promptImg, s.promptImgFallback]}><Ionicons name="location" size={18} color={colors.yellow} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.promptKicker}>NEW DISCOVERY</Text>
          <Text style={s.promptTitle} numberOfLines={1}>{poi.title}</Text>
        </View>
        <Pressable style={s.promptSave} testID="discovery-prompt-save" onPress={onSave} accessibilityRole="button" accessibilityLabel={`Save ${poi.title} to your scrapbook`}>
          <Ionicons name="bookmark" size={15} color={colors.bg} />
          <Text style={s.promptSaveText}>Save</Text>
        </Pressable>
        <Pressable style={s.promptClose} testID="discovery-prompt-dismiss" onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

/** Confirmation micro-toast. */
export function SaveToast({ message }: { message: string }) {
  return (
    <View style={[s.toastWrap, { pointerEvents: "none" }]}>
      <View style={s.toast}>
        <Ionicons name="checkmark-circle" size={16} color={colors.yellow} />
        <Text style={s.toastText}>{message}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  promptWrap: { position: "absolute", top: 78, left: 0, right: 0, alignItems: "center", paddingHorizontal: 16, zIndex: 25 },
  prompt: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 440, width: "100%", backgroundColor: "rgba(8,10,10,0.94)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,194,10,0.5)", paddingVertical: 8, paddingLeft: 8, paddingRight: 8 },
  promptImg: { width: 42, height: 42, borderRadius: 10, backgroundColor: "#0E1512" },
  promptImgFallback: { alignItems: "center", justifyContent: "center" },
  promptKicker: { color: colors.yellow, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.4 },
  promptTitle: { color: colors.white, fontSize: 14, fontWeight: "800", marginTop: 1 },
  promptSave: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.yellow, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40 },
  promptSaveText: { color: colors.bg, fontSize: 13, fontWeight: "800" },
  promptClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: 150, alignItems: "center", zIndex: 25 },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(8,10,10,0.95)", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", paddingVertical: 9, paddingHorizontal: 16 },
  toastText: { color: colors.white, fontSize: 13, fontWeight: "700" },
});
