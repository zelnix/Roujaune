import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import YouTubePlayer from "@/src/components/YouTubePlayer";
import { colors, radius, spacing } from "@/src/theme";
import { useScenicRoute, logScenicRide, ScenicRoute, useScenicFavourites } from "@/src/lib/scenic-routes";

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
};

/** Relaxed scenic POV player. Plays the admin-managed YouTube ride — no ERG,
 *  resistance, telemetry or rider-composite. On finish it logs a lightweight
 *  scenic ride to history (kept separate from training virtual rides). */
export default function ScenicRideScreen() {
  const router = useRouter();
  const { route: routeId } = useLocalSearchParams<{ route?: string }>();
  const { width } = useWindowDimensions();
  const { route, loading, error } = useScenicRoute(routeId);
  const fav = useScenicFavourites();

  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  // Count ride time only while the video is actually playing.
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);

  const leave = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const finish = async () => {
    if (!route) return leave();
    setSaving(true);
    await logScenicRide(route, elapsed);
    setSaving(false);
    leave();
  };

  const playerWidth = Math.min(width, 1100);
  const playerHeight = Math.round((playerWidth * 9) / 16);

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
      <SafeAreaView style={s.center} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
        <Text style={s.centerText}>This scenic route isn’t available.</Text>
        <Pressable onPress={leave} testID="scenic-back" style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={18} color={colors.white} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root} testID="scenic-ride">
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={s.header}>
            <Pressable onPress={leave} testID="scenic-exit" style={s.exitBtn} accessibilityRole="button" accessibilityLabel="Exit scenic ride" hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.white} />
              <Text style={s.exitText}>Exit</Text>
            </Pressable>
            <View style={s.timerPill} testID="scenic-timer">
              <Ionicons name="time-outline" size={14} color={colors.yellow} />
              <Text style={s.timerText}>{hms(elapsed)}</Text>
            </View>
          </View>

          {/* Player */}
          <View style={[s.playerWrap, { height: playerHeight }]} testID="scenic-player">
            <YouTubePlayer
              height={playerHeight}
              width={playerWidth}
              playing={playing}
              videoId={route.youtube_id}
              onStateChange={setPlaying}
            />
          </View>

          {/* Route info */}
          <View style={s.info}>
            <View style={s.badgeRow}>
              <View style={s.povBadge}>
                <Ionicons name="videocam" size={12} color="#fff" />
                <Text style={s.povText}>POV VIDEO</Text>
              </View>
              <View style={s.tagBadge}><Text style={s.tagText}>{route.tag}</Text></View>
              <Pressable
                testID={`scenic-fav-${route.id}`}
                onPress={() => fav.toggle(route.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityState={{ selected: fav.has(route.id) }}
                accessibilityLabel={fav.has(route.id) ? "Remove from saved" : "Save destination"}
                style={[s.favBtn, fav.has(route.id) && s.favBtnOn]}
              >
                <Ionicons name={fav.has(route.id) ? "heart" : "heart-outline"} size={16} color={fav.has(route.id) ? "#fff" : colors.white} />
                <Text style={s.favText}>{fav.has(route.id) ? "Saved" : "Save"}</Text>
              </Pressable>
            </View>
            <Text style={s.title}>{route.name}</Text>
            <Text style={s.place}>{route.place}</Text>
            {!!route.description && <Text style={s.desc}>{route.description}</Text>}

            <View style={s.stats}>
              {route.duration_min ? <Stat icon="time-outline" label={`${route.duration_min} min`} /> : null}
              {route.distance_km ? <Stat icon="navigate-outline" label={`${route.distance_km} km`} /> : null}
              {route.elevation_m ? <Stat icon="trending-up-outline" label={`${route.elevation_m} m`} /> : null}
              {route.difficulty ? <Stat icon="speedometer-outline" label={route.difficulty} /> : null}
            </View>

            {(route.terrain || route.surface) ? (
              <View style={s.detailRow} testID="scenic-terrain">
                {route.terrain ? <Detail icon="map-outline" label="Terrain" value={route.terrain} /> : null}
                {route.surface ? <Detail icon="trail-sign-outline" label="Surface" value={route.surface} /> : null}
              </View>
            ) : null}

            {route.highlights && route.highlights.length > 0 ? (
              <View style={s.route} testID="scenic-waypoints">
                <Text style={s.routeLabel}>ALONG THE WAY</Text>
                <View style={s.chips}>
                  {route.highlights.map((h, i) => (
                    <View key={`${h}-${i}`} style={s.chip}>
                      <Ionicons name="location-outline" size={12} color={colors.yellow} />
                      <Text style={s.chipText}>{h}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* Controls */}
          <View style={s.controls}>
            <Pressable
              testID="scenic-playpause"
              onPress={() => setPlaying((p) => !p)}
              style={({ pressed }) => [s.playBtn, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause ride" : "Play ride"}
            >
              <Ionicons name={playing ? "pause" : "play"} size={20} color={colors.bg} />
              <Text style={s.playText}>{playing ? "PAUSE" : "PLAY"}</Text>
            </Pressable>
            <Pressable
              testID="scenic-finish"
              onPress={finish}
              disabled={saving}
              style={({ pressed }) => [s.finishBtn, pressed && { opacity: 0.9 }, saving && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Finish ride"
            >
              <Ionicons name="flag" size={18} color={colors.white} />
              <Text style={s.finishText}>{saving ? "Saving…" : "Finish ride"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={15} color={colors.yellow} />
      <Text style={s.statText}>{label}</Text>
    </View>
  );
}

function Detail({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.detail}>
      <Ionicons name={icon} size={16} color={colors.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05060a" },
  center: { flex: 1, backgroundColor: "#05060a", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { color: colors.textDim, fontSize: 15, fontWeight: "600", textAlign: "center" },
  scroll: { paddingBottom: spacing.xl, alignItems: "center" },

  header: { width: "100%", maxWidth: 1100, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 12 },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  exitText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: colors.yellow + "44", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  timerText: { color: colors.white, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },

  playerWrap: { width: "100%", maxWidth: 1100, backgroundColor: "#000", overflow: "hidden" },

  info: { width: "100%", maxWidth: 1100, padding: spacing.lg, gap: 6 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  povBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(224,30,43,0.92)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  povText: { color: "#fff", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  tagBadge: { backgroundColor: "rgba(245,179,1,0.16)", borderWidth: 1, borderColor: colors.yellow + "55", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  tagText: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  favBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.05)" },
  favBtnOn: { backgroundColor: colors.red, borderColor: colors.red },
  favText: { color: colors.white, fontSize: 11.5, fontWeight: "800" },
  title: { color: colors.white, fontSize: 26, fontWeight: "900", letterSpacing: 0.3 },
  place: { color: colors.yellow, fontSize: 15, fontWeight: "700" },
  desc: { color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 640 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 14 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  detailRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16 },
  detail: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, minWidth: 220, flexGrow: 1, flexBasis: 220 },
  detailLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  detailValue: { color: colors.white, fontSize: 13.5, fontWeight: "600", marginTop: 2, lineHeight: 19 },

  route: { marginTop: 18, gap: 8 },
  routeLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,179,1,0.10)", borderWidth: 1, borderColor: colors.yellow + "33", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { color: colors.white, fontSize: 12.5, fontWeight: "600" },

  controls: { width: "100%", maxWidth: 1100, flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: spacing.lg, marginTop: 4 },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 30, minHeight: 52, flexGrow: 1 },
  playText: { color: colors.bg, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  finishBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 26, minHeight: 52, flexGrow: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  finishText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  backText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
