import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { swapSession, SwapMode, CreatedDay } from "@/src/lib/plan-create";

// Reusable sheet to ask the coach for an easier / harder / different-focus
// version of a single cycling session. Used on the plan preview and on the
// active Training Plan / Calendar.
export function SwapSessionSheet({
  visible, onClose, day, coachName, coachGender, goal, planId, week, dayIndex, onSwapped,
}: {
  visible: boolean; onClose: () => void;
  day: (Partial<CreatedDay> & { workout_id?: string }) | null;
  coachName: string; coachGender?: string; goal?: string;
  planId?: string; week?: number; dayIndex?: number;
  onSwapped: (newDay: CreatedDay & { workout_id?: string }, originalDay: (Partial<CreatedDay> & { workout_id?: string })) => void;
}) {
  const [busy, setBusy] = React.useState<SwapMode | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => { if (visible) { setBusy(null); setErr(null); } }, [visible]);

  const run = async (mode: SwapMode) => {
    if (!day) return;
    setBusy(mode); setErr(null);
    try {
      const nd = await swapSession({ day, mode, coachName, coachGender, goal, planId, week, dayIndex });
      onSwapped(nd, day);
      onClose();
    } catch {
      setErr("Couldn't swap that session. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const opts: { mode: SwapMode; icon: any; label: string; sub: string; color: string }[] = [
    { mode: "easier", icon: "trending-down", label: "Easier", sub: "Lower intensity or shorter", color: colors.green },
    { mode: "harder", icon: "trending-up", label: "Harder", sub: "More intensity or longer", color: colors.red },
    { mode: "focus", icon: "sync", label: "Change focus", sub: "A different kind of session", color: colors.yellow },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={busy ? undefined : onClose}>
        <Pressable style={s.sheet} onPress={() => {}} testID="swap-sheet">
          <View style={s.head}>
            <Ionicons name="swap-horizontal" size={17} color={colors.yellow} />
            <Text style={s.title}>Swap this session</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} hitSlop={10} disabled={!!busy} testID="swap-close"><Ionicons name="close" size={20} color={colors.textDim} /></Pressable>
          </View>
          {day ? (
            <Text style={s.current} numberOfLines={1}>
              {day.title || "Ride"}{day.zone ? ` · ${day.zone}` : ""}{day.duration ? ` · ${day.duration}` : ""}
            </Text>
          ) : null}
          <Text style={s.ask}>What would you like {coachName} to do?</Text>
          {opts.map((o) => (
            <Pressable key={o.mode} testID={`swap-${o.mode}`} onPress={() => run(o.mode)} disabled={!!busy}
              style={({ hovered }: any) => [s.opt, hovered && s.optHover, !!busy && busy !== o.mode && { opacity: 0.5 }]}>
              <View style={[s.optIcon, { backgroundColor: o.color + "22", borderColor: o.color + "55" }]}>
                {busy === o.mode ? <ActivityIndicator size="small" color={o.color} /> : <Ionicons name={o.icon} size={17} color={o.color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.optLabel}>{o.label}</Text>
                <Text style={s.optSub}>{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
          {err ? <Text style={s.err}>{err}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(4,4,6,0.72)", alignItems: "center", justifyContent: "center", padding: spacing.md },
  sheet: { width: "100%", maxWidth: 440, backgroundColor: "#141210", borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: spacing.md, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.white, fontSize: 16, fontWeight: "800" },
  current: { color: colors.yellow, fontSize: 12.5, fontWeight: "700" },
  ask: { color: colors.textDim, fontSize: 13, marginBottom: 2 },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.md, padding: 12 },
  optHover: { backgroundColor: "rgba(255,255,255,0.07)" },
  optIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  optLabel: { color: colors.white, fontSize: 15, fontWeight: "800" },
  optSub: { color: colors.textDim, fontSize: 12 },
  err: { color: colors.red, fontSize: 12.5, fontWeight: "700", textAlign: "center" },
});
