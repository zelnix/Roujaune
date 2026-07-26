// Emergent-managed push notifications — device registration.
//
// Uses the NATIVE device token (getDevicePushTokenAsync) and relays it to the
// backend, which registers it with the Emergent push relay. Push does NOT work
// in Expo Go / web — only in a deployed native build.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const API = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

/** Request permission (if needed), fetch the native token, and register it with
 * the backend. Safe to call on every app open — the relay upserts. No-op on web. */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${API}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    // Non-blocking: never let push registration break app startup.
  }
}
