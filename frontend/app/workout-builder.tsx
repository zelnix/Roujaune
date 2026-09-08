import React from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform,
  KeyboardAvoidingView, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as DocumentPicker from "expo-document-picker";

import { CC } from "@/src/components/calendar";
import {
  BuilderSegment, ZONE_META, estimateLoad, difficultyFromIF, createCustomWorkout,
} from "@/src/lib/custom-workouts";

const DEFAULT_SEGS: BuilderSegment[] = [
  { label: "Warm-up", zoneIdx: 1, minutes: 10, targetPct: 0.55 },
  { label: "Main effort", zoneIdx: 3, minutes: 20, targetPct: 0.9 },
  { label: "Cool-down", zoneIdx: 0, minutes: 5, targetPct: 0.5 },
];

const zoneForPct = (p: number) =>
  p < 0.56 ? 0 : p < 0.76 ? 1 : p < 0.9 ? 2 : p < 1.06 ? 3 : p < 1.2 ? 4 : 5;

/** Minimal ZWO importer — pulls SteadyState / Warmup / Cooldown / IntervalsT /
 * FreeRide blocks into an ordered segment list. Best-effort; ignores anything
 * it can't parse. */
function parseZwo(xml: string): BuilderSegment[] {
  const segs: BuilderSegment[] = [];
  const tagRe = /<(Warmup|Cooldown|SteadyState|IntervalsT|FreeRide|Ramp)\b([^>]*)\/?>/gi;
  const attr = (s: string, k: string) => {
    const m = new RegExp(`${k}="([\\d.]+)"`, "i").exec(s);
    return m ? parseFloat(m[1]) : undefined;
  };
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const tag = m[1].toLowerCase();
    const a = m[2];
    if (tag === "intervalst") {
      const repeat = Math.max(1, Math.round(attr(a, "Repeat") || 1));
      const on = Math.round((attr(a, "OnDuration") || 0) / 60);
      const off = Math.round((attr(a, "OffDuration") || 0) / 60);
      const onP = attr(a, "OnPower") ?? 0.9;
      const offP = attr(a, "OffPower") ?? 0.5;
      for (let r = 0; r < repeat; r++) {
        if (on > 0) segs.push({ label: `Effort ${r + 1}/${repeat}`, zoneIdx: zoneForPct(onP), minutes: on, targetPct: Math.round(onP * 100) / 100 });
        if (off > 0) segs.push({ label: "Recovery", zoneIdx: zoneForPct(offP), minutes: off, targetPct: Math.round(offP * 100) / 100 });
      }
      continue;
    }
    const dur = Math.round((attr(a, "Duration") || 0) / 60);
    if (dur <= 0) continue;
    const low = attr(a, "PowerLow");
    const high = attr(a, "PowerHigh");
    const p = attr(a, "Power") ?? (low != null && high != null ? (low + high) / 2 : tag === "warmup" ? 0.55 : tag === "cooldown" ? 0.5 : 0.65);
    const label = tag === "warmup" ? "Warm-up" : tag === "cooldown" ? "Cool-down" : tag === "freeride" ? "Free ride" : "Steady";
    segs.push({ label, zoneIdx: zoneForPct(p), minutes: dur, targetPct: Math.round(p * 100) / 100 });
  }
  return segs;
}

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ import?: string; date?: string }>();
  const { width } = useWindowDimensions();
  const compact = width < 720;

  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [segs, setSegs] = React.useState<BuilderSegment[]>(DEFAULT_SEGS);
  const [zonePicker, setZonePicker] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useMemo(() => estimateLoad(segs), [segs]);
  const difficulty = difficultyFromIF(load.if);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/workouts"));

  React.useEffect(() => {
    if (params.import === "1") importZwo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importZwo = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      let text = "";
      if (Platform.OS === "web" && (asset as any).file) {
        text = await (asset as any).file.text();
      } else {
        try {
          const FS = require("expo-file-system/legacy");
          text = await FS.readAsStringAsync(asset.uri);
        } catch {
          text = await (await fetch(asset.uri)).text();
        }
      }
      const parsed = parseZwo(text);
      if (parsed.length) {
        setSegs(parsed);
        if (!name) setName((asset.name || "Imported workout").replace(/\.(zwo|tcx|xml)$/i, ""));
        flash(`Imported ${parsed.length} segments`);
      } else {
        flash("Couldn't read that file — start from scratch");
      }
    } catch {
      flash("Import cancelled");
    }
  };

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 2200); };

  const updateSeg = (i: number, patch: Partial<BuilderSegment>) =>
    setSegs((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const removeSeg = (i: number) => setSegs((prev) => prev.filter((_, k) => k !== i));
  const addSeg = () => setSegs((prev) => [...prev, { label: "New segment", zoneIdx: 2, minutes: 10, targetPct: 0.75 }]);
  const moveSeg = (i: number, dir: -1 | 1) => setSegs((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    if (!name.trim()) { flash("Give your workout a name"); return; }
    if (!segs.length || load.duration <= 0) { flash("Add at least one segment"); return; }
    setSaving(true);
    const created = await createCustomWorkout({ name, description: desc, segments: segs });
    setSaving(false);
    if (!created) { flash("Couldn't save — try again"); return; }
    // Land on the workout library so the rider sees their new session.
    router.replace({ pathname: "/workout-list", params: { workout: created.id } } as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CC.bg }} edges={["top", "left", "right"]}>
      <StatusBar hidden />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* header */}
        <View style={s.header}>
          <Pressable testID="builder-back" onPress={goBack} hitSlop={10} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={CC.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Workout Builder</Text>
            <Text style={s.subtitle}>Design your own session, segment by segment.</Text>
          </View>
          <Pressable testID="builder-import" onPress={importZwo} style={({ hovered }: any) => [s.importBtn, hovered && s.hover]}>
            <Ionicons name="cloud-upload-outline" size={15} color={CC.white} />
            <Text style={s.importText}>Import</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* name + description */}
          <View style={s.card}>
            <Text style={s.fieldLabel}>NAME</Text>
            <TextInput
              testID="builder-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sweet-spot 3×10"
              placeholderTextColor={CC.dim}
              style={s.input}
            />
            <Text style={[s.fieldLabel, { marginTop: 14 }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              testID="builder-desc"
              value={desc}
              onChangeText={setDesc}
              placeholder="What is this session for?"
              placeholderTextColor={CC.dim}
              style={[s.input, { height: 64, textAlignVertical: "top" }]}
              multiline
            />
          </View>

          {/* live summary */}
          <View style={s.summary} testID="builder-summary">
            {[
              { v: `${load.duration}`, l: "MIN" },
              { v: `${load.tss}`, l: "TSS" },
              { v: `${load.if.toFixed(2)}`, l: "IF" },
              { v: difficulty, l: "EFFORT" },
            ].map((x) => (
              <View key={x.l} style={s.sumCell}>
                <Text style={s.sumVal}>{x.v}</Text>
                <Text style={s.sumLbl}>{x.l}</Text>
              </View>
            ))}
          </View>

          {/* segments */}
          <View style={s.card}>
            <Text style={s.cardTitle}>SEGMENTS</Text>
            {segs.map((seg, i) => {
              const z = ZONE_META[seg.zoneIdx];
              return (
                <View key={i} style={s.segRow} testID={`seg-${i}`}>
                  <View style={[s.segBar, { backgroundColor: z.color }]} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <TextInput
                      testID={`seg-label-${i}`}
                      value={seg.label}
                      onChangeText={(t) => updateSeg(i, { label: t })}
                      placeholder="Segment"
                      placeholderTextColor={CC.dim}
                      style={s.segLabel}
                    />
                    <View style={s.segControls}>
                      <Pressable testID={`seg-zone-${i}`} onPress={() => setZonePicker(zonePicker === i ? null : i)} style={s.zoneChip}>
                        <View style={[s.zoneDot, { backgroundColor: z.color }]} />
                        <Text style={s.zoneChipText}>{z.label}</Text>
                        <Ionicons name="chevron-down" size={12} color={CC.dim} />
                      </Pressable>
                      <View style={s.stepper}>
                        <Pressable testID={`seg-min-down-${i}`} onPress={() => updateSeg(i, { minutes: Math.max(1, seg.minutes - 1) })} style={s.stepBtn}><Ionicons name="remove" size={15} color={CC.white} /></Pressable>
                        <Text style={s.stepVal}>{seg.minutes}m</Text>
                        <Pressable testID={`seg-min-up-${i}`} onPress={() => updateSeg(i, { minutes: seg.minutes + 1 })} style={s.stepBtn}><Ionicons name="add" size={15} color={CC.white} /></Pressable>
                      </View>
                      <View style={s.stepper}>
                        <Pressable testID={`seg-pct-down-${i}`} onPress={() => updateSeg(i, { targetPct: Math.max(0.4, Math.round((seg.targetPct - 0.05) * 100) / 100) })} style={s.stepBtn}><Ionicons name="remove" size={15} color={CC.white} /></Pressable>
                        <Text style={s.stepVal}>{Math.round(seg.targetPct * 100)}%</Text>
                        <Pressable testID={`seg-pct-up-${i}`} onPress={() => updateSeg(i, { targetPct: Math.min(1.6, Math.round((seg.targetPct + 0.05) * 100) / 100) })} style={s.stepBtn}><Ionicons name="add" size={15} color={CC.white} /></Pressable>
                      </View>
                    </View>
                    {zonePicker === i ? (
                      <View style={s.zoneList}>
                        {ZONE_META.map((zm, zi) => (
                          <Pressable key={zi} testID={`seg-${i}-zone-${zi}`} onPress={() => { updateSeg(i, { zoneIdx: zi, targetPct: zm.defaultPct }); setZonePicker(null); }} style={s.zoneOpt}>
                            <View style={[s.zoneDot, { backgroundColor: zm.color }]} />
                            <Text style={s.zoneOptText}>{zm.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={s.segActions}>
                    <Pressable testID={`seg-up-${i}`} onPress={() => moveSeg(i, -1)} hitSlop={6} style={s.iconMini}><Ionicons name="arrow-up" size={15} color={CC.dim} /></Pressable>
                    <Pressable testID={`seg-down-${i}`} onPress={() => moveSeg(i, 1)} hitSlop={6} style={s.iconMini}><Ionicons name="arrow-down" size={15} color={CC.dim} /></Pressable>
                    <Pressable testID={`seg-remove-${i}`} onPress={() => removeSeg(i)} hitSlop={6} style={s.iconMini}><Ionicons name="trash-outline" size={15} color={CC.rouge} /></Pressable>
                  </View>
                </View>
              );
            })}
            <Pressable testID="add-segment" onPress={addSeg} style={({ hovered }: any) => [s.addSeg, hovered && s.hover]}>
              <Ionicons name="add-circle-outline" size={18} color={CC.yellow} />
              <Text style={s.addSegText}>Add segment</Text>
            </Pressable>
          </View>

          <View style={{ height: 90 }} />
        </ScrollView>

        {/* save bar */}
        <View style={s.saveBar}>
          {notice ? <Text style={s.notice} testID="builder-notice">{notice}</Text> : null}
          <Pressable testID="builder-save" onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]}>
            <Ionicons name="checkmark-circle" size={18} color="#241B00" />
            <Text style={s.saveText}>{saving ? "Saving…" : "Save workout"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border },
  title: { color: CC.white, fontSize: 24, fontWeight: "800" },
  subtitle: { color: CC.dim, fontSize: 12.5, marginTop: 3 },
  importBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 42 },
  importText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  hover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },

  content: { paddingHorizontal: 18, paddingTop: 6, gap: 14, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 16 },
  cardTitle: { color: CC.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, marginBottom: 10 },
  fieldLabel: { color: CC.dim, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  input: { color: CC.white, fontSize: 15, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44 },

  summary: { flexDirection: "row", backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, paddingVertical: 14 },
  sumCell: { flex: 1, alignItems: "center", borderRightWidth: 1, borderRightColor: CC.borderSoft },
  sumVal: { color: CC.white, fontSize: 20, fontWeight: "800" },
  sumLbl: { color: CC.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginTop: 3 },

  segRow: { flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: CC.borderSoft },
  segBar: { width: 4, borderRadius: 2, alignSelf: "stretch" },
  segLabel: { color: CC.white, fontSize: 14, fontWeight: "700", paddingVertical: 4, paddingHorizontal: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, minHeight: 36 },
  segControls: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  zoneChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, minHeight: 34 },
  zoneChipText: { color: CC.white, fontSize: 12, fontWeight: "700" },
  zoneDot: { width: 9, height: 9, borderRadius: 5 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingHorizontal: 4, minHeight: 34 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stepVal: { color: CC.white, fontSize: 12.5, fontWeight: "800", minWidth: 40, textAlign: "center" },
  zoneList: { gap: 2, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 6, marginTop: 4 },
  zoneOpt: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8, minHeight: 40 },
  zoneOptText: { color: CC.white, fontSize: 13, fontWeight: "600" },
  segActions: { justifyContent: "center", gap: 8 },
  iconMini: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  addSeg: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: CC.border, borderRadius: 12, paddingVertical: 12, marginTop: 12, minHeight: 46 },
  addSegText: { color: CC.yellow, fontSize: 13.5, fontWeight: "700" },

  saveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, backgroundColor: "rgba(10,10,10,0.96)", borderTopWidth: 1, borderTopColor: CC.border, gap: 8 },
  notice: { color: CC.yellow, fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.yellow, borderRadius: 12, paddingVertical: 14, minHeight: 50, maxWidth: 720, width: "100%", alignSelf: "center" },
  saveText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
});
