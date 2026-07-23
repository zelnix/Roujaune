import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, {
  Rect,
  Polyline,
  Circle as SvgCircle,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Path,
  Circle,
} from "react-native-svg";
import { colors, radius, spacing, shadow } from "../theme";
import { PrimaryButton, SecondaryButton, ReadinessScale, SectionLabel, Touchable } from "./ui";
import { useCoach } from "../lib/coach-persona";

const routeImg = require("../../assets/images/hero_cyclist_b2.jpg");

/* ------------------------- small shared pieces ------------------------- */
function Tag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.tag}>
      {icon}
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

function StatusDot({ state }: { state: "done" | "active" | "todo" }) {
  if (state === "done")
    return <Ionicons name="checkmark-circle" size={20} color={colors.green} />;
  if (state === "active") return <Ionicons name="ellipse" size={18} color={colors.yellow} />;
  return <Ionicons name="ellipse-outline" size={18} color={colors.textFaint} />;
}

/* ------------------------- Alberto coach card ------------------------- */
export function AlbertoTrainingCard({ width, onPress }: { width: number; onPress: () => void }) {
  const persona = useCoach();
  return (
    <Touchable testID="alberto-coach-card" onPress={onPress} lift style={{ width }}>
      <LinearGradient
        colors={["rgba(26,22,19,0.96)", "rgba(12,10,9,0.96)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.coachCard}
      >
        <View style={styles.coachPortraitWrap}>
          <Image source={persona.image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top center" accessibilityLabel={`Coach ${persona.name}`} />
          <LinearGradient colors={["transparent", "rgba(12,10,9,0.95)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.coachBody}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.coachName}>{persona.name}</Text>
            <Text style={styles.coachQuoteMark}>&#8220;</Text>
          </View>
          <Text style={styles.coachMsg}>You&apos;re ready to climb. Focus on steady power and smooth cadence.</Text>
          <Text style={styles.coachSupport}>Let&apos;s make it count.</Text>
        </View>
      </LinearGradient>
    </Touchable>
  );
}

/* ------------------------- workout profile chart ------------------------- */
const PROFILE = [
  0.14, 0.17, 0.21, 0.26, 0.32, 0.5, 0.46, 0.55, 0.5, 0.6, 0.56, 0.64, 0.6, 0.72, 0.67,
  0.75, 0.7, 0.83, 0.78, 0.87, 0.92, 0.86, 0.94, 0.88, 0.66, 0.52, 0.42, 0.32, 0.24, 0.17,
];

export function WorkoutProfileChart({ width, height = 150 }: { width: number; height?: number }) {
  const gap = 3;
  const bw = (width - gap * (PROFILE.length - 1)) / PROFILE.length;
  return (
    <Svg width={width} height={height} accessibilityLabel="Workout interval power profile">
      <Defs>
        <SvgGrad id="wp" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2392E" />
          <Stop offset="0.6" stopColor="#C51624" />
          <Stop offset="1" stopColor="#5A0E13" />
        </SvgGrad>
      </Defs>
      {PROFILE.map((v, i) => {
        const h = Math.max(4, v * (height - 6));
        return <Rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={2} fill="url(#wp)" opacity={0.55 + v * 0.45} />;
      })}
    </Svg>
  );
}

function WorkoutMetric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.metric}>
      {icon}
      <View style={{ marginLeft: 10 }}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

/* ------------------------- main workout card ------------------------- */
export function MainWorkoutCard({ onDetails, chartWidth }: { onDetails: () => void; chartWidth: number }) {
  return (
    <LinearGradient
      testID="main-workout-card"
      colors={["#160809", "#1E0A0C", "#100708"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.mainCard}
    >
      <View style={styles.mainTopRow}>
        <View style={{ flex: 1 }}>
          <SectionLabel color={colors.red}>MAIN WORKOUT</SectionLabel>
          <Text style={styles.workoutTitle}>Threshold Climb</Text>
          <View style={styles.tagRow}>
            <Tag icon={<MaterialCommunityIcons name="chart-timeline-variant" size={14} color={colors.red} />} label="Structured Workout" />
            <Tag icon={<Ionicons name="trending-up" size={14} color={colors.yellow} />} label="Climbing" />
            <Tag icon={<Ionicons name="sync" size={14} color="#5AA9E6" />} label="ERG Mode" />
          </View>
          <Text style={styles.workoutDesc}>Improve your lactate threshold and climbing sustainability with steady high-intensity efforts.</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.duration}>1h 00m</Text>
          <Text style={styles.durationLabel}>Duration</Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <WorkoutProfileChart width={chartWidth} height={150} />
        <View style={styles.chartBaseline} />
      </View>

      <View style={styles.metricsRow}>
        <WorkoutMetric icon={<Ionicons name="flash" size={22} color={colors.yellow} />} value="251 W" label="Target Power" />
        <View style={styles.metricDivider} />
        <WorkoutMetric icon={<MaterialCommunityIcons name="chart-bar" size={22} color={colors.red} />} value="Z4" label="Target Zone" />
        <View style={styles.metricDivider} />
        <WorkoutMetric icon={<MaterialCommunityIcons name="speedometer" size={22} color={colors.red} />} value="92 TSS" label="Training Load" />
        <View style={styles.metricDivider} />
        <WorkoutMetric icon={<MaterialCommunityIcons name="terrain" size={22} color={colors.yellow} />} value="1,050 m" label="Elevation Gain" />
        <SecondaryButton testID="view-details-button" label="View Details" onPress={onDetails} style={{ marginLeft: spacing.md }} />
      </View>
    </LinearGradient>
  );
}

/* ------------------------- route + weather card ------------------------- */
export function RouteWeatherCard({ onPreview, onImagePress }: { onPreview: () => void; onImagePress: () => void }) {
  return (
    <View style={styles.routeCard} testID="route-weather-card">
      <Touchable testID="route-image" onPress={onImagePress} lift={false} scaleTo={0.99} style={styles.routeImgWrap}>
        <Image source={routeImg} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" accessibilityLabel="Alpine cycling route" />
        <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFill} />
      </Touchable>

      <View style={styles.routeMid}>
        <SectionLabel color={colors.textDim}>ROUTE</SectionLabel>
        <Text style={styles.routeTitle}>Alpe d&apos;Huez</Text>
        <Text style={styles.routeMeta}>16.0 km  <Text style={{ color: colors.textFaint }}>•</Text>  1,090 m</Text>
        <SecondaryButton testID="preview-route-button" label="Preview Route" onPress={onPreview} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
      </View>

      <View style={styles.weatherCol}>
        <View style={styles.weatherHeadRow}>
          <SectionLabel color={colors.textDim}>WEATHER</SectionLabel>
          <MaterialCommunityIcons name="run" size={20} color={colors.yellow} />
        </View>
        <View style={styles.weatherMain}>
          <Ionicons name="sunny" size={30} color={colors.yellow} />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.weatherTemp}>18°C</Text>
            <Text style={styles.weatherCond}>Sunny</Text>
          </View>
        </View>
        <View style={styles.weatherStats}>
          <View style={styles.wStat}><Text style={styles.wStatLabel}>Wind</Text><Text style={styles.wStatVal}>8 km/h</Text></View>
          <View style={styles.wStat}><Text style={styles.wStatLabel}>Humidity</Text><Text style={styles.wStatVal}>48%</Text></View>
          <View style={styles.wStat}><Text style={styles.wStatLabel}>Feels Like</Text><Text style={styles.wStatVal}>18°C</Text></View>
        </View>
      </View>
    </View>
  );
}

/* ------------------------- readiness ------------------------- */
export function ReadinessCard() {
  return (
    <View style={styles.sideCard} testID="readiness-card">
      <View style={styles.sideLabelRow}>
        <Ionicons name="heart-outline" size={15} color={colors.red} />
        <SectionLabel color={colors.red}>READINESS</SectionLabel>
      </View>
      <Text style={styles.bigValue}>82%</Text>
      <Text style={styles.goodStatus}>Good to go</Text>
      <View style={{ marginTop: 12 }}>
        <ReadinessScale />
      </View>
    </View>
  );
}

/* ------------------------- training load ------------------------- */
const LOAD_PTS = [0.28, 0.22, 0.44, 0.7, 0.52, 0.66, 0.58];
const LOAD_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const HILITE = 2;

function TrainingLoadChart({ width, height = 78 }: { width: number; height?: number }) {
  const padX = 8;
  const padY = 8;
  const stepX = (width - padX * 2) / (LOAD_PTS.length - 1);
  const pts = LOAD_PTS.map((v, i) => [padX + i * stepX, height - padY - v * (height - padY * 2)]);
  const poly = pts.map((p) => p.join(",")).join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={poly} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <SvgCircle key={i} cx={p[0]} cy={p[1]} r={i === HILITE ? 4.5 : 3.2} fill={i === HILITE ? colors.yellow : "#fff"} />
      ))}
    </Svg>
  );
}

export function TrainingLoadCard({ width }: { width: number }) {
  return (
    <View style={styles.sideCard} testID="training-load-card">
      <SectionLabel color={colors.red}>TRAINING LOAD</SectionLabel>
      <Text style={styles.loadStatus}>Moderate</Text>
      <Text style={styles.loadValue}>366 TSS</Text>
      <TrainingLoadChart width={width - spacing.md * 2} />
      <View style={styles.loadLabels}>
        {LOAD_LABELS.map((l, i) => (
          <Text key={i} style={styles.loadLabel}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

/* ------------------------- what to expect + start ------------------------- */
export function WorkoutBreakdownCard({ onStart }: { onStart: () => void }) {
  const rows = [
    { label: "Warm Up", meta: "15 min", state: "done" as const },
    { label: "Threshold Blocks", meta: "3 x 12 min", state: "active" as const },
    { label: "Cool Down", meta: "15 min", state: "todo" as const },
  ];
  return (
    <View style={styles.sideCard} testID="what-to-expect-card">
      <SectionLabel color={colors.textDim}>WHAT TO EXPECT</SectionLabel>
      <View style={{ marginTop: 10, gap: 10 }}>
        {rows.map((r) => (
          <View key={r.label} style={styles.expectRow}>
            <Text style={styles.expectLabel}>{r.label}</Text>
            <Text style={styles.expectMeta}>{r.meta}</Text>
            <StatusDot state={r.state} />
          </View>
        ))}
      </View>
      <PrimaryButton testID="start-workout-button" label="Start Workout" onPress={onStart} style={{ marginTop: spacing.md }} />
    </View>
  );
}

/* ------------------------- equipment ------------------------- */
export function EquipmentCard({ onItemPress }: { onItemPress?: (label: string) => void }) {
  const items = [
    { label: "Smart Trainer", ok: true },
    { label: "Heart Rate Monitor", ok: true },
    { label: "Power Meter", ok: true },
    { label: "Cadence Sensor", ok: true },
    { label: "Fan", ok: false },
  ];
  return (
    <View style={styles.sideCard} testID="equipment-card">
      <SectionLabel color={colors.red}>EQUIPMENT</SectionLabel>
      <View style={{ marginTop: 8, gap: 8 }}>
        {items.map((it) => (
          <Touchable key={it.label} testID={`equip-${it.label.toLowerCase().replace(/\s+/g, "-")}`} scaleTo={0.98} lift={false} onPress={() => onItemPress?.(it.label)}>
            <View style={styles.equipRow}>
              <Text style={styles.equipLabel}>{it.label}</Text>
              {it.ok ? (
                <View style={[styles.equipDot, { backgroundColor: colors.green }]}>
                  <Ionicons name="checkmark" size={12} color="#04140A" />
                </View>
              ) : (
                <View style={[styles.equipDot, { backgroundColor: colors.yellow }]}>
                  <Ionicons name="alert" size={12} color="#1a1300" />
                </View>
              )}
            </View>
          </Touchable>
        ))}
      </View>
    </View>
  );
}

/* ------------------------- before you ride ------------------------- */
export function PreRideCard() {
  return (
    <LinearGradient testID="before-you-ride-card" colors={["#1C0B0C", "#0E0708"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bottomCard}>
      <SectionLabel color={colors.red}>BEFORE YOU RIDE</SectionLabel>
      <View style={styles.prRow}>
        <MaterialCommunityIcons name="bottle-soda-outline" size={26} color={colors.white} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.prTitle}>Fuel</Text>
          <Text style={styles.prSub}>Take in 30–60g carbs</Text>
        </View>
      </View>
      <View style={styles.prRow}>
        <Ionicons name="water" size={24} color="#5AA9E6" />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.prTitle}>Hydrate</Text>
          <Text style={styles.prSub}>500ml water</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

/* ------------------------- FB50 ------------------------- */
export function FB50RecommendationCard({ onPress }: { onPress: () => void }) {
  return (
    <Touchable testID="fb50-card" onPress={onPress} lift style={{ flex: 1 }} containerStyle={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
      <LinearGradient colors={["#20190A", "#0E0B06"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bottomCard}>
        <SectionLabel color={colors.yellow}>FB50 RECOMMENDATION</SectionLabel>
        <View style={styles.recRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recTitle}>Pre-Ride Activation</Text>
            <Text style={styles.recDur}>10 min</Text>
            <Text style={styles.recDesc}>Glute activation{"\n"}and mobility</Text>
          </View>
          <View style={styles.recArt}>
            <MaterialCommunityIcons name="human-handsup" size={54} color="rgba(255,255,255,0.85)" />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.yellow} style={styles.recArrow} />
      </LinearGradient>
    </Touchable>
  );
}

/* ------------------------- MPC ------------------------- */
function SunsetArt() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="xMidYMid slice" viewBox="0 0 300 160">
      <Defs>
        <SvgGrad id="mpc" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A2A28" />
          <Stop offset="0.5" stopColor="#8A3E1C" />
          <Stop offset="0.8" stopColor="#3A1A12" />
          <Stop offset="1" stopColor="#0C0706" />
        </SvgGrad>
      </Defs>
      <Path d="M0 0 H300 V160 H0 Z" fill="url(#mpc)" />
      <Circle cx={225} cy={95} r={22} fill="#F0A044" opacity={0.75} />
      <Path d="M225 120 c-13 0 -24 6 -24 13 h48 c0 -7 -11 -13 -24 -13 Z M225 92 a8 8 0 1 1 0.1 0 Z M212 120 c0 -11 5 -18 13 -20 c8 2 13 9 13 20 Z" fill="#140B09" />
    </Svg>
  );
}

export function MPCRecommendationCard({ onPress }: { onPress: () => void }) {
  return (
    <Touchable testID="mpc-card" onPress={onPress} lift style={{ flex: 1 }} containerStyle={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
      <View style={styles.bottomCard}>
        <SunsetArt />
        <LinearGradient colors={["rgba(5,5,5,0.72)", "rgba(5,5,5,0.2)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <SectionLabel color={colors.white}>MY PEACEFUL COMPANION</SectionLabel>
        <Text style={[styles.recTitle, { marginTop: 8 }]}>Calm Start</Text>
        <Text style={styles.recDur}>5 min</Text>
        <Text style={styles.recDesc}>Breathing and focus{"\n"}before your ride</Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  /* coach */
  coachCard: { flexDirection: "row", borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(233,180,76,0.28)", overflow: "hidden", minHeight: 150, ...shadow.card },
  coachPortraitWrap: { width: 128, alignSelf: "stretch", minHeight: 150 },
  coachBody: { flex: 1, paddingVertical: spacing.md, paddingRight: spacing.md, paddingLeft: spacing.sm, justifyContent: "center" },
  coachName: { color: colors.yellow, fontSize: 17, fontWeight: "800" },
  coachQuoteMark: { color: colors.gold, fontSize: 30, lineHeight: 30, fontWeight: "800", marginLeft: 8, marginTop: -4 },
  coachMsg: { color: colors.white, fontSize: 16, fontWeight: "700", lineHeight: 22, marginTop: 4 },
  coachSupport: { color: colors.textDim, fontSize: 13, marginTop: 8 },

  /* main workout */
  mainCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(197,22,36,0.28)", padding: spacing.lg, ...shadow.card },
  mainTopRow: { flexDirection: "row" },
  workoutTitle: { color: colors.white, fontSize: 30, fontWeight: "800", fontStyle: "italic", marginTop: 8 },
  tagRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: colors.white, fontSize: 12.5, fontWeight: "600" },
  workoutDesc: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 12, maxWidth: 440 },
  duration: { color: colors.white, fontSize: 26, fontWeight: "800" },
  durationLabel: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  chartWrap: { marginTop: spacing.md },
  chartBaseline: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 2 },
  metricsRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  metric: { flexDirection: "row", alignItems: "center", flex: 1 },
  metricValue: { color: colors.white, fontSize: 17, fontWeight: "800" },
  metricLabel: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  metricDivider: { width: 1, height: 34, backgroundColor: colors.borderSoft, marginHorizontal: 6 },

  /* route + weather */
  routeCard: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", minHeight: 158, ...shadow.card },
  routeImgWrap: { width: 300, alignSelf: "stretch", minHeight: 158 },
  routeMid: { flex: 1.1, padding: spacing.md, justifyContent: "center", borderRightWidth: 1, borderRightColor: colors.borderSoft },
  routeTitle: { color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 6 },
  routeMeta: { color: colors.textDim, fontSize: 13.5, marginTop: 4 },
  weatherCol: { flex: 1, padding: spacing.md },
  weatherHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  weatherMain: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  weatherTemp: { color: colors.white, fontSize: 26, fontWeight: "800" },
  weatherCond: { color: colors.textDim, fontSize: 12.5 },
  weatherStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  wStat: {},
  wStatLabel: { color: colors.textDim, fontSize: 11.5 },
  wStatVal: { color: colors.white, fontSize: 14, fontWeight: "700", marginTop: 2 },

  /* side cards */
  sideCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  sideLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bigValue: { color: colors.white, fontSize: 40, fontWeight: "900", marginTop: 6 },
  goodStatus: { color: colors.greenText, fontSize: 14, fontWeight: "700", marginTop: 2 },
  loadStatus: { color: colors.yellow, fontSize: 18, fontWeight: "800", marginTop: 8 },
  loadValue: { color: colors.textDim, fontSize: 13, marginTop: 2, marginBottom: 6 },
  loadLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, marginTop: 2 },
  loadLabel: { color: colors.textFaint, fontSize: 11, fontWeight: "600" },

  expectRow: { flexDirection: "row", alignItems: "center" },
  expectLabel: { color: colors.white, fontSize: 13.5, fontWeight: "600", flex: 1 },
  expectMeta: { color: colors.textDim, fontSize: 12.5, marginRight: 10 },

  equipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 2 },
  equipLabel: { color: colors.white, fontSize: 13.5, fontWeight: "600" },
  equipDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  /* bottom cards */
  bottomCard: { flex: 1, flexBasis: 0, minWidth: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, overflow: "hidden", minHeight: 130, ...shadow.card },
  prRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  prTitle: { color: colors.white, fontSize: 15, fontWeight: "700" },
  prSub: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  recRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  recTitle: { color: colors.white, fontSize: 16, fontWeight: "800" },
  recDur: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  recDesc: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 8 },
  recArt: { width: 70, alignItems: "center", justifyContent: "center" },
  recArrow: { position: "absolute", right: 12, bottom: 12 },
});
