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

/** Heart Rate Measurement (0x2A37) → bpm. */
export function parseHeartRate(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const is16 = (flags & 0x01) === 1;
  const hr = is16 ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return hr > 0 ? hr : null;
}

export type CrankSample = { revs: number; time: number }; // time in 1/1024 s

export type CyclingPower = { power: number; crank?: CrankSample };

/** Cycling Power Measurement (0x2A63) → instantaneous power (+ optional crank data). */
export function parseCyclingPower(bytes: Uint8Array): CyclingPower | null {
  if (bytes.length < 4) return null;
  const flags = bytes[0] | (bytes[1] << 8);
  // Instantaneous power is a signed 16-bit value at offset 2.
  let power = bytes[2] | (bytes[3] << 8);
  if (power > 0x7fff) power -= 0x10000;
  let off = 4;
  if (flags & 0x01) off += 1; // Pedal Power Balance
  if (flags & 0x04) off += 2; // Accumulated Torque
  if (flags & 0x10) off += 6; // Wheel Revolution Data (uint32 + uint16)
  let crank: CrankSample | undefined;
  if (flags & 0x20 && bytes.length >= off + 4) {
    const revs = bytes[off] | (bytes[off + 1] << 8);
    const time = bytes[off + 2] | (bytes[off + 3] << 8);
    crank = { revs, time };
  }
  return { power: Math.max(0, power), crank };
}

/** Cycling Speed & Cadence Measurement (0x2A5B) → optional crank data for cadence. */
export function parseCsc(bytes: Uint8Array): { crank?: CrankSample } | null {
  if (bytes.length < 1) return null;
  const flags = bytes[0];
  let off = 1;
  if (flags & 0x01) off += 6; // Wheel Revolution Data (uint32 + uint16)
  let crank: CrankSample | undefined;
  if (flags & 0x02 && bytes.length >= off + 4) {
    const revs = bytes[off] | (bytes[off + 1] << 8);
    const time = bytes[off + 2] | (bytes[off + 3] << 8);
    crank = { revs, time };
  }
  return { crank };
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
