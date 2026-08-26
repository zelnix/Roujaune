import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop, Line } from "react-native-svg";
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, withTiming, withDelay, withSpring, Easing,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RouteMapPoint = { at_pct: number; title: string; photo?: string | null };

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A decorative, self-drawing "route map": a stylised trail with a moving rider
 *  dot and photo bubbles that pop up at each saved discovery. Not real GPS. */
export function RideRouteMap({ width, height, seed, points }: {
  width: number; height: number; seed: string; points: RouteMapPoint[];
}) {
  const N = 64;
  const padX = 26, padTop = 30, padBottom = 34;
  const w = width - padX * 2;
  const h = height - padTop - padBottom;
  const midY = padTop + h / 2;

  // Deterministic gentle trail across the panel.
  const { xs, ys, d, length } = React.useMemo(() => {
    const r = hash(seed);
    const p1 = ((r & 0xff) / 255) * Math.PI * 2;
    const p2 = (((r >> 8) & 0xff) / 255) * Math.PI * 2;
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = padX + t * w;
      const y = midY
        + Math.sin(t * Math.PI * 2.1 + p1) * (h * 0.30)
        + Math.sin(t * Math.PI * 4.3 + p2) * (h * 0.12);
      xs.push(x); ys.push(Math.max(padTop, Math.min(padTop + h, y)));
    }
    let d = `M ${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    let length = 0;
    for (let i = 1; i < N; i++) {
      d += ` L ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
      length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    return { xs, ys, d, length };
  }, [width, height, seed]);

  const draw = useSharedValue(0);
  React.useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) });
  }, [d]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));
  const riderProps = useAnimatedProps(() => {
    "worklet";
    const i = draw.value * (xs.length - 1);
    const lo = Math.floor(i);
    const hi = Math.min(xs.length - 1, lo + 1);
    const f = i - lo;
    return { cx: xs[lo] + (xs[hi] - xs[lo]) * f, cy: ys[lo] + (ys[hi] - ys[lo]) * f };
  });

  const pt = (p: number) => {
    const i = Math.max(0, Math.min(N - 1, Math.round(p * (N - 1))));
    return { x: xs[i], y: ys[i] };
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="terrain" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#12201B" stopOpacity={1} />
            <Stop offset="1" stopColor="#0A100E" stopOpacity={1} />
          </SvgGradient>
        </Defs>
        <Path d={`M0,0 H${width} V${height} H0 Z`} fill="url(#terrain)" />
        {/* faint contour grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <Line key={`h${g}`} x1={0} y1={height * g} x2={width} y2={height * g} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        {/* full trail (faint) */}
        <Path d={d} stroke="rgba(255,194,10,0.22)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 7" />
        {/* animated drawn trail */}
        <AnimatedPath d={d} stroke={colors.yellow} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={length} animatedProps={lineProps} />
        {/* start flag */}
        <Circle cx={xs[0]} cy={ys[0]} r={5} fill="#0A100E" stroke={colors.yellow} strokeWidth={2} />
        {/* moving rider dot */}
        <AnimatedCircle r={6.5} fill={colors.yellow} stroke="#0A100E" strokeWidth={2} animatedProps={riderProps} />
      </Svg>

      {/* Discovery photo bubbles that pop up along the trail */}
      {points.map((pin, idx) => {
        const { x, y } = pt(pin.at_pct);
        return (
          <DiscoveryBubble key={`${pin.title}-${idx}`} x={x} y={y} delay={400 + pin.at_pct * 1600} photo={pin.photo} title={pin.title} />
        );
      })}
    </View>
  );
}

function DiscoveryBubble({ x, y, delay, photo, title }: { x: number; y: number; delay: number; photo?: string | null; title: string }) {
  const v = useSharedValue(0);
  React.useEffect(() => {
    v.value = 0;
    v.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 150 }));
  }, [delay]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.4 + 0.6 * v.value }] }));
  const S = 46;
  return (
    <Animated.View style={[st.bubble, { left: x - S / 2, top: y - S - 6, width: S, pointerEvents: "none" }, style]}>
      <View style={[st.bubbleImgWrap, { width: S, height: S, borderRadius: S / 2 }]}>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View style={st.bubbleFallback}><Ionicons name="location" size={16} color={colors.yellow} /></View>
        )}
      </View>
      <View style={st.bubbleTail} />
      <Text style={st.bubbleLabel} numberOfLines={1}>{title}</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  bubble: { position: "absolute", alignItems: "center" },
  bubbleImgWrap: { overflow: "hidden", borderWidth: 2, borderColor: colors.yellow, backgroundColor: "#0E1512" },
  bubbleFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleTail: { width: 2, height: 6, backgroundColor: colors.yellow },
  bubbleLabel: { color: colors.white, fontSize: 9, fontWeight: "700", maxWidth: 78, textAlign: "center", marginTop: 1, backgroundColor: "rgba(8,10,10,0.7)", borderRadius: 4, paddingHorizontal: 3, overflow: "hidden" },
});
