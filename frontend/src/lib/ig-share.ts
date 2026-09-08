import { Platform } from "react-native";

export type IgMode = "feed" | "story";
export type IgResult = "shared" | "notinstalled" | "error";

/**
 * Direct Instagram hand-off via react-native-share (native build only).
 * `feed` opens the Instagram Feed composer; `story` opens the Story composer
 * with the card as the background. Returns "error" if the native module or a
 * direct hand-off isn't available so callers can fall back to save-to-Photos.
 */
export async function shareToInstagram(mode: IgMode, imageUri: string, appId: string): Promise<IgResult> {
  try {
    // Lazy require so a missing native module (e.g. Expo Go) throws here and is
    // caught, rather than crashing the bundle at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNShare = require("react-native-share");
    const Share = RNShare.default;
    const Social = RNShare.Social;
    const url = imageUri.startsWith("file://") || imageUri.startsWith("data:") ? imageUri : `file://${imageUri}`;
    if (mode === "feed") {
      await Share.shareSingle({ social: Social.INSTAGRAM, url, type: "image/png", appId });
    } else {
      await Share.shareSingle({ social: Social.INSTAGRAM_STORIES, appId, backgroundImage: url });
    }
    return "shared";
  } catch (e: any) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("not installed") || msg.includes("no app") || msg.includes("could not") || msg.includes("activity")) {
      return "notinstalled";
    }
    return "error";
  }
}

/** Share a local PNG straight into the Facebook composer (native build only). */
export async function shareToFacebook(imageUri: string): Promise<IgResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNShare = require("react-native-share");
    const Share = RNShare.default;
    const Social = RNShare.Social;
    const url = imageUri.startsWith("file://") || imageUri.startsWith("data:") ? imageUri : `file://${imageUri}`;
    await Share.shareSingle({ social: Social.FACEBOOK, url, type: "image/png", useInternalStorage: Platform.OS === "android" });
    return "shared";
  } catch (e: any) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("not installed") || msg.includes("no app") || msg.includes("could not") || msg.includes("activity")) {
      return "notinstalled";
    }
    return "error";
  }
}
