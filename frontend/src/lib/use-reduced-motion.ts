import React from "react";
import { AccessibilityInfo } from "react-native";

/** True when the OS "Reduce Motion" preference is enabled. Used to drop
 *  non-essential transitions for motion-sensitive riders. */
export function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setReduced(!!v));
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduced;
}
