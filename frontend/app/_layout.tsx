import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect } from "react";
import { Platform, View, ActivityIndicator, Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth-context";
import { BLEProvider } from "@/src/lib/ble-context";
import { registerForPush } from "@/src/lib/push";
import { loadCatalog } from "@/src/lib/catalog";
import { colors } from "@/src/theme";
import { installLogBuffer } from "@/src/lib/logbuffer";
import { useA11y } from "@/src/lib/a11y";

// ── SAFE MODULE-SCOPE INITIALIZATION ────────────────────────────────────────
// Only side-effects that are guaranteed safe across all RN runtimes go here.
// Everything else is deferred to guarded useEffects inside components.

// Capture recent console output for diagnostics (non-invasive wrapper).
installLogBuffer();

// Keep the splash visible until fonts are loaded.  Wrapped in try/catch so a
// missing native module (or Expo Go quirks) can never kill cold start.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  /* splash may flash briefly on unsupported runtimes */
}

// ── NOTIFICATION HELPERS ─────────────────────────────────────────────────────
// Lazily loaded so the Notifications native module can never crash cold start.
let _Notifications: typeof import("expo-notifications") | null = null;
function getNotifications() {
  if (_Notifications) return _Notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _Notifications = require("expo-notifications") as typeof import("expo-notifications");
  } catch {
    /* native module unavailable */
  }
  return _Notifications;
}

function openNotificationTarget(data: Record<string, any>, router: ReturnType<typeof useRouter>) {
  const url = data?.deeplink || data?.action_url;
  if (!url) return;
  if (String(url).startsWith("http")) {
    Linking.openURL(String(url));
  } else {
    router.push(url);
  }
}

/**
 * Initialise push-notification infrastructure inside a component effect so a
 * failure can never kill the root render.  Called once from AuthGate.
 */
function useNotificationSetup() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    const N = getNotifications();
    if (!N) return;

    try {
      // Foreground display behavior.
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Android notification channel.
      if (Platform.OS === "android") {
        N.setNotificationChannelAsync("default", {
          name: "Default",
          importance: N.AndroidImportance.MAX,
          sound: "default",
        });
      }
    } catch {
      /* gracefully degrade — push will still work, just no foreground banner */
    }
  }, []);

  // Tap handling + denied-permission weekly nudge.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const N = getNotifications();
    if (!N) return;

    const tapSub = N.addNotificationResponseReceivedListener((response) => {
      openNotificationTarget(response.notification.request.content.data || {}, router);
    });

    N.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotificationTarget(response.notification.request.content.data || {}, router);
    });

    (async () => {
      try {
        const { status, canAskAgain } = await N.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        Alert.alert(
          "Stay on track",
          "Turn on notifications to get reminders for your scheduled benchmark tests.",
          [
            { text: "Later", style: "cancel", onPress: () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())) },
            {
              text: "Open Settings",
              onPress: () => {
                AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
                Linking.openSettings();
              },
            },
          ],
        );
      } catch {
        /* non-critical — the nudge just won't appear */
      }
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);
}

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const a11y = useA11y();

  // ── Guarded notification setup (cannot kill startup) ───────────────────────
  useNotificationSetup();

  // Register device for push once signed in (native only).
  useEffect(() => {
    if (user?.user_id) registerForPush(user.user_id);
  }, [user?.user_id]);

  // Warm workout-catalog cache once signed in.
  useEffect(() => {
    if (user?.user_id) loadCatalog();
  }, [user?.user_id]);

  // ── Navigation guard ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const route = segments[0];
    const onAuthScreen = route === "login";

    if (!user) {
      if (!onAuthScreen) router.replace("/login");
      return;
    }
    if (!user.onboarded) {
      if (route !== "onboarding") router.replace("/onboarding");
      return;
    }
    if (onAuthScreen) router.replace("/");
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  const stack = <Stack key={`a11y-${a11y.largeText ? "L" : "n"}-${a11y.highContrast ? "H" : "n"}`} screenOptions={{ headerShown: false }} />;

  // ── BLE only initialises after authentication ──────────────────────────────
  // Keeps the cold-start → login path completely free of BLE overhead.
  // On logout BLEProvider unmounts, disconnecting cleanly.
  if (user?.onboarded) {
    return <BLEProvider>{stack}</BLEProvider>;
  }
  return stack;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      try {
        SplashScreen.hideAsync();
      } catch {
        /* splash may already be hidden */
      }
    }
  }, [loaded, error]);

  // Lock to landscape on native — guarded so orientation failures can never
  // block the render tree.
  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const SO = require("expo-screen-orientation") as typeof import("expo-screen-orientation");
        await SO.lockAsync(SO.OrientationLock.LANDSCAPE);
      } catch {
        /* orientation lock unavailable — app still usable */
      }
    })();
  }, []);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
