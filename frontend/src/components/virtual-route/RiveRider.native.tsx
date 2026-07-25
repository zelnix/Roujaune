import React from "react";
import { Image, StyleProp, ViewStyle } from "react-native";
import Rive, { RiveRef, Fit, Alignment } from "rive-react-native";

/**
 * Native (iOS/Android) rider: a bone-rigged Rive cyclist whose pedalling speed
 * is driven live by the rider's cadence (and effort/strain on climbs). Falls
 * back to the chroma-keyed sprite if the .riv fails to load (e.g. the
 * placeholder is still in place before a real asset is exported).
 *
 * Expected .riv spec — Artboard: "Rider", State Machine: "Ride",
 * Number inputs: "cadence" (0–130), "effort" (0–100).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Rive loads .riv via a required asset
const RIDER_RIV = require("../../../assets/rive/rider.riv");
const STATE_MACHINE = "Ride";

export function RiveRider({ sprite, cadence = 0, effort = 0, style }: {
  sprite: any;
  cadence?: number;
  speed?: number;
  effort?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = React.useRef<RiveRef>(null);
  const [failed, setFailed] = React.useState(false);

  const setInput = React.useCallback((name: string, value: number) => {
    if (!ref.current) return;
    try {
      ref.current.setInputState(STATE_MACHINE, name, value);
    } catch {
      /* input not present yet / view not ready — retried on next update */
    }
  }, []);

  React.useEffect(() => {
    setInput("cadence", Math.max(0, Math.min(130, Math.round(cadence))));
  }, [cadence, setInput]);

  React.useEffect(() => {
    setInput("effort", Math.max(0, Math.min(100, Math.round(effort))));
  }, [effort, setInput]);

  if (failed) {
    return <Image source={sprite} style={style as any} resizeMode="contain" />;
  }

  return (
    <Rive
      ref={ref}
      source={RIDER_RIV}
      artboardName="Rider"
      stateMachineName={STATE_MACHINE}
      autoplay
      fit={Fit.Contain}
      alignment={Alignment.BottomCenter}
      style={style as any}
      onError={() => setFailed(true)}
    />
  );
}
