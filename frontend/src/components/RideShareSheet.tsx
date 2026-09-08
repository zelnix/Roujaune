import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing } from "@/src/theme";
import { SocialShareRow } from "./SocialShareRow";
import { CaptionEditor } from "./CaptionEditor";
import { styleCaption, getSavedTone, CaptionTone } from "@/src/lib/caption-styles";

/** End-of-ride share sheet: same quick-share row (Instagram Story/Feed, X,
 * WhatsApp, Copy) + editable caption with tone chips, opened from the ride
 * summary so riders can post right after finishing. */
export function RideShareSheet({
  visible, onClose, initialCaption, captionFacts, getImageUri, onMore, onNotice,
}: {
  visible: boolean;
  onClose: () => void;
  initialCaption: string;
  captionFacts?: { title?: string; place?: string; stats?: string[] };
  getImageUri: () => Promise<string>;
  onMore: () => void;
  onNotice: (msg: string) => void;
}) {
  const [caption, setCaption] = React.useState("");
  const [tone, setTone] = React.useState<CaptionTone>("proud");
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (!visible) { seededRef.current = false; return; }
    if (seededRef.current) return;
    seededRef.current = true;
    if (captionFacts) getSavedTone().then((t) => { setTone(t); setCaption(styleCaption(t, captionFacts)); });
    else setCaption(initialCaption);
  }, [visible, initialCaption, captionFacts]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} testID="ride-share-sheet">
        <Pressable style={st.sheet} onPress={() => { /* swallow */ }}>
          <View style={st.handle} />
          <View style={st.content}>
          <Text style={st.title}>Share your ride</Text>
          <CaptionEditor
            value={caption}
            onChange={setCaption}
            testID="ride-share-caption"
            activeTone={tone}
            onTone={captionFacts ? (t) => { setTone(t); setCaption(styleCaption(t, captionFacts)); } : undefined}
          />
          <SocialShareRow caption={caption} getImageUri={getImageUri} onNotice={(m) => onNotice(m)} />
          <View style={st.actions}>
            <Pressable testID="ride-share-more" onPress={onMore} accessibilityRole="button"
              accessibilityLabel="Share ride image via more apps"
              style={({ pressed }: any) => [st.primaryBtn, pressed && { opacity: 0.9 }]}>
              <Ionicons name="share-social" size={18} color="#241B00" />
              <Text style={st.primaryText}>More…</Text>
            </Pressable>
            <Pressable testID="ride-share-close" onPress={onClose} accessibilityRole="button"
              style={({ pressed }: any) => [st.secondaryBtn, pressed && { opacity: 0.85 }]}>
              <Text style={st.secondaryText}>Done</Text>
            </Pressable>
          </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,7,7,0.9)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl, alignItems: "center" },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", alignItems: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  title: { color: colors.white, fontSize: 18, fontWeight: "900", alignSelf: "flex-start" },
  actions: { flexDirection: "row", gap: 10, marginTop: 18, alignSelf: "stretch", maxWidth: 360, width: "100%", alignItems: "center", justifyContent: "center" },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.lg, paddingVertical: 13 },
  primaryText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 13 },
  secondaryText: { color: colors.white, fontSize: 15, fontWeight: "700" },
});
