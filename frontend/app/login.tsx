import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView, ImageBackground, Image } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth-context";
import { colors, radius, spacing, shadow, textShadow } from "@/src/theme";
import { AppVersionTag } from "@/src/components/AppVersionTag";

const AUTH_BG = require("../assets/images/auth_bg_sunset.png");
const LOGO_GLYPH = require("../assets/images/auth_logo_glyph.png");
const WORDMARK = require("../assets/images/auth_wordmark.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInGoogle, signInApple, forgotPassword } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError("Enter your email and password"); return; }
    setBusy(true);
    try {
      if (mode === "login") await signIn(email.trim(), password);
      else await signUp(email.trim(), password, name.trim() || undefined);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setError(null);
    if (!email.trim()) { setError("Enter your email above first"); return; }
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setForgotSent(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't send the reset email");
    } finally {
      setBusy(false);
    }
  };

  const social = async (fn: () => Promise<void>) => {
    setError(null); setBusy(true);
    try { await fn(); } catch (e: any) { setError(e?.message || "Sign-in failed"); } finally { setBusy(false); }
  };

  return (
    <ImageBackground source={AUTH_BG} resizeMode="cover" style={styles.root}>
      <View style={styles.scrim} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.center, { paddingTop: insets.top + spacing.lg }]} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Image source={LOGO_GLYPH} style={styles.glyph} resizeMode="contain" />
            <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
            <Text style={styles.brandTag}>Your strongest ride is your own.</Text>
            <AppVersionTag />
          </View>

          <View style={styles.card}>
            <Text style={styles.tagline}>{mode === "login" ? "Welcome back — let's ride." : "Create your rider account."}</Text>

            {step === "choose" ? (
              <>
                <Pressable style={styles.socialPrimary} onPress={() => social(signInGoogle)} disabled={busy} testID="google-btn">
                  <Ionicons name="logo-google" size={18} color="#1a1a1a" />
                  <Text style={styles.socialPrimaryText}>Continue with Google</Text>
                </Pressable>

                {Platform.OS === "ios" && (
                  <Pressable style={styles.socialApple} onPress={() => social(signInApple)} disabled={busy} testID="apple-btn">
                    <Ionicons name="logo-apple" size={19} color={colors.white} />
                    <Text style={styles.socialText}>Continue with Apple</Text>
                  </Pressable>
                )}

                <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} /></View>

                <Pressable style={styles.social} onPress={() => { setStep("email"); setError(null); }} disabled={busy} testID="email-btn">
                  <Ionicons name="mail-outline" size={18} color={colors.white} />
                  <Text style={styles.socialText}>{mode === "login" ? "Sign in with email" : "Sign up with email"}</Text>
                </Pressable>

                {error ? <Text style={styles.error} testID="auth-error">{error}</Text> : null}

                <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} testID="toggle-mode">
                  <Text style={styles.toggle}>
                    {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.backRow} onPress={() => { setStep("choose"); setError(null); setForgotOpen(false); }} hitSlop={8} testID="email-back">
                  <Ionicons name="chevron-back" size={18} color={colors.textDim} />
                  <Text style={styles.backText}>All sign-in options</Text>
                </Pressable>

                {mode === "register" && (
                  <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.textFaint}
                    value={name} onChangeText={setName} autoCapitalize="words" testID="name-input" />
                )}
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint}
                  value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                  autoComplete="email" testID="email-input" />
                <View style={styles.passwordWrap}>
                  <TextInput style={[styles.input, styles.passwordInput]} placeholder="Password" placeholderTextColor={colors.textFaint}
                    value={password} onChangeText={setPassword} secureTextEntry={!showPassword} testID="password-input" />
                  <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)} hitSlop={10}
                    accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} testID="toggle-password">
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textDim} />
                  </Pressable>
                </View>

                {error ? <Text style={styles.error} testID="auth-error">{error}</Text> : null}

                <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} testID="submit-btn">
                  {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>{mode === "login" ? "Sign in" : "Create account"}</Text>}
                </Pressable>

                {mode === "login" && !forgotOpen && (
                  <Pressable onPress={() => { setForgotOpen(true); setForgotSent(false); setError(null); }} testID="forgot-open">
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </Pressable>
                )}

                {mode === "login" && forgotOpen && (
                  <View style={styles.forgotBox}>
                    {forgotSent ? (
                      <View style={{ gap: 6 }}>
                        <Text style={styles.forgotTitle}>Check your inbox</Text>
                        <Text style={styles.forgotHint}>If an account exists for {email.trim() || "that email"}, we&apos;ve sent a reset link. It expires in 60 minutes.</Text>
                        <Pressable onPress={() => { setForgotOpen(false); setForgotSent(false); }} testID="forgot-done">
                          <Text style={styles.forgotAction}>Back to sign in</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.forgotTitle}>Reset your password</Text>
                        <Text style={styles.forgotHint}>Enter your email above, then send yourself a reset link.</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Pressable style={[styles.forgotBtn, busy && { opacity: 0.6 }]} onPress={sendReset} disabled={busy} testID="forgot-send">
                            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.forgotBtnText}>Send reset link</Text>}
                          </Pressable>
                          <Pressable style={styles.forgotCancel} onPress={() => { setForgotOpen(false); setError(null); }} testID="forgot-cancel">
                            <Text style={styles.forgotCancelText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} testID="toggle-mode">
                  <Text style={styles.toggle}>
                    {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.62)" },
  flex: { flex: 1 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.lg },
  brandBlock: { alignItems: "center", gap: 6 },
  glyph: { width: 76, height: 62 },
  wordmark: { width: 224, height: 34 },
  brandTag: { color: colors.white, fontSize: 13, fontWeight: "600", letterSpacing: 0.3, opacity: 0.9, ...textShadow("#000", 6) },
  card: { width: 420, maxWidth: "100%", backgroundColor: "rgba(12,12,11,0.86)", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: 12, ...shadow.card },
  tagline: { color: colors.textDim, fontSize: 14, textAlign: "center", marginBottom: 8 },
  input: { backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.white, fontSize: 15 },
  passwordWrap: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 46 },
  eyeBtn: { position: "absolute", right: 6, height: 40, width: 40, alignItems: "center", justifyContent: "center" },
  error: { color: colors.red, fontSize: 13, fontWeight: "600" },
  primary: { backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#000", fontWeight: "800", fontSize: 15 },
  toggle: { color: colors.gold, fontSize: 13.5, textAlign: "center", paddingVertical: 6 },
  forgotLink: { color: colors.textDim, fontSize: 13, textAlign: "center", paddingVertical: 4, textDecorationLine: "underline" },
  forgotBox: { backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginTop: 4 },
  forgotTitle: { color: colors.white, fontSize: 14.5, fontWeight: "800" },
  forgotHint: { color: colors.textDim, fontSize: 12.5, lineHeight: 18 },
  forgotBtn: { flex: 1, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  forgotBtnText: { color: "#000", fontWeight: "800", fontSize: 14 },
  forgotCancel: { paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  forgotCancelText: { color: colors.textDim, fontSize: 14, fontWeight: "600" },
  forgotAction: { color: colors.gold, fontSize: 13.5, fontWeight: "700", paddingTop: 4 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
  social: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13 },
  socialText: { color: colors.white, fontSize: 14.5, fontWeight: "700" },
  socialPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff", borderRadius: radius.md, paddingVertical: 14 },
  socialPrimaryText: { color: "#1a1a1a", fontSize: 15, fontWeight: "800" },
  socialApple: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#000", borderWidth: 1, borderColor: colors.white, borderRadius: radius.md, paddingVertical: 13 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4, marginBottom: 2 },
  backText: { color: colors.textDim, fontSize: 13.5, fontWeight: "600" },
});
