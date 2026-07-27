import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { submitCheckin, readinessTone, ReadinessResult } from "@/src/lib/checkin";
import { useCoach } from "@/src/lib/coach-persona";

const SCALE_LABELS: Record<string, [string, string]> = {
  sleep_quality: ["Poor", "Great"],
  energy: ["Low", "High"],
  soreness: ["Fresh", "Sore"],
  stress: ["Calm", "Stressed"],
  motivation: ["Low", "High"],
};

const SYMPTOMS: { key: string; label: string }[] = [
  { key: "chest_pain", label: "Chest pain or discomfort" },
  { key: "severe_dizziness", label: "Dizziness or faintness" },
  { key: "shortness_of_breath", label: "Unusual shortness of breath" },
  { key: "illness", label: "Illness or fever" },
  { key: "new_pain", label: "New or worsening pain" },
];

function Scale({ label, hint, value, onChange }: { label: string; hint: [string, string]; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.scaleRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              testID={`${label}-${n}`}
              onPress={() => onChange(n)}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${n} of 5`}
              style={[styles.scaleDot, on && styles.scaleDotOn]}
            >
              <Text style={[styles.scaleDotText, on && styles.scaleDotTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.scaleHints}>
        <Text style={styles.scaleHint}>{hint[0]}</Text>
        <Text style={styles.scaleHint}>{hint[1]}</Text>
      </View>
    </View>
  );
}

export default function CheckinScreen() {
  const router = useRouter();
  const coach = useCoach();
  const { width } = useWindowDimensions();
  const twoCol = width >= 720;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const [sleepHours, setSleepHours] = React.useState(7.5);
  const [sleepQuality, setSleepQuality] = React.useState(4);
  const [energy, setEnergy] = React.useState(3);
  const [soreness, setSoreness] = React.useState(2);
  const [stress, setStress] = React.useState(2);
  const [motivation, setMotivation] = React.useState(4);
  const [symptoms, setSymptoms] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<ReadinessResult | null>(null);

  const toggleSymptom = (k: string) => setSymptoms((s) => ({ ...s, [k]: !s[k] }));

  const onSubmit = async () => {
    setSaving(true);
    const activeSymptoms = Object.fromEntries(Object.entries(symptoms).filter(([, v]) => v));
    try {
      const r = await submitCheckin({
        checkin: {
          sleep_hours: sleepHours,
          sleep_quality: sleepQuality * 2,
          energy: energy * 2,
          soreness: ((soreness - 1) / 4) * 10,
          stress: ((stress - 1) / 4) * 10,
          motivation: motivation * 2,
        },
        symptoms: activeSymptoms,
        date: new Date().toISOString().slice(0, 10),
      });
      setResult(r);
    } catch {
      setSaving(false);
    }
  };

  const tone = result ? readinessTone(result.readinessScore, result.safetyOverride) : null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.header}>
          <Pressable testID="checkin-back" onPress={goBack} hitSlop={10} accessibilityLabel="Go back" style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Daily Check-in</Text>
            <Text style={styles.subtitle}>A quick honest check so {coach.name} can tune today&apos;s ride.</Text>
          </View>
        </View>

        {result ? (
          <ScrollView contentContainerStyle={styles.resultWrap}>
            <View style={[styles.resultCard, { borderColor: tone!.color }]} testID="checkin-result">
              <View style={[styles.scoreRing, { borderColor: tone!.color }]}>
                <Text style={[styles.scoreNum, { color: tone!.color }]}>{result.safetyOverride ? "!" : `${result.readinessScore}`}</Text>
                {!result.safetyOverride ? <Text style={styles.scoreUnit}>readiness</Text> : null}
              </View>
              <Text style={[styles.resultBand, { color: tone!.color }]}>{result.status}</Text>
              <View style={styles.factors}>
                {(result.mainFactors ?? []).slice(0, 4).map((f, i) => (
                  <View key={i} style={styles.factorRow}>
                    <Ionicons name="ellipse" size={7} color={tone!.color} />
                    <Text style={styles.factorText}>{f}</Text>
                  </View>
                ))}
              </View>
              {result.safetyOverride ? (
                <Text style={styles.safetyNote}>You reported a symptom that needs care. Please rest today and consider speaking with a medical professional before training.</Text>
              ) : null}
              <Pressable testID="checkin-done" onPress={goBack} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
              <Pressable testID="checkin-redo" onPress={() => { setResult(null); setSaving(false); }} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Edit answers</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {/* Sleep hours stepper */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Hours slept</Text>
              <View style={styles.stepper}>
                <Pressable testID="sleep-minus" onPress={() => setSleepHours((h) => Math.max(3, Math.round((h - 0.5) * 2) / 2))} style={styles.stepBtn}>
                  <Ionicons name="remove" size={22} color={colors.white} />
                </Pressable>
                <Text style={styles.stepValue}>{sleepHours.toFixed(1)}h</Text>
                <Pressable testID="sleep-plus" onPress={() => setSleepHours((h) => Math.min(12, Math.round((h + 0.5) * 2) / 2))} style={styles.stepBtn}>
                  <Ionicons name="add" size={22} color={colors.white} />
                </Pressable>
              </View>
            </View>

            <View style={twoCol ? styles.grid : undefined}>
              <View style={twoCol ? styles.gridCol : undefined}>
                <Scale label="Sleep quality" hint={SCALE_LABELS.sleep_quality} value={sleepQuality} onChange={setSleepQuality} />
                <Scale label="Energy" hint={SCALE_LABELS.energy} value={energy} onChange={setEnergy} />
                <Scale label="Motivation" hint={SCALE_LABELS.motivation} value={motivation} onChange={setMotivation} />
              </View>
              <View style={twoCol ? styles.gridCol : undefined}>
                <Scale label="Leg soreness" hint={SCALE_LABELS.soreness} value={soreness} onChange={setSoreness} />
                <Scale label="Stress" hint={SCALE_LABELS.stress} value={stress} onChange={setStress} />
              </View>
            </View>

            {/* Safety symptoms */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Any of these today? (tap if yes)</Text>
              <View style={styles.symptomWrap}>
                {SYMPTOMS.map((s) => {
                  const on = !!symptoms[s.key];
                  return (
                    <Pressable key={s.key} testID={`symptom-${s.key}`} onPress={() => toggleSymptom(s.key)} style={[styles.symptomChip, on && styles.symptomChipOn]}>
                      {on ? <Ionicons name="alert-circle" size={15} color="#fff" /> : null}
                      <Text style={[styles.symptomText, on && { color: "#fff" }]}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable testID="checkin-submit" onPress={onSubmit} disabled={saving} style={[styles.primaryBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#241B00" /> : <Text style={styles.primaryBtnText}>Get my readiness</Text>}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.white, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 3 },

  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 14, maxWidth: 900, width: "100%", alignSelf: "center" },
  grid: { flexDirection: "row", gap: 18 },
  gridCol: { flex: 1, gap: 14 },

  field: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  fieldLabel: { color: colors.white, fontSize: 14, fontWeight: "700", marginBottom: 12 },

  scaleRow: { flexDirection: "row", gap: 10 },
  scaleDot: { flex: 1, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  scaleDotOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  scaleDotText: { color: colors.textDim, fontSize: 16, fontWeight: "800" },
  scaleDotTextOn: { color: "#241B00" },
  scaleHints: { flexDirection: "row", justifyContent: "space-between", marginTop: 7 },
  scaleHint: { color: colors.textFaint, fontSize: 11, fontWeight: "600" },

  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepBtn: { width: 52, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepValue: { color: colors.white, fontSize: 22, fontWeight: "800" },

  symptomWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  symptomChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  symptomChipOn: { backgroundColor: colors.red, borderColor: colors.red },
  symptomText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: 14, paddingVertical: 15, minHeight: 52, marginTop: 4 },
  primaryBtnText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  ghostBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 13, minHeight: 44, marginTop: 4 },
  ghostBtnText: { color: colors.textDim, fontSize: 14, fontWeight: "700" },

  resultWrap: { padding: 20, alignItems: "center" },
  resultCard: { width: "100%", maxWidth: 480, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1.5, padding: 24, alignItems: "center", gap: 8 },
  scoreRing: { width: 128, height: 128, borderRadius: 64, borderWidth: 6, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  scoreNum: { fontSize: 44, fontWeight: "900" },
  scoreUnit: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  resultBand: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  factors: { gap: 8, alignSelf: "stretch", marginBottom: 6 },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  factorText: { color: colors.white, fontSize: 13.5, fontWeight: "600", flex: 1 },
  safetyNote: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: "center", marginVertical: 6 },
});
