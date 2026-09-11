// Parsers for standard Bluetooth GATT cycling / heart-rate characteristics.
// ble-plx delivers characteristic values as base64 strings.

// Standard 16-bit BLE assigned numbers (expanded to full 128-bit UUIDs).
export const UUID = {
  heartRate: "0000180d-0000-1000-8000-00805f9b34fb",
  heartRateMeasurement: "00002a37-0000-1000-8000-00805f9b34fb",
  cyclingPower: "00001818-0000-1000-8000-00805f9b34fb",
  cyclingPowerMeasurement: "00002a63-0000-1000-8000-00805f9b34fb",
  csc: "00001816-0000-1000-8000-00805f9b34fb",
  cscMeasurement: "00002a5b-0000-1000-8000-00805f9b34fb",
  // Fitness Machine Service (FTMS) — smart trainer read + control.
  fitnessMachine: "00001826-0000-1000-8000-00805f9b34fb",
  indoorBikeData: "00002ad2-0000-1000-8000-00805f9b34fb",
  fitnessMachineControlPoint: "00002ad9-0000-1000-8000-00805f9b34fb",
  fitnessMachineStatus: "00002ada-0000-1000-8000-00805f9b34fb",
  fitnessMachineFeature: "00002acc-0000-1000-8000-00805f9b34fb",
  battery: "0000180f-0000-1000-8000-00805f9b34fb",
  batteryLevel: "00002a19-0000-1000-8000-00805f9b34fb",
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function b64ToBytes(b64: string): Uint8Array {
  const clean = (b64 || "").replace(/=+$/, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Encode bytes → base64 (ble-plx writes characteristic values as base64). */
export function bytesToB64(bytes: number[] | Uint8Array): string {
  const arr = Array.from(bytes);
  let out = "";
  let i = 0;
  for (; i + 2 < arr.length; i += 3) {
    const n = (arr[i] << 16) | (arr[i + 1] << 8) | arr[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = arr.length - i;
  if (rem === 1) {
    const n = arr[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rem === 2) {
    const n = (arr[i] << 16) | (arr[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

/** Heart Rate Measurement (0x2A37) → bpm. */
export function parseHeartRate(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const is16 = (flags & 0x01) === 1;
  const hr = is16 ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return hr > 0 ? hr : null;
}

export type CrankSample = { revs: number; time: number }; // time in 1/1024 s
// Cumulative wheel revolutions (uint32) + last event time. `res` is the event
// time resolution in ticks/second (1/2048 s for Cycling Power, 1/1024 s for CSC).
export type WheelSample = { revs: number; time: number; res: number };

export type CyclingPower = { power: number; balance?: number | null; crank?: CrankSample; wheel?: WheelSample };

/** Read an unsigned 32-bit little-endian value. */
function u32(bytes: Uint8Array, off: number): number {
  return ((bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0);
}

/** Cycling Power Measurement (0x2A63) → instantaneous power (+ optional wheel / crank data). */
export function parseCyclingPower(bytes: Uint8Array): CyclingPower | null {
  if (bytes.length < 4) return null;
  const flags = bytes[0] | (bytes[1] << 8);
  // Instantaneous power is a signed 16-bit value at offset 2.
  let power = bytes[2] | (bytes[3] << 8);
  if (power > 0x7fff) power -= 0x10000;
  let off = 4;
  // Pedal Power Balance (0.5% units) — advanced power meters report left-side
  // contribution; a persistent lean off 50% is an early muscular-fatigue sign.
  let balance: number | null = null;
  if (flags & 0x01) { balance = Math.round((bytes[off] * 0.5) * 10) / 10; off += 1; }
  if (flags & 0x04) off += 2; // Accumulated Torque
  let wheel: WheelSample | undefined;
  if (flags & 0x10 && bytes.length >= off + 6) {
    // Wheel Revolution Data: uint32 revolutions + uint16 event time (1/2048 s).
    const revs = u32(bytes, off);
    const time = bytes[off + 4] | (bytes[off + 5] << 8);
    wheel = { revs, time, res: 2048 };
    off += 6;
  } else if (flags & 0x10) {
    off += 6;
  }
  let crank: CrankSample | undefined;
  if (flags & 0x20 && bytes.length >= off + 4) {
    const revs = bytes[off] | (bytes[off + 1] << 8);
    const time = bytes[off + 2] | (bytes[off + 3] << 8);
    crank = { revs, time };
  }
  return { power: Math.max(0, power), balance, crank, wheel };
}

/** Cycling Speed & Cadence Measurement (0x2A5B) → optional wheel (speed) + crank (cadence) data. */
export function parseCsc(bytes: Uint8Array): { crank?: CrankSample; wheel?: WheelSample } | null {
  if (bytes.length < 1) return null;
  const flags = bytes[0];
  let off = 1;
  let wheel: WheelSample | undefined;
  if (flags & 0x01 && bytes.length >= off + 6) {
    // Wheel Revolution Data: uint32 revolutions + uint16 event time (1/1024 s).
    const revs = u32(bytes, off);
    const time = bytes[off + 4] | (bytes[off + 5] << 8);
    wheel = { revs, time, res: 1024 };
    off += 6;
  } else if (flags & 0x01) {
    off += 6;
  }
  let crank: CrankSample | undefined;
  if (flags & 0x02 && bytes.length >= off + 4) {
    const revs = bytes[off] | (bytes[off + 1] << 8);
    const time = bytes[off + 2] | (bytes[off + 3] << 8);
    crank = { revs, time };
  }
  return { crank, wheel };
}

/**
 * Compute cadence (rpm) from two consecutive crank samples.
 * Event time is in 1/1024 s and wraps at 65536; revolutions wrap at 65536.
 */
export function cadenceFromCrank(prev: CrankSample, curr: CrankSample): number | null {
  let dt = curr.time - prev.time;
  if (dt < 0) dt += 0x10000; // time rollover
  if (dt === 0) return null; // no new event → keep last known cadence
  let dr = curr.revs - prev.revs;
  if (dr < 0) dr += 0x10000; // revs rollover
  const rpm = (dr * 1024 * 60) / dt;
  return rpm > 0 && rpm < 250 ? Math.round(rpm) : null;
}

/**
 * Compute speed (km/h) from two consecutive wheel samples and the wheel
 * circumference in millimetres. Event time wraps at 65536; the uint32
 * revolution counter wraps at 2^32.
 */
export function speedFromWheel(prev: WheelSample, curr: WheelSample, circumferenceMm: number): number | null {
  let dt = curr.time - prev.time;
  if (dt < 0) dt += 0x10000; // time rollover
  if (dt === 0) return null; // no new wheel event → keep last known speed
  let dr = curr.revs - prev.revs;
  if (dr < 0) dr += 0x100000000; // uint32 revs rollover
  const seconds = dt / curr.res;
  const metres = (dr * circumferenceMm) / 1000;
  const kmh = (metres / seconds) * 3.6;
  return kmh >= 0 && kmh < 150 ? Math.round(kmh * 10) / 10 : null;
}


export type IndoorBike = { speed?: number; cadence?: number; power?: number; hr?: number };

/**
 * FTMS Indoor Bike Data (0x2AD2) → instantaneous speed / cadence / power / HR.
 * Fields are laid out per the 16-bit flags header; we walk the offset in the
 * exact field order defined by the Fitness Machine spec.
 */
export function parseIndoorBikeData(bytes: Uint8Array): IndoorBike | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0] | (bytes[1] << 8);
  let off = 2;
  const u16 = () => { const v = bytes[off] | (bytes[off + 1] << 8); off += 2; return v; };
  const s16 = () => { let v = u16(); if (v > 0x7fff) v -= 0x10000; return v; };
  const res: IndoorBike = {};
  // bit0 == 0 → Instantaneous Speed present (0.01 km/h).
  if ((flags & 0x0001) === 0 && bytes.length >= off + 2) res.speed = Math.round(u16() * 0.01 * 10) / 10;
  if (flags & 0x0002) off += 2;                                    // Average Speed
  if (flags & 0x0004 && bytes.length >= off + 2) res.cadence = Math.round(u16() * 0.5); // Instantaneous Cadence (0.5 rpm)
  if (flags & 0x0008) off += 2;                                    // Average Cadence
  if (flags & 0x0010) off += 3;                                    // Total Distance (uint24)
  if (flags & 0x0020) off += 2;                                    // Resistance Level
  if (flags & 0x0040 && bytes.length >= off + 2) res.power = s16(); // Instantaneous Power (W)
  if (flags & 0x0080) off += 2;                                    // Average Power
  if (flags & 0x0100) off += 5;                                    // Expended Energy (2+2+1)
  if (flags & 0x0200 && bytes.length >= off + 1) { res.hr = bytes[off]; off += 1; } // Heart Rate (bpm)
  return res;
}

/**
 * FTMS Fitness Machine Control Point (0x2AD9) command builders. Each returns the
 * raw op-code + parameter bytes to write (with response) to the control point.
 */
export const FTMSControl = {
  requestControl: (): number[] => [0x00],
  reset: (): number[] => [0x01],
  // Set Target Resistance Level (0x04) — device-specific level (uint8).
  setResistance: (level: number): number[] => [0x04, Math.max(0, Math.min(200, Math.round(level))) & 0xff],
  // Set Target Power / ERG (0x05) — target power in watts (sint16 LE).
  setTargetPower: (watts: number): number[] => {
    const w = Math.max(0, Math.min(2000, Math.round(watts)));
    return [0x05, w & 0xff, (w >> 8) & 0xff];
  },
  start: (): number[] => [0x07],
  stop: (): number[] => [0x08, 0x01],
  // Set Indoor Bike Simulation Parameters (0x11): wind(0.001 m/s), grade(0.01 %),
  // Crr(0.0001), Cw(0.01). We fix wind=0 and typical Crr/Cw so grade drives feel.
  setSimGrade: (gradePct: number): number[] => {
    const g100 = Math.round(Math.max(-40, Math.min(40, gradePct)) * 100);
    const g = g100 < 0 ? g100 + 0x10000 : g100;
    return [0x11, 0x00, 0x00, g & 0xff, (g >> 8) & 0xff, 40, 51];
  },
};
