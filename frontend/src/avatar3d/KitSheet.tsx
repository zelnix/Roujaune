import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KIT_PRESETS, KitPresetKey } from "./Rider3D";

const C = { overlay: "rgba(0,0,0,0.55)", card: "#141414", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230" };
const KEYS = Object.keys(KIT_PRESETS) as KitPresetKey[];

/** Modal sheet to pick the 3D rider's ROUJAUNE kit (body + colours). */
export function KitSheet({ value, onChange, onClose }: {
  value: KitPresetKey; onChange: (k: KitPresetKey) => void; onClose: () => void;
}) {
  return (
    <Pressable style={styles.overlay} onPress={onClose} testID="kit-sheet">
      <Pressable style={styles.panel} onPress={() => {}}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your rider</Text>
            <Text style={styles.sub}>Choose a ROUJAUNE kit</Text>
          </View>
          <Pressable onPress={onClose} testID="kit-sheet-close" hitSlop={10}><Ionicons name="close" size={22} color={C.text} /></Pressable>
        </View>
        <View style={styles.grid}>
          {KEYS.map((k) => {
            const p = KIT_PRESETS[k];
            const active = value === k;
            return (
              <Pressable key={k} testID={`kit-${k}`} onPress={() => { onChange(k); onClose(); }} style={[styles.kit, active && styles.kitActive]}>
                <View style={styles.dots}>
                  <View style={[styles.dot, { backgroundColor: p.jersey }]} />
                  <View style={[styles.dot, { backgroundColor: p.shorts }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kitLabel}>{p.label}</Text>
                  <Text style={styles.kitBody}>{p.body === "female" ? "Female rider" : "Male rider"}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay, alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 },
  panel: { width: "100%", maxWidth: 520, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  head: { flexDirection: "row", alignItems: "center" },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  sub: { color: C.dim, fontSize: 12.5, marginTop: 2 },
  grid: { gap: 10 },
  kit: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 2, borderColor: C.border },
  kitActive: { borderColor: C.accent },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  kitLabel: { color: C.text, fontSize: 15, fontWeight: "700" },
  kitBody: { color: C.dim, fontSize: 12, marginTop: 1 },
});
