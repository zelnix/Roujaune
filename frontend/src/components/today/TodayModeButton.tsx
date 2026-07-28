import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "../../theme";
import { TODAY_MODES, TodayModeMeta, useTodayMode } from "../../lib/today-mode";
import { useReducedMotionSafe } from "../../lib/use-reduced-motion";

/** Compact activity selector that sits in the rail directly below the wordmark.
 *  Shows the eyebrow "TODAY I WANT TO", the selected activity (icon + short
 *  label + chevron) and opens a floating dark-glass menu of all modes. */
export function TodayModeButton({ compact = false }: { compact?: boolean }) {
  const { meta, experience, setExperience } = useTodayMode();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <View style={styles.wrap}>
      {!compact && <Text style={styles.eyebrow} numberOfLines={1}>RIDE XP</Text>}
      <Pressable
        testID="today-mode-button"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Riding experience: ${meta.label}. Change activity`}
        style={({ pressed }: any) => [styles.selected, pressed && styles.selectedPressed]}
      >
        <View style={styles.iconBubble}>
          <Ionicons name={meta.icon} size={compact ? 18 : 16} color={colors.yellow} />
        </View>
        {!compact && (
          <Text style={styles.selLabel} numberOfLines={1}>{meta.shortLabel}</Text>
        )}
      </Pressable>

      <TodayModeMenu
        visible={open}
        current={experience}
        onClose={() => setOpen(false)}
        onSelect={(id) => { setExperience(id); setOpen(false); }}
        onComingSoon={(id) => { setOpen(false); router.push(`/coming-soon?mode=${id}` as any); }}
      />
    </View>
  );
}

export function TodayModeMenu({
  visible, current, onClose, onSelect, onComingSoon,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (id: TodayModeMeta["id"]) => void;
  onComingSoon?: (id: TodayModeMeta["id"]) => void;
}) {
  const noMotion = useReducedMotionSafe();
  return (
    <Modal visible={visible} transparent animationType={noMotion ? "none" : "fade"} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close activity menu">
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.menuTitle}>RIDING EXPERIENCE</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {TODAY_MODES.map((m) => (
              <TodayModeOption
                key={m.id}
                meta={m}
                selected={m.id === current}
                onPress={() => {
                  if (m.availability === "coming-soon") onComingSoon?.(m.id);
                  else onSelect(m.id);
                }}
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${meta.label}. ${meta.description}${soon ? ". Tap to preview" : ""}${selected ? ". Selected" : ""}`}
      style={({ hovered }: any) => [
        styles.option,
        selected && styles.optionSel,
        hovered && !selected && styles.optionHover,
      ]}
    >
      <View style={[styles.optIcon, selected && styles.optIconSel]}>
        <Ionicons name={meta.icon} size={20} color={selected ? "#fff" : colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.optLabelRow}>
          <Text style={styles.optLabel} numberOfLines={1}>{meta.label}</Text>
          {selected && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
        </View>
        <Text style={styles.optDesc} numberOfLines={1}>{meta.description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", paddingHorizontal: 8, marginBottom: spacing.md },
  eyebrow: { color: colors.yellow, fontSize: 7.5, fontWeight: "800", letterSpacing: 0.7, marginBottom: 5, textAlign: "center" },
  selected: {
    width: "100%", alignItems: "center", gap: 4, paddingVertical: 9, paddingHorizontal: 6,
    borderRadius: radius.md, backgroundColor: colors.yellow,
    borderBottomWidth: 3, borderBottomColor: "#C6900A",
    ...(Platform.select({
      web: { boxShadow: "0px 4px 12px rgba(0,0,0,0.38)" } as any,
      default: { elevation: 4, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    })),
  },
  selectedPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 1, opacity: 0.96 },
  iconBubble: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  selLabel: { color: colors.bg, fontSize: 9.5, fontWeight: "900", textAlign: "center" },
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
  optLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "space-between" },
  optLabel: { color: colors.white, fontSize: 14.5, fontWeight: "700", flexShrink: 1 },
  optDesc: { color: colors.textDim, fontSize: 11.5, marginTop: 1, flexShrink: 1 },
  soonBadge: { color: colors.yellow, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.5, borderWidth: 1, borderColor: "rgba(245,179,1,0.4)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
});
