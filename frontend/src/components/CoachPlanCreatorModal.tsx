import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { generatePlan, acceptPlan, saveTemplate, listTemplates, deleteTemplate, renameTemplate, CreatedPlan, CreatedDay, PlanTemplate } from "@/src/lib/plan-create";
import { SwapSessionSheet } from "@/src/components/SwapSessionSheet";
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

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function DayRow({ d, onSwap }: { d: CreatedDay; onSwap?: () => void }) {
  const meta = KIND_META[d.kind] || KIND_META.rest;
  const sub = d.kind === "cycling"
    ? [d.zone, d.duration, d.tss ? `${d.tss} TSS` : ""].filter(Boolean).join(" · ")
    : d.kind === "rest" ? "Rest & recovery" : (d.duration || "");
  const tappable = d.kind === "cycling" && !!onSwap;
  const Wrap: any = tappable ? Pressable : View;
  return (
    <Wrap style={s.dayRow} {...(tappable ? { onPress: onSwap, testID: `preview-day-${d.day_name}` } : {})}>
      <Text style={s.dayName}>{d.day_name}</Text>
      <Ionicons name={meta.icon} size={15} color={meta.color} />
      <View style={{ flex: 1 }}>
        <Text style={s.dayTitle} numberOfLines={1}>{d.title}</Text>
        {sub ? <Text style={s.daySub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {tappable ? <Ionicons name="swap-horizontal" size={15} color={colors.textFaint} /> : null}
    </Wrap>
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
  const [eventOn, setEventOn] = React.useState(false);
  const [eventDate, setEventDate] = React.useState<Date>(new Date());
  const [plan, setPlan] = React.useState<CreatedPlan | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [swap, setSwap] = React.useState<{ wi: number; di: number; day: CreatedDay } | null>(null);
  const [tplSaved, setTplSaved] = React.useState(false);
  const [showTpls, setShowTpls] = React.useState(false);
  const [tpls, setTpls] = React.useState<PlanTemplate[] | null>(null);
  const [lastSwap, setLastSwap] = React.useState<{ wi: number; di: number; prev: CreatedDay } | null>(null);
  const [editTpl, setEditTpl] = React.useState<{ id: string; title: string } | null>(null);

  React.useEffect(() => {
    if (visible) { setStep("form"); setPlan(null); setErr(null); setSwap(null); setTplSaved(false); setShowTpls(false); setEventOn(false); }
  }, [visible]);

  const bumpEvent = (deltaDays: number) => {
    setEventDate((d) => { const n = new Date(d); n.setDate(n.getDate() + deltaDays); return n < new Date() ? d : n; });
  };
  const daysUntilEvent = Math.round((eventDate.getTime() - Date.now()) / 86400000);
  const weeksAvailable = Math.max(1, Math.floor(daysUntilEvent / 7) + 1);
  const eventTooClose = eventOn && weeksAvailable < weeks;
  const toggleEvent = () => {
    setEventOn((on) => {
      if (!on) { const d = new Date(); d.setDate(d.getDate() + weeks * 7); setEventDate(d); }
      return !on;
    });
  };

  const doGenerate = async () => {
    setErr(null); setStep("loading");
    try {
      const p = await generatePlan(persona.name, persona.gender, goal.trim() || "get fitter and ride stronger", weeks, days, eventOn ? isoDate(eventDate) : null);
      setPlan(p); setTplSaved(false); setStep("preview");
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

  const onSwapped = (nd: CreatedDay) => {
    setPlan((p) => {
      if (!p || !swap) return p;
      const weeksCopy = p.weeks.map((w, i) => i !== swap.wi ? w : { ...w, days: w.days.map((d, j) => j === swap.di ? { ...d, ...nd } : d) });
      return { ...p, weeks: weeksCopy };
    });
    if (swap) setLastSwap({ wi: swap.wi, di: swap.di, prev: swap.day });
  };
  const undoPreviewSwap = () => {
    setPlan((p) => {
      if (!p || !lastSwap) return p;
      const weeksCopy = p.weeks.map((w, i) => i !== lastSwap.wi ? w : { ...w, days: w.days.map((d, j) => j === lastSwap.di ? lastSwap.prev : d) });
      return { ...p, weeks: weeksCopy };
    });
    setLastSwap(null);
  };

  const openTemplates = async () => {
    setShowTpls(true); setTpls(null);
    try { setTpls(await listTemplates()); } catch { setTpls([]); }
  };
  const useTemplate = (t: PlanTemplate) => { setPlan(t.plan); setShowTpls(false); setTplSaved(true); setLastSwap(null); setStep("preview"); };
  const removeTemplate = async (id: string) => { await deleteTemplate(id); setTpls((ts) => (ts || []).filter((t) => t.id !== id)); };
  const commitRename = async () => {
    if (!editTpl) return;
    const { id, title } = editTpl;
    setEditTpl(null);
    if (!title.trim()) return;
    try { await renameTemplate(id, title.trim()); setTpls((ts) => (ts || []).map((t) => t.id === id ? { ...t, title: title.trim() } : t)); } catch { /* ignore */ }
  };
  const doSaveTemplate = async () => {
    if (!plan) return;
    try { await saveTemplate(plan); setTplSaved(true); } catch { /* ignore */ }
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

            {showTpls ? (
              <ScrollView contentContainerStyle={s.body} testID="template-list">
                <Pressable onPress={() => setShowTpls(false)} style={s.backRow}><Ionicons name="chevron-back" size={16} color={colors.yellow} /><Text style={s.backText}>Back</Text></Pressable>
                <Text style={s.label}>Start from a template</Text>
                {tpls === null ? <ActivityIndicator color={colors.yellow} style={{ marginTop: 16 }} />
                  : tpls.length === 0 ? <Text style={s.hint}>No saved templates yet. Save one from a generated plan.</Text>
                  : tpls.map((t) => (
                    <View key={t.id} style={s.tplRow}>
                      {editTpl?.id === t.id ? (
                        <>
                          <TextInput
                            testID={`tpl-rename-input-${t.id}`}
                            style={s.tplInput}
                            value={editTpl.title}
                            onChangeText={(v) => setEditTpl({ id: t.id, title: v })}
                            autoFocus
                            onSubmitEditing={commitRename}
                          />
                          <Pressable onPress={commitRename} hitSlop={8} testID={`tpl-rename-save-${t.id}`}><Ionicons name="checkmark" size={19} color={colors.green} /></Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable style={{ flex: 1 }} testID={`tpl-${t.id}`} onPress={() => useTemplate(t)}>
                            <Text style={s.tplTitle} numberOfLines={1}>{t.title}</Text>
                            <Text style={s.tplMeta}>{t.weeks_count} weeks · {t.days_per_week} days/week</Text>
                            <View style={s.tplDots}>
                              {(t.plan?.weeks?.[0]?.days ?? []).slice(0, 7).map((d, di) => (
                                <View key={di} style={[s.tplDot, { backgroundColor: (KIND_META[d.kind] || KIND_META.rest).color }]} />
                              ))}
                              <Text style={s.tplGlance}>week 1</Text>
                            </View>
                          </Pressable>
                          <Pressable onPress={() => setEditTpl({ id: t.id, title: t.title })} hitSlop={8} testID={`tpl-edit-${t.id}`}><Ionicons name="pencil" size={16} color={colors.textDim} /></Pressable>
                          <Pressable onPress={() => removeTemplate(t.id)} hitSlop={8} testID={`tpl-del-${t.id}`}><Ionicons name="trash-outline" size={17} color={colors.textDim} /></Pressable>
                        </>
                      )}
                    </View>
                  ))}
              </ScrollView>
            ) : step === "form" || step === "loading" ? (
              <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                <Pressable onPress={openTemplates} style={s.tplBtn} testID="open-templates">
                  <Ionicons name="albums-outline" size={15} color={colors.yellow} />
                  <Text style={s.tplBtnText}>Start from a template</Text>
                </Pressable>
                <Text style={s.label}>What's your goal?</Text>
                <TextInput testID="plan-goal-input" style={s.input}
                  placeholder="e.g. Ride my first 100km, get faster on climbs…"
                  placeholderTextColor={colors.textFaint} value={goal} onChangeText={setGoal} multiline editable={step === "form"} />
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

                <Pressable testID="event-toggle" onPress={toggleEvent} style={s.toggleRow}>
                  <Ionicons name={eventOn ? "checkbox" : "square-outline"} size={20} color={eventOn ? colors.yellow : colors.textDim} />
                  <Text style={s.toggleText}>I'm training for an event — peak me on the day</Text>
                </Pressable>
                {eventOn ? (
                  <View style={s.dateWrap} testID="event-date">
                    <View style={s.dateSteppers}>
                      <Pressable testID="event-minus-week" onPress={() => bumpEvent(-7)} style={s.stepBtn}><Text style={s.stepText}>−1w</Text></Pressable>
                      <Pressable testID="event-minus-day" onPress={() => bumpEvent(-1)} style={s.stepBtn}><Text style={s.stepText}>−1d</Text></Pressable>
                      <Text style={s.dateText}>{fmtDate(eventDate)}</Text>
                      <Pressable testID="event-plus-day" onPress={() => bumpEvent(1)} style={s.stepBtn}><Text style={s.stepText}>+1d</Text></Pressable>
                      <Pressable testID="event-plus-week" onPress={() => bumpEvent(7)} style={s.stepBtn}><Text style={s.stepText}>+1w</Text></Pressable>
                    </View>
                    {eventTooClose ? (
                      <View style={s.warnRow} testID="event-too-close">
                        <Ionicons name="alert-circle-outline" size={15} color="#E0A93A" />
                        <View style={{ flex: 1, gap: 8 }}>
                          <Text style={s.warnText}>
                            Your event is about {weeksAvailable} {weeksAvailable === 1 ? "week" : "weeks"} away — shorter than a {weeks}-week plan. {persona.name} will start right away and fit what's possible; for a full taper try a {weeksAvailable}-week plan or a later date.
                          </Text>
                          <Pressable testID="auto-shorten" onPress={() => setWeeks(Math.max(2, weeksAvailable))} style={s.shortenBtn}>
                            <Ionicons name="cut-outline" size={14} color="#050506" />
                            <Text style={s.shortenText}>Shorten to {Math.max(2, weeksAvailable)} weeks</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {err ? <Text style={s.err}>{err}</Text> : null}
                <Pressable testID="plan-generate" onPress={doGenerate} disabled={step === "loading"} style={[s.primary, step === "loading" && { opacity: 0.7 }]}>
                  {step === "loading" ? <ActivityIndicator color="#050506" /> : <Ionicons name="sparkles" size={16} color="#050506" />}
                  <Text style={s.primaryText}>{step === "loading" ? `${persona.name} is designing your plan…` : "Generate plan"}</Text>
                </Pressable>
                <Text style={s.hint}>{persona.name} uses your current level and ride data too.</Text>
              </ScrollView>
            ) : null}

            {!showTpls && (step === "preview" || step === "saving") && plan ? (
              <>
                <ScrollView contentContainerStyle={s.body} testID="plan-preview">
                  <View style={s.previewTop}>
                    <Text style={s.planTitle}>{plan.title}</Text>
                    <Pressable testID="save-template" onPress={doSaveTemplate} disabled={tplSaved} style={s.saveTplBtn}>
                      <Ionicons name={tplSaved ? "checkmark-circle" : "bookmark-outline"} size={14} color={tplSaved ? colors.green : colors.yellow} />
                      <Text style={[s.saveTplText, tplSaved && { color: colors.green }]}>{tplSaved ? "Saved" : "Save as template"}</Text>
                    </Pressable>
                  </View>
                  {plan.description ? <Text style={s.planDesc}>{plan.description}</Text> : null}
                  <Text style={s.metaLine}>{plan.weeks_count} weeks · {plan.days_per_week} days/week · tap a ride to swap it</Text>
                  {lastSwap ? (
                    <Pressable testID="preview-undo-swap" onPress={undoPreviewSwap} style={s.undoBanner}>
                      <Ionicons name="arrow-undo" size={14} color={colors.yellow} />
                      <Text style={s.undoText}>Swapped Week {lastSwap.wi + 1} {lastSwap.prev.day_name} — tap to undo</Text>
                    </Pressable>
                  ) : null}
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
                      {w.days.map((d, j) => <DayRow key={j} d={d} onSwap={() => setSwap({ wi: i, di: j, day: d })} />)}
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

      <SwapSessionSheet
        visible={!!swap}
        onClose={() => setSwap(null)}
        day={swap?.day ?? null}
        coachName={persona.name}
        coachGender={persona.gender}
        goal={goal}
        onSwapped={onSwapped}
      />
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
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 },
  toggleText: { color: colors.white, fontSize: 13.5, fontWeight: "700", flex: 1 },
  dateWrap: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 10 },
  dateSteppers: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  stepBtn: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.borderSoft },
  stepText: { color: colors.yellow, fontSize: 12.5, fontWeight: "800" },
  dateText: { color: colors.white, fontSize: 13, fontWeight: "800", flex: 1, textAlign: "center" },
  warnRow: { flexDirection: "row", gap: 7, marginTop: 10, backgroundColor: "rgba(224,169,58,0.1)", borderWidth: 1, borderColor: "rgba(224,169,58,0.4)", borderRadius: radius.sm, padding: 9 },
  warnText: { color: "#E9C77A", fontSize: 11.5, lineHeight: 16, flex: 1, fontWeight: "600" },
  shortenBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: "#E0A93A", borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  shortenText: { color: "#050506", fontSize: 12, fontWeight: "800" },
  undoBanner: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.4)", borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 },
  undoText: { color: colors.yellow, fontSize: 12, fontWeight: "800" },
  tplInput: { flex: 1, color: colors.white, fontSize: 14.5, fontWeight: "800", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.yellow, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 13, marginTop: 8 },
  primaryText: { color: "#050506", fontSize: 15, fontWeight: "800" },
  hint: { color: colors.textFaint, fontSize: 11.5, textAlign: "center", marginTop: 6 },
  err: { color: colors.red, fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  tplBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.03)" },
  tplBtnText: { color: colors.yellow, fontSize: 13.5, fontWeight: "800" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  backText: { color: colors.yellow, fontSize: 14, fontWeight: "800" },
  tplRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 12 },
  tplTitle: { color: colors.white, fontSize: 14.5, fontWeight: "800" },
  tplMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  tplDots: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 7 },
  tplDot: { width: 9, height: 9, borderRadius: 4.5 },
  tplGlance: { color: colors.textFaint, fontSize: 9.5, fontWeight: "700", marginLeft: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  previewTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planTitle: { color: colors.white, fontSize: 20, fontWeight: "900", flex: 1 },
  saveTplBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "rgba(255,255,255,0.04)" },
  saveTplText: { color: colors.yellow, fontSize: 11.5, fontWeight: "800" },
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
