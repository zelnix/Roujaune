import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Rider3D, KIT_PRESETS, KitPresetKey } from "@/src/avatar3d/Rider3D";

const C = { bg: "#0B0B0B", card: "#161616", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230", stage: "#0E1216" };
const PRESET_KEYS = Object.keys(KIT_PRESETS) as KitPresetKey[];

export default function Avatar3DDemo() {
  const [cadence, setCadence] = React.useState(85);
  const [power, setPower] = React.useState(210);
  const [isStanding, setStanding] = React.useState(false);
  const [isPaused, setPaused] = React.useState(false);
  const [preset, setPreset] = React.useState<KitPresetKey>("yellow");

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "3D Rider (preview)", headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.stage}>
            <Rider3D size={300} inputs={{ cadence, power, isStanding, isPaused, preset }} />
          </View>
          <Text style={styles.note}>Real-time 3D rider — a rigged human on a procedural bike with IK pedalling. Legs track the pedals, cadence sets the pace, power/standing drive the lean. Best on a device / Expo Go (GPU).</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inputs</Text>
            <Stepper label="Cadence" unit="rpm" value={cadence} min={0} max={130} step={5} onChange={setCadence} />
            <Stepper label="Power" unit="W" value={power} min={0} max={420} step={20} onChange={setPower} />
            <Row label="Standing climb"><Switch value={isStanding} onValueChange={setStanding} trackColor={{ true: C.accent, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" /></Row>
            <Row label="Paused"><Switch value={isPaused} onValueChange={setPaused} trackColor={{ true: C.accent, false: "rgba(255,255,255,0.2)" }} thumbColor="#fff" /></Row>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROUJAUNE kit</Text>
            <View style={styles.swatches}>
              {PRESET_KEYS.map((k) => {
                const p = KIT_PRESETS[k];
                return (
                  <Pressable key={k} onPress={() => setPreset(k)} style={[styles.kit, preset === k && styles.kitActive]}>
                    <View style={styles.kitDots}>
                      <View style={[styles.kitDot, { backgroundColor: p.jersey }]} />
                      <View style={[styles.kitDot, { backgroundColor: p.shorts }]} />
                    </View>
                    <Text style={styles.kitLabel}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text>{children}</View>;
}
function Stepper({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.ctrl}>
        <Pressable onPress={() => onChange(clamp(value - step))} style={styles.btn} hitSlop={8}><Text style={styles.btnText}>–</Text></Pressable>
        <Text style={styles.val}>{value} <Text style={styles.unit}>{unit}</Text></Text>
        <Pressable onPress={() => onChange(clamp(value + step))} style={styles.btn} hitSlop={8}><Text style={styles.btnText}>+</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  stage: { backgroundColor: C.stage, borderRadius: 20, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", minHeight: 300 },
  note: { color: C.dim, fontSize: 12.5, lineHeight: 18 },
  section: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 },
  sectionTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { color: C.text, fontSize: 14, fontWeight: "600" },
  ctrl: { flexDirection: "row", alignItems: "center", gap: 12 },
  btn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  btnText: { color: C.text, fontSize: 20, fontWeight: "800", marginTop: -2 },
  val: { color: C.text, fontSize: 15, fontWeight: "800", minWidth: 74, textAlign: "center" },
  unit: { color: C.dim, fontSize: 12 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kit: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 2, borderColor: "rgba(255,255,255,0.12)" },
  kitActive: { borderColor: C.accent },
  kitDots: { flexDirection: "row", gap: 4 },
  kitDot: { width: 16, height: 16, borderRadius: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  kitLabel: { color: C.text, fontSize: 13, fontWeight: "700" },
});
