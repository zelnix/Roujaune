import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow } from "@/src/theme";
import {
  RIDER_TYPES,
  BIKE_TYPES,
  CLOTHING_STYLES,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  RiderAppearanceConfiguration,
  RiderType,
  BikeType,
  ClothingStyle,
} from "@/src/lib/rider-config";
import { riderVisualFor } from "@/src/lib/virtual-riders";

const eq = (a: RiderAppearanceConfiguration, b: RiderAppearanceConfiguration) =>
  a.riderType === b.riderType && a.bikeType === b.bikeType && a.clothingStyle === b.clothingStyle;

const BIKE_ICON: Record<BikeType, keyof typeof Ionicons.glyphMap> = {
  road: "bicycle",
  mountain: "trail-sign",
  vintage: "time",
};
const CLOTHING_ICON: Record<ClothingStyle, keyof typeof Ionicons.glyphMap> = {
  pro: "trophy",
  get_fit: "fitness",
  casual: "shirt",
};

export default function RiderCustomiseScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const twoCol = width >= 820;

  const [draft, setDraft] = React.useState<RiderAppearanceConfiguration>(DEFAULT_APPEARANCE);
  const savedRef = React.useRef<RiderAppearanceConfiguration>(DEFAULT_APPEARANCE);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    loadAppearance().then((cfg) => {
      if (!alive) return;
      savedRef.current = cfg;
      setDraft(cfg);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const dirty = !eq(draft, savedRef.current);
  const isDefault = eq(draft, DEFAULT_APPEARANCE);
  const setField = <K extends keyof RiderAppearanceConfiguration>(k: K, v: RiderAppearanceConfiguration[K]) => {
    setJustSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const persist = async (cfg: RiderAppearanceConfiguration) => {
    setSaving(true);
    await saveAppearance(cfg);
    savedRef.current = cfg;
    setSaving(false);
    setJustSaved(true);
  };
  const onSave = async () => { if (!saving) await persist(draft); };
  const onContinue = async () => {
    if (saving) return;
    if (dirty) await persist(draft);
    router.back();
  };
  const onReset = () => { setJustSaved(false); setDraft({ ...DEFAULT_APPEARANCE }); };
  const onRestore = () => { setJustSaved(false); setDraft({ ...savedRef.current }); };

  const visual = riderVisualFor(draft.riderType);
  const bikeMeta = BIKE_TYPES.find((b) => b.id === draft.bikeType)!;
  const clothingMeta = CLOTHING_STYLES.find((c) => c.id === draft.clothingStyle)!;
  const riderMeta = RIDER_TYPES.find((r) => r.id === draft.riderType)!;

  const Preview = (
    <View style={[s.previewCard, { borderColor: visual.accent + "66" }]}>
      <View style={[s.previewGlow, { backgroundColor: visual.accent + "22" }]} />
      <Image source={visual.sprite} style={s.previewSprite} resizeMode="contain" />
      <View style={s.previewMeta}>
        <Text style={s.previewName}>{riderMeta.label}</Text>
        <View style={s.previewChips}>
          <View style={[s.chip, { borderColor: visual.accent + "88" }]}>
            <Ionicons name={BIKE_ICON[draft.bikeType]} size={13} color={colors.yellow} />
            <Text style={s.chipText}>{bikeMeta.label}</Text>
          </View>
          <View style={[s.chip, { borderColor: visual.accent + "88" }]}>
            <Ionicons name={CLOTHING_ICON[draft.clothingStyle]} size={13} color={colors.yellow} />
            <Text style={s.chipText}>{clothingMeta.label}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const Options = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.optScroll} showsVerticalScrollIndicator={false}>
      {/* Rider identity */}
      <Text style={s.sectionLabel}>CHOOSE YOUR RIDER</Text>
      <View style={s.riderGrid}>
        {RIDER_TYPES.map((r) => {
          const sel = r.id === draft.riderType;
          const v = riderVisualFor(r.id as RiderType);
          return (
            <Pressable key={r.id} onPress={() => setField("riderType", r.id)} testID={`cust-rider-${r.id}`}
              style={[s.riderCard, sel && { borderColor: v.accent, borderWidth: 2 }]}
              accessibilityRole="button" accessibilityLabel={`Choose ${r.label}`}>
              <Image source={v.sprite} style={s.riderThumb} resizeMode="contain" />
              <Text style={s.riderName} numberOfLines={1}>{r.label}</Text>
              {sel && <View style={[s.riderCheck, { backgroundColor: v.accent }]}><Ionicons name="checkmark" size={12} color="#fff" /></View>}
            </Pressable>
          );
        })}
      </View>

      {/* Bike */}
      <Text style={s.sectionLabel}>CHOOSE YOUR BIKE</Text>
      {BIKE_TYPES.map((b) => (
        <OptionRow key={b.id} icon={BIKE_ICON[b.id]} label={b.label} sub={b.sub} selected={b.id === draft.bikeType}
          testID={`cust-bike-${b.id}`} onPress={() => setField("bikeType", b.id)} />
      ))}

      {/* Clothing */}
      <Text style={s.sectionLabel}>CHOOSE YOUR RIDING STYLE</Text>
      {CLOTHING_STYLES.map((c) => (
        <OptionRow key={c.id} icon={CLOTHING_ICON[c.id]} label={c.label} sub={c.sub} selected={c.id === draft.clothingStyle}
          testID={`cust-style-${c.id}`} onPress={() => setField("clothingStyle", c.id)} />
      ))}
    </ScrollView>
  );

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left", "right"]}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} testID="cust-back" hitSlop={12} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={s.backText}>Back</Text>
          </Pressable>
          <Text style={s.title}>Customise Your Rider</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 64, justifyContent: "flex-end" }}>
            {justSaved && !dirty && (
              <View style={s.savedBadge}><Ionicons name="checkmark-circle" size={14} color={colors.green} /><Text style={s.savedText}>Saved</Text></View>
            )}
          </View>
        </View>

        {loading ? (
          <View style={s.loader}><ActivityIndicator color={colors.yellow} /></View>
        ) : (
          <View style={[s.body, twoCol ? s.bodyRow : s.bodyCol]}>
            <View style={twoCol ? s.previewCol : undefined}>{Preview}</View>
            <View style={{ flex: 1 }}>{Options}</View>
          </View>
        )}

        {/* Action bar */}
        <View style={s.actions}>
          <Pressable onPress={onReset} disabled={isDefault} hitSlop={8} style={[s.ghostBtn, isDefault && { opacity: 0.4 }]} testID="cust-reset" accessibilityRole="button" accessibilityLabel="Reset to default">
            <Ionicons name="refresh" size={16} color={colors.textDim} />
            <Text style={s.ghostText}>Reset</Text>
          </Pressable>
          <Pressable onPress={onRestore} disabled={!dirty} hitSlop={8} style={[s.ghostBtn, !dirty && { opacity: 0.4 }]} testID="cust-restore" accessibilityRole="button" accessibilityLabel="Restore last saved">
            <Ionicons name="arrow-undo" size={16} color={colors.textDim} />
            <Text style={s.ghostText}>Restore</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onSave} disabled={!dirty || saving} hitSlop={8} style={[s.saveBtn, (!dirty || saving) && { opacity: 0.5 }]} testID="cust-save" accessibilityRole="button" accessibilityLabel="Save">
            <Ionicons name="save" size={16} color={colors.text} />
            <Text style={s.saveText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
          <Pressable onPress={onContinue} disabled={saving} style={s.continueBtn} testID="cust-continue" accessibilityRole="button" accessibilityLabel="Continue">
            <Text style={s.continueText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.bg} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function OptionRow({ icon, label, sub, selected, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; selected: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[s.optRow, selected && s.optRowSel]} accessibilityRole="button" accessibilityLabel={`Choose ${label}`}>
      <View style={[s.optIcon, selected && { backgroundColor: colors.yellow + "22", borderColor: colors.yellow }]}>
        <Ionicons name={icon} size={18} color={selected ? colors.yellow : colors.textDim} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.optLabel, selected && { color: colors.text }]} numberOfLines={1}>{label}</Text>
        <Text style={s.optSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.yellow : colors.textFaint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, minWidth: 64 },
  backText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: 0.3, flex: 1, textAlign: "center" },
  savedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  savedText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  body: { flex: 1, paddingHorizontal: spacing.md, gap: spacing.md },
  bodyRow: { flexDirection: "row" },
  bodyCol: { flexDirection: "column" },
  previewCol: { width: 320 },

  previewCard: { borderRadius: radius.xl, borderWidth: 1, backgroundColor: "rgba(12,13,16,0.9)", overflow: "hidden", padding: spacing.md, alignItems: "center", minHeight: 220, ...(shadow.card as any) },
  previewGlow: { position: "absolute", top: -40, alignSelf: "center", width: 260, height: 260, borderRadius: 130 },
  previewSprite: { width: "82%", height: 220, marginVertical: 4 },
  previewMeta: { alignItems: "center", gap: 8, marginTop: 4 },
  previewName: { color: colors.text, fontSize: 18, fontWeight: "800" },
  previewChips: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(0,0,0,0.35)" },
  chipText: { color: colors.textDim, fontSize: 12, fontWeight: "700" },

  optScroll: { paddingBottom: spacing.md, gap: 8 },
  sectionLabel: { color: colors.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: spacing.sm, marginBottom: 2 },

  riderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  riderCard: { width: "48%", flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 8, alignItems: "center", gap: 4 },
  riderThumb: { width: 64, height: 72 },
  riderName: { color: colors.text, fontSize: 12, fontWeight: "700" },
  riderCheck: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  optRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  optRowSel: { borderColor: colors.yellow, backgroundColor: colors.cardElevated },
  optIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.borderSoft },
  optLabel: { color: colors.textDim, fontSize: 15, fontWeight: "700" },
  optSub: { color: colors.textFaint, fontSize: 12, marginTop: 1 },

  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.yellow + "88", backgroundColor: colors.yellow + "18" },
  saveText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  continueBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.yellow },
  continueText: { color: colors.bg, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
});
