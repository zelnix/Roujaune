import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Platform, Linking, ScrollView, TextInput } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library/legacy";
import * as ImagePicker from "expo-image-picker";
import { fetchDiscoveries } from "../lib/scenic-routes";
import { C } from "./plan";
import { SocialShareRow } from "./SocialShareRow";
import { AchievementCard, AchievementCardData } from "./AchievementCard";

/** Presents the branded achievement card and lets the rider share it or save it
 * to their photo library. */
export function ShareCardModal({
  visible, data, onClose,
}: {
  visible: boolean;
  data: AchievementCardData | null;
  onClose: () => void;
}) {
  const cardRef = React.useRef<View>(null);
  const [busy, setBusy] = React.useState<null | "share" | "save">(null);
  const [notice, setNotice] = React.useState<{ msg: string; action?: "settings" } | null>(null);
  const [bgUri, setBgUri] = React.useState<string | null>(null);
  const [discoPhotos, setDiscoPhotos] = React.useState<string[]>([]);
  const [caption, setCaption] = React.useState("");

  React.useEffect(() => {
    if (visible && data) {
      const head = [data.kicker, data.title].filter(Boolean).join(" · ");
      setCaption(`${head}${data.subtitle ? ` — ${data.subtitle}` : ""}\nROUJAUNE · Your strongest ride is your own.`);
    }
  }, [visible, data]);

  React.useEffect(() => {
    if (visible) { setNotice(null); setBgUri(null); }
  }, [visible]);

  React.useEffect(() => {
    if (visible && data?.variant === "season") {
      fetchDiscoveries().then((ds) => {
        const photos = Array.from(new Set(ds.map((d) => d.photo).filter(Boolean) as string[]));
        setDiscoPhotos(photos);
      }).catch(() => setDiscoPhotos([]));
    } else {
      setDiscoPhotos([]);
    }
  }, [visible, data?.variant]);

  const pickBackdrop = async () => {
    if (busy) return;
    setNotice(null);
    try {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!perm.granted) {
        setNotice({ msg: "Photo access is off, so we can't add your photo. You can enable it in Settings.", action: "settings" });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [4, 5], quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]?.uri) setBgUri(res.assets[0].uri);
    } catch (e) {
      setNotice({ msg: "Couldn't open your photos. Please try again." });
    }
  };

  const capture = async () => {
    // small settle so the card + background image are painted before capture
    await new Promise((r) => setTimeout(r, 250));
    return captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
  };

  const onShare = async () => {
    if (busy) return;
    setBusy("share");
    setNotice(null);
    try {
      const uri = await capture();
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ROUJAUNE achievement", UTI: "public.png" });
      } else {
        setNotice({ msg: "Sharing isn't available on this device — try Save to Photos instead." });
      }
    } catch (e) {
      setNotice({ msg: "Couldn't prepare the card. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy("save");
    setNotice(null);
    try {
      if (Platform.OS === "web") {
        setNotice({ msg: "Saving to Photos is available on the mobile app." });
        return;
      }
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await MediaLibrary.requestPermissionsAsync();
      }
      if (!perm.granted) {
        setNotice({ msg: "Photo access is off, so we can't save the card. You can still share it, or enable access in Settings.", action: "settings" });
        return;
      }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setNotice({ msg: "Saved to your Photos 🎉" });
    } catch (e) {
      setNotice({ msg: "Couldn't save the card. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={s.cardWrap}>
            <AchievementCard ref={cardRef} data={{ ...data, bgUri: bgUri ?? undefined }} />
          </View>

          {data.variant === "season" ? (
            <Pressable testID="season-backdrop-pick" onPress={pickBackdrop} disabled={!!busy}
              accessibilityRole="button" accessibilityLabel="Choose a backdrop photo for your season card"
              style={({ hovered }: any) => [s.bgBtn, hovered && s.bgBtnHover]}>
              <Ionicons name={bgUri ? "image" : "image-outline"} size={15} color={C.yellow} />
              <Text style={s.bgBtnText}>{bgUri ? "Change backdrop photo" : "Add your own backdrop photo"}</Text>
              {bgUri ? (
                <Pressable onPress={() => setBgUri(null)} hitSlop={8} accessibilityLabel="Remove backdrop photo" style={s.bgClear}>
                  <Ionicons name="close-circle" size={16} color={C.dim} />
                </Pressable>
              ) : null}
            </Pressable>
          ) : null}

          {data.variant === "season" && discoPhotos.length > 0 ? (
            <View style={s.discoWrap} testID="season-discovery-picker">
              <Text style={s.discoLabel}>Or pick from your Discoveries</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.discoRow}>
                {discoPhotos.map((uri) => {
                  const on = bgUri === uri;
                  return (
                    <Pressable key={uri} testID="season-discovery-thumb" onPress={() => setBgUri(uri)}
                      accessibilityRole="button" accessibilityLabel="Use this discovery photo as backdrop"
                      style={[s.thumb, on && s.thumbOn]}>
                      <Image source={{ uri }} style={s.thumbImg} contentFit="cover" />
                      {on ? (
                        <View style={s.thumbCheck}><Ionicons name="checkmark-circle" size={18} color={C.yellow} /></View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {notice ? (
            <View style={s.notice}>
              <Text style={s.noticeText}>{notice.msg}</Text>
              {notice.action === "settings" ? (
                <Pressable onPress={() => Linking.openSettings()} style={s.settingsBtn} accessibilityRole="button">
                  <Ionicons name="settings-outline" size={14} color={C.yellow} />
                  <Text style={s.settingsText}>Open Settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={s.captionWrap}>
            <Text style={s.captionLabel}>YOUR CAPTION</Text>
            <TextInput
              testID="share-caption-input"
              style={s.captionInput}
              value={caption}
              onChangeText={setCaption}
              multiline
              placeholder="Say something about your ride…"
              placeholderTextColor={C.dim}
              accessibilityLabel="Edit the caption shared with your card"
            />
          </View>

          <SocialShareRow caption={caption} getImageUri={capture} disabled={!!busy}
            onNotice={(msg, action) => setNotice({ msg, action })} />

          <View style={s.actions}>
            <Pressable testID="share-card-share" onPress={onShare} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Share achievement card image via more apps"
              style={({ hovered, pressed }: any) => [s.primaryBtn, (hovered || pressed) && { opacity: 0.9 }, !!busy && { opacity: 0.6 }]}>
              {busy === "share" ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="share-social" size={18} color="#241B00" />}
              <Text style={s.primaryText}>More…</Text>
            </Pressable>
            <Pressable testID="share-card-save" onPress={onSave} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Save achievement card to photos"
              style={({ hovered, pressed }: any) => [s.secondaryBtn, (hovered || pressed) && s.secondaryHover, !!busy && { opacity: 0.6 }]}>
              {busy === "save" ? <ActivityIndicator size="small" color={C.yellow} /> : <Ionicons name="download-outline" size={18} color={C.yellow} />}
              <Text style={s.secondaryText}>Save</Text>
            </Pressable>
          </View>

          <Pressable testID="share-card-close" onPress={onClose} accessibilityRole="button" style={s.closeBtn}>
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6,7,7,0.9)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 440, alignItems: "center" },
  captionWrap: { alignSelf: "stretch", marginTop: 16 },
  captionLabel: { color: C.yellow, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  captionInput: { color: C.white, fontSize: 13.5, lineHeight: 19, minHeight: 62, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
  cardWrap: { borderRadius: 22, ...Platform.select({ web: { boxShadow: "0px 12px 24px rgba(0,0,0,0.5)" }, default: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 } }) },
  notice: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 14, maxWidth: 360, alignItems: "center" },
  noticeText: { color: C.white, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  settingsText: { color: C.yellow, fontSize: 12.5, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  bgBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,194,10,0.06)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  bgBtnHover: { backgroundColor: "rgba(255,194,10,0.12)", borderColor: "rgba(255,194,10,0.6)" },
  bgBtnText: { color: C.yellow, fontSize: 13, fontWeight: "800" },
  bgClear: { marginLeft: 2 },
  discoWrap: { marginTop: 12, alignSelf: "stretch" },
  discoLabel: { color: C.dim, fontSize: 11.5, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  discoRow: { gap: 8, paddingHorizontal: 4 },
  thumb: { width: 56, height: 70, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  thumbOn: { borderColor: C.yellow },
  thumbImg: { width: "100%", height: "100%" },
  thumbCheck: { position: "absolute", right: 2, top: 2, backgroundColor: "rgba(11,12,12,0.7)", borderRadius: 10 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.yellow, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 34, minHeight: 48, minWidth: 130 },
  primaryText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 30, minHeight: 48, minWidth: 120, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", backgroundColor: "rgba(255,194,10,0.06)" },
  secondaryHover: { backgroundColor: "rgba(255,194,10,0.12)", borderColor: "rgba(255,194,10,0.6)" },
  secondaryText: { color: C.yellow, fontSize: 15, fontWeight: "800" },
  closeBtn: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 20 },
  closeText: { color: C.dim, fontSize: 14, fontWeight: "600" },
});
