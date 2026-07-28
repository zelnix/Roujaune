import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../theme";
import { TODAY_MODES, TodayModeMeta, useTodayMode } from "../../lib/today-mode";
import { useReducedMotionSafe } from "../../lib/use-reduced-motion";

/** Compact activity selector that sits in the rail directly below the wordmark.
 *  Shows the eyebrow "TODAY I WANT TO", the selected activity (icon + short
 *  label + chevron) and opens a floating dark-glass menu of all modes. */
export function TodayModeButton({ compact = false }: { compact?: boolean }) {
  const { meta, experience, setExperience } = useTodayMode();
  const [open, setOpen] = React.useState(false);

  return (
    <View style={styles.wrap}>
      {!compact && <Text style={styles.eyebrow} numberOfLines={1}>TODAY I WANT TO</Text>}
      <Pressable
        testID="today-mode-button"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Today mode: ${meta.label}. Change activity`}
        style={({ hovered }: any) => [styles.selected, hovered && styles.selectedHover]}
      >
        <View style={styles.iconBubble}>
          <Ionicons name={meta.icon} size={compact ? 18 : 16} color={colors.yellow} />
        </View>
        {!compact && (
          <Text style={styles.selLabel} numberOfLines={1}>{meta.shortLabel}</Text>
        )}
        <Ionicons name="chevron-down" size={compact ? 12 : 13} color={colors.textDim} style={compact ? styles.chevCompact : undefined} />
      </Pressable>

      <TodayModeMenu
        visible={open}
        current={experience}
        onClose={() => setOpen(false)}
        onSelect={(id) => { setExperience(id); setOpen(false); }}
      />
    </View>
  );
}

export function TodayModeMenu({
  visible, current, onClose, onSelect,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (id: TodayModeMeta["id"]) => void;
}) {
  const noMotion = useReducedMotionSafe();
  return (
    <Modal visible={visible} transparent animationType={noMotion ? "none" : "fade"} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close activity menu">
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.menuTitle}>TODAY I WANT TO</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {TODAY_MODES.map((m) => (
              <TodayModeOption
                key={m.id}
                meta={m}
                selected={m.id === current}
                onPress={() => { if (m.availability !== "coming-soon") onSelect(m.id); }}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TodayModeOption({ meta, selected, onPress }: { meta: TodayModeMeta; selected: boolean; onPress: () => void }) {
  const soon = meta.availability === "coming-soon";
  return (
    <Pressable
      testID={`today-mode-option-${meta.id}`}
      onPress={onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: soon }}
      accessibilityLabel={`${meta.label}. ${meta.description}${soon ? ". Coming soon" : ""}${selected ? ". Selected" : ""}`}
      style={({ hovered }: any) => [
        styles.option,
        selected && styles.optionSel,
        hovered && !selected && !soon && styles.optionHover,
        soon && styles.optionSoon,
      ]}
    >
      <View style={[styles.optIcon, selected && styles.optIconSel]}>
        <Ionicons name={meta.icon} size={20} color={selected ? "#fff" : soon ? colors.textFaint : colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.optLabelRow}>
          <Text style={[styles.optLabel, soon && { color: colors.textDim }]} numberOfLines={1}>{meta.label}</Text>
          {selected && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
          {soon && <Text style={styles.soonBadge}>COMING SOON</Text>}
        </View>
        <Text style={styles.optDesc} numberOfLines={1}>{meta.description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", paddingHorizontal: 8, marginBottom: spacing.md },
  eyebrow: { color: colors.textFaint, fontSize: 7.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 5, textAlign: "center" },
  selected: {
    width: "100%", alignItems: "center", gap: 3, paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "rgba(255,255,255,0.04)",
  },
  selectedHover: { borderColor: "rgba(255,255,255,0.24)" },
  iconBubble: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.12)", borderWidth: 1, borderColor: "rgba(245,179,1,0.35)" },
  selLabel: { color: colors.white, fontSize: 9.5, fontWeight: "700", textAlign: "center" },
  chevCompact: { marginTop: 1 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "flex-start", paddingLeft: 110, paddingVertical: 40 },
  menu: {
    width: 320, backgroundColor: "rgba(16,17,16,0.98)", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: 12, gap: 4,
    ...(Object.assign({}, { boxShadow: "0px 20px 50px rgba(0,0,0,0.6)" } as any)),
  },
  menuTitle: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 1, paddingHorizontal: 6, paddingTop: 2, paddingBottom: 6 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.md, minHeight: 56,
    borderWidth: 1, borderColor: "transparent",
  },
  optionSel: { backgroundColor: "rgba(224,30,43,0.16)", borderColor: "rgba(224,30,43,0.55)" },
  optionHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  optionSoon: { opacity: 0.7 },
  optIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  optIconSel: { backgroundColor: colors.red },
  optLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optLabel: { color: colors.white, fontSize: 14.5, fontWeight: "700" },
  optDesc: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  soonBadge: { color: colors.yellow, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.5, borderWidth: 1, borderColor: "rgba(245,179,1,0.4)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
});
