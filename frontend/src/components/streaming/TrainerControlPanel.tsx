import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, Switch } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius } from "@/src/theme";
import type { ControlMode } from "@/src/hooks/useBleSensors";

type Props = {
  visible: boolean;
  onClose: () => void;
  hasControl: boolean;
  mode: ControlMode;
  power: number | null;
  auto: boolean;
  onToggleAuto: (v: boolean) => void;
  onErg: (w: number) => void;
  onResistance: (l: number) => void;
  onGrade: (g: number) => void;
  onReset: () => void;
  context: "workout" | "scenic";
};

type Tab = "erg" | "resistance" | "sim";

/** Manual smart-trainer control (FTMS): ERG watts, resistance level, or road
 *  gradient. An Auto toggle hands control back to the workout intervals
 *  (ERG) or the route's terrain (grade). */
export function TrainerControlPanel(props: Props) {
  const { visible, onClose, hasControl, power, auto, onToggleAuto, onErg, onResistance, onGrade, onReset, context } = props;
  const [tab, setTab] = React.useState<Tab>(context === "workout" ? "erg" : "sim");
  const [erg, setErg] = React.useState(150);
  const [res, setRes] = React.useState(5);
  const [grade, setGrade] = React.useState(0);

  const autoLabel = context === "workout" ? "Auto ERG — follow interval targets" : "Auto terrain — follow route gradient";

  const applyErg = (w: number) => { const v = Math.max(30, Math.min(600, w)); setErg(v); onErg(v); };
  const applyRes = (l: number) => { const v = Math.max(0, Math.min(100, l)); setRes(v); onResistance(v); };
  const applyGrade = (g: number) => { const v = Math.max(-10, Math.min(20, Math.round(g * 2) / 2)); setGrade(v); onGrade(v); };

  const Stepper = ({ label, value, unit, onDec, onInc }: { label: string; value: string; unit: string; onDec: () => void; onInc: () => void }) => (
    <View style={sx.stepWrap}>
      <Text style={sx.stepLabel}>{label}</Text>
      <View style={sx.stepRow}>
        <Pressable style={[sx.stepBtn, auto && sx.disabled]} onPress={onDec} disabled={auto} testID="trainer-dec">
          <Ionicons name="remove" size={22} color={colors.white} />
        </Pressable>
        <View style={sx.stepValue}>
          <Text style={sx.stepNum}>{value}</Text>
          <Text style={sx.stepUnit}>{unit}</Text>
        </View>
        <Pressable style={[sx.stepBtn, auto && sx.disabled]} onPress={onInc} disabled={auto} testID="trainer-inc">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sx.backdrop} onPress={onClose} />
      <View style={sx.sheet} testID="trainer-control-panel">
        <View style={sx.grabber} />
        <View style={sx.head}>
          <Text style={sx.title}>Trainer control</Text>
          <Pressable onPress={onClose} hitSlop={10} testID="trainer-close" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        {!hasControl ? (
          <View style={sx.empty}>
            <Ionicons name="bluetooth-outline" size={26} color={colors.textFaint} />
            <Text style={sx.emptyText}>
              Connect a smart trainer that supports <Text style={{ color: colors.white, fontWeight: "800" }}>Bluetooth FTMS control</Text> to set ERG power, resistance and gradient. Pair it from Devices &amp; Sensors. Requires an installed native build.
            </Text>
          </View>
        ) : (
          <>
            <View style={sx.liveRow}>
              <Ionicons name="flash" size={16} color={colors.yellow} />
              <Text style={sx.liveVal}>{power != null ? `${Math.round(power)} W` : "— W"}</Text>
              <Text style={sx.liveLabel}>live power</Text>
            </View>

            <View style={sx.autoRow}>
              <View style={{ flex: 1 }}>
                <Text style={sx.autoTitle}>{autoLabel}</Text>
                <Text style={sx.autoSub}>{auto ? "The app is driving your trainer." : "Manual — you set the target below."}</Text>
              </View>
              <Switch value={auto} onValueChange={onToggleAuto} trackColor={{ true: colors.yellow, false: "#333" }} thumbColor="#fff" testID="trainer-auto" />
            </View>

            <View style={sx.tabs}>
              {(["erg", "resistance", "sim"] as Tab[]).map((t) => (
                <Pressable key={t} style={[sx.tab, tab === t && sx.tabOn]} onPress={() => setTab(t)} testID={`trainer-tab-${t}`}>
                  <Text style={[sx.tabText, tab === t && sx.tabTextOn]}>{t === "erg" ? "ERG" : t === "resistance" ? "Resistance" : "Gradient"}</Text>
                </Pressable>
              ))}
            </View>

            {tab === "erg" && (
              <Stepper label="Target power" value={String(erg)} unit="watts" onDec={() => applyErg(erg - 5)} onInc={() => applyErg(erg + 5)} />
            )}
            {tab === "resistance" && (
              <Stepper label="Resistance level" value={String(res)} unit="level" onDec={() => applyRes(res - 5)} onInc={() => applyRes(res + 5)} />
            )}
            {tab === "sim" && (
              <Stepper label="Road gradient" value={grade.toFixed(1)} unit="%" onDec={() => applyGrade(grade - 0.5)} onInc={() => applyGrade(grade + 0.5)} />
            )}

            {auto && <Text style={sx.autoNote}>Turn Auto off to adjust manually.</Text>}

            <Pressable style={sx.reset} onPress={onReset} testID="trainer-reset">
              <Ionicons name="refresh" size={16} color={colors.textDim} />
              <Text style={sx.resetText}>Reset trainer</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const sx = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderWidth: 1, borderColor: colors.border },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { color: colors.white, fontSize: 20, fontWeight: "900" },

  empty: { alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 12 },
  emptyText: { color: colors.textDim, fontSize: 13.5, lineHeight: 20, textAlign: "center" },

  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  liveVal: { color: colors.white, fontSize: 22, fontWeight: "900" },
  liveLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: "600" },

  autoRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.cardElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14 },
  autoTitle: { color: colors.white, fontSize: 14, fontWeight: "800" },
  autoSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },

  tabs: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: radius.pill, padding: 4, gap: 4, marginBottom: 18 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.yellow },
  tabText: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  tabTextOn: { color: "#241B00" },

  stepWrap: { alignItems: "center", gap: 12 },
  stepLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 22 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.35 },
  stepValue: { alignItems: "center", minWidth: 110 },
  stepNum: { color: colors.white, fontSize: 40, fontWeight: "900" },
  stepUnit: { color: colors.textDim, fontSize: 13, fontWeight: "600", marginTop: -2 },
  autoNote: { color: colors.textFaint, fontSize: 12, textAlign: "center", marginTop: 12 },

  reset: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, paddingVertical: 12 },
  resetText: { color: colors.textDim, fontSize: 14, fontWeight: "700" },
});
