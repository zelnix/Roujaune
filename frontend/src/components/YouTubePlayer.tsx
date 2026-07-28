import React from "react";
import YoutubePlayer from "react-native-youtube-iframe";

export type YouTubePlayerProps = {
  videoId: string;
  height: number;
  width: number;
  playing: boolean;
  onStateChange?: (playing: boolean) => void;
};

/** Native (iOS/Android) YouTube player via react-native-youtube-iframe. */
export default function YouTubePlayer({ videoId, height, width, playing, onStateChange }: YouTubePlayerProps) {
  return (
    <YoutubePlayer
      height={height}
      width={width}
      play={playing}
      mute
      videoId={videoId}
      onChangeState={(state: string) => {
        if (state === "playing") onStateChange?.(true);
        else if (state === "paused" || state === "ended") onStateChange?.(false);
      }}
      webViewProps={{ allowsInlineMediaPlayback: true }}
      initialPlayerParams={{ modestbranding: true, rel: false, controls: false, iv_load_policy: 3, mute: true }}
    />
  );
}
