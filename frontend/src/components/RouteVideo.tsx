import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";
import { getYouTubeId, posterFor } from "../lib/youtube";
import Player from "./video/RouteVideoPlayer";

type Props = {
  /** YouTube URL or bare 11-char video ID (configurable route source). */
  source: string;
  /** Bound to workout state — plays while the workout runs, pauses when paused. */
  playing: boolean;
  /** Keep muted (no sound). */
  muted?: boolean;
  /** Explicit width; height is derived from a 16:9 aspect ratio. */
  width: number;
  title?: string;
  onEnded?: () => void;
};

/** Reusable, cross-platform first-person route video with loading / invalid /
 * error / retry states and a poster preview. Falls back gracefully so the rest
 * of the workout keeps working if the video can't load. */
export function RouteVideo({ source, playing, muted = true, width, title, onEnded }: Props) {
  const videoId = getYouTubeId(source);
  const height = Math.round((width * 9) / 16);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);

  const onReady = React.useCallback(() => setLoading(false), []);
  const onError = React.useCallback(() => { setError(true); setLoading(false); }, []);
  const retry = () => { setError(false); setLoading(true); setRetryKey((k) => k + 1); };

  return (
    <View style={[styles.wrap, { width, height }]} testID="route-video">
      {!videoId ? (
        <View style={styles.state} testID="route-video-invalid">
          <Ionicons name="alert-circle-outline" size={30} color={colors.textDim} />
          <Text style={styles.stateTitle}>Video unavailable</Text>
          <Text style={styles.stateSub}>The route link is invalid.</Text>
        </View>
      ) : (
        <>
          <View style={StyleSheet.absoluteFill} key={retryKey}>
            <Player
              videoId={videoId}
              playing={playing && !error}
              muted={muted}
              width={width}
              height={height}
              onReady={onReady}
              onError={onError}
              onEnded={onEnded}
            />
          </View>

          {loading && !error && (
            <View style={styles.state} pointerEvents="none" testID="route-video-loading">
              <Image source={{ uri: posterFor(videoId) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              <View style={styles.posterScrim} />
              <ActivityIndicator size="large" color={colors.red} />
              <Text style={styles.stateSub}>Loading route…</Text>
            </View>
          )}

          {error && (
            <View style={styles.state} testID="route-video-error">
              <Ionicons name="cloud-offline-outline" size={28} color={colors.textDim} />
              <Text style={styles.stateTitle}>Couldn&apos;t load the route video</Text>
              <Text style={styles.stateSub}>Check your connection and try again.</Text>
              <Pressable onPress={retry} style={styles.retryBtn} testID="route-video-retry" accessibilityRole="button" accessibilityLabel="Retry loading route video">
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {title && !error && !loading && (
        <View style={styles.titleTag} pointerEvents="none">
          <Ionicons name="navigate" size={12} color={colors.yellow} />
          <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: colors.borderSoft },
  state: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0A0A0A" },
  posterScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  stateTitle: { color: colors.white, fontSize: 15, fontWeight: "700" },
  stateSub: { color: colors.textDim, fontSize: 12.5 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 9, marginTop: 6 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
  titleTag: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  titleText: { color: colors.white, fontSize: 12, fontWeight: "700", maxWidth: 240 },
});
