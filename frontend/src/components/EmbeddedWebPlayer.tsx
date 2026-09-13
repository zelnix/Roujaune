import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import { WebView } from "react-native-webview";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius } from "@/src/theme";

/**
 * Loads a website inside the video card, like the YouTube embed — for the
 * handful of streaming sources that can actually work this way (free-to-air
 * catch-up apps, the rider's own custom links). Netflix/Prime/Disney+/Apple TV
 * never reach this component; they always deep-link out (see streaming.ts).
 *
 * Reality check surfaced to the rider: a WebView is a real embedded browser,
 * so navigation/login generally works, but video playback on sites that
 * require DRM (Widevine/FairPlay) can still fail inside ANY embedded webview
 * — that's a platform limitation, not something we can code around. If the
 * page errors out or times out, we offer one tap to open it the normal way.
 */
export function EmbeddedWebPlayer({
  url, label, width, height, onOpenExternally, onClose,
}: {
  url: string;
  label: string;
  width: number;
  height: number;
  onOpenExternally: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    timeoutRef.current = setTimeout(() => setFailed((f) => (loading ? true : f)), 9000);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <View style={[wp.wrap, { width, height }]} testID="embedded-web-player">
      {Platform.OS === "web" ? (
        // react-native-web has no WebView polyfill (no <iframe> shim in this
        // package) and most streaming sites set X-Frame-Options/CSP to refuse
        // embedding anyway — so a *browser preview* can't show this inline.
        // On the real phone build this loads inside a genuine native WebView
        // (no iframe, no framing restriction) right here in the video card.
        <View style={wp.fallback}>
          <Ionicons name="phone-portrait-outline" size={26} color={colors.textDim} />
          <Text style={wp.fallbackTitle}>{label} needs the phone app to embed</Text>
          <Text style={wp.fallbackBody}>Browser preview can&apos;t show embedded video. On your phone (Expo Go or the built app) this plays right here in the card.</Text>
          <Pressable style={wp.openBtn} onPress={onOpenExternally} testID="embed-open-external">
            <Ionicons name="open-outline" size={15} color={colors.bg} />
            <Text style={wp.openBtnText}>Open {label} in a new tab</Text>
          </Pressable>
        </View>
      ) : failed ? (
        <View style={wp.fallback}>
          <Ionicons name="alert-circle-outline" size={26} color={colors.textDim} />
          <Text style={wp.fallbackTitle}>Couldn&apos;t load {label} here</Text>
          <Text style={wp.fallbackBody}>Some video needs DRM support an embedded view can&apos;t provide — this is a platform limit, not a bug.</Text>
          <Pressable style={wp.openBtn} onPress={onOpenExternally} testID="embed-open-external">
            <Ionicons name="open-outline" size={15} color={colors.bg} />
            <Text style={wp.openBtnText}>Open {label} instead</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <WebView
            source={{ uri: url }}
            style={wp.webview}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(req) => {
              // Keep normal page navigation (http/https) inside our own
              // WebView. Anything else (intent://, market://, custom app
              // schemes some sites use to "hand off" to their native app)
              // gets opened the normal way instead of silently failing here.
              if (/^https?:\/\//i.test(req.url)) return true;
              Linking.openURL(req.url).catch(() => {});
              return false;
            }}
            onLoadEnd={() => { setLoading(false); if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            testID="embed-webview"
          />
          {loading && (
            <View style={wp.loading} pointerEvents="none">
              <ActivityIndicator color={colors.yellow} />
            </View>
          )}
        </>
      )}
      <View style={[wp.bar, { pointerEvents: "box-none" }]}>
        <View style={wp.badge}>
          <Ionicons name="globe" size={12} color={colors.white} />
          <Text style={wp.badgeText} numberOfLines={1}>{label}</Text>
        </View>
        <Pressable style={wp.iconBtn} onPress={onOpenExternally} testID="embed-external-btn" accessibilityLabel={`Open ${label} in its own app`}>
          <Ionicons name="open-outline" size={16} color={colors.white} />
        </Pressable>
        <Pressable style={wp.iconBtn} onPress={onClose} testID="embed-close-btn" accessibilityLabel="Close">
          <Ionicons name="close" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const wp = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0a0a0a" },
  webview: { flex: 1, backgroundColor: "#0a0a0a" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", top: 8, left: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: colors.white, fontSize: 11.5, fontWeight: "800" },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
  fallbackTitle: { color: colors.white, fontSize: 14.5, fontWeight: "800", textAlign: "center" },
  fallbackBody: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", textAlign: "center", lineHeight: 17 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, marginTop: 4 },
  openBtnText: { color: colors.bg, fontSize: 13, fontWeight: "800" },
});
