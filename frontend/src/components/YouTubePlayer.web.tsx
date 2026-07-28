import React from "react";

export type YouTubePlayerProps = {
  videoId: string;
  height: number;
  width: number;
  playing: boolean;
  onStateChange?: (playing: boolean) => void;
};

/** Web (React Native Web) YouTube player. Renders a real DOM <iframe> via
 *  React.createElement so the web bundle never pulls in the native WebView
 *  shim required by react-native-youtube-iframe. */
export default function YouTubePlayer({ videoId, height, width, playing }: YouTubePlayerProps) {
  const src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1${playing ? "&autoplay=1" : ""}`;
  return React.createElement("iframe", {
    src,
    width,
    height,
    title: "Scenic ride",
    frameBorder: 0,
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
    allowFullScreen: true,
    style: { border: 0, display: "block" },
  });
}
