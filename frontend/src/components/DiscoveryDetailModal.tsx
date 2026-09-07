import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Platform } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius } from "@/src/theme";
import { ScenicDiscovery, updateDiscovery, deleteDiscovery } from "@/src/lib/scenic-routes";

/** A single saved discovery — full photo, story, and edit / ride-again / remove. */
export function DiscoveryDetailModal({
  visible, discovery, onClose, onRide, onChanged,
}: {
  visible: boolean;
  discovery: ScenicDiscovery | null;
  onClose: () => void;
  onRide: (routeId: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setEditing(false);
    setNote(discovery?.narration || discovery?.description || "");
  }, [discovery]);

  if (!discovery) return null;
  const d = discovery;

  const save = async () => {
    setSaving(true);
    await updateDiscovery(d.id, { narration: note });
    setSaving(false);
    setEditing(false);
    onChanged();
  };
  const remove = async () => {
    await deleteDiscovery(d.id);
    onChanged();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {d.photo ? (
              <Image source={{ uri: d.photo }} style={s.photo} contentFit="cover" />
            ) : (
              <View style={[s.photo, s.photoFallback]}><Ionicons name="image-outline" size={34} color={colors.textFaint} /></View>
            )}

            <View style={s.body}>
              <Text style={s.kicker}>DISCOVERY</Text>
              <Text style={s.title}>{d.title}</Text>
              {(d.route_name || d.place) ? (
                <View style={s.metaRow}>
                  <Ionicons name="location" size={13} color={colors.yellow} />
                  <Text style={s.meta} numberOfLines={1}>{[d.place, d.route_name].filter(Boolean).join(" · ")}</Text>
                </View>
              ) : null}

              {d.description ? <Text style={s.desc}>{d.description}</Text> : null}

              <View style={s.noteHead}>
                <Text style={s.noteLabel}>YOUR NOTE</Text>
                {!editing ? (
                  <Pressable onPress={() => setEditing(true)} testID="discovery-edit" hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit note">
                    <Ionicons name="create-outline" size={17} color={colors.yellow} />
                  </Pressable>
                ) : null}
              </View>
              {editing ? (
                <View>
                  <TextInput
                    testID="discovery-note-input"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    placeholder="Add a memory about this spot…"
                    placeholderTextColor={colors.textFaint}
                    style={s.input}
                  />
                  <View style={s.editActions}>
                    <Pressable onPress={() => { setEditing(false); setNote(d.narration || d.description || ""); }} style={s.ghostBtn} accessibilityRole="button">
                      <Text style={s.ghostText}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={save} disabled={saving} testID="discovery-note-save" style={[s.saveBtn, saving && { opacity: 0.6 }]} accessibilityRole="button">
                      <Text style={s.saveText}>{saving ? "Saving…" : "Save note"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={s.note}>{note || "No note yet — tap the pencil to add a memory."}</Text>
              )}
            </View>
          </ScrollView>

          <View style={s.footer}>
            <Pressable style={s.rideBtn} testID="discovery-ride" onPress={() => onRide(d.route_id)} accessibilityRole="button" accessibilityLabel="Ride this route">
              <Ionicons name="bicycle" size={16} color={colors.bg} />
              <Text style={s.rideText}>Ride this route</Text>
            </Pressable>
            <Pressable style={s.removeBtn} testID="discovery-remove" onPress={remove} accessibilityRole="button" accessibilityLabel="Remove discovery">
              <Ionicons name="trash-outline" size={16} color={colors.red} />
            </Pressable>
          </View>

          <Pressable onPress={onClose} style={s.closeBtn} testID="discovery-close" accessibilityRole="button">
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,7,7,0.86)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0E1512", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, maxHeight: "92%", overflow: "hidden", ...(Platform.OS === "web" ? { alignSelf: "center", width: "100%", maxWidth: 480, borderRadius: 24 } : null) },
  photo: { width: "100%", height: 220, backgroundColor: "#05060a" },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  body: { padding: 20 },
  kicker: { color: colors.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: colors.white, fontSize: 24, fontWeight: "900", marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  meta: { color: colors.textDim, fontSize: 13, fontWeight: "600", flex: 1 },
  desc: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 21, marginTop: 14 },
  noteHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 },
  noteLabel: { color: colors.yellow, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  note: { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 21, fontStyle: "italic" },
  input: { color: colors.white, fontSize: 14, lineHeight: 21, minHeight: 90, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, textAlignVertical: "top" },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  ghostBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.textDim, fontSize: 14, fontWeight: "700" },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.yellow },
  saveText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  rideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 13, minHeight: 48 },
  rideText: { color: colors.bg, fontSize: 15, fontWeight: "800" },
  removeBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(224,30,43,0.4)", backgroundColor: "rgba(224,30,43,0.08)" },
  closeBtn: { alignItems: "center", paddingVertical: 14 },
  closeText: { color: colors.textDim, fontSize: 14, fontWeight: "600" },
});
