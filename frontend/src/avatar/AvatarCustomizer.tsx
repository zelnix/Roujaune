import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Appearance, GlassesType, ROUJAUNE } from "./avatarConfigs";

const C = { card: "#161616", border: "rgba(255,255,255,0.12)", text: "#F5F1EA", dim: "#9A938B", accent: "#F2C230" };

const SWATCHES = [
  ROUJAUNE.yellow, ROUJAUNE.gold, ROUJAUNE.red, ROUJAUNE.burgundy, ROUJAUNE.burgundyDark,
  ROUJAUNE.black, ROUJAUNE.pink, ROUJAUNE.pinkDeep, ROUJAUNE.white, "#2E6CF2", "#2FA35A", "#8A8A8A",
];
const GLASSES: GlassesType[] = ["none", "clear", "dark", "wraparound"];
const TINTS = ["#20140A", "#1A1A1A", "#2E3A55", "#3A1030", "#0E3320"];

/** Live kit + eyewear customiser. Never touches identity (face/skin/hair). */
export function AvatarCustomizer({ appearance, onChange }: { appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }) {
  return (
    <View style={{ gap: 14 }}>
      <ColorRow label="Jersey (top)" value={appearance.jerseyTop} onPick={(c) => onChange({ jerseyTop: c })} />
      <ColorRow label="Jersey (bottom)" value={appearance.jerseyBottom} onPick={(c) => onChange({ jerseyBottom: c })} />
      <ColorRow label="Bib shorts" value={appearance.bib} onPick={(c) => onChange({ bib: c })} />
      <ColorRow label="Helmet" value={appearance.helmet} onPick={(c) => onChange({ helmet: c })} />
      <ColorRow label="Shoes" value={appearance.shoes} onPick={(c) => onChange({ shoes: c })} />
      <ColorRow label="Bike" value={appearance.bike} onPick={(c) => onChange({ bike: c })} />

      <View>
        <Text style={styles.label}>Riding glasses</Text>
        <View style={styles.chips}>
          {GLASSES.map((g) => (
            <Pressable key={g} testID={`glasses-${g}`} onPress={() => onChange({ glasses: g })} style={[styles.chip, appearance.glasses === g && styles.chipActive]}>
              <Text style={[styles.chipText, appearance.glasses === g && { color: C.accent }]}>{g}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {appearance.glasses !== "none" && (
        <>
          <ColorRow label="Frame colour" value={appearance.glassesFrame} onPick={(c) => onChange({ glassesFrame: c })} />
          <View>
            <Text style={styles.label}>Lens tint</Text>
            <View style={styles.chips}>
              {TINTS.map((t) => (
                <Pressable key={t} onPress={() => onChange({ glassesTint: t })} style={[styles.swatch, { backgroundColor: t }, appearance.glassesTint === t && styles.swatchActive]} />
              ))}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function ColorRow({ label, value, onPick }: { label: string; value: string; onPick: (c: string) => void }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {SWATCHES.map((c) => (
          <Pressable key={c} onPress={() => onPick(c)} style={[styles.swatch, { backgroundColor: c }, value === c && styles.swatchActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: C.dim, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.15)" },
  swatchActive: { borderColor: C.accent },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { borderColor: C.accent, backgroundColor: "rgba(242,194,48,0.08)" },
  chipText: { color: C.text, fontWeight: "700", fontSize: 12.5, textTransform: "capitalize" },
});
