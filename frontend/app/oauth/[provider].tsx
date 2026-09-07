import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, spacing } from "@/src/theme";
import { finishConnect } from "@/src/lib/ridesync";

/**
 * OAuth return screen. Strava (and other cloud providers) redirect the browser
 * to our backend bounce endpoint, which forwards here with ?code&state. On web
 * this route finalises the connection; on native the WebBrowser auth session
 * usually consumes the redirect before this screen loads, so this is a safe
 * fallback that also handles a cold deep-link open.
 */
export default function OAuthReturn() {
  const params = useLocalSearchParams<{ provider?: string; code?: string; state?: string; error?: string }>();
  const router = useRouter();
  const [status, setStatus] = React.useState<"working" | "ok" | "fail">("working");
  const [msg, setMsg] = React.useState("Finishing your connection…");

  React.useEffect(() => {
    const provider = String(params.provider || "");
    const code = params.code ? String(params.code) : "";
    const state = params.state ? String(params.state) : "";
    const error = params.error ? String(params.error) : "";
    let done = false;
    (async () => {
      if (error) {
        setStatus("fail"); setMsg("Authorization was cancelled.");
      } else if (!provider || !code) {
        setStatus("fail"); setMsg("Missing authorization details.");
      } else {
        try {
          await finishConnect(provider, code, state);
          if (done) return;
          setStatus("ok"); setMsg("Connected! Taking you back…");
        } catch {
          if (done) return;
          setStatus("fail"); setMsg("We couldn't finish connecting. Please try again.");
        }
      }
      setTimeout(() => router.replace("/connections"), status === "ok" ? 900 : 1400);
    })();
    return () => { done = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.wrap} testID="oauth-return">
      {status === "working" ? (
        <ActivityIndicator size="large" color={colors.yellow} />
      ) : (
        <Ionicons name={status === "ok" ? "checkmark-circle" : "alert-circle"} size={44}
          color={status === "ok" ? colors.green : colors.red} />
      )}
      <Text style={s.msg}>{msg}</Text>
      <Pressable style={s.btn} onPress={() => router.replace("/connections")} testID="oauth-return-continue">
        <Text style={s.btnText}>Go to Connections</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 16 },
  msg: { color: colors.white, fontSize: 15, fontWeight: "600", textAlign: "center", maxWidth: 320, lineHeight: 21 },
  btn: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20 },
  btnText: { color: colors.yellow, fontSize: 14, fontWeight: "800" },
});
