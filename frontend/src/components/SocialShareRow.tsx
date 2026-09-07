import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library/legacy";
import { colors } from "@/src/theme";

/** Quick share targets shown on the achievement + scenic-recap cards.
 * X / WhatsApp / Copy carry a text caption; Instagram Story (native only)
 * saves the card image to Photos, copies the caption, and opens Instagram's
 * Story composer so the rider can drop the card straight in. IG / FB / YouTube
 * can't be pre-filled via a URL, so the full-image share stays in the OS sheet
 * ("More…"). */
export function SocialShareRow({
  caption, getImageUri, onNotice, disabled,
}: {
  caption: string;
  getImageUri: () => Promise<string>;
  onNotice: (msg: string, action?: "settings") => void;
  disabled?: boolean;
}) {
  const openUrl = async (url: string, failMsg: string) => {
    try {
      if (Platform.OS === "web") { await Linking.openURL(url); return; }
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url); else onNotice(failMsg);
    } catch { onNotice(failMsg); }
  };
  const shareX = () => openUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`, "X isn't installed — use More to pick another app.");
  const shareWhatsApp = () => openUrl(`https://wa.me/?text=${encodeURIComponent(caption)}`, "WhatsApp isn't installed — use More to pick another app.");
  const copyCaption = async () => {
    try { await Clipboard.setStringAsync(caption); onNotice("Caption copied — paste it into any app 📋"); }
    catch { onNotice("Couldn't copy the caption."); }
  };
  const shareInstagram = async () => {
    if (Platform.OS === "web") { onNotice("Instagram sharing is available on the mobile app."); return; }
    try {
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { onNotice("Turn on photo access so we can save your card for Instagram.", "settings"); return; }
      try { await Clipboard.setStringAsync(caption); } catch { /* caption copy is best-effort */ }
      const uri = await getImageUri();
      await MediaLibrary.saveToLibraryAsync(uri);
      if (await Linking.canOpenURL("instagram-stories://share")) {
        await Linking.openURL("instagram-stories://share");
        onNotice("Saved to Photos ✓ Opening Instagram — add your ROUJAUNE card to your Story (caption copied).");
        return;
      }
      if (await Linking.canOpenURL("instagram://app")) {
        await Linking.openURL("instagram://app");
        onNotice("Saved to Photos ✓ Start a new Story in Instagram and pick your ROUJAUNE card.");
        return;
      }
      onNotice("Saved to Photos ✓ Instagram isn't installed — install it to post your Story.");
    } catch { onNotice("Couldn't prepare your Instagram share. Please try again."); }
  };
  return (
    <View style={st.row}>
      {Platform.OS !== "web" ? (
        <Btn testID="share-instagram" label="Story" icon="logo-instagram" onPress={shareInstagram} disabled={disabled} />
      ) : null}
      <Btn testID="share-x" label="X" icon="logo-twitter" onPress={shareX} disabled={disabled} />
      <Btn testID="share-whatsapp" label="WhatsApp" icon="logo-whatsapp" onPress={shareWhatsApp} disabled={disabled} />
      <Btn testID="share-copy" label="Copy" icon="copy-outline" onPress={copyCaption} disabled={disabled} />
    </View>
  );
}

function Btn({ label, icon, onPress, disabled, testID }: { label: string; icon: any; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Share to ${label}`}
      style={({ hovered, pressed }: any) => [st.btn, (hovered || pressed) && st.btnHover, disabled && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={17} color={colors.white} />
      <Text style={st.text}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 18, alignSelf: "stretch", justifyContent: "center", flexWrap: "wrap" },
  btn: { flexGrow: 1, flexBasis: 0, minWidth: 84, maxWidth: 130, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)" },
  btnHover: { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.24)" },
  text: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
});
