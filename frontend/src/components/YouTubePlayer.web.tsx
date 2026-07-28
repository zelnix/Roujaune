import React from "react";

export type YouTubePlayerProps = {
  videoId: string;
  height: number;
  width: number;
  playing: boolean;
  startSeconds?: number;
  onStateChange?: (playing: boolean) => void;
  onProgress?: (currentSec: number, durationSec: number) => void;
};

/** Web (React Native Web) YouTube player. Renders a real DOM <iframe> via
 *  React.createElement so the web bundle never pulls in the native WebView
 *  shim required by react-native-youtube-iframe.
 *
 *  Sharpness trick: YouTube selects playback quality from the player's *pixel*
 *  size. On high-DPI displays a CSS-sized player under-samples and looks soft,
 *  so we render the iframe at a large internal resolution (up to 4K) and scale
 *  it down to fit — YouTube then streams the highest-quality source available. */
export default function YouTubePlayer({ videoId, height, width, playing, startSeconds, onStateChange, onProgress }: YouTubePlayerProps) {
  const ref = React.useRef<HTMLIFrameElement | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const dpr = typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 1) : 1;

  // Supersample: internal render width targets at least QHD, capped at 4K.
  const renderW = Math.round(Math.min(3840, Math.max(width * dpr, 2560)));
  const renderH = Math.round(renderW * (height / width));
  const scale = width / renderW;

  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=1&controls=0&disablekb=1` +
    `&enablejsapi=1&vq=hd2160&hd=1&mute=1` +
    (startSeconds && startSeconds > 2 ? `&start=${Math.floor(startSeconds)}` : "") +
    (origin ? `&origin=${encodeURIComponent(origin)}` : "") +
    (playing ? "&autoplay=1" : "");

  const cmd = (func: string, args: any[] = []) => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  };

  const boostQuality = () => {
    cmd("mute");
    cmd("setPlaybackQuality", ["highres"]);
    cmd("setPlaybackQuality", ["hd2160"]);
  };

  const onLoad = () => {
    boostQuality();
    // Handshake so YouTube starts emitting periodic infoDelivery events
    // (currentTime/duration) back to us via postMessage.
    ref.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: videoId }), "*");
    if (playing) cmd("playVideo");
    onStateChange?.(playing);
    // Re-assert quality shortly after playback settles (YouTube can downshift).
    setTimeout(boostQuality, 1500);
    setTimeout(boostQuality, 4000);
  };

  // Parse YouTube's infoDelivery events for real currentTime + duration.
  React.useEffect(() => {
    if (!onProgress || typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      if (e.data.indexOf("infoDelivery") === -1) return;
      try {
        const msg = JSON.parse(e.data);
        const info = msg?.info;
        if (!info) return;
        const cur = typeof info.currentTime === "number" ? info.currentTime : undefined;
        const dur = typeof info.duration === "number" ? info.duration : undefined;
        if (cur !== undefined) onProgress(cur, dur ?? 0);
      } catch { /* ignore non-JSON frames */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onProgress]);

  React.useEffect(() => {
    cmd("mute");
    if (playing) { cmd("playVideo"); boostQuality(); }
    else cmd("pauseVideo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const iframe = React.createElement("iframe", {
    ref,
    src,
    width: renderW,
    height: renderH,
    title: "Scenic ride",
    frameBorder: 0,
    onLoad,
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
    allowFullScreen: true,
    style: {
      border: 0,
      display: "block",
      transform: `scale(${scale})`,
      transformOrigin: "top left",
    },
  });

  // Wrapper keeps the on-screen footprint exactly width×height while the iframe
  // renders large behind an overflow clip.
  return React.createElement(
    "div",
    { style: { width, height, overflow: "hidden", background: "#000" } },
    iframe
  );
}
