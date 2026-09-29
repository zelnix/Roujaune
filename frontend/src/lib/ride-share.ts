/**
 * ride-share — captures a RideShareCard as a PNG and routes it to the
 * requested social platform (Instagram Stories, X, OS share sheet).
 *
 * Uses react-native-view-shot for capture and react-native-share for
 * the OS share sheet + Instagram Stories sticker API.
 */
import { Linking } from "react-native";
import ViewShot from "react-native-view-shot";
import Share from "react-native-share";

export type ShareTarget = "instagram" | "x" | "os" | "copy";

// ── Capture the rendered React Native View as a temp PNG ──────────────
export async function captureCardAsUri(viewRef: React.RefObject<any>): Promise<string | null> {
  try {
    if (!viewRef.current) return null;
    const uri = await ViewShot.captureRef(viewRef.current, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    return uri;
  } catch (e) {
    console.warn("[ride-share] capture failed:", e);
    return null;
  }
}

// ── Build text caption ───────────────────────────────────────────────
function buildCaption(workoutName: string, avgPower?: number | null, tss?: number | null): string {
  const parts = [`Just finished "${workoutName}" on ROUJAUNE`];
  if (avgPower) parts.push(`${avgPower}W avg`);
  if (tss) parts.push(`TSS ${Math.round(tss)}`);
  parts.push("#IndoorCycling #ERGMode #ROUJAUNE");
  return parts.join(" | ");
}

// ── Share to a specific target ───────────────────────────────────────

/**
 * Instagram Stories — uses Meta's custom URL scheme to pass the stat card
 * as a sticker layer so the user can add their own background + annotations.
 */
async function shareInstagramStory(imageUri: string): Promise<boolean> {
  try {
    await Share.shareSingle({
      stickerImage: imageUri,
      backgroundBottomColor: "#0D0D0F",
      backgroundTopColor: "#1A1A2E",
      social: Share.Social.INSTAGRAM_STORIES,
      appId: "roujaune",  // Meta app ID (for attribution)
    } as any);
    return true;
  } catch {
    // Fallback: try generic Instagram share
    try {
      await Share.shareSingle({
        url: imageUri,
        social: Share.Social.INSTAGRAM,
      } as any);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * X (Twitter) — uses a deep link with pre-filled text, plus the OS share
 * sheet to attach the image (X's URL scheme for direct media is unreliable).
 */
async function shareToX(imageUri: string, caption: string): Promise<boolean> {
  try {
    // Try X/Twitter deep link for text first
    const url = `twitter://post?message=${encodeURIComponent(caption)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      // The deep link only handles text — for the image, fall through to OS sheet
    }
    // Use the OS share sheet with the image targeting X
    await Share.shareSingle({
      url: imageUri,
      message: caption,
      social: Share.Social.TWITTER,
    } as any);
    return true;
  } catch {
    return false;
  }
}

/**
 * OS share sheet (UIActivityViewController on iOS, ACTION_SEND on Android).
 * Universal fallback — the user chooses where to send (WhatsApp, iMessage, etc.)
 */
async function shareViaOSSheet(imageUri: string, caption: string): Promise<boolean> {
  try {
    await Share.open({
      url: imageUri,
      message: caption,
      type: "image/png",
    });
    return true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function shareRide(
  target: ShareTarget,
  imageUri: string,
  workoutName: string,
  avgPower?: number | null,
  tss?: number | null,
): Promise<boolean> {
  const caption = buildCaption(workoutName, avgPower, tss);

  switch (target) {
    case "instagram":
      return shareInstagramStory(imageUri);
    case "x":
      return shareToX(imageUri, caption);
    case "os":
    default:
      return shareViaOSSheet(imageUri, caption);
  }
}
