import React from "react";
import Svg, { G, Path, Line, Circle, Ellipse, Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, { useAnimatedProps } from "react-native-reanimated";
import { AvatarConfig, Appearance, AvatarInputs } from "./avatarConfigs";
import { useAvatarAnimation, AvatarMotion } from "./useAvatarAnimation";

const AG = Animated.createAnimatedComponent(G);
const AL = Animated.createAnimatedComponent(Line);

// ---- rig geometry (viewBox 0 0 220 240), bike facing right ----
const HIP = { x: 100, y: 98 };
const BB = { x: 108, y: 154 };   // bottom bracket (crank centre)
const CRANK_R = 15;
const L1 = 45;                   // thigh
const L2 = 47;                   // shin
const SHO = { x: 93, y: 58 };    // shoulder
const HB = { x: 160, y: 110 };   // handlebar
const HEAD = { x: 89, y: 43 };
const RW = { x: 48, y: 184 };    // rear wheel centre
const FW = { x: 180, y: 184 };   // front wheel centre
const WHEEL_R = 33;
const KNEE_SIGN = -1;

// 2-bone IK: knee position for a hip + pedal target.
function legPoints(theta: number) {
  "worklet";
  const px = BB.x + CRANK_R * Math.cos(theta);
  const py = BB.y + CRANK_R * Math.sin(theta);
  let dx = px - HIP.x;
  let dy = py - HIP.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  const dmin = Math.abs(L1 - L2) + 2;
  const dmax = L1 + L2 - 2;
  d = Math.max(dmin, Math.min(dmax, d));
  const base = Math.atan2(dy, dx);
  let cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  cosA = Math.max(-1, Math.min(1, cosA));
  const a = Math.acos(cosA);
  const ka = base + KNEE_SIGN * a;
  const kx = HIP.x + L1 * Math.cos(ka);
  const ky = HIP.y + L1 * Math.sin(ka);
  return { px, py, kx, ky };
}

/** One animated leg (thigh + shin + shoe + crank arm). */
function Leg({ motion, phase, skin, shoe, bike, back }: {
  motion: AvatarMotion; phase: number; skin: string; shoe: string; bike: string; back?: boolean;
}) {
  const thigh = useAnimatedProps(() => {
    const p = legPoints(motion.crank.value + phase);
    return { x1: HIP.x, y1: HIP.y, x2: p.kx, y2: p.ky };
  });
  const shin = useAnimatedProps(() => {
    const p = legPoints(motion.crank.value + phase);
    return { x1: p.kx, y1: p.ky, x2: p.px, y2: p.py };
  });
  const crankArm = useAnimatedProps(() => {
    const p = legPoints(motion.crank.value + phase);
    return { x1: BB.x, y1: BB.y, x2: p.px, y2: p.py };
  });
  const shoeP = useAnimatedProps(() => {
    const p = legPoints(motion.crank.value + phase);
    return { x1: p.px - 9, y1: p.py + 2, x2: p.px + 8, y2: p.py + 2 };
  });
  const kneeP = useAnimatedProps(() => {
    const p = legPoints(motion.crank.value + phase);
    return { cx: p.kx, cy: p.ky } as { cx: number; cy: number };
  });
  const AC = Animated.createAnimatedComponent(Circle);
  const op = back ? 0.82 : 1;
  const w = back ? 11 : 13;
  return (
    <G opacity={op}>
      <AL animatedProps={crankArm} stroke={bike} strokeWidth={3} strokeLinecap="round" />
      <AL animatedProps={thigh} stroke={skin} strokeWidth={w} strokeLinecap="round" />
      <AL animatedProps={shin} stroke={skin} strokeWidth={w - 3} strokeLinecap="round" />
      <AC animatedProps={kneeP} r={(w - 3) / 2} fill={skin} />
      <AL animatedProps={shoeP} stroke={shoe} strokeWidth={7} strokeLinecap="round" />
    </G>
  );
}

/** The full rider rig. Identity is fixed; appearance/glasses are live props. */
export function CyclistAvatar({ config, appearance, inputs, size = 200 }: {
  config: AvatarConfig; appearance?: Partial<Appearance>; inputs: AvatarInputs; size?: number;
}) {
  const a: Appearance = { ...config.defaults, ...appearance };
  const id = config.identity;
  const motion = useAvatarAnimation(inputs);
  const gid = React.useId().replace(/:/g, "");

  // Root bob + sway (standing out-of-saddle motion).
  const rootProps = useAnimatedProps(() => {
    const bob = Math.sin(motion.crank.value * 2) * motion.stand.value * 3;
    const sway = Math.sin(motion.crank.value) * motion.stand.value * 3.2;
    return { transform: `translate(0 ${bob}) rotate(${sway} ${HIP.x} ${HIP.y})` };
  });
  // Torso forward lean about the hip.
  const torsoProps = useAnimatedProps(() => ({ transform: `rotate(${motion.lean.value} ${HIP.x} ${HIP.y})` }));
  const wheelFront = useAnimatedProps(() => ({ transform: `rotate(${(motion.wheel.value * 180) / Math.PI} ${FW.x} ${FW.y})` }));
  const wheelRear = useAnimatedProps(() => ({ transform: `rotate(${(motion.wheel.value * 180) / Math.PI} ${RW.x} ${RW.y})` }));

  // Elbow between shoulder and handlebar.
  const elbow = { x: 128, y: 94 };
  const braid = id.hairStyle === "braid";

  const glassesEl = renderGlasses(a);

  return (
    <Svg width={size} height={size * (240 / 220)} viewBox="0 0 220 240">
      <Defs>
        <LinearGradient id={`jersey-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={a.jerseyTop} />
          <Stop offset="1" stopColor={a.jerseyBottom} />
        </LinearGradient>
      </Defs>

      <AG animatedProps={rootProps}>
        {/* ---------- bike ---------- */}
        <G>
          {/* frame */}
          <Path d={`M${RW.x} ${RW.y} L${BB.x} ${BB.y} L${HIP.x - 2} ${HIP.y + 6} M${BB.x} ${BB.y} L${HB.x - 6} ${HB.y - 2} L${FW.x} ${FW.y} M${HIP.x - 2} ${HIP.y + 6} L${HB.x - 6} ${HB.y - 2}`}
            stroke={a.bike} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {/* saddle + bar */}
          <Line x1={HIP.x - 12} y1={HIP.y + 4} x2={HIP.x + 8} y2={HIP.y + 6} stroke={a.bike} strokeWidth={5} strokeLinecap="round" />
          <Path d={`M${HB.x - 10} ${HB.y - 4} q10 -2 14 8`} stroke={a.bike} strokeWidth={4} fill="none" strokeLinecap="round" />
          {/* wheels */}
          <AG animatedProps={wheelRear}>
            <Circle cx={RW.x} cy={RW.y} r={WHEEL_R} stroke={a.bike} strokeWidth={4} fill="none" />
            {spokes(RW.x, RW.y, WHEEL_R)}
          </AG>
          <AG animatedProps={wheelFront}>
            <Circle cx={FW.x} cy={FW.y} r={WHEEL_R} stroke={a.bike} strokeWidth={4} fill="none" />
            {spokes(FW.x, FW.y, WHEEL_R)}
          </AG>
        </G>

        {/* far leg (behind) */}
        <Leg motion={motion} phase={Math.PI} skin={id.skinShade} shoe={darken(a.shoes)} bike={a.bike} back />

        {/* ---------- upper body (leans about hip) ---------- */}
        <AG animatedProps={torsoProps}>
          {/* bib shorts / seat */}
          <Ellipse cx={HIP.x} cy={HIP.y - 2} rx={16} ry={13} fill={a.bib} />
          {/* torso jersey (gradient) */}
          <Line x1={HIP.x} y1={HIP.y - 6} x2={SHO.x} y2={SHO.y} stroke={`url(#jersey-${gid})`} strokeWidth={27} strokeLinecap="round" />
          {/* upper arm (jersey sleeve) + forearm (skin) */}
          <Line x1={SHO.x + 1} y1={SHO.y + 1} x2={elbow.x} y2={elbow.y} stroke={a.jerseyTop} strokeWidth={12} strokeLinecap="round" />
          <Line x1={elbow.x} y1={elbow.y} x2={HB.x} y2={HB.y} stroke={id.skin} strokeWidth={9} strokeLinecap="round" />
          <Circle cx={HB.x} cy={HB.y} r={5} fill={id.skin} />
          {/* neck + head */}
          <Line x1={SHO.x} y1={SHO.y} x2={HEAD.x + 3} y2={HEAD.y + 9} stroke={id.skin} strokeWidth={9} strokeLinecap="round" />
          {braid && <Path d={`M${HEAD.x + 8} ${HEAD.y + 2} q10 8 6 26`} stroke={id.hair} strokeWidth={6} fill="none" strokeLinecap="round" />}
          <Circle cx={HEAD.x} cy={HEAD.y} r={13} fill={id.skin} />
          {/* hair back + beard */}
          <Path d={`M${HEAD.x + 10} ${HEAD.y - 4} q4 8 -2 15`} stroke={id.hair} strokeWidth={5} fill="none" strokeLinecap="round" />
          {id.beard && <Path d={`M${HEAD.x - 9} ${HEAD.y + 4} q9 12 17 -1`} stroke={id.hair} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9} />}
          {/* nose hint */}
          <Path d={`M${HEAD.x - 12} ${HEAD.y + 2} q-3 2 0 5`} stroke={id.skinShade} strokeWidth={2} fill="none" strokeLinecap="round" />
          {/* helmet */}
          <Path d={`M${HEAD.x - 14} ${HEAD.y - 2} q14 -22 30 -2 q-2 -6 -8 -8 q-10 -3 -16 3 q-5 3 -6 7 z`} fill={a.helmet} />
          <Path d={`M${HEAD.x - 14} ${HEAD.y - 2} q14 -22 30 -2`} stroke={darken(a.helmet)} strokeWidth={1.5} fill="none" />
          {/* glasses */}
          <G transform={`translate(${HEAD.x - 12} ${HEAD.y})`}>{glassesEl}</G>
        </AG>

        {/* near leg (front) */}
        <Leg motion={motion} phase={0} skin={id.skin} shoe={a.shoes} bike={a.bike} />
      </AG>
    </Svg>
  );
}

function spokes(cx: number, cy: number, r: number) {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI;
    lines.push(
      <Line key={i} x1={cx - r * Math.cos(ang)} y1={cy - r * Math.sin(ang)} x2={cx + r * Math.cos(ang)} y2={cy + r * Math.sin(ang)} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
    );
  }
  return <G>{lines}</G>;
}

function renderGlasses(a: Appearance) {
  if (a.glasses === "none") return null;
  const tint = a.glasses === "clear" ? "rgba(220,235,255,0.35)" : a.glassesTint;
  const wide = a.glasses === "wraparound";
  return (
    <G>
      <Path d={`M-2 -2 q${wide ? 12 : 9} -3 ${wide ? 16 : 13} 4 q-2 4 -8 4 q-8 0 -8 -8 z`} fill={tint} stroke={a.glassesFrame} strokeWidth={1.4} />
      <Rect x={-3} y={-3} width={4} height={3} fill={a.glassesFrame} />
    </G>
  );
}

// small colour helpers
function darken(hex: string, amt = 0.72) {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const n = parseInt(c, 16);
  const r = Math.round(((n >> 16) & 255) * amt);
  const g = Math.round(((n >> 8) & 255) * amt);
  const b = Math.round((n & 255) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
