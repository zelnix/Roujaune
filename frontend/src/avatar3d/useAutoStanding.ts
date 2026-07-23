import { useEffect, useState } from "react";

/** Decide when the rider stands out of the saddle to climb, from power + cadence.
 * Standing = a big-gear grind (high power, low cadence). Hysteresis stops the
 * rider flickering in/out of the saddle near the threshold. */
export function useAutoStanding(power: number, cadence: number): boolean {
  const [standing, setStanding] = useState(false);
  useEffect(() => {
    setStanding((prev) => {
      if (!prev && power >= 285 && cadence <= 74) return true;
      if (prev && (power <= 245 || cadence >= 84)) return false;
      return prev;
    });
  }, [power, cadence]);
  return standing;
}
