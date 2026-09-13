import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library/legacy";
import { colors } from "@/src/theme";
import { shareToInstagram, shareToFacebook } from "@/src/lib/ig-share";

const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID || "";

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
  const shareInstagram = async (mode: "story" | "feed") => {
    if (Platform.OS === "web") {
      try { await Clipboard.setStringAsync(caption); } catch { /* best-effort */ }
      await openUrl("https://www.instagram.com/", "Couldn't open Instagram — copy the caption and post manually.");
      onNotice("Caption copied — paste it when you post on Instagram.");
      return;
    }
    try {
      try { await Clipboard.setStringAsync(caption); } catch { /* caption copy is best-effort */ }
      const uri = await getImageUri();
      // 1) Direct hand-off — opens the IG Feed/Story composer with the card.
      if (META_APP_ID) {
        const res = await shareToInstagram(mode, uri, META_APP_ID);
        if (res === "shared") {
          onNotice(mode === "story"
            ? "Opening your Instagram Story — caption copied to paste."
            : "Opening the Instagram composer — caption copied to paste.");
          return;
        }
        if (res === "notinstalled") { onNotice("Instagram isn't installed — install it to post."); return; }
        // res === "error" -> fall through to the save-to-Photos path below.
      }
      // 2) Fallback: save to Photos, then open Instagram to pick the card.
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { onNotice("Turn on photo access so we can save your card for Instagram.", "settings"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      const targets = mode === "story"
        ? ["instagram-stories://share", "instagram://app"]
        : ["instagram://library", "instagram://app"];
      for (const t of targets) {
        try {
          await Linking.openURL(t);
          onNotice("Saved to Photos ✓ Opening Instagram — pick your ROUJAUNE card (caption copied).");
          return;
        } catch { /* try next target */ }
      }
      onNotice("Saved to Photos ✓ Instagram isn't installed — install it to post.");
    } catch { onNotice("Couldn't prepare your Instagram share. Please try again."); }
  };
  const shareFacebook = async () => {
    if (Platform.OS === "web") {
      try { await Clipboard.setStringAsync(caption); } catch { /* best-effort */ }
      await openUrl("https://www.facebook.com/", "Couldn't open Facebook — copy the caption and post manually.");
      onNotice("Caption copied — paste it when you post on Facebook.");
      return;
    }
    try {
      try { await Clipboard.setStringAsync(caption); } catch { /* best-effort */ }
      const uri = await getImageUri();
      const res = await shareToFacebook(uri);
      if (res === "shared") { onNotice("Opening Facebook — caption copied to paste (Facebook won't pre-fill it)."); return; }
      if (res === "notinstalled") { onNotice("Facebook isn't installed — install it to post."); return; }
      // error -> save to Photos so the rider can attach it manually
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { onNotice("Turn on photo access so we can save your card for Facebook.", "settings"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      onNotice("Saved to Photos ✓ Open Facebook and attach your ROUJAUNE card (caption copied).");
    } catch { onNotice("Couldn't prepare your Facebook share. Please try again."); }
  };
  return (
    <View style={st.row}>
      <Btn testID="share-instagram" label="Story" icon="logo-instagram" onPress={() => shareInstagram("story")} disabled={disabled} />
      <Btn testID="share-instagram-feed" label="Feed" icon="logo-instagram" onPress={() => shareInstagram("feed")} disabled={disabled} />
      <Btn testID="share-facebook" label="Facebook" icon="logo-facebook" onPress={shareFacebook} disabled={disabled} />
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
  row: { flexDirection: "row", gap: 9, marginTop: 20, alignSelf: "stretch", justifyContent: "center", flexWrap: "wrap", maxWidth: 480 },
  btn: { flexGrow: 1, flexBasis: 0, minWidth: 92, maxWidth: 148, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)" },
  btnHover: { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.24)" },
  text: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
});
