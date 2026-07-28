import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, Animated, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Circle } from "react-native-svg";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import YouTubePlayer from "@/src/components/YouTubePlayer";
import { colors, radius } from "@/src/theme";
import { useScenicRoute, logScenicRide, ytThumb } from "@/src/lib/scenic-routes";
import { useCoach, useVoiceGuidance, setVoiceGuidance, VoiceGuidance } from "@/src/lib/coach-persona";

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" }) as string;

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

/** Warm red→gold gradient text (matches the ROUJAUNE brand ramp). */
function GradientText({ text, style }: { text: string; style: any }) {
  if (Platform.OS === "web") {
    return (
      <Text
        style={[style, {
          // web-only gradient clip
          backgroundImage: "linear-gradient(95deg, #F2392E 0%, #F5B301 58%, #FFC418 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        } as any]}
      >
        {text}
      </Text>
    );
  }
  return (
    <MaskedView maskElement={<Text style={[style, { color: "#000" }]}>{text}</Text>}>
      <LinearGradient colors={["#F2392E", "#F5B301", "#FFC418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }}>
        <Text style={[style, { opacity: 0 }]}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/** Yellow progress ring with the percentage centred inside. */
function Ring({ pct }: { pct: number }) {
  const size = 54, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.yellow} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** Static audio waveform decoration. */
function Waveform() {
  const bars = [6, 12, 20, 10, 16, 24, 14, 8, 18, 12, 22, 9, 15, 20, 7, 13];
  return (
    <View style={s.wave}>
      {bars.map((h, i) => <View key={i} style={[s.waveBar, { height: h }]} />)}
    </View>
  );
}

/** Immersive live scenic-ride experience — a full-bleed POV video with a
 *  cinematic, fully hideable HUD (tap the scene to show/hide). */
export default function ScenicRideScreen() {
  const router = useRouter();
  const { route: routeId } = useLocalSearchParams<{ route?: string }>();
  const { width, height } = useWindowDimensions();
  const { route, loading, error } = useScenicRoute(routeId);
  const persona = useCoach();

  const [playing, setPlaying] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [hud, setHud] = React.useState(true);
  const guidance = useVoiceGuidance();
  const audioMode: "quiet" | "discover" | "guided" =
    guidance === "muted" ? "quiet" : guidance === "full" ? "guided" : "discover";
  const setAudio = (m: "quiet" | "discover" | "guided") => {
    const map: Record<typeof m, VoiceGuidance> = { quiet: "muted", discover: "essential", guided: "full" } as const;
    setVoiceGuidance(map[m]);
  };
  const fade = React.useRef(new Animated.Value(1)).current;

  // Soft, looping ambient soundtrack that replaces the (muted) video audio.
  const ambient = useAudioPlayer(require("../assets/audio/scenic_ambient.mp3"));
  React.useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    try { ambient.loop = true; ambient.volume = 0.18; } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Music follows the ride: plays while riding, softens/mutes in Quiet mode.
  React.useEffect(() => {
    try {
      ambient.volume = audioMode === "quiet" ? 0.06 : 0.18;
      if (playing) ambient.play(); else ambient.pause();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioMode]);
  // Stop the music when leaving the ride.
  React.useEffect(() => () => { try { ambient.pause(); } catch {} }, [ambient]);

  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);

  React.useEffect(() => {
    Animated.timing(fade, { toValue: hud ? 1 : 0, duration: 260, useNativeDriver: Platform.OS !== "web" }).start();
  }, [hud, fade]);

  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };
  const finish = async () => {
    if (!route) return leave();
    setSaving(true);
    await logScenicRide(route, elapsed);
    setSaving(false);
    leave();
  };

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.yellow} />
        <Text style={s.centerText}>Loading your scenic ride…</Text>
      </View>
    );
  }
  if (error || !route) {
    return (
      <View style={s.center}>
        <StatusBar style="light" />
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
        <Text style={s.centerText}>This scenic route isn’t available.</Text>
        <Pressable onPress={leave} style={s.pillBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={18} color={colors.white} />
          <Text style={s.pillBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // Cover-fit the 16:9 video to the whole screen.
  const cover = width / height > 16 / 9
    ? { w: width, h: width * 9 / 16 }
    : { w: height * 16 / 9, h: height };

  const durationSec = (route.duration_min ?? 45) * 60;
  const pct = Math.min(1, elapsed / durationSec);
  const remainingMin = Math.max(0, Math.ceil((durationSec - elapsed) / 60));
  const km = ((route.distance_km ?? 0) * pct).toFixed(1);
  const upcoming = route.highlights?.[0] ?? "the next highlight";
  const subtitle = route.tag || "Scenic Route";

  return (
    <View style={s.root} testID="scenic-ride">
      <StatusBar style="light" hidden />

      {/* POV video — full-bleed cover */}
      <View style={s.videoWrap} pointerEvents="none">
        <View style={{ width: cover.w, height: cover.h, marginLeft: (width - cover.w) / 2, marginTop: (height - cover.h) / 2 }}>
          <YouTubePlayer height={cover.h} width={cover.w} playing={playing} videoId={route.youtube_id} onStateChange={setPlaying} />
        </View>
      </View>

      {/* subtle legibility vignette */}
      <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.45)", "transparent", "transparent", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFill as any} />

      {/* tap-catcher (below HUD) toggles the HUD */}
      <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setHud((v) => !v)} testID="hud-toggle-scene" accessibilityRole="button" accessibilityLabel={hud ? "Hide overlay" : "Show overlay"} />

      {/* HUD */}
      <Animated.View style={[StyleSheet.absoluteFill as any, { opacity: fade }]} pointerEvents={hud ? "box-none" : "none"}>
        {/* Title */}
        <View style={s.title} pointerEvents="none">
          <GradientText text="SCENIC RIDE" style={s.titleText} />
        </View>

        {/* Left — progress panel */}
        <View style={s.leftPanel} pointerEvents="box-none">
          <View style={s.rowCenter}>
            <Ionicons name="location" size={16} color={colors.yellow} />
            <Text style={s.placeText} numberOfLines={1}>{route.place || route.name}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.rowCenter}>
            <Ring pct={pct} />
            <View style={s.ringLabelWrap}><Text style={s.ringPct}>{Math.round(pct * 100)}%</Text></View>
            <View style={{ marginLeft: 12 }}>
              <Text style={s.metaBig}>{Math.round(pct * 100)}%</Text>
              <Text style={s.metaSub}>of route explored</Text>
            </View>
          </View>
          <View style={s.rowCenter}>
            <Ionicons name="stopwatch-outline" size={22} color={colors.white} />
            <View style={{ marginLeft: 12 }}>
              <Text style={s.metaBig}>{remainingMin} min</Text>
              <Text style={s.metaSub}>remaining</Text>
            </View>
          </View>
        </View>

        {/* Center — destination */}
        <View style={s.center2} pointerEvents="none">
          <View style={s.rowCenter}>
            <Ionicons name="location" size={13} color={colors.yellow} />
            <Text style={s.country}>{(route.country || route.region || "").toUpperCase()}</Text>
          </View>
          <Text style={s.destination}>{route.name}</Text>
          <View style={s.rowCenter}>
            <Text style={s.destSub}>{subtitle}</Text>
            <Ionicons name="reorder-two" size={18} color={colors.yellow} style={{ marginLeft: 8 }} />
          </View>
        </View>

        {/* Right — coming up */}
        <View style={s.rightPanel} pointerEvents="box-none">
          <Text style={s.comingUp}>COMING UP</Text>
          <Text style={s.poiName}>{upcoming}</Text>
          <Image source={{ uri: route.thumbnail || ytThumb(route.youtube_id) }} style={s.poiImg} contentFit="cover" />
          <Text style={s.poiDesc}>A scenic highlight along the {subtitle.toLowerCase()} — settle in as you approach.</Text>
          <Pressable style={s.hearBtn} testID="hear-the-story" onPress={() => setAudio("guided")} accessibilityRole="button" accessibilityLabel={`Hear the story of ${upcoming}`}>
            <Ionicons name="headset" size={16} color="#fff" />
            <Text style={s.hearText}>Hear the story</Text>
          </Pressable>
        </View>

        {/* Companion card */}
        <View style={s.companion} pointerEvents="box-none">
          <Image source={persona.image} style={s.avatar} contentFit="cover" contentPosition="top center" />
          <View style={{ flex: 1 }}>
            <Text style={s.companionName}>{persona.name}</Text>
            <Text style={s.companionText}>
              You&apos;re approaching one of {route.place || route.name}&apos;s most iconic views. Settle in, enjoy the {subtitle.toLowerCase()}, and I&apos;ll share a story as we reach {upcoming}.
            </Text>
            <Waveform />
          </View>
        </View>

        {/* Bottom metrics + audio mode */}
        <View style={s.metricsBar} pointerEvents="box-none">
          <Metric icon="time-outline" value={clock(elapsed)} label="Time" />
          <Metric icon="sync-outline" value="78" label="rpm" />
          <Metric icon="heart-outline" value="118" label="bpm" />
          <Metric icon="navigate-outline" value={km} label="km" />
          <View style={s.segment}>
            <Seg icon="leaf-outline" label="Quiet" active={audioMode === "quiet"} onPress={() => setAudio("quiet")} />
            <Seg icon="sparkles-outline" label="Discover" active={audioMode === "discover"} onPress={() => setAudio("discover")} />
            <Seg icon="headset-outline" label="Guided" active={audioMode === "guided"} onPress={() => setAudio("guided")} />
          </View>
        </View>

        {/* Bottom nav */}
        <View style={s.nav} pointerEvents="box-none">
          <View style={s.navBrand}>
            <Image source={require("../assets/images/logo_glyph_t.png")} style={s.navGlyph} contentFit="contain" />
            <Image source={require("../assets/images/wordmark_t.png")} style={s.navWordmarkImg} contentFit="contain" />
          </View>
          <View style={s.navItems}>
            <NavItem icon="home-outline" label="Home" onPress={() => router.replace("/")} />
            <NavItem icon="compass-outline" label="Explore" onPress={() => router.replace("/scenic-destinations")} />
            <NavItem icon="bicycle" label="Ride" active />
            <NavItem icon="map-outline" label="Journeys" onPress={() => router.replace("/saved-destinations")} />
            <NavItem icon="headset-outline" label="Audio" onPress={() => setAudio(audioMode === "guided" ? "quiet" : "guided")} />
            <NavItem icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} />
            <NavItem icon="people-outline" label="Companion" onPress={() => router.push("/profile")} />
          </View>
        </View>
      </Animated.View>

      {/* Persistent utility cluster (always tappable, even when HUD hidden) */}
      <View style={s.utility} pointerEvents="box-none">
        <Pressable style={s.utilBtn} onPress={() => setHud((v) => !v)} testID="hud-toggle" accessibilityRole="button" accessibilityLabel={hud ? "Hide overlay" : "Show overlay"}>
          <Ionicons name={hud ? "eye-outline" : "eye-off-outline"} size={20} color="#fff" />
        </Pressable>
        <Pressable style={s.utilBtn} onPress={() => setPlaying((p) => !p)} testID="scenic-playpause" accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"}>
          <Ionicons name={playing ? "pause" : "play"} size={20} color="#fff" />
        </Pressable>
        <Pressable style={[s.utilBtn, s.utilExit]} onPress={finish} disabled={saving} testID="scenic-finish" accessibilityRole="button" accessibilityLabel="Finish ride">
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function Metric({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={s.metric}>
      <View style={s.metricIcon}><Ionicons name={icon} size={15} color={colors.yellow} /></View>
      <View>
        <Text style={s.metricValue}>{value}</Text>
        <Text style={s.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function Seg({ icon, label, active, onPress }: { icon: any; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.seg, active && s.segActive]} accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={active ? "#fff" : colors.textDim} />
      <Text style={[s.segText, active && s.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: any; label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.navItem} accessibilityRole="button" accessibilityLabel={label} disabled={active}>
      <Ionicons name={icon} size={19} color={active ? colors.red : colors.textDim} />
      <Text style={[s.navLabel, active && { color: colors.red, fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

const PANEL = "rgba(14,18,20,0.55)";
const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05060a" },
  center: { flex: 1, backgroundColor: "#05060a", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center" },
  pillBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  pillBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  videoWrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#000" },

  rowCenter: { flexDirection: "row", alignItems: "center" },

  title: { position: "absolute", top: 26, left: 30 },
  titleText: { fontSize: 30, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },

  leftPanel: { position: "absolute", top: 150, left: 24, width: 262, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 20, gap: 18 },
  placeText: { color: colors.white, fontSize: 17, fontWeight: "700", marginLeft: 10, flex: 1 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.14)" },
  ringLabelWrap: { position: "absolute", width: 54, alignItems: "center" },
  ringPct: { color: colors.white, fontSize: 12, fontWeight: "800" },
  metaBig: { color: colors.white, fontSize: 22, fontWeight: "800" },
  metaSub: { color: colors.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 1 },

  center2: { position: "absolute", top: 70, alignSelf: "center", alignItems: "center", width: "100%" },
  country: { color: colors.white, fontSize: 13, fontWeight: "800", letterSpacing: 3, marginLeft: 6 },
  destination: { color: colors.white, fontFamily: SERIF, fontSize: 52, fontWeight: "700", marginTop: 2, ...(Platform.OS === "web" ? { textShadow: "0px 2px 18px rgba(0,0,0,0.6)" } : { textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 18, textShadowOffset: { width: 0, height: 2 } }) },
  destSub: { color: colors.white, fontSize: 17, fontWeight: "500", letterSpacing: 0.4 },

  rightPanel: { position: "absolute", top: 150, right: 24, width: 300, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 20 },
  comingUp: { color: colors.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  poiName: { color: colors.white, fontFamily: SERIF, fontSize: 26, fontWeight: "700", marginTop: 4, marginBottom: 12 },
  poiImg: { width: "100%", height: 150, borderRadius: radius.md, backgroundColor: "#0E1512" },
  poiDesc: { color: colors.textDim, fontSize: 13.5, lineHeight: 20, marginTop: 12 },
  hearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, marginTop: 14, minHeight: 46 },
  hearText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },

  companion: { position: "absolute", left: 24, bottom: 168, width: 420, flexDirection: "row", gap: 14, backgroundColor: PANEL, borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.yellow, backgroundColor: "#0E1512" },
  companionName: { color: colors.yellow, fontSize: 16, fontWeight: "700", fontStyle: "italic" },
  companionText: { color: "rgba(255,255,255,0.9)", fontSize: 13.5, lineHeight: 20, marginTop: 3 },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8, height: 24 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.yellow, opacity: 0.85 },

  metricsBar: { position: "absolute", bottom: 92, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(14,18,20,0.72)", borderRadius: radius.pill, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10 },
  metric: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  metricIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.14)" },
  metricValue: { color: colors.white, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700", marginTop: -1 },
  segment: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radius.pill, padding: 4, marginLeft: 6, gap: 2 },
  seg: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.red },
  segText: { color: colors.textDim, fontSize: 13.5, fontWeight: "700" },
  segTextActive: { color: "#fff" },

  nav: { position: "absolute", bottom: 16, left: 24, right: 24, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(8,10,10,0.78)", borderRadius: radius.pill, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 20, paddingVertical: 12 },
  navBrand: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 22, marginRight: 8, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  navGlyph: { width: 30, height: 30 },
  navWordmarkImg: { width: 132, height: 22 },
  navItems: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  navItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
  navLabel: { color: colors.textDim, fontSize: 15, fontWeight: "600" },

  utility: { position: "absolute", top: 24, right: 24, flexDirection: "row", gap: 10, zIndex: 20 },
  utilBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: BORDER },
  utilExit: { backgroundColor: "rgba(224,30,43,0.85)", borderColor: colors.red },
});
