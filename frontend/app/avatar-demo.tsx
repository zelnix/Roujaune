import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  AvatarSelector, AvatarCustomizer, CyclistAvatar,
  avatarById, DEFAULT_INPUTS, DEFAULT_CHOICE, AvatarChoice, Appearance,
} from "@/src/avatar/CyclistAvatarSystem";

const C = { bg: "#0B0B0B", card: "#161616", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230", stage: "#101418" };

export default function AvatarDemo() {
  const [choice, setChoice] = React.useState<AvatarChoice>(DEFAULT_CHOICE);
  const [cadence, setCadence] = React.useState(85);
  const [power, setPower] = React.useState(210);
  const [resistance, setResistance] = React.useState(45);
  const [isStanding, setStanding] = React.useState(false);
  const [isPaused, setPaused] = React.useState(false);

  const config = avatarById(choice.avatarId);
  const appearance: Appearance = { ...config.defaults, ...choice.appearance };
  const inputs = { ...DEFAULT_INPUTS, cadence, power, resistance, speed: Math.max(4, power / 8 + cadence / 6), isStanding, isPaused };

  const patchAppearance = (patch: Partial<Appearance>) =>
    setChoice((c) => ({ ...c, appearance: { ...c.appearance, ...patch } }));

  // Reset appearance overrides when switching avatars (keep their identity kit).
  const pickAvatar = (id: string) => setChoice({ avatarId: id, appearance: {} });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Roujaune Avatar Studio", headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* stage */}
          <View style={styles.stage}>
            <CyclistAvatar config={config} appearance={choice.appearance} inputs={inputs} size={240} />
            <View style={styles.stageTag}>
              <Text style={styles.stageTagText}>{isPaused ? "PAUSED" : isStanding ? "STANDING CLIMB" : power > 260 ? "HARD EFFORT" : power > 170 ? "MODERATE" : power > 90 ? "EASY" : "RECOVERY"}</Text>
            </View>
          </View>

          <Section title="Choose avatar">
            <AvatarSelector value={choice.avatarId} onChange={pickAvatar} />
          </Section>

          <Section title="Trainer inputs (demo)">
            <Stepper label="Cadence" unit="rpm" value={cadence} min={0} max={130} step={5} onChange={setCadence} />
            <Stepper label="Power" unit="W" value={power} min={0} max={420} step={20} onChange={setPower} />
            <Stepper label="Resistance" unit="%" value={resistance} min={0} max={100} step={10} onChange={setResistance} />
            <ToggleRow label="Standing climb" value={isStanding} onChange={setStanding} />
            <ToggleRow label="Paused" value={isPaused} onChange={setPaused} />
          </Section>

          <Section title="Customise kit & glasses">
            <AvatarCustomizer appearance={appearance} onChange={patchAppearance} />
          </Section>
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stepper({ label, unit, value, min, max, step, onChange }: {
  label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepCtrl}>
        <Pressable testID={`dec-${label}`} onPress={() => onChange(clamp(value - step))} style={styles.stepBtn} hitSlop={8}><Text style={styles.stepBtnText}>–</Text></Pressable>
        <Text style={styles.stepValue}>{value} <Text style={styles.stepUnit}>{unit}</Text></Text>
        <Pressable testID={`inc-${label}`} onPress={() => onChange(clamp(value + step))} style={styles.stepBtn} hitSlop={8}><Text style={styles.stepBtnText}>+</Text></Pressable>
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" testID={`toggle-${label}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  stage: { backgroundColor: C.stage, borderRadius: 20, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", paddingVertical: 12, minHeight: 300, overflow: "hidden" },
  stageTag: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
  stageTagText: { color: C.accent, fontWeight: "800", fontSize: 11, letterSpacing: 0.6 },
  section: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 },
  sectionTitle: { color: C.text, fontWeight: "800", fontSize: 15, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepLabel: { color: C.text, fontSize: 14, fontWeight: "600" },
  stepCtrl: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: C.text, fontSize: 20, fontWeight: "800", marginTop: -2 },
  stepValue: { color: C.text, fontSize: 15, fontWeight: "800", minWidth: 74, textAlign: "center" },
  stepUnit: { color: C.dim, fontSize: 12, fontWeight: "600" },
});
