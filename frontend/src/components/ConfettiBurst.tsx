import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { colors } from "@/src/theme";

const PALETTE = [colors.yellow, "#FFFFFF", colors.red, "#5AC8A8", "#FFD98A"];

type Piece = {
  startX: number; driftX: number; fall: number; wobble: number;
  size: number; spins: number; delay: number; duration: number; color: string; round: boolean;
};

function buildPieces(count: number, width: number, height: number): Piece[] {
  const arr: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random;
    arr.push({
      startX: width * (0.28 + r() * 0.44),          // burst from the upper-centre
      driftX: (r() - 0.5) * width * 0.9,
      fall: height * (0.72 + r() * 0.3),
      wobble: (r() - 0.5) * 40,
      size: 6 + r() * 6,
      spins: 1 + r() * 3,
      delay: r() * 320,
      duration: 1500 + r() * 900,
      color: PALETTE[Math.floor(r() * PALETTE.length)],
      round: r() > 0.5,
    });
  }
  return arr;
}

/** A one-shot celebratory confetti burst. Non-interactive; sized to its parent. */
export function ConfettiBurst({ width, height, count = 32, originY = 40 }: {
  width: number; height: number; count?: number; originY?: number;
}) {
  const pieces = React.useMemo(() => buildPieces(count, width, height), [count, width, height]);
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", pointerEvents: "none" }]}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} p={p} originY={originY} />
      ))}
    </View>
  );
}

function ConfettiPiece({ p, originY }: { p: Piece; originY: number }) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    t.value = withDelay(p.delay, withTiming(1, { duration: p.duration, easing: Easing.out(Easing.quad) }));
  }, []);
  const style = useAnimatedStyle(() => {
    const y = t.value * p.fall;
    const x = p.driftX * t.value + Math.sin(t.value * Math.PI * 3) * p.wobble;
    const opacity = t.value < 0.8 ? 1 : Math.max(0, 1 - (t.value - 0.8) / 0.2);
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p.spins * 360 * t.value}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: "absolute", left: p.startX, top: originY, width: p.size, height: p.size * (p.round ? 1 : 1.6), backgroundColor: p.color, borderRadius: p.round ? p.size : 2 },
        style,
      ]}
    />
  );
}
