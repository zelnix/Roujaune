import React from "react";
import YoutubePlayer from "react-native-youtube-iframe";

export type CorePlayerProps = {
  videoId: string;
  playing: boolean;
  muted: boolean;
  width: number;
  height: number;
  onReady: () => void;
  onError: () => void;
  onEnded?: () => void;
};

/** Native (iOS/Android) YouTube player — official IFrame API via WebView. */
export default function RouteVideoPlayer({ videoId, playing, muted, width, height, onReady, onError, onEnded }: CorePlayerProps) {
  return (
    <YoutubePlayer
      height={height}
      width={width}
      videoId={videoId}
      play={playing}
      mute={muted}
      forceAndroidAutoplay
      webViewStyle={{ opacity: 0.99, backgroundColor: "transparent" }}
      webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
      onReady={onReady}
      onError={onError}
      onChangeState={(s: string) => { if (s === "ended") onEnded?.(); }}
      initialPlayerParams={{ playsinline: 1, controls: true, modestbranding: true, rel: false, loop: true }}
    />
  );
}
