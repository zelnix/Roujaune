import React from "react";
import { Text, StyleSheet, Platform, TextStyle, StyleProp, Pressable, Modal, View } from "react-native";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@react-native-vector-icons/ionicons";
import { textShadow } from "../theme";

/** "v1.0.0 · Build 1" — reads the version from app config and the platform
 *  build number (ios.buildNumber / android.versionCode), falling back to the
 *  native build version on a real device. */
export function versionLabel(): string {
  const cfg: any = Constants.expoConfig ?? {};
  const v = cfg.version ?? "1.0.0";
  const b = Platform.OS === "ios" ? cfg.ios?.buildNumber : cfg.android?.versionCode;
  const build = b ?? (Constants as any).nativeBuildVersion ?? "1";
  return `v${v} · Build ${build}`;
}

/** Detailed build info surfaced on long-press for support triage. */
function buildDetails(): { label: string; value: string }[] {
  const cfg: any = Constants.expoConfig ?? {};
  const C: any = Constants as any;
  const bundleId = Platform.OS === "ios" ? cfg.ios?.bundleIdentifier : cfg.android?.package;
  const rows: { label: string; value: string | undefined }[] = [
    { label: "Version", value: cfg.version ?? "1.0.0" },
    { label: "Build", value: (Platform.OS === "ios" ? cfg.ios?.buildNumber : cfg.android?.versionCode) ?? C.nativeBuildVersion ?? "1" },
    { label: "Bundle ID", value: bundleId },
    { label: "Runtime", value: cfg.runtimeVersion ? String(cfg.runtimeVersion) : undefined },
    { label: "Expo SDK", value: cfg.sdkVersion },
    { label: "Platform", value: `${Platform.OS} ${Platform.Version ?? ""}`.trim() },
    { label: "Environment", value: C.executionEnvironment },
    { label: "App version", value: C.nativeAppVersion },
    { label: "Install ID", value: C.installationId },
  ];
  return rows.filter((r) => r.value != null && String(r.value).length > 0).map((r) => ({ label: r.label, value: String(r.value) }));
}

export function AppVersionTag({ style }: { style?: StyleProp<TextStyle> }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const rows = React.useMemo(() => buildDetails(), []);

  const copy = async () => {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    try { await Clipboard.setStringAsync(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  };

  return (
    <>
      <Pressable
        onLongPress={() => setOpen(true)}
        delayLongPress={450}
        testID="app-version-tag"
        accessibilityRole="button"
        accessibilityLabel="App version — long press for build details"
      >
        <Text style={[styles.text, style]}>{versionLabel()}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} testID="build-info-overlay">
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} testID="build-info-modal">
            <View style={styles.head}>
              <Ionicons name="information-circle" size={20} color="#F4B51E" />
              <Text style={styles.headTitle}>Build details</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setOpen(false)} hitSlop={10} testID="build-info-close" accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue} selectable numberOfLines={1}>{r.value}</Text>
              </View>
            ))}
            <Pressable onPress={copy} style={styles.copyBtn} testID="build-info-copy" accessibilityRole="button" accessibilityLabel="Copy build details">
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#050506" />
              <Text style={styles.copyText}>{copied ? "Copied" : "Copy details"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginTop: 6,
    ...textShadow("rgba(0,0,0,0.6)", 5),
  },
  overlay: { flex: 1, backgroundColor: "rgba(4,4,6,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, backgroundColor: "#141210", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 18, padding: 18, gap: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)", gap: 16 },
  rowLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12.5, fontWeight: "700" },
  rowValue: { color: "#fff", fontSize: 12.5, fontWeight: "600", flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F4B51E", borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  copyText: { color: "#050506", fontSize: 14, fontWeight: "800" },
});
