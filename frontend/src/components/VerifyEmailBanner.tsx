import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";

/** Soft, dismissible nudge shown to password-account users whose email is not
 * yet verified. Lets them resend the verification email inline. */
export function VerifyEmailBanner() {
  const { user, resendVerification } = useAuth();
  const [dismissed, setDismissed] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = React.useState<string | null>(null);

  const needs = !!user && user.provider === "password" && !user.email_verified;
  if (!needs || dismissed) return null;

  const resend = async () => {
    if (state === "sending") return;
    setState("sending");
    setMsg(null);
    try {
      await resendVerification();
      setState("sent");
    } catch (e: any) {
      setState("error");
      setMsg(e?.message || "Couldn't send right now");
    }
  };

  return (
    <View style={styles.wrap} testID="verify-email-banner">
      <View style={styles.iconWrap}>
        <Ionicons name="mail-unread-outline" size={18} color={colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Verify your email</Text>
        {state === "sent" ? (
          <Text style={styles.sub}>Sent to {user?.email} — tap the link in the email to confirm.</Text>
        ) : state === "error" ? (
          <Text style={[styles.sub, { color: colors.red }]}>{msg}</Text>
        ) : (
          <Text style={styles.sub}>Confirm {user?.email} to secure your account.</Text>
        )}
      </View>
      {state !== "sent" ? (
        <Pressable onPress={resend} style={styles.btn} disabled={state === "sending"} testID="verify-resend">
          {state === "sending" ? <ActivityIndicator size="small" color="#241B00" /> : <Text style={styles.btnText}>Resend</Text>}
        </Pressable>
      ) : null}
      <Pressable onPress={() => setDismissed(true)} style={styles.close} hitSlop={8} testID="verify-dismiss" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,194,10,0.08)", borderWidth: 1, borderColor: "rgba(255,194,10,0.35)",
    borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: spacing.md,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,194,10,0.12)" },
  title: { color: colors.white, fontSize: 14, fontWeight: "800" },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  btn: { backgroundColor: colors.yellow, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 16, minHeight: 40, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#241B00", fontSize: 13.5, fontWeight: "800" },
  close: { padding: 4 },
});
