import React from "react";
import { Image, StyleProp, ViewStyle } from "react-native";
import Rive, { RiveRef, Fit, Alignment, BindByName } from "rive-react-native";
import {
  createRiderAnimator,
  CyclingTelemetry,
  CYCLING_NUMBER_KEYS,
  CYCLING_BOOLEAN_KEYS,
  RiderArtboard,
} from "@/src/lib/rider-animation";
import {
  RIVE_MODE,
  RIVE_STATE_MACHINE,
  RIVE_VIEW_MODEL_INSTANCE,
  PROTOTYPE_ARTBOARD,
  PROTOTYPE_STATE_MACHINE,
} from "@/src/lib/rive-profile";

/**
 * Native (iOS/Android) Roujaune rider. Renders one of four rider artboards from
 * the production `roujaune-riders.riv` and drives its `CyclingTelemetry` View
 * Model via Data Binding. All animation values are derived by the pure
 * telemetry engine and pushed each frame (diffed to avoid redundant native
 * calls). Falls back to the chroma-keyed sprite if the file/artboard fails to
 * load (e.g. while the placeholder is still in place).
 *
 * A prototype-compatibility mode (RIVE_MODE = "prototype") instead drives a
 * simple Artboard "Rider" / State Machine "Ride" with cadence + effort inputs.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Rive loads .riv via a required asset
const RIDERS_RIV = require("../../../assets/rive/roujaune-riders.riv");

export type RiveRiderProps = {
  sprite: any;                 // fallback artwork (web / load failure)
  riderArtboard: RiderArtboard;
  cadenceRpm: number;
  powerWatts: number;
  speedKph: number;
  heartRateBpm?: number;
  gradientPct?: number;
  curve?: number;
  leanDeg?: number;
  ftp?: number;
  isConnected?: boolean;
  isPaused?: boolean;
  isSimulation?: boolean;
  isPedalling?: boolean;
  signalLost?: boolean;
  emergencyStop?: boolean;
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RiveRider(props: RiveRiderProps) {
  const { sprite, riderArtboard, style } = props;
  const ref = React.useRef<RiveRef>(null);
  const [failed, setFailed] = React.useState(false);
  const prototype = RIVE_MODE === "prototype";

  // Latest inputs, read by the animation loop without re-subscribing.
  const inputsRef = React.useRef(props);
  inputsRef.current = props;

  const animatorRef = React.useRef(createRiderAnimator());
  const lastNum = React.useRef<Record<string, number>>({});
  const lastBool = React.useRef<Record<string, boolean>>({});

  const pushProduction = React.useCallback((t: CyclingTelemetry) => {
    const r = ref.current;
    if (!r) return;
    for (const k of CYCLING_NUMBER_KEYS) {
      const v = t[k] as number;
      if (lastNum.current[k] !== v) {
        lastNum.current[k] = v;
        try { r.setNumber(k, v); } catch { /* prop absent / not ready */ }
      }
    }
    for (const k of CYCLING_BOOLEAN_KEYS) {
      const v = t[k] as boolean;
      if (lastBool.current[k] !== v) {
        lastBool.current[k] = v;
        try { r.setBoolean(k, v); } catch { /* prop absent / not ready */ }
      }
    }
  }, []);

  const pushPrototype = React.useCallback((t: CyclingTelemetry) => {
    const r = ref.current;
    if (!r) return;
    try { r.setInputState(PROTOTYPE_STATE_MACHINE, "cadence", t.cadenceRpm); } catch { /* noop */ }
    try { r.setInputState(PROTOTYPE_STATE_MACHINE, "effort", Math.round(t.effort01 * 100)); } catch { /* noop */ }
  }, []);

  // Drive the animation from a rAF loop with real delta-time.
  React.useEffect(() => {
    if (failed) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const loop = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const t = animatorRef.current.step(inputsRef.current, dt);
      acc += dt;
      if (acc >= 1 / 30) { // throttle native writes to ~30fps
        acc = 0;
        if (prototype) pushPrototype(t); else pushProduction(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [failed, prototype, pushProduction, pushPrototype]);

  if (failed) {
    return <Image source={sprite} style={style as any} resizeMode="contain" />;
  }

  return (
    <Rive
      ref={ref}
      source={RIDERS_RIV}
      artboardName={prototype ? PROTOTYPE_ARTBOARD : riderArtboard}
      stateMachineName={prototype ? PROTOTYPE_STATE_MACHINE : RIVE_STATE_MACHINE}
      dataBinding={prototype ? undefined : BindByName(RIVE_VIEW_MODEL_INSTANCE)}
      autoplay
      fit={Fit.Contain}
      alignment={Alignment.BottomCenter}
      style={style as any}
      onError={() => setFailed(true)}
    />
  );
}
