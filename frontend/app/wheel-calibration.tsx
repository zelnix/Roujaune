import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { CC } from "@/src/components/calendar";
import { useBleSensors } from "@/src/hooks/useBleSensors";
import { BleSensorsPanel } from "@/src/components/BleSensorsPanel";
import { useSettings, nearestWheelPreset } from "@/src/lib/settings";
import { haversineMeters } from "@/src/lib/geo";

type Phase = "idle" | "running" | "done";
type LocPerm = "unknown" | "granted" | "denied" | "blocked";

// Reliable-result thresholds — enough revolutions + distance for GPS noise to
// average out to a trustworthy roll-out figure.
const MIN_DISTANCE_M = 50;
const MIN_REVS = 20;
const GOOD_DISTANCE_M = 200;

function revsDelta(start: number, curr: number): number {
  let d = curr - start;
  if (d < 0) d += 0x100000000; // uint32 wheel-counter rollover
  return d;
}

export default function WheelCalibrationScreen() {
  const router = useRouter();
  const { settings, setSetting } = useSettings();
  const ble = useBleSensors(settings.wheelCircumference);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [showBle, setShowBle] = React.useState(false);
  const [locPerm, setLocPerm] = React.useState<LocPerm>("unknown");
  const [distanceM, setDistanceM] = React.useState(0);
  const [startRevs, setStartRevs] = React.useState<number | null>(null);
  const [currRevs, setCurrRevs] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const watchRef = React.useRef<Location.LocationSubscription | null>(null);
  const lastFix = React.useRef<{ lat: number; lon: number } | null>(null);

  // Is fresh wheel data streaming from a connected speed sensor?
  const wheelLive = ble.readings.wheelRevs != null && ble.readings.ts > 0 && Date.now() - ble.readings.ts < 6000;

  // Keep the live revolution counter fresh while calibrating.
  React.useEffect(() => {
    if (phase === "running" && ble.readings.wheelRevs != null) setCurrRevs(ble.readings.wheelRevs);
  }, [phase, ble.readings.wheelRevs, ble.readings.ts]);

  const stopWatch = React.useCallback(() => {
    try { watchRef.current?.remove(); } catch { /* noop */ }
    watchRef.current = null;
  }, []);

  React.useEffect(() => () => stopWatch(), [stopWatch]);

  const ensureLocation = React.useCallback(async (): Promise<boolean> => {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status === "granted") { setLocPerm("granted"); return true; }
    if (!cur.canAskAgain) { setLocPerm("blocked"); return false; }
    const req = await Location.requestForegroundPermissionsAsync();
    if (req.status === "granted") { setLocPerm("granted"); return true; }
    setLocPerm(req.canAskAgain ? "denied" : "blocked");
    return false;
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    if (ble.readings.wheelRevs == null) {
      setError("Connect a speed / wheel sensor and start pedalling so revolutions come through first.");
      return;
    }
    const ok = await ensureLocation();
    if (!ok) return;
    setDistanceM(0);
    lastFix.current = null;
    setStartRevs(ble.readings.wheelRevs);
    setCurrRevs(ble.readings.wheelRevs);
    setResult(null);
    setPhase("running");
    try {
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (accuracy != null && accuracy > 25) return; // skip low-confidence fixes
          const prev = lastFix.current;
          if (prev) {
            const step = haversineMeters(prev.lat, prev.lon, latitude, longitude);
            if (step >= 1 && step <= 100) setDistanceM((d) => d + step); // ignore jitter + jumps
          }
          lastFix.current = { lat: latitude, lon: longitude };
        }
      );
    } catch {
      setError("Couldn't start GPS tracking. Head outdoors with a clear sky view and try again.");
      setPhase("idle");
    }
  }, [ble.readings.wheelRevs, ensureLocation]);

  const revs = startRevs != null && currRevs != null ? revsDelta(startRevs, currRevs) : 0;
  const liveCirc = distanceM > 0 && revs > 0 ? (distanceM * 1000) / revs : null;
  const canSave = distanceM >= MIN_DISTANCE_M && revs >= MIN_REVS && liveCirc != null && liveCirc >= 1000 && liveCirc <= 2400;

  const finish = React.useCallback(() => {
    stopWatch();
    if (!canSave || liveCirc == null) {
      setError(`Ride a bit further — need at least ${MIN_DISTANCE_M} m and ${MIN_REVS} wheel turns for a reliable result.`);
      setPhase("idle");
      return;
    }
    const mm = Math.round(liveCirc);
    setResult(mm);
    setSetting("wheelCircumference", mm);
    setPhase("done");
  }, [canSave, liveCirc, setSetting, stopWatch]);

  const reset = React.useCallback(() => {
    stopWatch();
    setPhase("idle"); setDistanceM(0); setStartRevs(null); setCurrRevs(null); setResult(null); setError(null);
  }, [stopWatch]);

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar hidden />
      <View style={s.header}>
        <Pressable testID="cal-back" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={CC.dim} />
          <Text style={s.backText}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleWrap}>
          <View style={s.badge}><Ionicons name="locate" size={20} color={CC.rouge} /></View>
          <Text style={s.title}>GPS wheel calibration</Text>
          <Text style={s.sub}>
            Ride a straight ~{GOOD_DISTANCE_M} m outdoors with your speed sensor connected. We measure the real distance
            by GPS and count your wheel turns to compute your exact roll-out — far more accurate than a tyre preset.
          </Text>
        </View>

        {!ble.supported ? (
          <View style={[s.card, s.notice]} testID="cal-unsupported">
            <Ionicons name="bluetooth" size={22} color={CC.yellow} />
            <Text style={s.noticeText}>
              Calibration needs Bluetooth + GPS, which run only in a native build. Publish your app and generate an
              iOS/Android build to calibrate with a real speed sensor — it can&apos;t run in the web preview or Expo Go.
            </Text>
          </View>
        ) : (
          <>
            {/* Sensor status */}
            <View style={s.card} testID="cal-sensor">
              <View style={s.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Speed sensor</Text>
                  <Text style={s.cardSub}>
                    {ble.connected.length === 0
                      ? "No sensor connected yet."
                      : wheelLive
                        ? "Connected · wheel data streaming."
                        : "Connected · spin the wheel to stream data."}
                  </Text>
                </View>
                <View style={[s.dot, wheelLive ? s.dotOn : s.dotOff]} />
              </View>
              <Pressable testID="cal-connect" onPress={() => setShowBle(true)} style={s.secondaryBtn}>
                <Ionicons name="bluetooth" size={16} color={CC.white} />
                <Text style={s.secondaryText}>{ble.connected.length === 0 ? "Connect a speed sensor" : "Manage sensors"}</Text>
              </Pressable>
            </View>

            {/* Live metrics */}
            <View style={s.metricsRow}>
              <Metric label="GPS DISTANCE" value={distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km` : `${Math.round(distanceM)} m`} />
              <Metric label="WHEEL TURNS" value={phase === "idle" && startRevs == null ? "—" : String(revs)} />
              <Metric label="ROLL-OUT" value={liveCirc != null ? `${Math.round(liveCirc)} mm` : "—"} highlight />
            </View>

            {locPerm === "blocked" && (
              <Pressable testID="cal-open-settings" style={s.warnBtn} onPress={() => Linking.openSettings()}>
                <Ionicons name="settings-outline" size={16} color="#fff" />
                <Text style={s.warnBtnText}>Open Settings to allow Location</Text>
              </Pressable>
            )}
            {locPerm === "denied" && (
              <Text style={s.hintWarn}>Location is needed to measure the ride distance. Tap Start to allow it.</Text>
            )}
            {error && <Text style={s.hintWarn} testID="cal-error">{error}</Text>}

            {/* Result banner */}
            {phase === "done" && result != null && (() => {
              const near = nearestWheelPreset(result);
              const sign = near.delta > 0 ? "+" : "";
              const matchExact = near.delta === 0;
              const off = Math.abs(near.delta);
              const trust = off <= 25; // within ~1% of a known tyre → high confidence
              return (
                <View style={[s.card, s.resultCard]} testID="cal-result">
                  <Ionicons name="checkmark-circle" size={22} color={CC.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultTitle}>Calibrated to {result} mm</Text>
                    <Text style={s.resultCompare} testID="cal-compare">
                      {matchExact
                        ? `Spot-on match for ${near.label}.`
                        : `Closest to ${near.label} (${sign}${near.delta} mm).`}
                    </Text>
                    <Text style={s.cardSub}>
                      {trust
                        ? "Within a normal tolerance — this looks reliable and is now saved."
                        : "That's a fair bit off the nearest tyre — re-run on a longer, straighter stretch if it looks wrong. Saved for now."}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Controls */}
            {phase !== "running" ? (
              <Pressable testID="cal-start" onPress={start} style={[s.primaryBtn, !wheelLive && s.primaryBtnDim]}>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={s.primaryText}>{phase === "done" ? "Calibrate again" : "Start calibration ride"}</Text>
              </Pressable>
            ) : (
              <View style={s.controlRow}>
                <Pressable testID="cal-stop" onPress={finish} style={[s.primaryBtn, { flex: 1 }, !canSave && s.primaryBtnDim]}>
                  <Ionicons name="save" size={18} color="#fff" />
                  <Text style={s.primaryText}>Stop &amp; save</Text>
                </Pressable>
                <Pressable testID="cal-cancel" onPress={reset} style={s.ghostBtn}>
                  <Text style={s.ghostText}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {phase === "running" && (
              <Text style={s.progressHint}>
                {canSave
                  ? "Great — enough data captured. Stop whenever you're ready."
                  : `Keep riding straight… aim for ${GOOD_DISTANCE_M} m for the best accuracy.`}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {showBle && (
        <BleSensorsPanel
          supported={ble.supported}
          poweredOn={ble.poweredOn}
          scanning={ble.scanning}
          devices={ble.devices}
          connected={ble.connected}
          readings={ble.readings}
          permissionStatus={ble.permissionStatus}
          error={ble.error}
          onScan={ble.startScan}
          onStopScan={ble.stopScan}
          onConnect={ble.connect}
          onDisconnect={ble.disconnect}
          onClose={() => setShowBle(false)}
          units={settings.units}
        />
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[s.metric, highlight && s.metricHi]}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, highlight && { color: CC.rouge }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CC.bg },
  header: { paddingHorizontal: 22, paddingTop: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  backText: { color: CC.dim, fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 22, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" },
  titleWrap: { alignItems: "center", gap: 8, marginTop: 8 },
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(201,23,39,0.12)", alignItems: "center", justifyContent: "center" },
  title: { color: CC.white, fontSize: 24, fontWeight: "800" },
  sub: { color: CC.dim, fontSize: 13, lineHeight: 19, textAlign: "center" },

  card: { backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.border, padding: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardTitle: { color: CC.white, fontSize: 15, fontWeight: "800" },
  cardSub: { color: CC.dim, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotOn: { backgroundColor: CC.green },
  dotOff: { backgroundColor: "rgba(255,255,255,0.2)" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 46 },
  secondaryText: { color: CC.white, fontSize: 13.5, fontWeight: "700" },

  metricsRow: { flexDirection: "row", gap: 12 },
  metric: { flex: 1, backgroundColor: CC.card, borderRadius: 16, borderWidth: 1, borderColor: CC.borderSoft, paddingVertical: 18, paddingHorizontal: 12, alignItems: "center" },
  metricHi: { borderColor: "rgba(201,23,39,0.4)" },
  metricLabel: { color: CC.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  metricValue: { color: CC.white, fontSize: 22, fontWeight: "900", marginTop: 6 },

  notice: { flexDirection: "row", gap: 12, alignItems: "center" },
  noticeText: { flex: 1, color: CC.dim, fontSize: 12.5, lineHeight: 18 },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 14, paddingVertical: 15, minHeight: 52 },
  primaryBtnDim: { opacity: 0.55 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  controlRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  ghostBtn: { paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: CC.border, backgroundColor: "rgba(255,255,255,0.03)" },
  ghostText: { color: CC.dim, fontSize: 14, fontWeight: "700" },
  progressHint: { color: CC.dim, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  hintWarn: { color: "#F5A623", fontSize: 12.5, textAlign: "center", lineHeight: 18 },

  warnBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.rouge, borderRadius: 12, paddingVertical: 12, minHeight: 46 },
  warnBtnText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },

  resultCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderColor: "rgba(46,196,124,0.4)" },
  resultTitle: { color: CC.white, fontSize: 16, fontWeight: "800" },
  resultCompare: { color: CC.white, fontSize: 13, fontWeight: "700", marginTop: 3 },
});
