import React from "react";
import { Image, StyleProp, ViewStyle } from "react-native";
import Rive, { RiveRef, Fit, Alignment, BindByName } from "rive-react-native";
import {
  createRiderAnimator,
  CyclingTelemetry,
  CYCLING_NUMBER_KEYS,
  CYCLING_BOOLEAN_KEYS,
} from "@/src/lib/rider-animation";
import {
  RIVE_MODE,
  RIVE_ENABLED,
  RIVE_STATE_MACHINE,
  RIVE_VIEW_MODEL_INSTANCE,
  RIVE_BIKE_PROPERTY,
  RIVE_CLOTHING_PROPERTY,
  PROTOTYPE_ARTBOARD,
  PROTOTYPE_STATE_MACHINE,
  riderArtboardFor,
  bikeEnumValue,
  clothingEnumValue,
} from "@/src/lib/rive-profile";
import { RiderType, BikeType, ClothingStyle, wheelCircumferenceFor } from "@/src/lib/rider-config";

/**
 * Native Roujaune rider. Resolves the artboard from `riderType`, binds the
 * `CyclingTelemetry` View Model, selects nested bike + clothing variants via
 * data-bound enum properties, and drives all animation values from the pure
 * telemetry engine (wheel phase uses the selected bike's circumference).
 * Falls back to the chroma-keyed sprite if the .riv/artboard fails to load.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Rive loads .riv via a required asset
const RIDERS_RIV = require("../../../assets/rive/roujaune-riders.riv");

export type RiveRiderProps = {
  sprite: any;                 // fallback artwork (web / load failure)
  riderType: RiderType;
  bikeType: BikeType;
  clothingStyle: ClothingStyle;
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
  const { sprite, riderType, bikeType, clothingStyle, style } = props;
  const ref = React.useRef<RiveRef>(null);
  // Start "failed" (→ sprite fallback) whenever Rive is disabled, so the native
  // <Rive> component is never mounted against the placeholder .riv asset.
  const [failed, setFailed] = React.useState(!RIVE_ENABLED);
  const prototype = RIVE_MODE === "prototype";

  const inputsRef = React.useRef(props);
  inputsRef.current = props;

  const animatorRef = React.useRef(createRiderAnimator());
  const lastNum = React.useRef<Record<string, number>>({});
  const lastBool = React.useRef<Record<string, boolean>>({});

  // Push bike + clothing selections (nested variant switching) when they change.
  React.useEffect(() => {
    if (failed || prototype || !ref.current) return;
    try { ref.current.setString(RIVE_BIKE_PROPERTY, bikeEnumValue(bikeType)); } catch { /* prop absent */ }
    try { ref.current.setString(RIVE_CLOTHING_PROPERTY, clothingEnumValue(clothingStyle)); } catch { /* prop absent */ }
  }, [bikeType, clothingStyle, failed, prototype]);

  const pushProduction = React.useCallback((t: CyclingTelemetry) => {
    const r = ref.current;
    if (!r) return;
    for (const k of CYCLING_NUMBER_KEYS) {
      const v = t[k] as number;
      if (lastNum.current[k] !== v) { lastNum.current[k] = v; try { r.setNumber(k, v); } catch { /* noop */ } }
    }
    for (const k of CYCLING_BOOLEAN_KEYS) {
      const v = t[k] as boolean;
      if (lastBool.current[k] !== v) { lastBool.current[k] = v; try { r.setBoolean(k, v); } catch { /* noop */ } }
    }
  }, []);

  const pushPrototype = React.useCallback((t: CyclingTelemetry) => {
    const r = ref.current;
    if (!r) return;
    try { r.setInputState(PROTOTYPE_STATE_MACHINE, "cadence", t.cadenceRpm); } catch { /* noop */ }
    try { r.setInputState(PROTOTYPE_STATE_MACHINE, "effort", Math.round(t.effort01 * 100)); } catch { /* noop */ }
  }, []);

  React.useEffect(() => {
    if (failed) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const loop = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const p = inputsRef.current;
      const t = animatorRef.current.step(
        { ...p, wheelCircumferenceMetres: wheelCircumferenceFor(p.bikeType) },
        dt,
      );
      acc += dt;
      if (acc >= 1 / 30) {
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
      artboardName={prototype ? PROTOTYPE_ARTBOARD : riderArtboardFor(riderType)}
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
