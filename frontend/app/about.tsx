import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as MailComposer from "expo-mail-composer";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";

import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useAuth } from "@/src/lib/auth-context";
import { useEntitlement } from "@/src/lib/entitlement";
import { useSettings } from "@/src/lib/settings";
import { getRecentLogs } from "@/src/lib/logbuffer";

const SUPPORT_EMAIL = "support@roujaune.cc";

const DEVICE_TYPE: Record<number, string> = {
  0: "Unknown", 1: "Phone", 2: "Tablet", 3: "Desktop", 4: "TV",
};

function appVersion() {
  const cfg: any = Constants.expoConfig ?? {};
  return cfg.version ?? "—";
}
function buildNumber() {
  const cfg: any = Constants.expoConfig ?? {};
  const b = Platform.OS === "ios" ? cfg.ios?.buildNumber : cfg.android?.versionCode;
  return String(b ?? (Constants as any).nativeBuildVersion ?? "—");
}

export default function AboutScreen() {
  const { user } = useAuth();
  const ent = useEntitlement();
  const { settings } = useSettings();
  const [busy, setBusy] = React.useState(false);

  const rows = React.useMemo(() => {
    const cfg: any = Constants.expoConfig ?? {};
    const planLabel = ent.premium
      ? `Premium · ${ent.plan === "yearly" ? "Annual" : ent.plan === "monthly" ? "Monthly" : "Member"}`
      : "Free";
    return {
      app: [
        ["App", cfg.name ?? "Roujaune"],
        ["Version", appVersion()],
        ["Build", buildNumber()],
        ["Expo SDK", cfg.sdkVersion ?? (Constants as any).expoVersion ?? "—"],
        ["Environment", __DEV__ ? "Preview / Development" : "Production"],
        ["Runtime", (Constants as any).executionEnvironment ?? "—"],
        ["API", (process.env.EXPO_PUBLIC_BACKEND_URL ?? "—").replace(/\/$/, "")],
      ] as [string, string][],
      device: [
        ["Platform", `${Platform.OS}${Device.osVersion ? " " + Device.osVersion : ""}`],
        ["OS", Device.osName ?? Platform.OS],
        ["Model", Device.modelName ?? Device.deviceName ?? "—"],
        ["Brand", Device.brand ?? Device.manufacturer ?? "—"],
        ["Type", DEVICE_TYPE[Device.deviceType ?? 0] ?? "Unknown"],
        ["Physical device", Device.isDevice ? "Yes" : "No (simulator)"],
      ] as [string, string][],
      account: [
        ["Name", user?.name ?? "—"],
        ["Email", user?.email ?? "—"],
        ["User ID", user?.user_id ?? "—"],
        ["Sign-in", user?.provider ?? "—"],
        ["Email verified", user?.email_verified ? "Yes" : "No"],
        ["Plan", planLabel],
        ["FTP", `${settings.ftp} W`],
      ] as [string, string][],
    };
  }, [user, ent, settings.ftp]);

  const diagnosticsText = React.useCallback(() => {
    const at = new Date().toISOString();
    const lines: string[] = [`Roujaune diagnostics — ${at}`, ""];
    (["app", "device", "account"] as const).forEach((k) => {
      lines.push(`== ${k.toUpperCase()} ==`);
      (rows as any)[k].forEach(([l, v]: [string, string]) => lines.push(`${l}: ${v}`));
      lines.push("");
    });
    return lines.join("\n");
  }, [rows]);

  const onCopy = async () => {
    const text = `${diagnosticsText()}\n== RECENT LOGS ==\n${getRecentLogs()}`;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Diagnostics and recent logs copied to your clipboard.");
  };

  const onEmail = async () => {
    if (busy) return;
    setBusy(true);
    const diag = diagnosticsText();
    const logs = getRecentLogs();
    try {
      const available = Platform.OS !== "web" && (await MailComposer.isAvailableAsync());
      if (available) {
        let attachments: string[] = [];
        try {
          const path = `${FileSystem.cacheDirectory}roujaune-diagnostics.txt`;
          await FileSystem.writeAsStringAsync(path, `${diag}\n== RECENT LOGS ==\n${logs}`);
          attachments = [path];
        } catch {
          // attachment optional — logs still go in the body below
        }
        await MailComposer.composeAsync({
          recipients: [SUPPORT_EMAIL],
          subject: `Roujaune support — ${user?.email ?? "user"}`,
          body: `Describe your issue here:\n\n\n----------------------------------------\n${diag}\n== RECENT LOGS ==\n${logs}`,
          attachments,
        });
      } else {
        // Web / no mail app configured → mailto (cap logs so the URL isn't rejected)
        const shortLogs = logs.split("\n").slice(-40).join("\n");
        const body = encodeURIComponent(
          `Describe your issue here:\n\n\n----------------------------------------\n${diag}\n== RECENT LOGS (last 40) ==\n${shortLogs}`
        );
        const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Roujaune support")}&body=${body}`;
        const ok = await Linking.canOpenURL(url).catch(() => false);
        if (ok) {
          await Linking.openURL(url);
        } else {
          await onCopy();
          Alert.alert(
            "No email app found",
            `We copied your diagnostics — please paste them into an email to ${SUPPORT_EMAIL}.`
          );
        }
      }
    } catch {
      Alert.alert("Couldn't open email", `Please email ${SUPPORT_EMAIL} — your diagnostics have been copied.`);
      await onCopy();
    } finally {
      setBusy(false);
    }
  };

  const Section = ({ title, data, testID }: { title: string; data: [string, string][]; testID: string }) => (
    <Card style={s.card} testID={testID}>
      <SectionTitle label={title} />
      {data.map(([label, value], i) => (
        <View key={label} style={[s.row, i < data.length - 1 && s.rowBorder]}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowValue} numberOfLines={2} selectable>{value}</Text>
        </View>
      ))}
    </Card>
  );

  return (
    <AppScaffold active="profile" title="About & Support" subtitle="App info and a fast line to our team">
      <Section title="App" data={rows.app} testID="about-app" />
      <Section title="Device" data={rows.device} testID="about-device" />
      <Section title="Account" data={rows.account} testID="about-account" />

      <Card style={s.card} testID="about-support">
        <SectionTitle label="Contact support" />
        <Text style={s.help}>
          Having trouble? Email our team — your app, device and account details plus recent logs are
          attached automatically so we can help faster.
        </Text>
        <Pressable testID="about-email" onPress={onEmail} disabled={busy}
          style={({ hovered }: any) => [s.primaryBtn, hovered && s.hover, busy && s.btnDisabled]}>
          <Ionicons name="mail" size={17} color="#241B00" />
          <Text style={s.primaryText}>{busy ? "Opening email…" : "Email support"}</Text>
        </Pressable>
        <Pressable testID="about-copy" onPress={onCopy}
          style={({ hovered }: any) => [s.secondaryBtn, hovered && s.hover]}>
          <Ionicons name="copy-outline" size={16} color={CC.white} />
          <Text style={s.secondaryText}>Copy diagnostics</Text>
        </Pressable>
        <Text style={s.emailHint}>{SUPPORT_EMAIL}</Text>
      </Card>
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 14, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, gap: 16 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)" },
  rowLabel: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  rowValue: { color: CC.white, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  help: { color: CC.dim, fontSize: 13, lineHeight: 19, marginBottom: 14, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: CC.yellow, borderRadius: 12, paddingVertical: 13, minHeight: 48,
  },
  primaryText: { color: "#241B00", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 12,
    paddingVertical: 12, minHeight: 46, marginTop: 10,
  },
  secondaryText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
  hover: { opacity: 0.9 },
  emailHint: { color: CC.dim, fontSize: 12, textAlign: "center", marginTop: 12 },
});
