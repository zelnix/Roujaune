import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, ImageBackground, Image } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth-context";
import { ChangeStartDateModal } from "@/src/components/ChangeStartDateModal";
import { resetPlanStart } from "@/src/lib/plan";
import { colors, radius, spacing, textShadow } from "@/src/theme";

const AUTH_BG = require("../assets/images/auth_bg_sunset.png");
const LOGO_GLYPH = require("../assets/images/auth_logo_glyph.png");
const WORDMARK = require("../assets/images/auth_wordmark.png");

const API = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

type Answers = { experience_years: number; weekly_rides: number; longest_ride_min: number; confident_60min: boolean; self_rating: string };
type PlanSummary = { id: string; title: string; description?: string; level?: string };
type Reco = { level: string; recommended: { id: string; title: string; authored?: boolean } | null; plans: PlanSummary[]; allow_free: boolean };

const Q = [
  { key: "self_rating", label: "How would you rate your cycling right now?", opts: [["new", "Brand new"], ["some", "Some experience"], ["confident", "Confident rider"]] },
  { key: "weekly_rides", label: "How many times do you ride per week?", opts: [["0", "Rarely"], ["1", "1–2"], ["3", "3–4"], ["5", "5+"]] },
  { key: "longest_ride_min", label: "Your longest comfortable ride?", opts: [["0", "< 30 min"], ["45", "~45 min"], ["90", "~90 min"], ["150", "2+ hours"]] },
  { key: "experience_years", label: "How long have you been riding?", opts: [["0", "Just starting"], ["2", "1–2 years"], ["5", "3–5 years"], ["8", "5+ years"]] },
  { key: "confident_60min", label: "Can you ride 60 min without stopping?", opts: [["no", "Not yet"], ["yes", "Yes"]] },
] as const;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh, user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reco, setReco] = useState<Reco | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const allAnswered = Q.every((q) => answers[q.key] !== undefined);

  const submit = async () => {
    setBusy(true);
    const body: Answers = {
      experience_years: Number(answers.experience_years ?? 0),
      weekly_rides: Number(answers.weekly_rides ?? 0),
      longest_ride_min: Number(answers.longest_ride_min ?? 0),
      confident_60min: answers.confident_60min === "yes",
      self_rating: answers.self_rating ?? "new",
    };
    try {
      const r = await fetch(`${API}/api/onboarding/recommend`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setReco(await r.json());
    } finally {
      setBusy(false);
    }
  };

  const choose = async (planId: string) => {
    setBusy(true);
    try {
      await fetch(`${API}/api/rider/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, reset_progress: true }),
      });
      // Ride-free needs no schedule; a real plan prompts for a start date next.
      if (planId === "none") {
        await refresh();
        router.replace("/");
      } else {
        setPendingPlan(planId);
      }
    } finally {
      setBusy(false);
    }
  };

  const finishWithStart = async (dateISO?: string) => {
    setBusy(true);
    try {
      if (dateISO) { try { await resetPlanStart(dateISO); } catch { /* keep default anchor */ } }
      await refresh();
      setPendingPlan(null);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  const skipToPlans = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/rider/plan`);
      const d = await r.json();
      setReco({ level: "", recommended: null, plans: d.plans || [], allow_free: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={AUTH_BG} resizeMode="cover" style={styles.root}>
      <View style={styles.scrim} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}>
        <View style={styles.brandRow}>
          <Image source={LOGO_GLYPH} style={styles.glyph} resizeMode="contain" />
          <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
        </View>
        <Text style={styles.hi}>Hi {user?.name?.split(" ")[0] || "rider"} 👋</Text>
        {!reco ? (
          <>
            <Text style={styles.title}>Let&apos;s find your plan</Text>
            <Text style={styles.sub}>A few quick questions so we can match you to the right training.</Text>
            {Q.map((q) => (
              <View key={q.key} style={styles.qBlock}>
                <Text style={styles.qLabel}>{q.label}</Text>
                <View style={styles.opts}>
                  {q.opts.map(([val, lbl]) => {
                    const active = answers[q.key] === val;
                    return (
                      <Pressable key={val} testID={`opt-${q.key}-${val}`} onPress={() => setAnswers((a) => ({ ...a, [q.key]: val }))}
                        style={[styles.opt, active && styles.optActive]}>
                        <Text style={[styles.optText, active && styles.optTextActive]}>{lbl}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Pressable style={[styles.primary, (!allAnswered || busy) && { opacity: 0.5 }]} disabled={!allAnswered || busy} onPress={submit} testID="see-plan-btn">
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>See my recommendation</Text>}
            </Pressable>
            <Pressable onPress={skipToPlans} disabled={busy} testID="skip-to-plans">
              <Text style={styles.skip}>Skip — just show me the plans</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>{reco.level ? <>You&apos;re a <Text style={{ color: colors.yellow }}>{reco.level}</Text> rider</> : "Choose your plan"}</Text>
            {reco.recommended && (
              <Pressable style={styles.recoCard} onPress={() => choose(reco.recommended!.id)} testID="accept-reco">
                <View style={styles.recoTop}>
                  <Ionicons name="star" size={16} color={colors.yellow} />
                  <Text style={styles.recoBadge}>RECOMMENDED FOR YOU</Text>
                </View>
                <Text style={styles.recoTitle}>{reco.recommended.title}</Text>
                {reco.recommended.authored === false && (
                  <Text style={styles.recoNote}>A dedicated {reco.level.toLowerCase()} plan is coming soon — this is the closest match for now.</Text>
                )}
                <Text style={styles.recoCta}>Start this plan →</Text>
              </Pressable>
            )}

            <Text style={styles.pickAnother}>Or pick another plan</Text>
            {reco.plans.filter((p) => p.id !== reco.recommended?.id).map((p) => (
              <Pressable key={p.id} style={styles.planRow} onPress={() => choose(p.id)} testID={`plan-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{p.title}</Text>
                  {p.level ? <Text style={styles.planLevel}>{p.level}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </Pressable>
            ))}

            <Pressable style={styles.freeRow} onPress={() => choose("none")} testID="ride-free">
              <Ionicons name="bicycle" size={18} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>Ride free — no plan</Text>
                <Text style={styles.planLevel}>Just ride whenever you like, no schedule</Text>
              </View>
            </Pressable>

            {busy && <ActivityIndicator color={colors.yellow} style={{ marginTop: 16 }} />}
          </>
        )}
      </ScrollView>
      <ChangeStartDateModal
        visible={!!pendingPlan}
        onClose={() => finishWithStart()}
        onConfirm={(dateISO) => finishWithStart(dateISO)}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.7)" },
  scroll: { padding: spacing.xl, maxWidth: 720, width: "100%", alignSelf: "center", gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  glyph: { width: 44, height: 36 },
  wordmark: { width: 150, height: 23 },
  hi: { color: colors.textDim, fontSize: 15 },
  title: { color: colors.white, fontSize: 26, fontWeight: "900", ...textShadow("#000", 8) },
  sub: { color: colors.textDim, fontSize: 14, marginBottom: 8 },
  qBlock: { marginTop: 12, gap: 8 },
  qLabel: { color: colors.white, fontSize: 15, fontWeight: "700", ...textShadow("#000", 6) },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opt: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(12,12,11,0.78)" },
  optActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  optText: { color: colors.textDim, fontSize: 13.5, fontWeight: "600" },
  optTextActive: { color: "#000", fontWeight: "800" },
  primary: { backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: 22 },
  primaryText: { color: "#000", fontWeight: "800", fontSize: 15 },
  skip: { color: colors.textDim, fontSize: 13, textAlign: "center", paddingVertical: 12, textDecorationLine: "underline" },
  recoCard: { backgroundColor: "rgba(245,179,1,0.14)", borderWidth: 1, borderColor: colors.yellow, borderRadius: radius.lg, padding: spacing.lg, marginTop: 12, gap: 6 },
  recoTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  recoBadge: { color: colors.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  recoTitle: { color: colors.white, fontSize: 20, fontWeight: "800" },
  recoNote: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
  recoCta: { color: colors.yellow, fontSize: 14, fontWeight: "700", marginTop: 4 },
  pickAnother: { color: colors.textFaint, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 22 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(12,12,11,0.82)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginTop: 8 },
  freeRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(12,12,11,0.82)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 14, marginTop: 8 },
  planTitle: { color: colors.white, fontSize: 15, fontWeight: "700" },
  planLevel: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
});
