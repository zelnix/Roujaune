import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polyline, Polygon as SvgPolygon } from "react-native-svg";
import { colors, radius, spacing, textShadow } from "@/src/theme";
import { versionLabel } from "./AppVersionTag";
import { BUILD_STAMP } from "@/src/lib/build-stamp";

const WORDMARK = require("../../assets/images/auth_wordmark.png");
const LOGO_GLYPH = require("../../assets/images/auth_logo_glyph.png");

type Tone = "good" | "warn" | "bad" | "neutral";
const toneColor = (t: Tone) => (t === "good" ? colors.green : t === "warn" ? colors.yellow : t === "bad" ? colors.red : colors.textDim);

// ---- Header (slim progress bar) -------------------------------------------
export function LiveHeader({ elapsed, progress, estFinish }: { elapsed: string; progress: number; estFinish: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View style={h.bar}>
      <View style={h.stat}>
        <Text style={h.statLabel}>ELAPSED</Text>
        <Text style={h.statValue}>{elapsed}</Text>
      </View>
      <View style={[h.progressWrap, { flex: 1 }]}>
        <View style={h.progressTop}><Text style={h.progressPct}>{pct}% complete</Text></View>
        <View style={h.track}><View style={[h.fill, { width: `${pct}%` }]} /></View>
      </View>
      <View style={h.stat}>
        <Text style={h.statLabel}>EST. FINISH</Text>
        <Text style={h.statValue}>{estFinish}</Text>
      </View>
    </View>
  );
}

// ---- Brand card (metric row) ----------------------------------------------
export function BrandCard({ dense, onPress }: { dense?: boolean; onPress?: () => void }) {
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      style={[brand.card, dense && brand.cardDense]}
      testID="brand-card"
      {...(onPress ? { onPress, accessibilityRole: "button", accessibilityLabel: "ROUJAUNE — go to home" } : {})}
    >
      <Image source={LOGO_GLYPH} style={dense ? brand.glyphDense : brand.glyph} contentFit="contain" />
      <Image source={WORDMARK} style={dense ? brand.logoDense : brand.logo} contentFit="contain" />
      <Text style={[brand.version, dense && brand.versionDense]} numberOfLines={1}>{versionLabel()}</Text>
      {__DEV__ ? <Text style={[brand.stamp, dense && brand.stampDense]} numberOfLines={1}>Preview · {BUILD_STAMP}</Text> : null}
    </Wrap>
  );
}

// Compact history of ride-affecting adjustments made during the session.
export function AdjustmentsStrip({ entries }: { entries: { id: number; t: string; label: string }[] }) {
  if (!entries.length) return null;
  return (
    <View style={aj.wrap} testID="adjustments-strip">
      <View style={aj.head}>
        <Ionicons name="options" size={13} color={colors.yellow} />
        <Text style={aj.title}>ADJUSTMENTS</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={aj.row}>
        {entries.map((e) => (
          <View key={e.id} style={aj.chip}>
            <Text style={aj.chipTime}>{e.t}</Text>
            <Text style={aj.chipText}>{e.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---- Metric card ----------------------------------------------------------
export function MetricCard({
  icon, label, value, unit, status, statusTone = "neutral", sub, accent = colors.yellow, connected, deviceName, battery, signal, onDevicePress, half, dense,
}: {
  icon: any; label: string; value: string; unit?: string; status?: string; statusTone?: Tone; sub?: string; accent?: string; connected?: boolean; deviceName?: string; battery?: number | null; signal?: number | null; onDevicePress?: () => void; half?: boolean; dense?: boolean;
}) {
  const batIcon = battery == null ? null : battery >= 66 ? "battery-full" : battery >= 25 ? "battery-half" : "battery-dead";
  const batColor = battery == null ? colors.textDim : battery <= 15 ? colors.red : battery <= 30 ? colors.yellow : colors.green;
  // The status dot doubles as a connection-strength indicator: green = strong,
  // yellow = fair, red = weak (based on the sensor's RSSI in dBm).
  const dotColor = !connected ? colors.textFaint
    : signal == null ? colors.green
    : signal >= -70 ? colors.green
    : signal >= -82 ? colors.yellow
    : colors.red;
  const ConnTag: any = onDevicePress ? Pressable : View;
  return (
    <View style={[m.card, half && m.cardHalf, dense && m.cardDense]} testID={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <View style={m.head}>
        <Ionicons name={icon} size={dense ? 14 : 16} color={accent} />
        {connected !== undefined ? (
          <ConnTag
            style={m.conn}
            testID={`metric-conn-${label.toLowerCase().replace(/\s+/g, "-")}`}
            {...(onDevicePress ? { onPress: onDevicePress, hitSlop: 8, accessibilityRole: "button", accessibilityLabel: connected ? `${deviceName || "Device"} connected. Tap to manage sensors` : "Tap to pair a sensor" } : {})}
          >
            <View style={[m.connDot, { backgroundColor: connected ? dotColor : "transparent", borderColor: connected ? dotColor : colors.textFaint }]} />
            {!dense ? (
              <Text style={[m.connText, { color: connected ? colors.green : colors.textFaint }]} numberOfLines={1}>{connected ? (deviceName || "Connected") : "Pair"}</Text>
            ) : null}
            {connected && batIcon ? (
              <>
                <Ionicons name={batIcon} size={13} color={batColor} style={m.batIcon} />
                <Text style={[m.connText, { color: batColor }]}>{battery}%</Text>
              </>
            ) : null}
          </ConnTag>
        ) : null}
        <Text style={[m.label, dense && m.labelDense]} numberOfLines={dense ? 2 : 1}>{label}</Text>
        {status ? (
          <View style={[m.pill, dense && m.pillDense, { borderColor: toneColor(statusTone), backgroundColor: toneColor(statusTone) + "22" }]}>
            <Text style={[m.pillText, dense && m.pillTextDense, { color: toneColor(statusTone) }]}>{status}</Text>
          </View>
        ) : null}
      </View>
      <View style={[m.valueRow, dense && m.valueRowDense]}>
        <Text style={[m.value, dense && m.valueDense, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {unit ? <Text style={[m.unit, dense && m.unitDense]}>{unit}</Text> : null}
      </View>
      {sub ? <Text style={[m.sub, dense && m.subDense]}>{sub}</Text> : null}
    </View>
  );
}

// ---- Sensor health strip --------------------------------------------------
// A compact horizontal strip listing every paired BLE sensor with its battery
// and signal strength at a glance. Only shown when real sensors are connected.
export type SensorHealth = { id: string; name: string; kind: "hr" | "trainer" | "sensor"; battery: number | null; signal: number | null; reconnecting?: boolean };

function signalMeta(signal: number | null) {
  if (signal == null) return { color: colors.green, bars: 3, label: "" };
  if (signal >= -70) return { color: colors.green, bars: 3, label: "Strong" };
  if (signal >= -82) return { color: colors.yellow, bars: 2, label: "Fair" };
  return { color: colors.red, bars: 1, label: "Weak" };
}

function SignalBars({ signal }: { signal: number | null }) {
  const { color, bars } = signalMeta(signal);
  return (
    <View style={sh.bars}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[sh.bar, { height: 5 + i * 3, backgroundColor: i < bars ? color : colors.textFaint + "66" }]} />
      ))}
    </View>
  );
}

export function SensorHealthRow({ sensors, onSensorPress }: { sensors: SensorHealth[]; onSensorPress?: (id: string) => void }) {
  if (!sensors.length) return null;
  const Chip: any = onSensorPress ? Pressable : View;
  return (
    <View style={sh.strip} testID="sensor-health-row">
      <Ionicons name="pulse" size={14} color={colors.yellow} style={{ marginRight: 2 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sh.scroll}>
        {sensors.map((s) => {
          const icon = s.kind === "hr" ? "heart" : s.kind === "trainer" ? "bicycle" : "hardware-chip-outline";
          const batColor = s.battery == null ? colors.textDim : s.battery <= 15 ? colors.red : s.battery <= 30 ? colors.yellow : colors.green;
          const batIcon = s.battery == null ? null : s.battery >= 66 ? "battery-full" : s.battery >= 25 ? "battery-half" : "battery-dead";
          const sig = signalMeta(s.signal);
          const weak = !s.reconnecting && s.signal != null && s.signal < -82;
          return (
            <Chip
              key={s.id}
              style={[sh.chip, weak && sh.chipWeak]}
              testID={`sensor-health-${s.id}`}
              {...(onSensorPress ? { onPress: () => onSensorPress(s.id), hitSlop: 6, accessibilityRole: "button", accessibilityLabel: `${s.name || "Sensor"} — tap to open sensor pairing` } : {})}
            >
              <Ionicons name={icon as any} size={14} color={s.reconnecting ? colors.yellow : colors.white} />
              <Text style={sh.name} numberOfLines={1}>{s.name || "Sensor"}</Text>
              {s.reconnecting ? (
                <Text style={sh.reconnect}>reconnecting…</Text>
              ) : (
                <>
                  <SignalBars signal={s.signal} />
                  {s.signal != null ? <Text style={[sh.sigLabel, { color: sig.color }]}>{sig.label}</Text> : null}
                  {batIcon ? (
                    <View style={sh.batWrap}>
                      <Ionicons name={batIcon as any} size={13} color={batColor} style={sh.batIcon} />
                      <Text style={[sh.bat, { color: batColor }]}>{s.battery}%</Text>
                    </View>
                  ) : null}
                </>
              )}
              {onSensorPress ? <Ionicons name="chevron-forward" size={12} color={colors.textFaint} /> : null}
            </Chip>
          );
        })}
      </ScrollView>
    </View>
  );
}


function ConnRow({ icon, label, ok, okText }: { icon: any; label: string; ok: boolean; okText: string }) {
  return (
    <View style={cn.row}>
      <View style={cn.rowIcon}><Ionicons name={icon} size={16} color={ok ? colors.green : colors.textFaint} /></View>
      <Text style={cn.rowLabel}>{label}</Text>
      <View style={cn.rowRight}>
        {ok ? <Ionicons name="checkmark-circle" size={14} color={colors.green} /> : <Ionicons name="ellipse-outline" size={13} color={colors.textFaint} />}
        <Text style={[cn.rowState, { color: ok ? colors.green : colors.textFaint }]}>{ok ? okText : "Off"}</Text>
      </View>
    </View>
  );
}
export function ConnectionsPanel({ trainerOn, wearableOn, powerOn, hrOn, cadenceOn }: { trainerOn: boolean; wearableOn: boolean; powerOn: boolean; hrOn: boolean; cadenceOn: boolean }) {
  const allOn = powerOn && hrOn && cadenceOn;
  return (
    <View style={cn.panel} testID="connections-panel">
      <View style={cn.header}><Ionicons name="hardware-chip-outline" size={15} color={colors.yellow} /><Text style={cn.title}>CONNECTIONS</Text></View>
      <Text style={cn.section}>DEVICES</Text>
      <ConnRow icon="bicycle" label="Trainer" ok={trainerOn} okText="Connected" />
      <ConnRow icon="watch-outline" label="Wearable" ok={wearableOn} okText="Connected" />
      <View style={cn.divider} />
      <Text style={cn.section}>LIVE DATA</Text>
      <ConnRow icon="flash" label="Power" ok={powerOn} okText="Active" />
      <ConnRow icon="heart" label="Heart Rate" ok={hrOn} okText="Active" />
      <ConnRow icon="sync" label="Cadence" ok={cadenceOn} okText="Active" />
      <View style={[cn.footer, { borderColor: allOn ? colors.green + "55" : colors.border, backgroundColor: allOn ? colors.green + "18" : "rgba(255,255,255,0.03)" }]}>
        <Ionicons name={allOn ? "shield-checkmark" : "information-circle-outline"} size={14} color={allOn ? colors.green : colors.textDim} />
        <Text style={[cn.footerText, { color: allOn ? colors.green : colors.textDim }]}>{allOn ? "All ride data active" : "Some data inactive"}</Text>
      </View>
    </View>
  );
}

// ---- Session card (Elapsed / Est. finish / Distance) ----------------------
export function SessionCard({ elapsed, estFinish, riddenKm, totalKm }: { elapsed: string; estFinish: string; riddenKm: number; totalKm: number }) {
  return (
    <View style={sc.panel} testID="session-card">
      <View style={sc.header}><Ionicons name="stopwatch-outline" size={15} color={colors.yellow} /><Text style={sc.title}>SESSION</Text></View>
      <View style={sc.stat}>
        <Text style={sc.label}>ELAPSED</Text>
        <Text style={sc.value} testID="session-elapsed">{elapsed}</Text>
      </View>
      <View style={sc.divider} />
      <View style={sc.stat}>
        <Text style={sc.label}>EST. FINISH</Text>
        <Text style={sc.value} testID="session-estfinish">{estFinish}</Text>
      </View>
      <View style={sc.divider} />
      <View style={sc.stat}>
        <Text style={sc.label}>DISTANCE</Text>
        <Text style={sc.value} testID="session-distance">{riddenKm.toFixed(1)}<Text style={sc.unit}> / {totalKm.toFixed(1)} km</Text></Text>
      </View>
    </View>
  );
}

// ---- Alberto coaching banner ----------------------------------------------
export function CoachBanner({ name, message, avatar }: { name: string; message: string; avatar: any }) {
  return (
    <View style={cb.wrap} testID="coach-banner">
      <Image source={avatar} style={cb.avatar} contentFit="cover" contentPosition="top center" />
      <View style={{ flex: 1 }}>
        <Text style={cb.name}>{name} · Live coaching</Text>
        <Text style={cb.msg} numberOfLines={2}>{message}</Text>
      </View>
      <Ionicons name="mic" size={16} color={colors.yellow} />
    </View>
  );
}

// ---- Right column info cards ----------------------------------------------
export function InfoCard({ icon, label, value, sub, accent = colors.white, tone }: { icon: any; label: string; value: string; sub?: string; accent?: string; tone?: Tone }) {
  return (
    <View style={ic.card}>
      <View style={ic.head}><Ionicons name={icon} size={14} color={tone ? toneColor(tone) : colors.yellow} /><Text style={ic.label}>{label}</Text></View>
      <Text style={[ic.value, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={ic.sub}>{sub}</Text> : null}
    </View>
  );
}

// ---- Elevation profile (mini) --------------------------------------------
export function ElevationProfile({ progress, grade }: { progress: number; grade: number }) {
  const W = 100, H = 26;
  // A simple stylised climb profile that scales with grade.
  const peak = Math.min(1, 0.35 + grade / 12);
  const pts = [`0,${H}`, `20,${H - H * peak * 0.3}`, `45,${H - H * peak * 0.6}`, `70,${H - H * peak}`, `100,${H - H * peak * 0.5}`];
  const x = Math.max(0, Math.min(1, progress)) * W;
  return (
    <View style={[ep.wrap, { pointerEvents: "none" }]}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <SvgPolygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="rgba(245,179,1,0.16)" />
        <Polyline points={pts.join(" ")} fill="none" stroke={colors.yellow} strokeWidth={1.4} />
        <Polyline points={`${x},0 ${x},${H}`} stroke="#fff" strokeWidth={1} strokeDasharray="2,2" opacity={0.8} />
      </Svg>
    </View>
  );
}

// ---- Terrain card (right column) ------------------------------------------
export function TerrainCard({ grade, elevGain, distanceLeft, progress, isClimb }: { grade: number; elevGain: number; distanceLeft: number; progress: number; isClimb: boolean }) {
  return (
    <View style={tc.card} testID="terrain-card">
      <View style={tc.head}><Ionicons name="trail-sign-outline" size={14} color={colors.yellow} /><Text style={tc.title}>TERRAIN</Text></View>
      <View style={tc.stats}>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.abs(grade).toFixed(1)}%</Text><Text style={tc.statLbl}>{isClimb ? "GRADE" : "AVG GRADE"}</Text></View>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.round(elevGain)} m</Text><Text style={tc.statLbl}>ELEV GAIN</Text></View>
        <View style={tc.stat}><Text style={tc.statVal}>{Math.max(0, distanceLeft).toFixed(1)} km</Text><Text style={tc.statLbl}>DIST LEFT</Text></View>
      </View>
      <View style={tc.profileWrap}><ElevationProfile progress={progress} grade={grade} /></View>
    </View>
  );
}

// ---- Workout card (right column, top) -------------------------------------
export function WorkoutCard({
  planName, phase, week, day, workoutName, description,
}: {
  planName: string; phase?: string; week?: string; day?: string; workoutName: string; description?: string;
}) {
  const chips = [phase, week, day].filter(Boolean) as string[];
  return (
    <View style={wc.card} testID="workout-card">
      <Text style={wc.title} numberOfLines={2}>{workoutName}</Text>
      <View style={wc.head}>
        <Ionicons name="ribbon-outline" size={13} color={colors.yellow} />
        <Text style={wc.plan} numberOfLines={1}>{planName}</Text>
      </View>
      {chips.length ? (
        <View style={wc.metaRow}>
          {chips.map((c, i) => (<View key={i} style={wc.chip}><Text style={wc.chipText}>{c}</Text></View>))}
        </View>
      ) : null}
      {description ? (
        <>
          <View style={wc.divider} />
          <Text style={wc.desc} numberOfLines={6}>{description}</Text>
        </>
      ) : null}
    </View>
  );
}

// ---- Step timeline (bottom) -----------------------------------------------
export type TimelineStep = {
  index: number; label: string; zoneLabel: string; duration: string; durationSec: number;
  watts: number; targetPct: number; rpe: number; color: string; intensity: number; desc?: string;
};
export type StepStatus = "done" | "current" | "future";

function ProfileSeg({ step, status, width, fill, onPress }: { step: TimelineStep; status: StepStatus; width: number; fill: number; onPress: () => void }) {
  const h = Math.max(110, 82 + Math.max(0, Math.min(1, step.intensity)) * 52);
  const base = status === "future" ? "rgba(255,255,255,0.12)" : status === "done" ? colors.yellow + "44" : step.color + "33";
  const fillPct = status === "done" ? 100 : status === "current" ? Math.max(0, Math.min(1, fill)) * 100 : 0;
  const dim = status === "future";
  return (
    <Pressable onPress={onPress} testID={`step-seg-${step.index}`} style={[st.seg, { width }]}>
      <View style={[st.segBar, { height: h, backgroundColor: base, borderColor: status === "current" ? colors.yellow : "rgba(255,255,255,0.10)" }]}>
        {fillPct > 0 ? <View style={[st.segFill, { width: `${fillPct}%` }]} /> : null}
        <View style={[st.segLabel, { pointerEvents: "none" }]}>
          <Text style={[st.segName, dim && { color: colors.textDim }]} numberOfLines={2}>{step.index + 1}. {step.label}</Text>
          {step.desc ? <Text style={[st.segDesc, dim && { color: colors.textFaint }]} numberOfLines={2}>{step.desc}</Text> : null}
          <Text style={[st.segMeta, dim && { color: colors.textFaint }]} numberOfLines={1}>{step.duration}{step.watts > 0 ? ` · ${step.watts} W` : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function StepTimeline({
  steps, activeIndex, remaining, stepProgress = 0, onStepPress,
}: {
  steps: TimelineStep[]; activeIndex: number; remaining?: string; stepProgress?: number; onStepPress: (index: number) => void;
}) {
  const MIN = 150;
  const total = steps.reduce((a, s) => a + Math.max(1, s.durationSec), 0) || 1;
  const [chartW, setChartW] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  // Each bar is duration-proportional but never narrower than MIN so its
  // overlaid text stays readable; if the total exceeds the width we scroll.
  const floored = steps.map((s) => Math.max(MIN, (Math.max(1, s.durationSec) / total) * (chartW || 1)));
  const sumF = floored.reduce((a, b) => a + b, 0) || 1;
  const contentW = Math.max(chartW, sumF);
  const scale = sumF > 0 ? contentW / sumF : 1;
  const widths = floored.map((w) => w * scale);
  const scrollable = contentW > chartW + 1;
  React.useEffect(() => {
    if (activeIndex < 0 || !chartW) return;
    let x = 0;
    for (let i = 0; i < activeIndex; i++) x += widths[i];
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, chartW]);
  return (
    <View style={st.wrap} testID="interval-timeline">
      {steps.length ? (() => {
        const cur = steps[Math.max(0, Math.min(activeIndex, steps.length - 1))];
        const nxt = activeIndex + 1 < steps.length ? steps[activeIndex + 1] : null;
        return (
          <View style={st.nowNext} testID="now-next-strip">
            <Pressable style={[st.nnCell, st.nnNow]} onPress={() => onStepPress(cur.index)} testID="now-next-now" accessibilityRole="button" accessibilityLabel={`Current stage ${cur.label}. Tap for details`}>
              <View style={st.nnTagNow}><Text style={st.nnTagNowText}>NOW</Text></View>
              <View style={[st.nnDot, { backgroundColor: cur.color }]} />
              <View style={st.nnBody}>
                <Text style={st.nnName} numberOfLines={1}>{cur.index + 1}. {cur.label}</Text>
                <Text style={st.nnMeta} numberOfLines={1}>{cur.zoneLabel}{cur.watts > 0 ? ` · ${cur.watts} W` : ""}</Text>
              </View>
              {remaining ? (
                <View style={st.nnCountdown}>
                  <Text style={st.nnCountValue} testID="now-countdown">{remaining}</Text>
                  <Text style={st.nnCountLabel}>LEFT</Text>
                </View>
              ) : null}
              <View style={[st.nnProgressTrack, { pointerEvents: "none" }]}>
                <View style={[st.nnProgressFill, { width: `${Math.round(Math.max(0, Math.min(1, stepProgress)) * 100)}%` }]} />
              </View>
            </Pressable>
            <Ionicons name="arrow-forward" size={22} color={colors.textDim} style={st.nnArrow} />
            <Pressable style={[st.nnCell, st.nnNext]} onPress={() => nxt && onStepPress(nxt.index)} disabled={!nxt} testID="now-next-next" accessibilityRole="button" accessibilityLabel={nxt ? `Next stage ${nxt.label}. Tap for details` : "Last stage"}>
              <View style={st.nnTagNext}><Text style={st.nnTagNextText}>NEXT</Text></View>
              {nxt ? (
                <>
                  <View style={[st.nnDot, { backgroundColor: nxt.color }]} />
                  <View style={st.nnBody}>
                    <Text style={st.nnName} numberOfLines={1}>{nxt.index + 1}. {nxt.label}</Text>
                    <Text style={st.nnMeta} numberOfLines={1}>{nxt.duration}{nxt.watts > 0 ? ` · ${nxt.watts} W` : ""}</Text>
                  </View>
                </>
              ) : (
                <View style={st.nnBody}>
                  <Text style={st.nnName} numberOfLines={1}>Finish</Text>
                  <Text style={st.nnMeta} numberOfLines={1}>Last step — bring it home</Text>
                </View>
              )}
            </Pressable>
          </View>
        );
      })() : null}

      <View onLayout={(e) => setChartW(Math.round(e.nativeEvent.layout.width))}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} scrollEnabled={scrollable}>
          <View style={[st.chart, { width: chartW ? contentW : "100%" }]}>
            {steps.map((s, i) => (
              <ProfileSeg
                key={s.index}
                step={s}
                status={s.index < activeIndex ? "done" : s.index === activeIndex ? "current" : "future"}
                width={chartW ? widths[i] : MIN}
                fill={stepProgress}
                onPress={() => onStepPress(s.index)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ---- Step detail popup ----------------------------------------------------
const ZONE_TIP: Record<string, string> = {
  Z1: "Very easy — active recovery. Keep it light and spin the legs.",
  Z2: "Aerobic endurance. Conversational effort you can sustain for hours.",
  Z3: "Tempo. Comfortably hard — controlled breathing, steady rhythm.",
  Z4: "Threshold. Sustainably hard; hold your target and stay composed.",
  Z5: "VO2 max. Very hard intervals — commit fully, then recover well.",
  Z6: "Anaerobic. All-out efforts to sharpen top-end power.",
};
export function StepDetailModal({
  step, activeIndex, total, onClose,
}: {
  step: TimelineStep; activeIndex: number; total: number; onClose: () => void;
}) {
  const status: StepStatus = step.index < activeIndex ? "done" : step.index === activeIndex ? "current" : "future";
  const statusLabel = status === "done" ? "Completed" : status === "current" ? "In progress" : "Upcoming";
  const statusTone = status === "done" ? colors.green : status === "current" ? colors.yellow : colors.textDim;
  const stats: { label: string; value: string }[] = [
    { label: "ZONE", value: step.zoneLabel },
    { label: "DURATION", value: step.duration },
    { label: "TARGET", value: step.watts > 0 ? `${step.watts} W` : "—" },
    { label: "% FTP", value: `${Math.round(step.targetPct * 100)}%` },
    { label: "RPE", value: `${step.rpe} / 10` },
  ];
  return (
    <View style={sd.panel} testID="step-detail-modal">
      <View style={sd.head}>
        <View style={sd.badge}><Text style={sd.badgeText}>STEP {step.index + 1} / {total}</Text></View>
        <Pressable onPress={onClose} hitSlop={10} testID="step-detail-close"><Ionicons name="close" size={22} color={colors.white} /></Pressable>
      </View>
      <View style={sd.titleRow}>
        <View style={[sd.zoneDot, { backgroundColor: step.color }]} />
        <Text style={sd.title} numberOfLines={2}>{step.label}</Text>
      </View>
      <View style={[sd.statusPill, { borderColor: statusTone + "66", backgroundColor: statusTone + "1A" }]}>
        <View style={[sd.statusDot, { backgroundColor: statusTone }]} />
        <Text style={[sd.statusText, { color: statusTone }]}>{statusLabel}</Text>
      </View>
      <View style={sd.grid}>
        {stats.map((s) => (
          <View key={s.label} style={sd.stat}>
            <Text style={sd.statLabel}>{s.label}</Text>
            <Text style={sd.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>
      <View style={sd.tipBox}>
        <Ionicons name="bulb-outline" size={15} color={colors.yellow} />
        <Text style={sd.tipText}>{ZONE_TIP[step.zoneLabel] ?? "Hold your target and keep a smooth, steady effort."}</Text>
      </View>
    </View>
  );
}

// ---- Bottom controls ------------------------------------------------------
export function LiveControlBar({
  paused, erg, audioOn, live, onLive, onAudio, onMirror, onErg, onControls, onReconnect, onSettings, onBluetooth, onLock, locked, onPauseToggle, onEnd,
}: {
  paused: boolean; erg: number; audioOn: boolean; live: boolean; onLive: () => void; onAudio: () => void; onMirror: () => void;
  onErg: (d: number) => void; onControls: () => void; onReconnect: () => void; onSettings: () => void; onBluetooth: () => void; onLock: () => void; locked: boolean;
  onPauseToggle: () => void; onEnd: () => void;
}) {
  // Scale the bar down on small screens so nothing overflows and Pause/End
  // always stay on the same row (never wrap to a second line).
  const { width } = useWindowDimensions();
  const compact = width < 1180;
  const tiny = width < 900;
  const H = tiny ? 48 : compact ? 58 : 76;          // control height
  const ICON = tiny ? 17 : compact ? 20 : 26;       // secondary icon size
  const PICON = tiny ? 19 : compact ? 22 : 28;      // pause icon size
  const RTXT = tiny ? 10 : compact ? 11 : 13;       // secondary label
  const PTXT = tiny ? 14 : compact ? 16 : 20;       // pause/end label
  const MINW = tiny ? 56 : compact ? 68 : 92;       // secondary button min width
  const PADH = tiny ? 8 : compact ? 12 : 20;        // secondary button padding
  const PPADH = tiny ? 16 : compact ? 22 : 30;      // pause/end padding
  const ERGV = tiny ? 16 : compact ? 18 : 22;       // erg value font

  const roundStyle = [bc.round, { minWidth: MINW, height: H, paddingHorizontal: PADH }];
  const rtxt = [bc.roundText, { fontSize: RTXT }];

  return (
    <View style={bc.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={bc.group} contentContainerStyle={bc.groupInner}>
        <Pressable onPress={onLive} style={[bc.pill, { height: H }, live ? bc.pillOn : bc.pillOff]} testID="bc-live">
          <View style={[bc.pillDot, { backgroundColor: live ? colors.green : colors.textDim }]} />
          <Text style={[bc.pillText, { color: live ? colors.green : colors.textDim, fontSize: PTXT }]}>{live ? "LIVE" : "DEMO"}</Text>
        </Pressable>
        <Pressable onPress={onAudio} style={roundStyle} testID="bc-audio" accessibilityLabel="Audio">
          <Ionicons name={audioOn ? "volume-high" : "volume-mute"} size={ICON} color={colors.white} />
          <Text style={rtxt}>Audio</Text>
        </Pressable>
        <Pressable onPress={onMirror} style={roundStyle} testID="bc-mirror" accessibilityLabel="Mirror">
          <Ionicons name="tv-outline" size={ICON} color={colors.white} />
          <Text style={rtxt}>Mirror</Text>
        </Pressable>

        <View style={[bc.erg, { height: H, paddingHorizontal: PADH }]} testID="bc-erg">
          <Text style={bc.ergLabel}>ERG INTENSITY</Text>
          <View style={bc.ergRow}>
            <Pressable onPress={() => onErg(-5)} style={[bc.ergBtn, tiny && bc.ergBtnSm]} testID="bc-erg-down" hitSlop={6}><Ionicons name="remove" size={ICON} color={colors.white} /></Pressable>
            <Text style={[bc.ergValue, { fontSize: ERGV, minWidth: tiny ? 42 : 60 }]}>{erg}%</Text>
            <Pressable onPress={() => onErg(5)} style={[bc.ergBtn, tiny && bc.ergBtnSm]} testID="bc-erg-up" hitSlop={6}><Ionicons name="add" size={ICON} color={colors.white} /></Pressable>
          </View>
        </View>

        <Pressable onPress={onReconnect} style={roundStyle} testID="bc-reconnect" accessibilityLabel="Reconnect Trainer">
          <Ionicons name="refresh" size={ICON} color={colors.white} />
          <Text style={rtxt}>Reconnect</Text>
        </Pressable>
        <Pressable onPress={onSettings} style={roundStyle} testID="bc-settings" accessibilityLabel="Workout Settings">
          <Ionicons name="settings-outline" size={ICON} color={colors.white} />
          <Text style={rtxt}>Settings</Text>
        </Pressable>
        <Pressable onPress={onBluetooth} style={roundStyle} testID="bc-bluetooth" accessibilityLabel="Bluetooth Sensors">
          <Ionicons name="bluetooth" size={ICON} color={colors.white} />
          <Text style={rtxt}>Sensors</Text>
        </Pressable>
        <Pressable onPress={onLock} style={roundStyle} testID="bc-lock" accessibilityLabel="Touch Lock">
          <Ionicons name={locked ? "lock-closed" : "lock-open-outline"} size={ICON} color={locked ? colors.yellow : colors.white} />
          <Text style={rtxt}>Lock</Text>
        </Pressable>
        <Pressable onPress={onControls} style={roundStyle} testID="bc-controls" accessibilityLabel="Controls">
          <Ionicons name="options-outline" size={ICON} color={colors.white} />
          <Text style={rtxt}>Controls</Text>
        </Pressable>
      </ScrollView>

      <View style={bc.primary}>
        <Pressable onPress={onPauseToggle} style={[bc.pause, { height: H, paddingHorizontal: PPADH }]} testID="bc-pause">
          <Ionicons name={paused ? "play" : "pause"} size={PICON} color={colors.bg} />
          <Text style={[bc.pauseText, { fontSize: PTXT }]}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable onPress={onEnd} style={[bc.end, { height: H, paddingHorizontal: PPADH }]} testID="bc-end">
          <Ionicons name="stop" size={ICON} color="#fff" />
          <Text style={[bc.endText, { fontSize: PTXT }]}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const card = { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border } as const;

const h = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  logo: { width: 96, height: 20 },
  titleWrap: { minWidth: 120, maxWidth: 220 },
  route: { color: colors.yellow, fontSize: 13, fontWeight: "800" },
  workout: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  center: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, justifyContent: "center" },
  stat: { alignItems: "center" },
  statLabel: { color: colors.textFaint, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  statValue: { color: colors.white, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  progressWrap: { flex: 1, maxWidth: 320, minWidth: 120 },
  progressTop: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 4 },
  progressPct: { color: colors.yellow, fontSize: 11, fontWeight: "800" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 3 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1 },
  liveOn: { borderColor: colors.green + "66", backgroundColor: colors.green + "18" },
  liveOff: { borderColor: colors.border, backgroundColor: colors.card },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});

const brand = StyleSheet.create({
  card: { ...card, flex: 1, minWidth: 120, alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 8 },
  cardDense: { minWidth: 92, paddingVertical: 8, gap: 4 },
  glyph: { width: 44, height: 44 },
  glyphDense: { width: 30, height: 30 },
  logo: { width: "86%", height: 40 },
  logoDense: { width: "88%", height: 24 },
  version: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, marginTop: 4 },
  versionDense: { fontSize: 8.5, marginTop: 2 },
  stamp: { color: colors.textFaint, fontSize: 9.5, fontWeight: "600", letterSpacing: 0.2, marginTop: 2, opacity: 0.8 },
  stampDense: { fontSize: 8, marginTop: 1 },
});

const aj = StyleSheet.create({
  wrap: { ...card, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: colors.textDim, fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipTime: { color: colors.yellow, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  chipText: { color: colors.white, fontSize: 12, fontWeight: "700" },
});

const m = StyleSheet.create({
  card: { ...card, flex: 1, paddingHorizontal: 16, paddingVertical: 14, minWidth: 150 },
  cardHalf: { flex: 0, flexGrow: 1, flexBasis: "47%", minWidth: 140 },
  cardDense: { paddingHorizontal: 12, paddingVertical: 8, minWidth: 108 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  conn: { flexDirection: "row", alignItems: "center", gap: 4 },
  connDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  connText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", maxWidth: 96 },
  batIcon: { marginLeft: 2, transform: [{ rotate: "90deg" }] },
  label: { color: colors.textDim, fontSize: 11.5, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", flex: 1 },
  labelDense: { fontSize: 9.5, letterSpacing: 0.6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  pillDense: { paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  pillTextDense: { fontSize: 9.5 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  valueRowDense: { marginTop: 3, gap: 4 },
  value: { fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 44 },
  valueDense: { fontSize: 25, lineHeight: 28 },
  unit: { color: colors.textDim, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  unitDense: { fontSize: 11, marginBottom: 3 },
  sub: { color: colors.textDim, fontSize: 12.5, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
  subDense: { fontSize: 10, marginTop: 2 },
});

const sh = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: 8, ...card, paddingVertical: 8, paddingHorizontal: 12 },
  scroll: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  chipWeak: { borderColor: colors.red + "88", backgroundColor: colors.red + "18" },
  name: { color: colors.white, fontSize: 11.5, fontWeight: "800", maxWidth: 110, letterSpacing: 0.2 },
  reconnect: { color: colors.yellow, fontSize: 10.5, fontWeight: "800", fontStyle: "italic" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 1.5, height: 11 },
  bar: { width: 3, borderRadius: 1 },
  sigLabel: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  batWrap: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 2 },
  batIcon: { transform: [{ rotate: "90deg" }] },
  bat: { fontSize: 10.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
});

const cn = StyleSheet.create({
  panel: { ...card, padding: 14, gap: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  title: { color: colors.white, fontSize: 12.5, fontWeight: "800", letterSpacing: 1 },
  section: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginTop: 6, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6 },
  rowIcon: { width: 24, alignItems: "center" },
  rowLabel: { color: colors.white, fontSize: 13, fontWeight: "600", flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowState: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 6 },
  footer: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 11, marginTop: 10 },
  footerText: { fontSize: 11.5, fontWeight: "700" },
});

const sc = StyleSheet.create({
  panel: { ...card, padding: 16, gap: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  title: { color: colors.white, fontSize: 12.5, fontWeight: "800", letterSpacing: 1 },
  stat: { paddingVertical: 6 },
  label: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 3 },
  value: { color: colors.white, fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: 0.5 },
  unit: { color: colors.textDim, fontSize: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 4 },
});

const cb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12, ...card, borderColor: colors.yellow + "3A", backgroundColor: colors.yellow + "10", paddingVertical: 11, paddingHorizontal: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  name: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5 },
  msg: { color: colors.white, fontSize: 14, fontWeight: "600", lineHeight: 19, marginTop: 2 },
});

const ic = StyleSheet.create({
  card: { ...card, padding: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  value: { fontSize: 26, fontWeight: "900", marginTop: 8, fontVariant: ["tabular-nums"] },
  sub: { color: colors.textFaint, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
});

const ep = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, height: 30, paddingHorizontal: 2 },
});

const tc = StyleSheet.create({
  card: { ...card, padding: 14, paddingBottom: 24, minHeight: 100, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  stats: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 6 },
  stat: { alignItems: "flex-start" },
  statVal: { color: colors.white, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLbl: { color: colors.textFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 2 },
  profileWrap: { position: "absolute", left: 12, right: 12, bottom: 6 },
});

const st = StyleSheet.create({
  wrap: { ...card, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  title: { color: colors.white, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  laps: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.yellow + "12", borderWidth: 1, borderColor: colors.yellow + "33", borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 16 },
  lapsTime: { color: colors.yellow, fontSize: 32, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: 0.5 },
  lapsMeta: { alignItems: "flex-start" },
  lapsLabel: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  lapsStep: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 1 },
  timingRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  timeStat: { alignItems: "flex-end" },
  timeLabel: { color: colors.textFaint, fontSize: 8.5, fontWeight: "800", letterSpacing: 1 },
  timeValue: { color: colors.white, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.yellow, borderRadius: 4 },
  progressPct: { color: colors.yellow, fontSize: 11, fontWeight: "800", minWidth: 34, textAlign: "right" },
  nowNext: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  nnCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, minHeight: 58, overflow: "hidden" },
  nnNow: { backgroundColor: colors.yellow + "16", borderColor: colors.yellow + "44" },
  nnNext: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.border },
  nnArrow: { alignSelf: "center" },
  nnDot: { width: 12, height: 12, borderRadius: 6 },
  nnBody: { flex: 1 },
  nnTagNow: { backgroundColor: colors.yellow, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  nnTagNowText: { color: colors.bg, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  nnTagNext: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  nnTagNextText: { color: colors.textDim, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  nnName: { color: colors.white, fontSize: 16, fontWeight: "800" },
  nnMeta: { color: colors.textDim, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  nnCountdown: { alignItems: "flex-end", marginLeft: 6, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.yellow + "33" },
  nnCountValue: { color: colors.yellow, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: 0.5 },
  nnCountLabel: { color: colors.yellow, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: -1 },
  nnProgressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(255,255,255,0.10)" },
  nnProgressFill: { height: "100%", backgroundColor: colors.yellow },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 0 },
  seg: { height: "100%", justifyContent: "flex-end", paddingHorizontal: 2 },
  segBar: { width: "100%", borderRadius: 7, borderWidth: 1, overflow: "hidden", justifyContent: "flex-end" },
  segFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.yellow + "3A", borderRightWidth: 2, borderRightColor: colors.yellow },
  segLabel: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: 9, paddingVertical: 8, justifyContent: "flex-end", gap: 3 },
  segName: { color: colors.white, fontSize: 13.5, fontWeight: "800", ...textShadow("rgba(0,0,0,0.85)", 3) },
  segDesc: { color: "rgba(244,240,233,0.85)", fontSize: 11.5, fontWeight: "600", lineHeight: 15, ...textShadow("rgba(0,0,0,0.85)", 3) },
  segMeta: { color: colors.yellow, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"], ...textShadow("rgba(0,0,0,0.85)", 3) },
});

const sd = StyleSheet.create({
  panel: { width: 440, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { backgroundColor: colors.yellow + "1E", borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  badgeText: { color: colors.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  zoneDot: { width: 12, height: 12, borderRadius: 6 },
  title: { color: colors.white, fontSize: 22, fontWeight: "800", flex: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  stat: { width: "30%", minWidth: 110, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  statLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  statValue: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  tipBox: { flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: colors.yellow + "10", borderWidth: 1, borderColor: colors.yellow + "33", borderRadius: radius.md, padding: 12, marginTop: 2 },
  tipText: { color: colors.white, fontSize: 13, fontWeight: "600", lineHeight: 18, flex: 1 },
});

const wc = StyleSheet.create({
  card: { ...card, padding: 14, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  plan: { color: colors.yellow, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", flex: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.textDim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3 },
  title: { color: colors.white, fontSize: 18, fontWeight: "900", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 2 },
  desc: { color: colors.textDim, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  stepsHead: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  list: { marginTop: 2 },
  listContent: { gap: 5, paddingBottom: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm },
  stepCurrent: { backgroundColor: colors.yellow + "14", borderWidth: 1, borderColor: colors.yellow + "3A" },
  stepBar: { width: 4, alignSelf: "stretch", minHeight: 26, borderRadius: 2 },
  stepName: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  stepDesc: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 1 },
  stepRight: { alignItems: "flex-end", gap: 3, minWidth: 44 },
  stepDur: { color: colors.textDim, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
});

const bc = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap", columnGap: 8, ...card, backgroundColor: colors.nav, paddingHorizontal: 12, paddingVertical: 10 },
  group: { flex: 1 },
  groupInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },
  primary: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  round: { alignItems: "center", justifyContent: "center", gap: 4, minWidth: 92, height: 76, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  roundText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, height: 76, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16 },
  pillOn: { backgroundColor: "rgba(67,209,122,0.14)", borderColor: colors.green + "66" },
  pillOff: { backgroundColor: colors.card, borderColor: colors.border },
  pillDot: { width: 11, height: 11, borderRadius: 6 },
  pillText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  erg: { alignItems: "center", justifyContent: "center", height: 76, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  ergLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  ergRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 3 },
  ergBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  ergBtnSm: { width: 28, height: 28, borderRadius: 14 },
  ergValue: { color: colors.yellow, fontSize: 22, fontWeight: "800", minWidth: 60, textAlign: "center" },
  pause: { flexDirection: "row", alignItems: "center", gap: 8, height: 76, paddingHorizontal: 30, borderRadius: radius.md, backgroundColor: colors.yellow },
  pauseText: { color: colors.bg, fontSize: 20, fontWeight: "800" },
  end: { flexDirection: "row", alignItems: "center", gap: 8, height: 76, paddingHorizontal: 28, borderRadius: radius.md, backgroundColor: colors.red },
  endText: { color: "#fff", fontSize: 20, fontWeight: "800" },
});
