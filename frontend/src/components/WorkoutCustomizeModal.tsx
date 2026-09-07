import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { CC } from "./calendar";
import { loadCatalog } from "@/src/lib/catalog";
import type { Workout } from "@/src/lib/workout-catalog";

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

type SegSpec = { label: string; zoneIdx: number; minutes: number; targetPct?: number };

/**
 * Rider-facing "Assign / edit this workout" control. On save it forks a personal
 * copy on the backend (POST assign) and PUTs the edits — never touching the
 * shared global catalog. "Reset to default" discards the rider's copy.
 */
export function WorkoutCustomizeModal({
  workoutId, visible, onClose, onSaved,
}: {
  workoutId: string | null;
  visible: boolean;
  onClose: () => void;
  onSaved?: (msg: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [wk, setWk] = React.useState<Workout | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [segs, setSegs] = React.useState<SegSpec[]>([]);
  const [duration, setDuration] = React.useState(0);
  const [mine, setMine] = React.useState(false);

  React.useEffect(() => {
    if (!visible || !workoutId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(workoutId)}`);
        const d = (await res.json()) as any;
        if (!alive) return;
        setWk(d);
        setName(d?.name ?? "");
        setDescription(d?.description ?? "");
        setSegs(Array.isArray(d?.segmentSpec) ? d.segmentSpec.map((s: SegSpec) => ({ ...s })) : []);
        setDuration(Number(d?.duration ?? 0));
        setMine(Boolean(d?.origin_id || d?.edited_at || d?.assigned_at));
      } catch {
        // leave empty; user can cancel
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [visible, workoutId]);

  const hasSegs = segs.length > 0;
  const totalMin = hasSegs ? segs.reduce((a, s) => a + (s.minutes || 0), 0) : duration;

  const bumpSeg = (i: number, delta: number) => {
    setSegs((prev) => prev.map((s, idx) => idx === i ? { ...s, minutes: Math.max(0, (s.minutes || 0) + delta) } : s));
  };
  const bumpDuration = (delta: number) => setDuration((d) => Math.max(0, d + delta));

  const save = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      // Fork a personal copy first (idempotent), then apply edits.
      await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(workoutId)}/assign`, { method: "POST" });
      const patch: Record<string, any> = { name: name.trim() || wk?.name, description: description.trim() };
      if (hasSegs) { patch.segmentSpec = segs; patch.duration = totalMin; }
      else { patch.duration = duration; }
      const res = await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(workoutId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch }),
      });
      if (res.ok) {
        await loadCatalog();
        onSaved?.("Workout customised — it's now your own copy");
        onClose();
      } else {
        onSaved?.("Couldn't save your changes");
      }
    } catch {
      onSaved?.("Couldn't save your changes");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      await fetch(`${apiBase()}/api/catalog/${encodeURIComponent(workoutId)}/reset`, { method: "DELETE" });
      await loadCatalog();
      onSaved?.("Reverted to the default workout");
      onClose();
    } catch {
      onSaved?.("Couldn't reset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card} testID="customize-modal">
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Customise this workout</Text>
              <Text style={s.sub}>{mine ? "Your personal copy" : "Creates your own editable copy"}</Text>
            </View>
            <Pressable testID="customize-close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={CC.dim} />
            </Pressable>
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={CC.yellow} /></View>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={s.label}>Name</Text>
              <TextInput testID="customize-name" value={name} onChangeText={setName} style={s.input}
                placeholder="Workout name" placeholderTextColor={CC.dim} />

              <Text style={s.label}>Notes</Text>
              <TextInput testID="customize-desc" value={description} onChangeText={setDescription} style={[s.input, s.multiline]}
                placeholder="Describe this session" placeholderTextColor={CC.dim} multiline />

              {hasSegs ? (
                <>
                  <Text style={s.label}>Segments · {totalMin} min total</Text>
                  {segs.map((sg, i) => (
                    <View key={`${sg.label}-${i}`} style={s.segRow}>
                      <Text style={s.segLabel} numberOfLines={1}>{sg.label}</Text>
                      <View style={s.stepper}>
                        <Pressable testID={`seg-minus-${i}`} onPress={() => bumpSeg(i, -1)} hitSlop={8} style={s.stepBtn}>
                          <Ionicons name="remove" size={16} color={CC.white} />
                        </Pressable>
                        <Text style={s.stepVal}>{sg.minutes}m</Text>
                        <Pressable testID={`seg-plus-${i}`} onPress={() => bumpSeg(i, 1)} hitSlop={8} style={s.stepBtn}>
                          <Ionicons name="add" size={16} color={CC.white} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <Text style={s.label}>Duration</Text>
                  <View style={s.segRow}>
                    <Text style={s.segLabel}>Total minutes</Text>
                    <View style={s.stepper}>
                      <Pressable testID="dur-minus" onPress={() => bumpDuration(-5)} hitSlop={8} style={s.stepBtn}>
                        <Ionicons name="remove" size={16} color={CC.white} />
                      </Pressable>
                      <Text style={s.stepVal}>{duration}m</Text>
                      <Pressable testID="dur-plus" onPress={() => bumpDuration(5)} hitSlop={8} style={s.stepBtn}>
                        <Ionicons name="add" size={16} color={CC.white} />
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          )}

          <View style={s.actions}>
            {mine ? (
              <Pressable testID="customize-reset" onPress={reset} disabled={saving} style={[s.secBtn, saving && { opacity: 0.5 }]}>
                <Ionicons name="refresh" size={15} color={CC.dim} />
                <Text style={s.secText}>Reset to default</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}
            <Pressable testID="customize-save" onPress={save} disabled={saving || loading} style={[s.saveBtn, (saving || loading) && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="checkmark" size={17} color="#241B00" />}
              <Text style={s.saveText}>Save my version</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 460, backgroundColor: "#141615", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,194,10,0.28)", padding: 18 },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  title: { color: CC.white, fontSize: 17, fontWeight: "800" },
  sub: { color: CC.dim, fontSize: 12, marginTop: 2 },
  center: { paddingVertical: 40, alignItems: "center" },
  label: { color: CC.yellow, fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: "#0E100F", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, color: CC.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 62, textAlignVertical: "top" },
  segRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  segLabel: { color: CC.white, fontSize: 13, flex: 1, marginRight: 10 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#22201A", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  stepVal: { color: CC.white, fontSize: 13, fontWeight: "700", minWidth: 40, textAlign: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  secBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  secText: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: CC.yellow },
  saveText: { color: "#241B00", fontSize: 14, fontWeight: "800" },
});
