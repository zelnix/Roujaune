import { Platform } from "react-native";

/**
 * ANT+ FE-C (Fitness Equipment Control) scaffold — Android-only, future work.
 *
 * ANT+ is a separate radio protocol from Bluetooth. It requires a dedicated ANT
 * radio plus Garmin's ANT+ services, and a native module bridging them:
 *   • iOS       — NO ANT+ support at all (no ANT radio). Not possible.
 *   • Android   — only on ANT-capable hardware, via a native ANT+ module.
 *
 * No maintained cross-platform Expo/React Native ANT+ module exists yet, so this
 * file is an intentional placeholder that always reports "unavailable". It lets
 * the UI surface an honest state today and gives us a single integration point
 * to wire a real native ANT module into later (setTargetPower / setGrade mirror
 * the FTMS control surface so callers stay identical).
 */
export const ANT_FEC_SUPPORTED = false;

export const ANT_FEC_PLATFORM_NOTE =
  Platform.OS === "android"
    ? "ANT+ FE-C needs an ANT-capable Android device and a native ANT module — planned for a future build. Use Bluetooth FTMS today."
    : "ANT+ FE-C isn't available on iOS (no ANT radio). Use Bluetooth FTMS instead.";

export type AntFecController = {
  available: boolean;
  connect: () => Promise<boolean>;
  setTargetPower: (watts: number) => Promise<boolean>;
  setGrade: (pct: number) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

export function getAntFecController(): AntFecController {
  return {
    available: ANT_FEC_SUPPORTED,
    connect: async () => false,
    setTargetPower: async () => false,
    setGrade: async () => false,
    disconnect: async () => {},
  };
}
