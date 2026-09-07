import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
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
  /** Inline width; height is derived from `aspectRatio` (default 16:9). Ignored when `fill`. */
  width?: number;
  /** Override the inline aspect ratio (width/height). Defaults to 16/9. */
  aspectRatio?: number;
  /** Fill the parent container (immersive/expanded mode). */
  fill?: boolean;
  title?: string;
  onEnded?: () => void;
  /** Fires when the video fails to load (invalid id or player error). */
  onError?: () => void;
  /** Show an expand/collapse control and report taps. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Overlay content (e.g. live-data HUD) rendered above the video. */
  children?: React.ReactNode;
};

/** Reusable, cross-platform first-person route video with loading / invalid /
 * error / retry states, a poster preview, an optional expand control, and an
 * overlay slot for live-data HUDs. Falls back gracefully so the rest of the
 * workout keeps working if the video can't load. */
export function RouteVideo({
  source, playing, muted = true, width, aspectRatio = 16 / 9, fill = false, title, onEnded, onError: onErrorProp, expanded, onToggleExpand, children,
}: Props) {
  const videoId = getYouTubeId(source);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);

  const onReady = React.useCallback(() => setLoading(false), []);
  const onError = React.useCallback(() => { setError(true); setLoading(false); onErrorProp?.(); }, [onErrorProp]);
  const retry = () => { setError(false); setLoading(true); setRetryKey((k) => k + 1); };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize({ w: Math.round(w), h: Math.round(h) });
  };

  // An invalid/unresolvable source is also treated as an error so the parent
  // can fall back gracefully (e.g. switch to the Virtual route).
  React.useEffect(() => { if (!videoId) onErrorProp?.(); }, [videoId, onErrorProp]);

  const containerStyle = fill
    ? [styles.fill]
    : [{ width, aspectRatio }];

  return (
    <View style={[styles.wrap, fill && styles.wrapFill, containerStyle]} onLayout={onLayout} testID="route-video">
      {!videoId ? (
        <View style={styles.state} testID="route-video-invalid">
          <Ionicons name="alert-circle-outline" size={30} color={colors.textDim} />
          <Text style={styles.stateTitle}>Video unavailable</Text>
          <Text style={styles.stateSub}>The route link is invalid.</Text>
        </View>
      ) : (
        <>
          {size.w > 0 && size.h > 0 && (
            <View style={StyleSheet.absoluteFill} key={retryKey}>
              <Player
                videoId={videoId}
                playing={playing && !error}
                muted={muted}
                width={size.w}
                height={size.h}
                onReady={onReady}
                onError={onError}
                onEnded={onEnded}
              />
            </View>
          )}

          {loading && !error && (
            <View style={[styles.state, { pointerEvents: "none" }]} testID="route-video-loading">
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

      {/* Live-data HUD / overlay slot */}
      {children && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>{children}</View>
      )}

      {/* Expand / collapse control */}
      {onToggleExpand && !error && videoId && (
        <Pressable
          style={styles.expandBtn}
          onPress={onToggleExpand}
          testID="video-expand-toggle"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse route video" : "Expand route video"}
        >
          <Ionicons name={expanded ? "contract" : "expand"} size={18} color="#fff" />
        </Pressable>
      )}

      {title && !expanded && !error && !loading && (
        <View style={[styles.titleTag, { pointerEvents: "none" }]}>
          <Ionicons name="navigate" size={12} color={colors.yellow} />
          <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: colors.borderSoft },
  wrapFill: { borderRadius: 0, borderWidth: 0 },
  fill: { flex: 1, width: "100%", height: "100%" },
  state: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0A0A0A" },
  posterScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  stateTitle: { color: colors.white, fontSize: 15, fontWeight: "700" },
  stateSub: { color: colors.textDim, fontSize: 12.5 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 9, marginTop: 6 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
  titleTag: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  titleText: { color: colors.white, fontSize: 12, fontWeight: "700", maxWidth: 240 },
  expandBtn: { position: "absolute", top: 10, right: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
});
