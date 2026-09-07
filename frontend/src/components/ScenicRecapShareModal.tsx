import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Platform, Linking, ScrollView, TextInput } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library/legacy";
import { colors, radius } from "@/src/theme";
import { ScenicJourney, setRecapCover } from "@/src/lib/scenic-routes";
import { ScenicRecapCard } from "./ScenicRecapCard";
import { SocialShareRow } from "./SocialShareRow";

/** Presents the branded scenic ride recap and lets the rider share or save it. */
export function ScenicRecapShareModal({
  visible, journey, coachName, onClose,
}: {
  visible: boolean;
  journey: ScenicJourney | null;
  coachName?: string;
  onClose: () => void;
}) {
  const cardRef = React.useRef<View>(null);
  const [busy, setBusy] = React.useState<null | "share" | "save">(null);
  const [notice, setNotice] = React.useState<{ msg: string; action?: "settings" } | null>(null);
  // Live cover override so the card updates the instant a cover is picked.
  const [cover, setCover] = React.useState<string | null | undefined>(undefined);
  const [caption, setCaption] = React.useState("");

  React.useEffect(() => { if (visible) setNotice(null); }, [visible]);
  React.useEffect(() => { setCover(journey?.cover ?? null); }, [journey]);
  React.useEffect(() => {
    if (visible && journey) {
      const j = journey as any;
      const name = j.name || j.title || j.routeName || "My scenic ride";
      const place = j.place || j.location ? ` · ${j.place || j.location}` : "";
      setCaption(`${name}${place}\nROUJAUNE · Your strongest ride is your own.`);
    }
  }, [visible, journey]);

  const coverPhotos = React.useMemo(
    () => Array.from(new Set((journey?.discoveries || []).map((d) => d.photo).filter(Boolean) as string[])),
    [journey],
  );

  const chooseCover = (photo: string | null) => {
    setCover(photo);
    if (journey) setRecapCover(journey.id, photo);
  };

  const capture = async () => {
    await new Promise((r) => setTimeout(r, 250));
    return captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
  };

  const onShare = async () => {
    if (busy) return;
    setBusy("share"); setNotice(null);
    try {
      const uri = await capture();
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ROUJAUNE scenic ride", UTI: "public.png" });
      } else {
        setNotice({ msg: "Sharing isn't available on this device — try Save to Photos instead." });
      }
    } catch {
      setNotice({ msg: "Couldn't prepare the recap. Please try again." });
    } finally { setBusy(null); }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy("save"); setNotice(null);
    try {
      if (Platform.OS === "web") {
        setNotice({ msg: "Saving to Photos is available on the mobile app." });
        return;
      }
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        setNotice({ msg: "Photo access is off, so we can't save the recap. You can still share it, or enable access in Settings.", action: "settings" });
        return;
      }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setNotice({ msg: "Saved to your Photos 🎉" });
    } catch {
      setNotice({ msg: "Couldn't save the recap. Please try again." });
    } finally { setBusy(null); }
  };

  if (!journey) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close" />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.sheet}>
            <View style={s.cardWrap}>
              <ScenicRecapCard ref={cardRef} journey={{ ...journey, cover: cover === undefined ? journey.cover : cover }} coachName={coachName} />
            </View>

            {coverPhotos.length > 0 ? (
              <View style={s.coverPicker}>
                <Text style={s.coverLabel}>COVER PHOTO</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.coverRow}>
                  <Pressable onPress={() => chooseCover(null)} testID="cover-default" style={[s.coverThumb, (cover == null) && s.coverThumbSel]} accessibilityRole="button" accessibilityLabel="Use default cover">
                    {journey.thumbnail ? (
                      <Image source={{ uri: journey.thumbnail }} style={s.coverImg} contentFit="cover" />
                    ) : (
                      <View style={[s.coverImg, s.coverImgFallback]}><Ionicons name="logo-youtube" size={18} color={colors.textFaint} /></View>
                    )}
                    {cover == null ? <View style={s.coverCheck}><Ionicons name="checkmark" size={13} color={colors.bg} /></View> : null}
                  </Pressable>
                  {coverPhotos.map((p) => (
                    <Pressable key={p} onPress={() => chooseCover(p)} testID="cover-option" style={[s.coverThumb, cover === p && s.coverThumbSel]} accessibilityRole="button" accessibilityLabel="Use this discovery as cover">
                      <Image source={{ uri: p }} style={s.coverImg} contentFit="cover" />
                      {cover === p ? <View style={s.coverCheck}><Ionicons name="checkmark" size={13} color={colors.bg} /></View> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {notice ? (
              <View style={s.notice}>
                <Text style={s.noticeText}>{notice.msg}</Text>
                {notice.action === "settings" ? (
                  <Pressable onPress={() => Linking.openSettings()} style={s.settingsBtn} accessibilityRole="button">
                    <Ionicons name="settings-outline" size={14} color={colors.yellow} />
                    <Text style={s.settingsText}>Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={s.captionWrap}>
              <Text style={s.captionLabel}>YOUR CAPTION</Text>
              <TextInput testID="recap-caption-input" style={s.captionInput} value={caption}
                onChangeText={setCaption} multiline placeholder="Say something about your ride…"
                placeholderTextColor={colors.textDim} accessibilityLabel="Edit the caption shared with your recap" />
            </View>

            <SocialShareRow caption={caption} getImageUri={capture} disabled={!!busy}
              onNotice={(msg, action) => setNotice({ msg, action })} />

            <View style={s.actions}>
              <Pressable testID="recap-share" onPress={onShare} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Share scenic ride recap image via more apps"
                style={({ pressed }: any) => [s.primaryBtn, pressed && { opacity: 0.9 }, !!busy && { opacity: 0.6 }]}>
                {busy === "share" ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="share-social" size={18} color="#241B00" />}
                <Text style={s.primaryText}>More…</Text>
              </Pressable>
              <Pressable testID="recap-save" onPress={onSave} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Save scenic ride recap to photos"
                style={({ pressed }: any) => [s.secondaryBtn, pressed && s.secondaryHover, !!busy && { opacity: 0.6 }]}>
                {busy === "save" ? <ActivityIndicator size="small" color={colors.yellow} /> : <Ionicons name="download-outline" size={18} color={colors.yellow} />}
                <Text style={s.secondaryText}>Save</Text>
              </Pressable>
            </View>

            <Pressable testID="recap-close" onPress={onClose} accessibilityRole="button" style={s.closeBtn}>
              <Text style={s.closeText}>Close</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,7,7,0.9)" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 440, alignItems: "center" },
  cardWrap: { borderRadius: 22, ...Platform.select({ web: { boxShadow: "0px 12px 24px rgba(0,0,0,0.5)" }, default: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 } }) },
  coverPicker: { alignSelf: "stretch", marginTop: 16, maxWidth: 360, width: "100%" },
  captionWrap: { alignSelf: "stretch", marginTop: 16, maxWidth: 360, width: "100%" },
  captionLabel: { color: colors.yellow, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  captionInput: { color: colors.white, fontSize: 13.5, lineHeight: 19, minHeight: 62, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
  coverLabel: { color: colors.yellow, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 8 },
  coverRow: { gap: 10, paddingRight: 8 },
  coverThumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: "#0E1512" },
  coverThumbSel: { borderColor: colors.yellow },
  coverImg: { width: "100%", height: "100%" },
  coverImgFallback: { alignItems: "center", justifyContent: "center" },
  coverTag: { position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", color: colors.white, fontSize: 9, fontWeight: "800", backgroundColor: "rgba(5,6,10,0.7)", paddingVertical: 2 },
  coverCheck: { position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  notice: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14, maxWidth: 360, alignItems: "center" },
  noticeText: { color: colors.white, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  settingsText: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 34, minHeight: 48, minWidth: 130 },
  primaryText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 30, minHeight: 48, minWidth: 120, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,194,10,0.06)" },
  secondaryHover: { backgroundColor: "rgba(255,194,10,0.12)", borderColor: "rgba(255,194,10,0.6)" },
  secondaryText: { color: colors.yellow, fontSize: 15, fontWeight: "800" },
  closeBtn: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 20 },
  closeText: { color: colors.textDim, fontSize: 14, fontWeight: "600" },
});
