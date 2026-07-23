import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { AppScaffold, Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useCoach, setCoach, COACHES, CoachId, COACH_STYLES, VOICE_GUIDANCE_OPTS, useCoachStyle, setCoachStyle, useVoiceGuidance, setVoiceGuidance, CoachStyle, VoiceGuidance } from "@/src/lib/coach-persona";

const PITCH: Record<CoachId, number> = { alberto: 0.82, adriana: 1.22 };
const PREVIEW_LINE = "Alright, let's ride. Hold steady and breathe — you've got this.";

/** Resolve a coach's configured device voice: the Nth Spanish voice in device
 * order (Alberto → 18, Adriana → 7), matching the workout audio logic. */
async function resolveCoachVoice(voiceNum: number): Promise<{ id?: string; lang: string }> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const seen = new Set<string>();
    const es: Speech.Voice[] = [];
    for (const v of voices) {
      if (!v.identifier || seen.has(v.identifier)) continue;
      if (!(v.language ?? "").toLowerCase().startsWith("es")) continue;
      seen.add(v.identifier);
      es.push(v);
    }
    const pick = es[voiceNum - 1] ?? es[0];
    if (pick) return { id: pick.identifier, lang: pick.language ?? "es-ES" };
  } catch {
    /* fall through to pitch-only preview */
  }
  return { lang: "es-ES" };
}

export default function SettingsScreen() {
  const persona = useCoach();
  const coachStyle = useCoachStyle();
  const voiceGuidance = useVoiceGuidance();
  const [units, setUnits] = React.useState<"metric" | "imperial">("metric");
  const [previewing, setPreviewing] = React.useState<CoachId | null>(null);
  const [toggles, setToggles] = React.useState({ coachAudio: true, autoSync: true, weeklyReport: true, restReminders: false });
  const set = (k: keyof typeof toggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  const previewVoice = async (id: CoachId) => {
    Speech.stop();
    setPreviewing(id);
    const v = await resolveCoachVoice(COACHES[id].voiceNum);
    Speech.speak(PREVIEW_LINE, {
      voice: v.id,
      language: v.lang,
      pitch: PITCH[id],
      rate: 0.92,
      onDone: () => setPreviewing(null),
      onStopped: () => setPreviewing(null),
      onError: () => setPreviewing(null),
    });
  };
  React.useEffect(() => () => { Speech.stop(); }, []);

  return (
    <AppScaffold active="settings" title="Settings" subtitle="Your profile, coach and training preferences.">
      <View style={s.row}>
        <Card testID="profile" style={{ flex: 1 }}>
          <SectionTitle label="RIDER PROFILE" />
          <View style={s.profRow}>
            <View style={s.avatar}><Ionicons name="person" size={26} color={CC.dim} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.profName}>Rider One</Text>
              <Text style={s.profSub}>Roujaune · Harmony Wellness Group</Text>
            </View>
            <Pressable testID="edit-profile" style={({ hovered }: any) => [s.editBtn, hovered && s.hover]}>
              <Text style={s.editText}>Edit</Text>
            </Pressable>
          </View>
          <View style={s.statsRow}>
            <Stat v="287 W" l="FTP" />
            <Stat v="78 kg" l="Weight" />
            <Stat v="4.4" l="W/kg" />
            <Stat v="58" l="VO2 Max" />
          </View>
        </Card>

        <Card testID="coach-select" style={{ flex: 1 }}>
          <SectionTitle label="YOUR COACH" color={CC.rouge} />
          <View style={s.coachRow}>
            {(Object.keys(COACHES) as CoachId[]).map((id) => {
              const c = COACHES[id]; const on = persona.id === id;
              return (
                <Pressable key={id} testID={`coach-${id}`} onPress={() => setCoach(id)} accessibilityState={{ selected: on }}
                  style={[s.coachCard, on && s.coachOn]}>
                  <Image source={c.image} style={s.coachImg} contentFit="cover" contentPosition="top center" />
                  <Text style={[s.coachName, on && { color: CC.white }]}>{c.name}</Text>
                  <Text style={s.coachRole}>Voice {c.voiceNum}</Text>
                  {on && <View style={s.coachCheck}><Ionicons name="checkmark" size={13} color="#04210F" /></View>}
                  <Pressable testID={`preview-${id}`} onPress={() => previewVoice(id)} hitSlop={8}
                    accessibilityRole="button" accessibilityLabel={`Preview ${c.name}'s voice`}
                    style={({ hovered }: any) => [s.previewBtn, hovered && s.previewHover]}>
                    <Ionicons name={previewing === id ? "volume-high" : "play"} size={13} color={CC.white} />
                    <Text style={s.previewText}>{previewing === id ? "Playing…" : "Preview voice"}</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.coachHint}>Your coach gives live audio cues, post-ride debriefs and adapts your plan.</Text>
        </Card>
      </View>

      <Card testID="coach-preference">
        <SectionTitle label="COACH PREFERENCE" color={CC.rouge} />
        <Text style={s.groupLabel}>Coaching Style</Text>
        <View style={s.optionGrid}>
          {COACH_STYLES.map((o) => {
            const on = coachStyle === o.id;
            return (
              <Pressable key={o.id} testID={`style-${o.id}`} onPress={() => setCoachStyle(o.id as CoachStyle)} accessibilityState={{ selected: on }}
                style={[s.optionCard, on && s.optionOn]}>
                <View style={s.optionHead}>
                  <Text style={[s.optionLabel, on && { color: CC.white }]}>{o.label}</Text>
                  {on ? <Ionicons name="checkmark-circle" size={16} color={CC.rouge} /> : <View style={s.optionDot} />}
                </View>
                <Text style={s.optionHint}>{o.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[s.groupLabel, { marginTop: 18 }]}>Voice Guidance</Text>
        <View style={s.optionGrid}>
          {VOICE_GUIDANCE_OPTS.map((o) => {
            const on = voiceGuidance === o.id;
            return (
              <Pressable key={o.id} testID={`guidance-${o.id}`} onPress={() => setVoiceGuidance(o.id as VoiceGuidance)} accessibilityState={{ selected: on }}
                style={[s.optionCard, on && s.optionOn]}>
                <View style={s.optionHead}>
                  <Text style={[s.optionLabel, on && { color: CC.white }]}>{o.label}</Text>
                  {on ? <Ionicons name="checkmark-circle" size={16} color={CC.rouge} /> : <View style={s.optionDot} />}
                </View>
                <Text style={s.optionHint}>{o.hint}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.coachHint}>Applies to {persona.name}&apos;s live cues, previews, summaries and recovery guidance across the app.</Text>
      </Card>

      <Card testID="preferences">
        <SectionTitle label="TRAINING PREFERENCES" />
        <View style={[s.prefRow, s.divider]}>
          <View style={{ flex: 1 }}><Text style={s.prefTitle}>Units</Text><Text style={s.prefSub}>Distance, weight and speed</Text></View>
          <View style={s.segment}>
            <Pressable testID="units-metric" onPress={() => setUnits("metric")} style={[s.seg, units === "metric" && s.segOn]}><Text style={[s.segText, units === "metric" && s.segTextOn]}>Metric</Text></Pressable>
            <Pressable testID="units-imperial" onPress={() => setUnits("imperial")} style={[s.seg, units === "imperial" && s.segOn]}><Text style={[s.segText, units === "imperial" && s.segTextOn]}>Imperial</Text></Pressable>
          </View>
        </View>
        <PrefToggle label="Coach audio cues" sub="Live spoken coaching during rides" on={toggles.coachAudio} onToggle={() => set("coachAudio")} testID="tg-coachAudio" divider />
        <PrefToggle label="Auto-sync activities" sub="Send completed rides to connected services" on={toggles.autoSync} onToggle={() => set("autoSync")} testID="tg-autoSync" divider />
        <PrefToggle label="Weekly report" sub={`${persona.name}'s summary every Sunday`} on={toggles.weeklyReport} onToggle={() => set("weeklyReport")} testID="tg-weeklyReport" divider />
        <PrefToggle label="Rest-day reminders" sub="Gentle nudge to recover" on={toggles.restReminders} onToggle={() => set("restReminders")} testID="tg-restReminders" />
      </Card>

      <Card testID="about">
        <SectionTitle label="ABOUT" color={CC.rouge} />
        {[
          { icon: "shield-checkmark-outline", label: "Privacy & Data" },
          { icon: "document-text-outline", label: "Terms of Service" },
          { icon: "help-circle-outline", label: "Help & Support" },
        ].map((r, i, arr) => (
          <Pressable key={r.label} testID={`about-${i}`} style={({ hovered }: any) => [s.aboutRow, i < arr.length - 1 && s.divider, hovered && { backgroundColor: "rgba(255,255,255,0.03)" }]}>
            <Ionicons name={r.icon as any} size={18} color={CC.dim} />
            <Text style={s.aboutText}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={15} color={CC.dim} />
          </Pressable>
        ))}
        <Text style={s.version}>ROUJAUNE · Part of Harmony Wellness Group · v1.0.0</Text>
      </Card>
    </AppScaffold>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return <View style={s.stat}><Text style={s.statV}>{v}</Text><Text style={s.statL}>{l}</Text></View>;
}
function PrefToggle({ label, sub, on, onToggle, testID, divider }: { label: string; sub: string; on: boolean; onToggle: () => void; testID: string; divider?: boolean }) {
  return (
    <View style={[s.prefRow, divider && s.divider]}>
      <View style={{ flex: 1 }}><Text style={s.prefTitle}>{label}</Text><Text style={s.prefSub}>{sub}</Text></View>
      <Toggle testID={testID} on={on} onToggle={onToggle} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  profRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  profName: { color: CC.white, fontSize: 18, fontWeight: "800" },
  profSub: { color: CC.dim, fontSize: 12, marginTop: 2 },
  editBtn: { borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  editText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 20, marginTop: 18, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 14 },
  stat: {},
  statV: { color: CC.white, fontSize: 18, fontWeight: "800" },
  statL: { color: CC.dim, fontSize: 11, marginTop: 1 },
  coachRow: { flexDirection: "row", gap: 12 },
  coachCard: { flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1.5, borderColor: CC.borderSoft, padding: 14 },
  coachOn: { borderColor: CC.rouge, backgroundColor: "rgba(201,23,39,0.06)" },
  coachImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.08)" },
  coachName: { color: CC.dim, fontSize: 15, fontWeight: "800", marginTop: 8 },
  coachRole: { color: CC.dim, fontSize: 11, marginTop: 1 },
  coachCheck: { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: CC.green, alignItems: "center", justifyContent: "center" },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  previewHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  previewText: { color: CC.white, fontSize: 12, fontWeight: "700" },
  coachHint: { color: CC.dim, fontSize: 11.5, marginTop: 12, lineHeight: 16 },
  groupLabel: { color: CC.white, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionCard: { flexGrow: 1, flexBasis: "47%", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, borderWidth: 1.5, borderColor: CC.borderSoft, paddingVertical: 12, paddingHorizontal: 14 },
  optionOn: { borderColor: CC.rouge, backgroundColor: "rgba(201,23,39,0.06)" },
  optionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  optionLabel: { color: CC.dim, fontSize: 14, fontWeight: "700", flex: 1 },
  optionDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)" },
  optionHint: { color: CC.dim, fontSize: 11.5, marginTop: 4, lineHeight: 15 },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  prefTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  prefSub: { color: CC.dim, fontSize: 12, marginTop: 1 },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 },
  seg: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 8 },
  segOn: { backgroundColor: CC.rouge },
  segText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  segTextOn: { color: "#fff" },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 8 },
  aboutText: { flex: 1, color: CC.white, fontSize: 14, fontWeight: "600" },
  version: { color: CC.dim, fontSize: 11, textAlign: "center", marginTop: 14 },
});
