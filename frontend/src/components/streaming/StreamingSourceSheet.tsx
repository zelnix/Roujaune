import React from "react";
import {
  Modal, View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { colors, radius, spacing } from "@/src/theme";
import { STREAMING_SERVICES, parseYouTubeId, launchStreaming, pipTip, StreamingService, loadYouTubeRecents, addYouTubeRecent, YouTubeRecent, youtubeThumb } from "@/src/lib/streaming";

type Props = {
  visible: boolean;
  source: "route" | "youtube";
  onClose: () => void;
  onPickRoute: () => void;
  onPickYouTube: (videoId: string) => void;
  routeLabel?: string;
  routeDesc?: string;
};

/** Bottom sheet to choose what plays behind a live ride: the scenic route
 *  video (default), the rider's own YouTube video (played in-app), or launch
 *  their own streaming app (Netflix / Prime / Disney+ / Apple TV) via PiP. */
export function StreamingSourceSheet({ visible, source, onClose, onPickRoute, onPickYouTube, routeLabel = "Scenic route video", routeDesc = "The curated ride footage with points of interest." }: Props) {
  const [url, setUrl] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [expandYT, setExpandYT] = React.useState(source === "youtube");
  const [recents, setRecents] = React.useState<YouTubeRecent[]>([]);

  React.useEffect(() => {
    if (visible) { setExpandYT(source === "youtube"); setErr(null); loadYouTubeRecents().then(setRecents); }
  }, [visible, source]);

  const submitYouTube = () => {
    const id = parseYouTubeId(url);
    if (!id) { setErr("Paste a valid YouTube link (or video ID)."); return; }
    setErr(null);
    addYouTubeRecent(id, url.trim()).then(setRecents);
    onPickYouTube(id);
    onClose();
  };

  const pickRecent = (r: YouTubeRecent) => {
    addYouTubeRecent(r.id, r.url).then(setRecents);
    onPickYouTube(r.id);
    onClose();
  };

  const launch = (svc: StreamingService) => {
    Alert.alert(
      `Watch on ${svc.name}`,
      pipTip(svc.name),
      [
        { text: "Cancel", style: "cancel" },
        { text: `Open ${svc.name}`, onPress: () => launchStreaming(svc) },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sx.backdrop} onPress={onClose} testID="stream-backdrop" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={sx.kav}>
        <View style={sx.sheet} testID="streaming-sheet">
          <View style={sx.grabber} />
          <View style={sx.head}>
            <Text style={sx.title}>Ride screen</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="stream-close" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textDim} />
            </Pressable>
          </View>
          <Text style={sx.sub}>Choose what plays behind your ride.</Text>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Scenic route video (default) */}
            <Pressable
              style={[sx.opt, source === "route" && sx.optOn]}
              onPress={() => { onPickRoute(); onClose(); }}
              testID="source-route"
            >
              <View style={[sx.optIcon, { backgroundColor: "rgba(245,179,1,0.14)" }]}>
                <Ionicons name="image" size={20} color={colors.yellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sx.optName}>{routeLabel}</Text>
                <Text style={sx.optDesc}>{routeDesc}</Text>
              </View>
              <Ionicons name={source === "route" ? "radio-button-on" : "radio-button-off"} size={20} color={source === "route" ? colors.yellow : colors.textFaint} />
            </Pressable>

            {/* My YouTube */}
            <Pressable
              style={[sx.opt, source === "youtube" && sx.optOn]}
              onPress={() => setExpandYT((v) => !v)}
              testID="source-youtube"
            >
              <View style={[sx.optIcon, { backgroundColor: "rgba(255,0,0,0.14)" }]}>
                <MaterialCommunityIcons name="youtube" size={22} color="#FF3B30" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sx.optName}>My YouTube video</Text>
                <Text style={sx.optDesc}>Paste any YouTube link to ride to your own footage.</Text>
              </View>
              <Ionicons name={source === "youtube" ? "radio-button-on" : "chevron-down"} size={20} color={source === "youtube" ? colors.yellow : colors.textFaint} />
            </Pressable>

            {expandYT && (
              <View style={sx.ytBox}>
                <TextInput
                  value={url}
                  onChangeText={(t) => { setUrl(t); if (err) setErr(null); }}
                  placeholder="https://youtube.com/watch?v=…"
                  placeholderTextColor={colors.textFaint}
                  style={sx.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={submitYouTube}
                  testID="yt-input"
                />
                {err && <Text style={sx.err}>{err}</Text>}
                <Pressable style={sx.playBtn} onPress={submitYouTube} testID="yt-play">
                  <Ionicons name="play" size={16} color="#04210F" />
                  <Text style={sx.playText}>Play this video</Text>
                </Pressable>
                {recents.length > 0 && (
                  <View style={sx.recentsWrap} testID="yt-recents">
                    <Text style={sx.recentsLabel}>RECENT</Text>
                    <View style={sx.recentsCol}>
                      {recents.map((r) => (
                        <Pressable key={r.id} style={sx.recentRow} onPress={() => pickRecent(r)} testID={`yt-recent-${r.id}`}>
                          <Image source={{ uri: youtubeThumb(r.id) }} style={sx.recentThumb} contentFit="cover" />
                          <Text style={sx.recentTitle} numberOfLines={2}>{r.title || r.id}</Text>
                          <Ionicons name="play-circle" size={20} color={colors.yellow} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* External streaming apps */}
            <Text style={sx.divLabel}>OR WATCH YOUR OWN APP</Text>
            <Text style={sx.hint}>Opens your app with your subscription — keep it in Picture-in-Picture (iOS) or split-screen (Android) and your ride keeps recording.</Text>
            <View style={sx.grid}>
              {STREAMING_SERVICES.map((svc) => (
                <Pressable key={svc.id} style={sx.tile} onPress={() => launch(svc)} testID={`stream-${svc.id}`}>
                  <View style={[sx.tileIcon, { backgroundColor: svc.color }]}>
                    <MaterialCommunityIcons name={svc.icon as any} size={24} color="#fff" />
                  </View>
                  <Text style={sx.tileName} numberOfLines={1}>{svc.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={sx.foot}>Streaming apps run on your device with your own account. Requires the app installed on this phone.</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sx = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderWidth: 1, borderColor: colors.border },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.white, fontSize: 20, fontWeight: "900" },
  sub: { color: colors.textDim, fontSize: 13.5, marginTop: 2, marginBottom: 14 },

  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, backgroundColor: colors.cardElevated },
  optOn: { borderColor: colors.yellow, backgroundColor: "rgba(245,179,1,0.06)" },
  optIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optName: { color: colors.white, fontSize: 15, fontWeight: "800" },
  optDesc: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },

  ytBox: { marginBottom: 12, marginTop: -2, gap: 10 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 14.5 },
  err: { color: colors.red, fontSize: 12.5, fontWeight: "600" },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 13, minHeight: 46 },
  playText: { color: "#04210F", fontSize: 14.5, fontWeight: "800" },

  recentsWrap: { marginTop: 4 },
  recentsLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
  recentsCol: { gap: 8 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8 },
  recentThumb: { width: 56, height: 32, borderRadius: 6, backgroundColor: colors.bg },
  recentTitle: { flex: 1, color: colors.white, fontSize: 13, fontWeight: "600" },

  divLabel: { color: colors.textFaint, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: 8, marginBottom: 6 },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "30%", alignItems: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardElevated },
  tileIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileName: { color: colors.white, fontSize: 12.5, fontWeight: "700" },

  foot: { color: colors.textFaint, fontSize: 11.5, lineHeight: 17, marginTop: 16 },
});
