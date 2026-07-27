import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { AppScaffold, Card, SectionTitle, Toggle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useCoach, setCoach, COACHES, CoachId, COACH_STYLES, VOICE_GUIDANCE_OPTS, useCoachStyle, setCoachStyle, useVoiceGuidance, setVoiceGuidance, CoachStyle, VoiceGuidance, SPEECH_RATES, useCoachRate, setCoachRate } from "@/src/lib/coach-persona";
import { resolveBothCoachVoices, ResolvedVoice, COACH_PITCH, loadSpanishVoices, CoachVoiceOption } from "@/src/lib/coach-voice";
import { getVoiceId, setVoiceId } from "@/src/lib/prefs";
import { useSettings, WHEEL_PRESETS } from "@/src/lib/settings";

const PREVIEW_LINE = "Alright, let's ride. Hold steady and breathe — you've got this.";

export default function SettingsScreen() {
  const persona = useCoach();
  const router = useRouter();
  const { settings, setSetting } = useSettings();
  const coachStyle = useCoachStyle();
  const voiceGuidance = useVoiceGuidance();
  const speechRate = useCoachRate();
  const voices = React.useRef<Record<CoachId, ResolvedVoice> | null>(null);
  const [available, setAvailable] = React.useState<CoachVoiceOption[]>([]);
  const [savedVoice, setSavedVoice] = React.useState<Record<CoachId, string | null>>({ alberto: null, adriana: null });
  const [previewing, setPreviewing] = React.useState<CoachId | null>(null);

  const refreshVoices = React.useCallback(async () => {
    const saved = { alberto: await getVoiceId("alberto"), adriana: await getVoiceId("adriana") };
    setSavedVoice(saved);
    voices.current = await resolveBothCoachVoices(saved);
    setAvailable(await loadSpanishVoices());
  }, []);

  React.useEffect(() => { refreshVoices(); }, [refreshVoices]);

  const previewVoice = async (id: CoachId, voiceId?: string) => {
    Speech.stop();
    setPreviewing(id);
    const v = voiceId
      ? { id: voiceId, lang: available.find((o) => o.id === voiceId)?.lang ?? "es-ES" }
      : (voices.current?.[id] ?? (await resolveBothCoachVoices({ alberto: savedVoice.alberto, adriana: savedVoice.adriana }))[id]);
    Speech.speak(PREVIEW_LINE, {
      voice: v.id,
      language: v.lang,
      pitch: COACH_PITCH[id],
      rate: speechRate,
      onDone: () => setPreviewing(null),
      onStopped: () => setPreviewing(null),
      onError: () => setPreviewing(null),
    });
  };

  const chooseVoice = async (voiceId: string) => {
    await setVoiceId(persona.id, voiceId);
    setSavedVoice((sv) => ({ ...sv, [persona.id]: voiceId }));
    voices.current = await resolveBothCoachVoices({ ...savedVoice, [persona.id]: voiceId });
    previewVoice(persona.id, voiceId);
  };

  React.useEffect(() => () => { Speech.stop(); }, []);

  return (
    <AppScaffold active="settings" title="Settings" subtitle="Coach, equipment and app preferences.">
      <View style={s.row}>
        <Card testID="coach-select" style={{ flex: 1 }}>
          <SectionTitle label="YOUR COMPANION COACH" color={CC.rouge} />
          <View style={s.coachRow}>
            {(Object.keys(COACHES) as CoachId[]).map((id) => {
              const c = COACHES[id]; const on = persona.id === id;
              return (
                <Pressable key={id} testID={`coach-${id}`} onPress={() => setCoach(id)} accessibilityState={{ selected: on }}
                  style={[s.coachCard, on && s.coachOn]}>
                  <Image source={c.image} style={s.coachImg} contentFit="cover" contentPosition="top center" />
                  <Text style={[s.coachName, on && { color: CC.white }]}>{c.name}</Text>
                  <Text style={s.coachRole}>{c.gender === "male" ? "Spanish accent · male" : "Spanish accent · female"}</Text>
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
          <Text style={s.coachHint}>Your companion coach gives live audio cues, post-ride debriefs and adapts your plan.</Text>
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

      <Card testID="voice-tuning">
        <SectionTitle label="VOICE FINE-TUNING" color={CC.rouge} />
        <Text style={s.groupLabel}>Speaking speed</Text>
        <View style={s.speedRow}>
          {SPEECH_RATES.map((r) => {
            const on = Math.abs(speechRate - r.rate) < 0.001;
            return (
              <Pressable key={r.id} testID={`rate-${r.id}`} onPress={() => setCoachRate(r.rate)} accessibilityState={{ selected: on }}
                style={[s.speedBtn, on && s.speedOn]}>
                <Text style={[s.speedText, on && { color: CC.white }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.voiceHead}>
          <Text style={[s.groupLabel, { marginTop: 18, marginBottom: 0 }]}>Voice for {persona.name}</Text>
          <Image source={persona.image} style={s.voiceHeadAvatar} contentFit="cover" contentPosition="top center" />
        </View>
        {available.length === 0 ? (
          <Text style={s.coachHint}>Voice options appear here on your device. Open the app in Expo Go or a build to choose from your installed Spanish voices.</Text>
        ) : (
          <View style={s.voiceGrid}>
            {available.map((v) => {
              const on = savedVoice[persona.id] === v.id;
              return (
                <Pressable key={v.id} testID={`voice-${v.id}`} onPress={() => chooseVoice(v.id)} accessibilityState={{ selected: on }}
                  style={[s.voiceChip, on && s.voiceChipOn]}>
                  <Ionicons name={on ? "checkmark-circle" : "mic-outline"} size={14} color={on ? CC.rouge : CC.dim} />
                  <Text style={[s.voiceChipText, on && { color: CC.white }]}>{v.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={s.coachHint}>Pick which installed Spanish voice {persona.name} uses. Tapping a voice previews it. Switch coaches above to tune the other.</Text>
      </Card>

      <Card testID="equipment-prefs">
        <SectionTitle label="EQUIPMENT & RIDE" color={CC.rouge} />
        <PrefToggle label="Smart trainer" sub="Control resistance (ERG) from your workouts" on={settings.hasTrainer} onToggle={() => setSetting("hasTrainer", !settings.hasTrainer)} testID="tg-hasTrainer" divider />
        <PrefToggle label="Heart-rate / wearable" sub="Show live heart rate and recovery data" on={settings.hasWearable} onToggle={() => setSetting("hasWearable", !settings.hasWearable)} testID="tg-hasWearable" divider />
        <PrefToggle label="Live HUD overlay" sub="On-screen metrics during rides" on={settings.hudEnabled} onToggle={() => setSetting("hudEnabled", !settings.hudEnabled)} testID="tg-hudEnabled" divider />
        <PrefToggle label="Seated mode" sub={`${persona.name} avoids standing-effort cues`} on={settings.seatedMode} onToggle={() => setSetting("seatedMode", !settings.seatedMode)} testID="tg-seatedMode" divider />
        <PrefToggle label="Demo mode" sub="Simulate sensor data without hardware" on={settings.demoMode} onToggle={() => setSetting("demoMode", !settings.demoMode)} testID="tg-demoMode" />
        <Text style={s.coachHint}>These stay in sync with the pre-ride setup and your Connections — one source of truth, saved to your account.</Text>
      </Card>

      <Card testID="wheel-speed">
        <SectionTitle label="WHEEL & SPEED" color={CC.rouge} />
        <Text style={s.prefTitle}>Wheel circumference</Text>
        <Text style={[s.prefSub, { marginBottom: 12 }]}>Converts wheel-sensor revolutions into your live speed. Pick your tyre or set an exact roll-out.</Text>
        <View style={s.voiceGrid}>
          {WHEEL_PRESETS.map((p) => {
            const on = settings.wheelCircumference === p.mm;
            return (
              <Pressable key={p.mm} testID={`wheel-${p.mm}`} onPress={() => setSetting("wheelCircumference", p.mm)} accessibilityState={{ selected: on }}
                style={[s.voiceChip, on && s.voiceChipOn]}>
                <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={14} color={on ? CC.rouge : CC.dim} />
                <Text style={[s.voiceChipText, on && { color: CC.white }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[s.ftpRow, { borderTopWidth: 1, borderTopColor: CC.borderSoft, marginTop: 14, paddingTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.prefTitle}>Custom roll-out</Text>
            <Text style={s.prefSub}>Fine-tune to your exact measured circumference.</Text>
          </View>
          <View style={s.ftpStepper}>
            <Pressable testID="wheel-minus" onPress={() => setSetting("wheelCircumference", Math.max(1000, settings.wheelCircumference - 1))} style={s.ftpBtn}>
              <Ionicons name="remove" size={18} color={CC.white} />
            </Pressable>
            <View style={[s.ftpValueWrap, { minWidth: 84 }]}>
              <Text style={s.ftpValue}>{settings.wheelCircumference}</Text>
              <Text style={s.ftpUnit}>mm</Text>
            </View>
            <Pressable testID="wheel-plus" onPress={() => setSetting("wheelCircumference", Math.min(2400, settings.wheelCircumference + 1))} style={s.ftpBtn}>
              <Ionicons name="add" size={18} color={CC.white} />
            </Pressable>
          </View>
        </View>
        <Pressable testID="wheel-calibrate" onPress={() => router.push("/wheel-calibration")}
          style={({ hovered }: any) => [s.calibrateBtn, hovered && s.calibrateHover]}>
          <Ionicons name="locate" size={16} color={CC.rouge} />
          <View style={{ flex: 1 }}>
            <Text style={s.calibrateText}>Auto-calibrate with GPS</Text>
            <Text style={s.calibrateSub}>Ride outdoors to measure your exact roll-out automatically.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={CC.dim} />
        </Pressable>
        <Text style={s.coachHint}>Only used with a wheel / speed sensor. A smart trainer reports speed directly.</Text>
      </Card>

      <Card testID="preferences">
        <SectionTitle label="TRAINING PREFERENCES" />
        <View style={[s.prefRow, s.divider]}>
          <View style={{ flex: 1 }}><Text style={s.prefTitle}>Units</Text><Text style={s.prefSub}>Distance, weight and speed</Text></View>
          <View style={s.segment}>
            <Pressable testID="units-metric" onPress={() => setSetting("units", "metric")} style={[s.seg, settings.units === "metric" && s.segOn]}><Text style={[s.segText, settings.units === "metric" && s.segTextOn]}>Metric</Text></Pressable>
            <Pressable testID="units-imperial" onPress={() => setSetting("units", "imperial")} style={[s.seg, settings.units === "imperial" && s.segOn]}><Text style={[s.segText, settings.units === "imperial" && s.segTextOn]}>Imperial</Text></Pressable>
          </View>
        </View>
        <PrefToggle label="Coach audio cues" sub="Live spoken coaching during rides" on={settings.coachAudio} onToggle={() => setSetting("coachAudio", !settings.coachAudio)} testID="tg-coachAudio" divider />
        <PrefToggle label="Auto-sync activities" sub="Send completed rides to connected services" on={settings.autoSync} onToggle={() => setSetting("autoSync", !settings.autoSync)} testID="tg-autoSync" divider />
        <PrefToggle label="Weekly report" sub={`${persona.name}'s summary every Sunday`} on={settings.weeklyReport} onToggle={() => setSetting("weeklyReport", !settings.weeklyReport)} testID="tg-weeklyReport" divider />
        <PrefToggle label="Rest-day reminders" sub="Gentle nudge to recover" on={settings.restReminders} onToggle={() => setSetting("restReminders", !settings.restReminders)} testID="tg-restReminders" />
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
  speedRow: { flexDirection: "row", gap: 10 },
  speedBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: CC.borderSoft, backgroundColor: "rgba(255,255,255,0.02)", minHeight: 46 },
  speedOn: { borderColor: CC.rouge, backgroundColor: "rgba(201,23,39,0.08)" },
  speedText: { color: CC.dim, fontSize: 13.5, fontWeight: "700" },
  voiceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 },
  voiceHeadAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)" },
  voiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  voiceChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: CC.borderSoft, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.02)", minHeight: 42 },
  voiceChipOn: { borderColor: CC.rouge, backgroundColor: "rgba(201,23,39,0.08)" },
  voiceChipText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  ftpRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6 },
  ftpStepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  ftpBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: CC.border, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  ftpValueWrap: { flexDirection: "row", alignItems: "flex-end", minWidth: 66, justifyContent: "center" },
  ftpValue: { color: CC.white, fontSize: 24, fontWeight: "900" },
  ftpUnit: { color: CC.dim, fontSize: 13, fontWeight: "700", marginBottom: 3, marginLeft: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: CC.borderSoft },
  prefTitle: { color: CC.white, fontSize: 14, fontWeight: "700" },
  prefSub: { color: CC.dim, fontSize: 12, marginTop: 1 },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 },
  seg: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 8 },
  segOn: { backgroundColor: CC.rouge },
  segText: { color: CC.dim, fontSize: 12.5, fontWeight: "700" },
  segTextOn: { color: "#fff" },
  calibrateBtn: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "rgba(201,23,39,0.05)", minHeight: 46 },
  calibrateHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(201,23,39,0.09)" },
  calibrateText: { color: CC.white, fontSize: 13.5, fontWeight: "700" },
  calibrateSub: { color: CC.dim, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 8 },
  aboutText: { flex: 1, color: CC.white, fontSize: 14, fontWeight: "600" },
  version: { color: CC.dim, fontSize: 11, textAlign: "center", marginTop: 14 },
});
