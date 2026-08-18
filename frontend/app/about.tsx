import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, Linking, TextInput, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as MailComposer from "expo-mail-composer";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useAuth } from "@/src/lib/auth-context";
import { useEntitlement } from "@/src/lib/entitlement";
import { useSettings } from "@/src/lib/settings";
import { getRecentLogs } from "@/src/lib/logbuffer";

const SUPPORT_EMAIL = "support@harmonywellnessgroup.com.au";

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

  // ── Rate the app + feedback ────────────────────────────────────────────
  const [rating, setRating] = React.useState(0);
  const [message, setMessage] = React.useState("");
  const [shot, setShot] = React.useState<{ uri: string; name: string; type: string } | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const API = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

  const pickScreenshot = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") {
        if (perm.canAskAgain) {
          const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
          status = req.status;
        }
        if (status !== "granted") {
          Alert.alert(
            "Photo access needed",
            "Allow photo access to attach a screenshot to your feedback.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.fileName ?? `screenshot.${(a.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`;
      setShot({ uri: a.uri, name, type: a.mimeType ?? "image/jpeg" });
    } catch {
      Alert.alert("Couldn't open photos", "Please try again.");
    }
  };

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!shot) return null;
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(shot.uri)).blob();
      form.append("file", blob, shot.name);
    } else {
      form.append("file", { uri: shot.uri, name: shot.name, type: shot.type } as any);
    }
    const res = await fetch(`${API}/api/feedback/screenshot`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const d = await res.json();
    return d.path ?? null;
  };

  const submitFeedback = async () => {
    if (sending) return;
    if (rating === 0) {
      Alert.alert("Add a rating", "Please tap a star rating before sending.");
      return;
    }
    setSending(true);
    try {
      let screenshot_path: string | null = null;
      try {
        screenshot_path = await uploadScreenshot();
      } catch {
        // Screenshot is optional — carry on without it if the upload fails.
        screenshot_path = null;
      }
      const res = await fetch(`${API}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          message: message.trim(),
          screenshot_path,
          meta: {
            platform: `${Platform.OS}${Device.osVersion ? " " + Device.osVersion : ""}`,
            model: Device.modelName ?? undefined,
            version: appVersion(),
            build: buildNumber(),
          },
        }),
      });
      if (!res.ok) throw new Error(`submit ${res.status}`);
      setSent(true);
      setMessage("");
      setShot(null);
    } catch {
      Alert.alert("Couldn't send", "Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

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

      <Card style={s.card} testID="about-feedback">
        <SectionTitle label="Rate & feedback" />
        {sent ? (
          <View style={s.thanks} testID="feedback-thanks">
            <Ionicons name="checkmark-circle" size={30} color={CC.green} />
            <Text style={s.thanksTitle}>Thanks for the feedback!</Text>
            <Text style={s.thanksSub}>Our team reads every note. You can send another any time.</Text>
            <Pressable testID="feedback-again" onPress={() => { setSent(false); setRating(0); }}
              style={({ hovered }: any) => [s.secondaryBtn, hovered && s.hover, { marginTop: 14 }]}>
              <Ionicons name="create-outline" size={16} color={CC.white} />
              <Text style={s.secondaryText}>Send more feedback</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.help}>How are we doing? Tap a rating and tell us what you love or what we can fix.</Text>
            <View style={s.stars} testID="feedback-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} testID={`feedback-star-${n}`} onPress={() => setRating(n)} hitSlop={6}
                  accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}>
                  <Ionicons name={n <= rating ? "star" : "star-outline"} size={34}
                    color={n <= rating ? CC.yellow : "rgba(255,255,255,0.28)"} style={s.star} />
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="feedback-message"
              value={message}
              onChangeText={setMessage}
              placeholder="Share the details… (optional)"
              placeholderTextColor={CC.dim}
              multiline
              style={s.input}
              maxLength={2000}
            />
            {shot ? (
              <View style={s.shotWrap} testID="feedback-shot">
                <Image source={{ uri: shot.uri }} style={s.shotImg} resizeMode="cover" />
                <Pressable testID="feedback-shot-remove" onPress={() => setShot(null)} hitSlop={8} style={s.shotRemove}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable testID="feedback-attach" onPress={pickScreenshot}
                style={({ hovered }: any) => [s.attachBtn, hovered && s.hover]}>
                <Ionicons name="image-outline" size={16} color={CC.white} />
                <Text style={s.secondaryText}>Attach a screenshot</Text>
              </Pressable>
            )}
            <Pressable testID="feedback-submit" onPress={submitFeedback} disabled={sending}
              style={({ hovered }: any) => [s.primaryBtn, hovered && s.hover, sending && s.btnDisabled, { marginTop: 12 }]}>
              {sending ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="send" size={16} color="#241B00" />}
              <Text style={s.primaryText}>{sending ? "Sending…" : "Send feedback"}</Text>
            </Pressable>
          </>
        )}
      </Card>

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
  stars: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4, marginBottom: 14 },
  star: { marginHorizontal: 2 },
  input: {
    minHeight: 92, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12,
    padding: 12, color: CC.white, fontSize: 14, textAlignVertical: "top", backgroundColor: "rgba(255,255,255,0.03)",
  },
  attachBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 12,
    paddingVertical: 12, minHeight: 46, marginTop: 12,
  },
  shotWrap: { marginTop: 12, alignSelf: "flex-start" },
  shotImg: { width: 96, height: 96, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  shotRemove: { position: "absolute", top: -8, right: -8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12 },
  thanks: { alignItems: "center", paddingVertical: 10, gap: 6 },
  thanksTitle: { color: CC.white, fontSize: 16, fontWeight: "800", marginTop: 4 },
  thanksSub: { color: CC.dim, fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 },
});
