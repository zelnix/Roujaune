import React from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors } from "@/src/theme";

/** Editable caption field with an optional one-tap "Auto stats" button that
 * rewrites the caption from the ride's numbers. Shared by the achievement card,
 * scenic recap and end-of-ride summary share sheets. */
export function CaptionEditor({
  value, onChange, onAuto, testID = "caption",
}: {
  value: string;
  onChange: (t: string) => void;
  onAuto?: () => void;
  testID?: string;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={st.label}>YOUR CAPTION</Text>
        {onAuto ? (
          <Pressable testID={`${testID}-auto`} onPress={onAuto} accessibilityRole="button"
            accessibilityLabel="Write a caption from my ride stats"
            style={({ hovered, pressed }: any) => [st.autoBtn, (hovered || pressed) && st.autoHover]}>
            <Ionicons name="sparkles-outline" size={13} color={colors.yellow} />
            <Text style={st.autoText}>Auto stats</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        testID={`${testID}-input`}
        style={st.input}
        value={value}
        onChangeText={onChange}
        multiline
        placeholder="Say something about your ride…"
        placeholderTextColor={colors.textDim}
        accessibilityLabel="Edit the caption shared with your card"
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: "stretch", marginTop: 16, maxWidth: 360, width: "100%" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label: { color: colors.yellow, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4 },
  autoBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.yellow + "55", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  autoHover: { backgroundColor: colors.yellow + "18" },
  autoText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  input: { color: colors.white, fontSize: 13.5, lineHeight: 19, minHeight: 62, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
});
