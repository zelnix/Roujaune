import React from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { colors } from "@/src/theme";
import { CAPTION_TONES, CaptionTone, saveTone } from "@/src/lib/caption-styles";

/** Editable caption field with one-tap tone chips (Proud / Playful / Minimal)
 * that rewrite the caption from the ride's numbers. The chosen tone is
 * remembered so a rider's next share defaults to their favourite voice. */
export function CaptionEditor({
  value, onChange, onTone, activeTone, testID = "caption",
}: {
  value: string;
  onChange: (t: string) => void;
  onTone?: (tone: CaptionTone) => void;
  activeTone?: CaptionTone;
  testID?: string;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={st.label}>YOUR CAPTION</Text>
        {onTone ? (
          <View style={st.tones}>
            {CAPTION_TONES.map((t) => {
              const active = activeTone === t.key;
              return (
                <Pressable key={t.key} testID={`${testID}-tone-${t.key}`}
                  onPress={() => { onTone(t.key); saveTone(t.key); }}
                  accessibilityRole="button" accessibilityState={{ selected: active }}
                  accessibilityLabel={`Write a ${t.label.toLowerCase()} caption from my ride`}
                  style={({ hovered, pressed }: any) => [st.tone, active && st.toneActive, (hovered || pressed) && st.toneHover]}>
                  <Text style={[st.toneText, active && st.toneTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
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
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 },
  label: { color: colors.yellow, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4 },
  tones: { flexDirection: "row", gap: 6 },
  tone: { borderWidth: 1, borderColor: colors.yellow + "55", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  toneActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  toneHover: { backgroundColor: colors.yellow + "18" },
  toneText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  toneTextActive: { color: "#241B00" },
  input: { color: colors.white, fontSize: 13.5, lineHeight: 19, minHeight: 62, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
});
