import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Circle, Polyline, Rect, Circle as SvgCircle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, shadow } from "../theme";

/* ---------------- pressable with hover-lift + press scale ---------------- */
export function Touchable({
  children,
  onPress,
  style,
  containerStyle,
  testID,
  scaleTo = 0.97,
  lift = true,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  scaleTo?: number;
  lift?: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const anim = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Pressable
      testID={testID}
      style={containerStyle}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        onPress?.();
      }}
      onPressIn={() => anim(scaleTo)}
      onPressOut={() => anim(1)}
      onHoverIn={() => lift && anim(1.02)}
      onHoverOut={() => lift && anim(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ---------------- card surfaces ---------------- */
export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function GlassCard({
  children,
  style,
  intensity = 30,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  testID?: string;
}) {
  return (
    <BlurView tint="dark" intensity={intensity} testID={testID} style={[styles.glass, style]}>
      {children}
    </BlurView>
  );
}

export function SectionLabel({ children, color = colors.textDim }: { children: string; color?: string }) {
  return <Text style={[styles.sectionLabel, { color }]}>{children}</Text>;
}

/* ---------------- buttons ---------------- */
export function PrimaryButton({
  label,
  onPress,
  icon = "play",
  testID,
  style,
}: {
  label: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable testID={testID} onPress={onPress} style={[shadow.glow, style]}>
      <LinearGradient
        colors={[colors.red, "#E8631C", colors.yellow]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.primaryBtn}
      >
        <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.primaryBtnText}>{label}</Text>
      </LinearGradient>
    </Touchable>
  );
}

export function YellowButton({
  label,
  onPress,
  testID,
  style,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable testID={testID} onPress={onPress} style={style}>
      <View style={styles.yellowBtn}>
        <Text style={styles.yellowBtnText}>{label}</Text>
        <Ionicons name="arrow-forward" size={15} color="#1a1300" style={{ marginLeft: 6 }} />
      </View>
    </Touchable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  testID,
  tone = "outline",
  style,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
  tone?: "outline" | "red";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Touchable testID={testID} onPress={onPress} style={style}>
      <View
        style={[
          styles.secondaryBtn,
          tone === "red"
            ? { backgroundColor: "rgba(224,30,43,0.16)", borderColor: "rgba(224,30,43,0.5)" }
            : { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.border },
        ]}
      >
        <Text style={styles.secondaryBtnText}>{label}</Text>
      </View>
    </Touchable>
  );
}

/* ---------------- circular progress ring ---------------- */
export function CircularProgress({
  size = 58,
  stroke = 6,
  progress,
  color = colors.yellow,
  track = "rgba(255,255,255,0.12)",
}: {
  size?: number;
  stroke?: number;
  progress: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress / 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ color: colors.white, fontWeight: "800", fontSize: size * 0.26 }}>{progress}%</Text>
    </View>
  );
}

/* ---------------- climb bar graph ---------------- */
export function ClimbBars({ data, color = colors.red, width = 88, height = 46 }: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const gap = 2;
  const bw = (width - gap * (data.length - 1)) / data.length;
  return (
    <Svg width={width} height={height}>
      {data.map((v, i) => {
        const h = Math.max(3, v * height);
        return (
          <Rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={color}
            opacity={0.5 + v * 0.5}
          />
        );
      })}
    </Svg>
  );
}

/* ---------------- line chart ---------------- */
export function LineChart({ data, color = colors.red, width = 220, height = 70 }: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const pad = 6;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * stepX, height - pad - v * (height - pad * 2)]);
  const polyline = pts.map((p) => p.join(",")).join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <SvgCircle key={i} cx={p[0]} cy={p[1]} r={2.6} fill={color} />
      ))}
    </Svg>
  );
}

/* ---------------- readiness scale bars ---------------- */
export function ReadinessScale() {
  const bars = [
    colors.red,
    colors.red,
    "#E8631C",
    colors.yellow,
    colors.yellow,
    colors.green,
    colors.green,
    colors.green,
  ];
  return (
    <View style={styles.readinessRow}>
      {bars.map((c, i) => (
        <View key={i} style={{ alignItems: "center", justifyContent: "flex-end", height: 30 }}>
          {i === 6 && <View style={styles.readinessMarker} />}
          <View style={{ width: 5, height: 10 + i * 2.4, borderRadius: 2, backgroundColor: c }} />
        </View>
      ))}
    </View>
  );
}

/* ---------------- activity dots ---------------- */
export function ActivityDots({ dots }: { dots: string[] }) {
  const map: Record<string, string> = { red: colors.red, yellow: colors.yellow, green: colors.green, white: "#fff" };
  return (
    <View style={styles.dotsRow}>
      {dots.map((d, i) => (
        <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: map[d] }} />
      ))}
    </View>
  );
}

/* ---------------- glass status pill ---------------- */
export function GlassPill({ children, style, testID, onPress }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onPress?: () => void;
}) {
  return (
    <Touchable testID={testID} onPress={onPress} scaleTo={0.9}>
      <BlurView tint="dark" intensity={40} style={[styles.pill, style]}>
        {children}
      </BlurView>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.card,
  },
  glass: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,10,0.35)",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.2 },
  yellowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.yellow,
  },
  yellowBtnText: { color: "#1a1300", fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  secondaryBtnText: { color: colors.white, fontWeight: "700", fontSize: 13.5 },
  readinessRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  readinessMarker: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginBottom: 3,
  },
  dotsRow: { flexDirection: "row", gap: 3, marginTop: 3, height: 4, justifyContent: "center" },
  pill: {
    height: 40,
    minWidth: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 10,
    overflow: "hidden",
  },
});
