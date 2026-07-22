import React from "react";
import type { CorePlayerProps } from "./RouteVideoPlayer";

/** Web (React Native Web) YouTube player — real DOM <iframe> via the IFrame API,
 * controlled programmatically through postMessage so it stays in sync with the
 * workout state without opening a new tab. */
export default function RouteVideoPlayer({ videoId, playing, muted, onReady, onError, onEnded }: CorePlayerProps) {
  const ref = React.useRef<HTMLIFrameElement | null>(null);

  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?enablejsapi=1&controls=1&modestbranding=1&rel=0&playsinline=1&fs=1` +
    `&mute=${muted ? 1 : 0}&autoplay=1&loop=1&playlist=${videoId}` +
    (origin ? `&origin=${origin}&widget_referrer=${origin}` : "");

  const post = React.useCallback((func: string) => {
    try {
      ref.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "*",
      );
    } catch {
      /* noop */
    }
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => (playing ? post("playVideo") : post("pauseVideo")), 120);
    return () => clearTimeout(t);
  }, [playing, post]);

  React.useEffect(() => {
    post(muted ? "mute" : "unMute");
  }, [muted, post]);

  // Listen for player state changes (ended) via the IFrame API postMessage bus.
  React.useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try {
        const d = JSON.parse(e.data);
        if (d?.event === "onStateChange" && d?.info === 0) onEnded?.();
      } catch {
        /* ignore non-JSON frames */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onEnded]);

  return React.createElement("iframe", {
    ref,
    src,
    width: "100%",
    height: "100%",
    frameBorder: "0",
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope",
    allowFullScreen: true,
    title: "First-person cycling route video",
    onLoad: onReady,
    onError,
    style: { border: 0, display: "block" },
  });
}
