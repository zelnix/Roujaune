import React from "react";
import YoutubePlayer from "react-native-youtube-iframe";

export type YouTubePlayerProps = {
  videoId: string;
  height: number;
  width: number;
  playing: boolean;
  startSeconds?: number;
  onStateChange?: (playing: boolean) => void;
  onProgress?: (currentSec: number, durationSec: number) => void;
};

/** Native (iOS/Android) YouTube player via react-native-youtube-iframe. Polls
 *  the player's real currentTime/duration so the HUD progress + POI timing are
 *  pixel-accurate to the video, not an estimate. */
export default function YouTubePlayer({ videoId, height, width, playing, startSeconds, onStateChange, onProgress }: YouTubePlayerProps) {
  const playerRef = React.useRef<any>(null);
  const durRef = React.useRef(0);

  React.useEffect(() => {
    if (!onProgress) return;
    let alive = true;
    const t = setInterval(async () => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = await p.getCurrentTime?.();
        if (!durRef.current) {
          const d = await p.getDuration?.();
          if (d && d > 0) durRef.current = d;
        }
        if (alive && typeof cur === "number") onProgress(cur, durRef.current || 0);
      } catch { /* player not ready yet */ }
    }, 500);
    return () => { alive = false; clearInterval(t); };
  }, [onProgress]);

  return (
    <YoutubePlayer
      ref={playerRef}
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
      initialPlayerParams={{ modestbranding: true, rel: false, controls: false, iv_load_policy: 3, mute: true, start: startSeconds ? Math.floor(startSeconds) : undefined }}
    />
  );
}
