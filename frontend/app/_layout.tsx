import { Stack, useRouter, useSegments } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { LogBox, Platform, View, ActivityIndicator, Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth-context";
import { registerForPush } from "@/src/lib/push";
import { loadCatalog } from "@/src/lib/catalog";
import { colors } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// Foreground display behavior — MODULE SCOPE (native only).
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android notification channel — MODULE SCOPE, created before any push arrives.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
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

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register this device for push once the rider is signed in (native only).
  useEffect(() => {
    if (user?.user_id) registerForPush(user.user_id);
  }, [user?.user_id]);

  // Warm the workout-catalog cache from the backend once signed in, so the
  // Live HUD picks up the rider's assigned/edited copies + coach overrides.
  useEffect(() => {
    if (user?.user_id) loadCatalog();
  }, [user?.user_id]);

  // Notification tap handling + denied-permission weekly nudge (native only).
  useEffect(() => {
    if (Platform.OS === "web") return;

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationTarget(response.notification.request.content.data || {}, router);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotificationTarget(response.notification.request.content.data || {}, router);
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
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
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  useEffect(() => {
    if (loading) return;
    const route = segments[0];
    const onAuthScreen = route === "login";

    if (!user) {
      if (!onAuthScreen) router.replace("/login");
      return;
    }
    // Signed in but hasn't chosen a plan yet → onboarding.
    if (!user.onboarded) {
      if (route !== "onboarding") router.replace("/onboarding");
      return;
    }
    // Signed in + onboarded but sitting on the login screen → home.
    if (onAuthScreen) router.replace("/");
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
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
