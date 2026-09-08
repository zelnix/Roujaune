import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { C } from "./plan";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextMonday(from: Date): Date {
  const x = new Date(from);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const delta = ((8 - day) % 7) || 7; // always the *next* Monday
  return addDays(x, delta);
}

/** Compact, web- and native-safe date picker for re-anchoring a plan. Quick
 * chips cover the common intents; the stepper handles anything else. */
export function ChangeStartDateModal({
  visible, onClose, onConfirm, currentStart,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (dateISO: string) => void;
  currentStart?: string;
}) {
  const today = React.useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, [visible]);
  const [sel, setSel] = React.useState<Date>(today);

  React.useEffect(() => { if (visible) setSel(addDays(today, 1)); }, [visible, today]);

  const selIso = iso(sel);
  const label = sel.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isPast = sel < today;

  const chips: { label: string; date: Date }[] = [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next Monday", date: nextMonday(today) },
    { label: "In 2 weeks", date: addDays(today, 14) },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={s.title}>Change start date</Text>
            <Pressable testID="startdate-close" onPress={onClose} hitSlop={8}><Ionicons name="close" size={20} color={C.white} /></Pressable>
          </View>
          <Text style={s.sub}>
            Your whole plan re-anchors to the day you pick{currentStart ? ` (currently ${currentStart})` : ""}. A hard event date stays fixed — the plan tightens to fit if needed.
          </Text>

          <View style={s.stepper}>
            <Pressable testID="startdate-prev" onPress={() => setSel((d) => addDays(d, -1))} style={s.stepBtn}><Ionicons name="chevron-back" size={20} color={C.white} /></Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={s.dateLabel} testID="startdate-label">{label}</Text>
              {isPast ? <Text style={s.pastWarn}>Pick today or later</Text> : null}
            </View>
            <Pressable testID="startdate-next" onPress={() => setSel((d) => addDays(d, 1))} style={s.stepBtn}><Ionicons name="chevron-forward" size={20} color={C.white} /></Pressable>
          </View>

          <View style={s.chips}>
            {chips.map((c) => {
              const active = iso(c.date) === selIso;
              return (
                <Pressable key={c.label} testID={`startdate-chip-${c.label.replace(/\s+/g, "-").toLowerCase()}`} onPress={() => setSel(c.date)} style={[s.chip, active && s.chipActive]}>
                  <Text style={[s.chipText, active && s.chipTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            testID="startdate-confirm"
            disabled={isPast}
            onPress={() => onConfirm(selIso)}
            style={[s.confirm, isPast && { opacity: 0.5 }]}
          >
            <Ionicons name="calendar" size={16} color="#241B00" />
            <Text style={s.confirmText}>Set start to {sel.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: 460, maxWidth: "100%", backgroundColor: C.cardHi, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: C.white, fontSize: 18, fontWeight: "800" },
  sub: { color: C.dim, fontSize: 12.5, lineHeight: 18 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  dateLabel: { color: C.white, fontSize: 15.5, fontWeight: "800", textAlign: "center" },
  pastWarn: { color: C.rouge, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, minHeight: 40, justifyContent: "center" },
  chipActive: { backgroundColor: "rgba(255,194,10,0.14)", borderColor: C.yellow },
  chipText: { color: C.white, fontSize: 12.5, fontWeight: "700" },
  chipTextActive: { color: C.yellow },
  confirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.yellow, borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  confirmText: { color: "#241B00", fontSize: 14.5, fontWeight: "800" },
});
