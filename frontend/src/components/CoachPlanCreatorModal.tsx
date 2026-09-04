import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { generatePlan, acceptPlan, CreatedPlan, CreatedDay } from "@/src/lib/plan-create";
import type { CoachPersona } from "@/src/lib/coach-persona";

const WEEK_OPTS = [4, 6, 8, 12];
const DAY_OPTS = [3, 4, 5];

const KIND_META: Record<string, { icon: any; color: string }> = {
  cycling: { icon: "bicycle", color: colors.yellow },
  strength: { icon: "barbell-outline", color: "#E0A93A" },
  mobility: { icon: "body-outline", color: "#E0A93A" },
  recovery: { icon: "leaf-outline", color: colors.green },
  balance: { icon: "walk-outline", color: "#E0A93A" },
  rest: { icon: "bed-outline", color: "#8A6FE0" },
};

function DayRow({ d }: { d: CreatedDay }) {
  const meta = KIND_META[d.kind] || KIND_META.rest;
  const sub = d.kind === "cycling"
    ? [d.zone, d.duration, d.tss ? `${d.tss} TSS` : ""].filter(Boolean).join(" · ")
    : d.kind === "rest" ? "Rest & recovery" : (d.duration || "");
  return (
    <View style={s.dayRow}>
      <Text style={s.dayName}>{d.day_name}</Text>
      <Ionicons name={meta.icon} size={15} color={meta.color} />
      <View style={{ flex: 1 }}>
        <Text style={s.dayTitle} numberOfLines={1}>{d.title}</Text>
        {sub ? <Text style={s.daySub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function CoachPlanCreatorModal({
  visible, onClose, persona, onAccepted,
}: {
  visible: boolean; onClose: () => void; persona: CoachPersona; onAccepted?: (title: string) => void;
}) {
  const [step, setStep] = React.useState<"form" | "loading" | "preview" | "saving">("form");
  const [goal, setGoal] = React.useState("");
  const [weeks, setWeeks] = React.useState(8);
  const [days, setDays] = React.useState(4);
  const [plan, setPlan] = React.useState<CreatedPlan | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) { setStep("form"); setPlan(null); setErr(null); }
  }, [visible]);

  const doGenerate = async () => {
    setErr(null); setStep("loading");
    try {
      const p = await generatePlan(persona.name, persona.gender, goal.trim() || "get fitter and ride stronger", weeks, days);
      setPlan(p); setStep("preview");
    } catch {
      setErr(`${persona.name} couldn't build the plan just now. Please try again.`); setStep("form");
    }
  };

  const doAccept = async () => {
    if (!plan) return;
    setStep("saving");
    try {
      const r = await acceptPlan(plan, persona.name);
      onAccepted?.(r.title);
      onClose();
    } catch {
      setErr("Couldn't save the plan. Please try again."); setStep("preview");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.center}>
          <View style={s.card} testID="plan-creator">
            <View style={s.head}>
              <Ionicons name="sparkles" size={18} color={colors.yellow} />
              <Text style={s.headTitle}>{step === "preview" || step === "saving" ? "Review your plan" : `Build a plan with ${persona.name}`}</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={onClose} hitSlop={10} testID="plan-creator-close" accessibilityLabel="Close" accessibilityRole="button">
                <Ionicons name="close" size={20} color={colors.textDim} />
              </Pressable>
            </View>

            {step === "form" || step === "loading" ? (
              <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                <Text style={s.label}>What's your goal?</Text>
                <TextInput
                  testID="plan-goal-input"
                  style={s.input}
                  placeholder="e.g. Ride my first 100km, get faster on climbs…"
                  placeholderTextColor={colors.textFaint}
                  value={goal}
                  onChangeText={setGoal}
                  multiline
                  editable={step === "form"}
                />
                <Text style={s.label}>How many weeks?</Text>
                <View style={s.chips}>
                  {WEEK_OPTS.map((w) => (
                    <Pressable key={w} testID={`weeks-${w}`} onPress={() => setWeeks(w)} style={[s.chip, weeks === w && s.chipOn]}>
                      <Text style={[s.chipText, weeks === w && s.chipTextOn]}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.label}>Days per week</Text>
                <View style={s.chips}>
                  {DAY_OPTS.map((d) => (
                    <Pressable key={d} testID={`days-${d}`} onPress={() => setDays(d)} style={[s.chip, days === d && s.chipOn]}>
                      <Text style={[s.chipText, days === d && s.chipTextOn]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
                {err ? <Text style={s.err}>{err}</Text> : null}
                <Pressable testID="plan-generate" onPress={doGenerate} disabled={step === "loading"} style={[s.primary, step === "loading" && { opacity: 0.7 }]}>
                  {step === "loading" ? <ActivityIndicator color="#050506" /> : <Ionicons name="sparkles" size={16} color="#050506" />}
                  <Text style={s.primaryText}>{step === "loading" ? `${persona.name} is designing your plan…` : "Generate plan"}</Text>
                </Pressable>
                <Text style={s.hint}>{persona.name} uses your current level and ride data too.</Text>
              </ScrollView>
            ) : null}

            {(step === "preview" || step === "saving") && plan ? (
              <>
                <ScrollView contentContainerStyle={s.body} testID="plan-preview">
                  <Text style={s.planTitle}>{plan.title}</Text>
                  {plan.description ? <Text style={s.planDesc}>{plan.description}</Text> : null}
                  <Text style={s.metaLine}>{plan.weeks_count} weeks · {plan.days_per_week} days/week</Text>
                  {plan.goals?.length ? (
                    <View style={s.goalsWrap}>
                      {plan.goals.map((g, i) => (
                        <View key={i} style={s.goalRow}>
                          <Ionicons name="flag-outline" size={14} color={colors.yellow} />
                          <Text style={s.goalText} numberOfLines={2}>{g.title}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {plan.weeks.map((w, i) => (
                    <View key={i} style={s.weekBlock}>
                      <Text style={s.weekHead}>Week {i + 1} · {w.focus}</Text>
                      {w.days.map((d, j) => <DayRow key={j} d={d} />)}
                    </View>
                  ))}
                  {err ? <Text style={s.err}>{err}</Text> : null}
                </ScrollView>
                <View style={s.footer}>
                  <Pressable testID="plan-regenerate" onPress={() => setStep("form")} disabled={step === "saving"} style={[s.ghost, { flex: 1 }]}>
                    <Ionicons name="refresh" size={15} color={colors.white} />
                    <Text style={s.ghostText}>Adjust</Text>
                  </Pressable>
                  <Pressable testID="plan-accept" onPress={doAccept} disabled={step === "saving"} style={[s.primary, { flex: 1.4, marginTop: 0 }]}>
                    {step === "saving" ? <ActivityIndicator color="#050506" /> : <Ionicons name="checkmark" size={16} color="#050506" />}
                    <Text style={s.primaryText}>{step === "saving" ? "Saving…" : "Accept plan"}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(4,4,6,0.78)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  card: { width: "100%", maxWidth: 560, maxHeight: "88%", backgroundColor: "#141210", borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  headTitle: { color: colors.white, fontSize: 16, fontWeight: "800" },
  body: { padding: spacing.md, gap: 10 },
  label: { color: colors.textDim, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.3, marginTop: 4 },
  input: { color: colors.white, fontSize: 15, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { minWidth: 52, alignItems: "center", paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "rgba(255,255,255,0.04)" },
  chipOn: { borderColor: colors.yellow, backgroundColor: colors.yellow + "22" },
  chipText: { color: colors.textDim, fontSize: 15, fontWeight: "800" },
  chipTextOn: { color: colors.yellow },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 13, marginTop: 8 },
  primaryText: { color: "#050506", fontSize: 15, fontWeight: "800" },
  hint: { color: colors.textFaint, fontSize: 11.5, textAlign: "center", marginTop: 6 },
  err: { color: colors.red, fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  planTitle: { color: colors.white, fontSize: 20, fontWeight: "900" },
  planDesc: { color: colors.textDim, fontSize: 13.5, lineHeight: 19 },
  metaLine: { color: colors.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  goalsWrap: { gap: 6, marginTop: 2 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalText: { color: colors.white, fontSize: 13, fontWeight: "600", flex: 1 },
  weekBlock: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 10, gap: 6, marginTop: 6 },
  weekHead: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  dayName: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", width: 34 },
  dayTitle: { color: colors.white, fontSize: 13, fontWeight: "700" },
  daySub: { color: colors.textDim, fontSize: 11 },
  footer: { flexDirection: "row", gap: 10, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  ghost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingVertical: 13 },
  ghostText: { color: colors.white, fontSize: 14, fontWeight: "800" },
});
