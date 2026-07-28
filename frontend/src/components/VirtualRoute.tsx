import React from "react";
import { View, StyleSheet, Animated, Easing, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Svg, { Polygon, Ellipse, Path } from "react-native-svg";
import { colors } from "../theme";
import { useReducedMotionSafe } from "../lib/use-reduced-motion";

// Rear-view rider cutouts. A female asset drops in here when available.
const RIDER_MALE = require("../../assets/images/rider_male_rear_cut.png");
const RIDER_FEMALE = (() => {
  try {
    return require("../../assets/images/rider_female_rear_cut.png");
  } catch {
    return RIDER_MALE;
  }
})();

const DASHES = 7;
const POSTS = 5;

/**
 * A calm, non-video "virtual route": a parallax road that scrolls toward the
 * rider at their real speed, with a rear-view rider (matching their gender)
 * whose cadence drives a subtle pedalling bob. Runs anywhere (no YouTube).
 */
export function VirtualRoute({ width, height, speed = 26, cadence = 88, gender = "male", paused = false }: { width: number; height: number; speed?: number; cadence?: number; gender?: string; paused?: boolean }) {
  const scroll = React.useRef(new Animated.Value(0)).current;
  const bob = React.useRef(new Animated.Value(0)).current;
  const loopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const bobRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const reduceMotion = useReducedMotionSafe();

  const cx = width / 2;
  const horizonY = height * 0.42;
  const roadTopHalf = Math.max(14, width * 0.02);
  const roadBotHalf = width * 0.46;

  // Road scroll speed scales with the rider's speed (paused → frozen).
  React.useEffect(() => {
    loopRef.current?.stop();
    if (paused || reduceMotion) { scroll.setValue(0); return; }
    const kmh = Math.max(6, Math.min(60, speed));
    const dur = 2600 - (kmh / 60) * 1700; // faster speed → shorter loop
    scroll.setValue(0);
    loopRef.current = Animated.loop(
      Animated.timing(scroll, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [speed, paused, scroll, reduceMotion]);

  // Pedalling bob scales with cadence.
  React.useEffect(() => {
    bobRef.current?.stop();
    if (paused || reduceMotion) { bob.setValue(0); return; }
    const rpm = Math.max(50, Math.min(120, cadence));
    const half = (60000 / rpm) / 2; // one bob per pedal stroke
    bobRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bobRef.current.start();
    return () => bobRef.current?.stop();
  }, [cadence, paused, bob, reduceMotion]);

  // Perspective mapping p(0=horizon,1=foreground) → screen y, scale, spread.
  const yFor = (p: number) => horizonY + (height - horizonY) * (p * p);
  const roadHalfFor = (p: number) => roadTopHalf + (roadBotHalf - roadTopHalf) * (p * p);

  const riderH = height * 0.62;
  const riderW = riderH * 0.31;
  const riderImg = gender === "female" ? RIDER_FEMALE : RIDER_MALE;

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(3, height * 0.012)] });
  const sway = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-2, 2, -2] });

  return (
    <View style={[styles.wrap, { width, height }]} testID="virtual-route">
      {/* sky */}
      <LinearGradient colors={["#0A0C12", "#1A1526", "#3A2230", "#5A3326"]} locations={[0, 0.42, 0.62, 0.78]} style={StyleSheet.absoluteFill} />
      {/* sun glow + hills */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Ellipse cx={cx} cy={horizonY + 4} rx={width * 0.22} ry={height * 0.09} fill="#C9642E" opacity={0.45} />
        <Path d={`M0 ${horizonY} Q ${width * 0.25} ${horizonY - height * 0.12} ${width * 0.5} ${horizonY - height * 0.03} T ${width} ${horizonY} V ${height} H 0 Z`} fill="#0C0E15" opacity={0.9} />
        <Path d={`M0 ${horizonY + 6} Q ${width * 0.35} ${horizonY - height * 0.05} ${width * 0.7} ${horizonY + 8} T ${width} ${horizonY + 4} V ${height} H 0 Z`} fill="#070810" />
        {/* road */}
        <Polygon
          points={`${cx - roadTopHalf},${horizonY} ${cx + roadTopHalf},${horizonY} ${cx + roadBotHalf},${height} ${cx - roadBotHalf},${height}`}
          fill="#17181F"
        />
        <Polygon points={`${cx - roadTopHalf},${horizonY} ${cx - roadTopHalf - 3},${horizonY} ${cx - roadBotHalf - 10},${height} ${cx - roadBotHalf},${height}`} fill="#2A2D38" />
        <Polygon points={`${cx + roadTopHalf},${horizonY} ${cx + roadTopHalf + 3},${horizonY} ${cx + roadBotHalf + 10},${height} ${cx + roadBotHalf},${height}`} fill="#2A2D38" />
      </Svg>

      {/* moving centre-line dashes */}
      {Array.from({ length: DASHES }).map((_, i) => {
        const phase = i / DASHES;
        const p = Animated.modulo(Animated.add(scroll, phase), 1);
        const translateY = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [yFor(0), yFor(0.5), yFor(1)] });
        const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1.5] });
        const opacity = p.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.9, 0.9] });
        return (
          <Animated.View key={`d${i}`} style={[styles.dash, { left: cx - 4, opacity, transform: [{ translateY }, { scale }] }]} />
        );
      })}

      {/* roadside markers for depth */}
      {Array.from({ length: POSTS }).map((_, i) => {
        const phase = i / POSTS;
        const p = Animated.modulo(Animated.add(scroll, phase), 1);
        const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1.4] });
        const opacity = p.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.8, 0.8] });
        const yL = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [yFor(0), yFor(0.5), yFor(1)] });
        const xL = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [cx - roadHalfFor(0) - 6, cx - roadHalfFor(0.5) - 10, cx - roadHalfFor(1) - 16] });
        const xR = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [cx + roadHalfFor(0) + 6, cx + roadHalfFor(0.5) + 10, cx + roadHalfFor(1) + 16] });
        return (
          <React.Fragment key={`p${i}`}>
            <Animated.View style={[styles.post, { top: 0, left: 0, opacity, transform: [{ translateX: xL }, { translateY: yL }, { scale }] }]} />
            <Animated.View style={[styles.post, { top: 0, left: 0, opacity, transform: [{ translateX: xR }, { translateY: yL }, { scale }] }]} />
          </React.Fragment>
        );
      })}

      {/* rider (from the rear) */}
      <Animated.View style={[styles.rider, { left: cx - riderW / 2, bottom: -height * 0.02, transform: [{ translateY: bobY }, { translateX: sway }], pointerEvents: "none" }]}>
        <Image source={riderImg} style={{ width: riderW, height: riderH }} contentFit="contain" />
      </Animated.View>

      <View style={[styles.badge, { pointerEvents: "none" }]}>
        <Text style={styles.badgeText}>VIRTUAL ROUTE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#0A0C12", borderRadius: 16 },
  dash: { position: "absolute", top: 0, width: 8, height: 26, borderRadius: 3, backgroundColor: colors.yellow },
  post: { position: "absolute", width: 6, height: 34, borderRadius: 2, backgroundColor: "#3A3E4A" },
  rider: { position: "absolute" },
  badge: { position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  badgeText: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
