import React from "react";
import { AccessibilityInfo } from "react-native";
import { useA11y } from "./a11y";

/** True when motion should be reduced — either the OS "Reduce Motion" setting
 *  OR the app's own accessibility toggle (Settings → Accessibility). Used to
 *  drop non-essential transitions/loops for motion-sensitive 50+ riders. */
export function useReducedMotionSafe(): boolean {
  const [osReduced, setOsReduced] = React.useState(false);
  const a11y = useA11y();
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setOsReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setOsReduced(!!v));
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return osReduced || a11y.reduceMotion;
}
