import type { BleDevice, BleReadings, PermState } from "./useBleSensors";

/**
 * Web / preview stub — Web Bluetooth is not used here. `supported` is false so
 * the workout screen shows the "needs a native build" guidance.
 */
export function useBleSensors(_wheelCircumferenceMm?: number) {
  const readings: BleReadings = { power: null, cadence: null, hr: null, speed: null, ts: 0 };
  const noop = async () => {};
  return {
    supported: false,
    poweredOn: false,
    scanning: false,
    devices: [] as BleDevice[],
    connected: [] as BleDevice[],
    readings,
    permissionStatus: "unknown" as PermState,
    error: null as string | null,
    requestPermission: async () => false,
    startScan: noop,
    stopScan: () => {},
    connect: noop,
    disconnect: noop,
  };
}
