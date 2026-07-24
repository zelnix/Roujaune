import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView, ImageBackground, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth-context";
import { colors, radius, spacing, shadow, textShadow } from "@/src/theme";

const AUTH_BG = require("../assets/images/auth_bg_sunset.png");
const LOGO_GLYPH = require("../assets/images/auth_logo_glyph.png");
const WORDMARK = require("../assets/images/auth_wordmark.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInGoogle, signInApple } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          </View>

          <View style={styles.card}>
            <Text style={styles.tagline}>{mode === "login" ? "Welcome back — let's ride." : "Create your rider account."}</Text>

            {mode === "register" && (
              <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.textFaint}
                value={name} onChangeText={setName} autoCapitalize="words" testID="name-input" />
            )}
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint}
              value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" testID="email-input" />
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textFaint}
              value={password} onChangeText={setPassword} secureTextEntry testID="password-input" />

            {error ? <Text style={styles.error} testID="auth-error">{error}</Text> : null}

            <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} testID="submit-btn">
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>{mode === "login" ? "Sign in" : "Create account"}</Text>}
            </Pressable>

            <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} testID="toggle-mode">
              <Text style={styles.toggle}>
                {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
              </Text>
            </Pressable>

            <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} /></View>

            <Pressable style={styles.social} onPress={() => social(signInGoogle)} disabled={busy} testID="google-btn">
              <Ionicons name="logo-google" size={18} color={colors.white} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </Pressable>

            {Platform.OS === "ios" && (
              <Pressable style={[styles.social, { backgroundColor: "#000", borderColor: colors.white }]} onPress={() => social(signInApple)} disabled={busy} testID="apple-btn">
                <Ionicons name="logo-apple" size={18} color={colors.white} />
                <Text style={styles.socialText}>Continue with Apple</Text>
              </Pressable>
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
  error: { color: colors.red, fontSize: 13, fontWeight: "600" },
  primary: { backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#000", fontWeight: "800", fontSize: 15 },
  toggle: { color: colors.gold, fontSize: 13.5, textAlign: "center", paddingVertical: 6 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
  social: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 13 },
  socialText: { color: colors.white, fontSize: 14.5, fontWeight: "700" },
});
