import React from "react";
import { View, Image, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Line, G } from "react-native-svg";
import { colors } from "@/src/theme";
import type { VirtualRider } from "@/src/lib/virtual-riders";

const WORDMARK = require("../../../assets/images/auth_wordmark.png");
const LOGO_GLYPH = require("../../../assets/images/auth_logo_glyph.png");

const AView = Animated.View;

export type SceneTelemetry = {
  power: number;
  cadence: number;
  speed: number;
  gradient: number;
  curve: number;
  moving: boolean;      // ride running (not paused/stopped)
  connected: boolean;   // any device / sim active
  reducedMotion: boolean;
};

/**
 * Layered 2.5D virtual route scene. The rider plate is the stable focal point;
 * the world is animated around/beneath it (speed streaks, scrolling road
 * markers, drifting particles, camera bob, bike lean, dynamic light & motion
 * blur) driven by smoothed telemetry via a rAF phase loop.
 */
export function VirtualRouteScene({ rider, telemetry }: { rider: VirtualRider; telemetry: SceneTelemetry }) {
  const tRef = React.useRef(telemetry);
  tRef.current = telemetry;

  // Animated outputs.
  const bobY = React.useRef(new Animated.Value(0)).current;
  const lean = React.useRef(new Animated.Value(0)).current;      // degrees
  const scale = React.useRef(new Animated.Value(1)).current;
  const streak = React.useRef(new Animated.Value(0)).current;    // 0..1 scroll phase
  const wheelDeg = React.useRef(new Animated.Value(0)).current;
  const blur = React.useRef(new Animated.Value(0)).current;      // 0..1 speed haze

  // Phase accumulators (persist across frames).
  const phase = React.useRef({ bob: 0, streak: 0, wheel: 0, leanS: 0, scaleS: 1, blurS: 0, last: 0 });

  React.useEffect(() => {
    let raf: number;
    const loop = (now: number) => {
      const p = phase.current;
      const dt = p.last ? Math.min(0.05, (now - p.last) / 1000) : 0;
      p.last = now;
      const t = tRef.current;
      const moving = t.moving && t.connected;

      // Cadence → pedal/bob frequency (bob at ~2× pedal stroke). Power → amplitude.
      const cadHz = moving ? (Math.max(0, t.cadence) / 60) : 0;
      const amp = t.reducedMotion ? 0 : (2 + Math.min(6, t.power / 60));
      p.bob += cadHz * 2 * Math.PI * 2 * dt;
      bobY.setValue(Math.sin(p.bob) * amp);

      // Speed → forward motion (streaks + wheel + road markers).
      const spd = moving ? Math.max(0, t.speed) : 0;
      p.streak = (p.streak + spd * 0.02 * dt) % 1;
      streak.setValue(p.streak);
      p.wheel = (p.wheel + spd * 26 * dt) % 360;
      wheelDeg.setValue(p.wheel);

      // Gradient/curve → lean & posture (smoothed).
      const targetLean = t.reducedMotion ? 0 : t.curve * 3.2;
      p.leanS += (targetLean - p.leanS) * Math.min(1, dt * 3);
      lean.setValue(p.leanS);

      // Power + gradient → subtle plate scale (effort surge / climbing lean-in).
      const targetScale = t.reducedMotion ? 1 : 1 + Math.min(0.05, t.power / 8000) + Math.max(0, t.gradient) / 400;
      p.scaleS += (targetScale - p.scaleS) * Math.min(1, dt * 2);
      scale.setValue(p.scaleS);

      // Speed → motion-blur haze.
      const targetBlur = t.reducedMotion ? 0 : Math.min(1, spd / 55);
      p.blurS += (targetBlur - p.blurS) * Math.min(1, dt * 2);
      blur.setValue(p.blurS);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bobY, lean, scale, streak, wheelDeg, blur]);

  const leanDeg = lean.interpolate({ inputRange: [-4, 4], outputRange: ["-4deg", "4deg"] });

  // Two scrolling road-edge streaks per side (offset by 0.5 phase) sliding toward
  // the camera to sell forward motion along the baked road.
  const edgeStreaks = (side: "left" | "right") =>
    [0, 0.5].map((off, i) => {
      const ty = streak.interpolate({
        inputRange: [0, 1],
        outputRange: [`${-40 + off * 100}%`, `${60 + off * 100}%`],
      });
      const tx = side === "left" ? -1 : 1;
      return (
        <AView
          key={`${side}-${i}`}
          pointerEvents="none"
          style={[
            st.edgeStreak,
            side === "left" ? st.edgeLeft : st.edgeRight,
            { transform: [{ translateY: ty as any }, { skewY: `${tx * 12}deg` }] },
          ]}
        />
      );
    });

  // Center dashed markers scrolling downward.
  const dashes = [0, 0.25, 0.5, 0.75].map((off, i) => {
    const ty = streak.interpolate({ inputRange: [0, 1], outputRange: [`${-10 + off * 120}%`, `${110 + off * 120}%`] });
    const sc = streak.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4] });
    return <AView key={`d-${i}`} pointerEvents="none" style={[st.dash, { transform: [{ translateY: ty as any }, { scale: sc as any }] }]} />;
  });

  return (
    <View style={st.wrap}>
      {/* Rider + world plate (camera bob / lean / effort scale). */}
      <AView style={[st.plateWrap, { transform: [{ translateY: bobY }, { rotate: leanDeg }, { scale }] }]}>
        <Image source={rider.image} style={st.plate} resizeMode="cover" />
      </AView>

      {/* Road-direction speed streaks + center markers (forward motion). */}
      <View style={st.roadLayer} pointerEvents="none">
        {edgeStreaks("left")}
        {edgeStreaks("right")}
        <View style={st.centerLane}>{dashes}</View>
      </View>

      {/* Speed haze / motion blur intensifying with speed. */}
      <AView pointerEvents="none" style={[st.blur, { opacity: blur.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }]} />

      {/* Cinematic vignette + dynamic bottom light. */}
      <View pointerEvents="none" style={st.vignette} />
      <View pointerEvents="none" style={st.floorGlow} />

      {/* Rotating drivetrain indicator (wheel/cadence) — subtle, bottom-centre. */}
      <View pointerEvents="none" style={st.wheelBadge}>
        <AView style={{ transform: [{ rotate: wheelDeg.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }] }}>
          <Svg width={40} height={40} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={17} stroke={colors.yellow} strokeWidth={2} fill="none" opacity={0.9} />
            <G opacity={0.8}>
              {[0, 45, 90, 135].map((a) => (
                <Line key={a} x1={20} y1={20} x2={20 + 15 * Math.cos((a * Math.PI) / 180)} y2={20 + 15 * Math.sin((a * Math.PI) / 180)} stroke={colors.yellow} strokeWidth={1.5} />
              ))}
              {[0, 45, 90, 135].map((a) => (
                <Line key={`b${a}`} x1={20} y1={20} x2={20 - 15 * Math.cos((a * Math.PI) / 180)} y2={20 - 15 * Math.sin((a * Math.PI) / 180)} stroke={colors.yellow} strokeWidth={1.5} />
              ))}
            </G>
            <Circle cx={20} cy={20} r={3} fill={colors.yellow} />
          </Svg>
        </AView>
      </View>

      {/* Brand lockup, upper-left (never baked into artwork). */}
      <View pointerEvents="none" style={st.brand}>
        <Image source={LOGO_GLYPH} style={st.brandGlyph} resizeMode="contain" />
        <Image source={WORDMARK} style={st.brandWord} resizeMode="contain" />
      </View>

      {!telemetry.connected && (
        <View pointerEvents="none" style={st.pausedBadge}>
          <Ionicons name="pause-circle" size={16} color={colors.white} />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden", backgroundColor: "#05060a" },
  plateWrap: { ...StyleSheet.absoluteFillObject },
  plate: { width: "100%", height: "100%" },
  roadLayer: { ...StyleSheet.absoluteFillObject },
  edgeStreak: { position: "absolute", width: 5, height: 90, borderRadius: 4, backgroundColor: "rgba(245,179,1,0.55)" },
  edgeLeft: { left: "26%", bottom: 0 },
  edgeRight: { right: "26%", bottom: 0 },
  centerLane: { position: "absolute", left: "49%", bottom: 0, width: 8, height: "60%", alignItems: "center" },
  dash: { position: "absolute", width: 6, height: 26, borderRadius: 3, backgroundColor: "rgba(244,240,233,0.5)" },
  blur: { ...StyleSheet.absoluteFillObject, backgroundColor: "#8Fb4ff" },
  vignette: Platform.select({
    web: { ...StyleSheet.absoluteFillObject, boxShadow: "inset 0 0 220px rgba(0,0,0,0.75)" } as any,
    default: { ...StyleSheet.absoluteFillObject, borderWidth: 60, borderColor: "rgba(0,0,0,0.35)" },
  }) as any,
  floorGlow: { position: "absolute", left: 0, right: 0, bottom: 0, height: 90, backgroundColor: "rgba(245,179,1,0.06)" },
  wheelBadge: { position: "absolute", bottom: 14, alignSelf: "center", opacity: 0.85 },
  brand: { position: "absolute", top: 14, left: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  brandGlyph: { width: 30, height: 30 },
  brandWord: { width: 128, height: 22 },
  pausedBadge: { position: "absolute", top: 14, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, padding: 4 },
});
