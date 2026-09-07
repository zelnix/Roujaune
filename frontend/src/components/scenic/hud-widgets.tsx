import React from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Circle } from "react-native-svg";
import { colors, radius } from "@/src/theme";

export const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" }) as string;

export const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

/** Warm red→gold gradient text (matches the ROUJAUNE brand ramp). */
export function GradientText({ text, style }: { text: string; style: any }) {
  if (Platform.OS === "web") {
    return (
      <Text
        style={[style, {
          backgroundImage: "linear-gradient(95deg, #F2392E 0%, #F5B301 58%, #FFC418 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        } as any]}
      >
        {text}
      </Text>
    );
  }
  return (
    <MaskedView maskElement={<Text style={[style, { color: "#000" }]}>{text}</Text>}>
      <LinearGradient colors={["#F2392E", "#F5B301", "#FFC418"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }}>
        <Text style={[style, { opacity: 0 }]}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/** Yellow progress ring. */
export function Ring({ pct }: { pct: number }) {
  const size = 54, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.yellow} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** Audio waveform — animates only while companion narration is playing. */
export function Waveform({ active }: { active?: boolean }) {
  const bars = [6, 12, 20, 10, 16, 24, 14, 8, 18, 12, 22, 9, 15, 20, 7, 13];
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!active) { anim.stopAnimation(); anim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 420, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);
  return (
    <View style={s.wave}>
      {bars.map((h, i) => {
        const min = active ? Math.max(3, h * 0.4) : h;
        const scaled = anim.interpolate({ inputRange: [0, 1], outputRange: [min, active ? h * (0.7 + (i % 5) * 0.12) : h] });
        return <Animated.View key={i} style={[s.waveBar, { height: scaled as any, opacity: active ? 1 : 0.7 }]} />;
      })}
    </View>
  );
}

export function Metric({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={s.metric}>
      <View style={s.metricIcon}><Ionicons name={icon} size={15} color={colors.yellow} /></View>
      <View>
        <Text style={s.metricValue}>{value}</Text>
        <Text style={s.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function Seg({ icon, label, active, onPress }: { icon: any; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.seg, active && s.segActive]} accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={active ? "#fff" : colors.textDim} />
      <Text style={[s.segText, active && s.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function NavItem({ icon, label, active, onPress }: { icon: any; label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.navItem} accessibilityRole="button" accessibilityLabel={label} disabled={active}>
      <Ionicons name={icon} size={19} color={active ? colors.red : colors.textDim} />
      <Text style={[s.navLabel, active && { color: colors.red, fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

export function MusicControl({ on, level, onToggle, onLevel }: { on: boolean; level: number; onToggle: () => void; onLevel: (l: number) => void }) {
  return (
    <View style={s.music} testID="music-control">
      <Pressable onPress={onToggle} hitSlop={8} style={s.musicBtn} testID="music-toggle" accessibilityRole="button" accessibilityLabel={on ? "Turn music off" : "Turn music on"}>
        <Ionicons name={on ? "musical-notes" : "volume-mute"} size={16} color={on ? colors.yellow : colors.textDim} />
      </Pressable>
      <View style={s.musicBars}>
        {[1, 2, 3, 4].map((i) => (
          <Pressable key={i} onPress={() => onLevel(i)} hitSlop={6} testID={`music-level-${i}`} accessibilityRole="button" accessibilityLabel={`Music volume ${i}`}
            style={[s.musicBar, { height: 6 + i * 4 }, on && i <= level ? s.musicBarOn : null]} />
        ))}
      </View>
    </View>
  );
}

const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  music: { position: "absolute", top: 74, left: 30, flexDirection: "row", alignItems: "flex-end", gap: 10, backgroundColor: "rgba(14,18,20,0.6)", borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  musicBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  musicBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 24, paddingBottom: 2 },
  musicBar: { width: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" },
  musicBarOn: { backgroundColor: colors.yellow },

  wave: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8, height: 24 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.yellow, opacity: 0.85 },

  metric: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  metricIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,179,1,0.14)" },
  metricValue: { color: colors.white, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700", marginTop: -1 },

  seg: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.red },
  segText: { color: colors.textDim, fontSize: 13.5, fontWeight: "700" },
  segTextActive: { color: "#fff" },

  navItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
  navLabel: { color: colors.textDim, fontSize: 15, fontWeight: "600" },
});
