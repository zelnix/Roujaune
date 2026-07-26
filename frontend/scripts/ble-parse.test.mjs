// Pure-function sanity tests for the BLE CSC / Cycling-Power parsers.
// Run: node frontend/scripts/ble-parse.test.mjs
import assert from "node:assert";

// --- Inline copies of the parse logic (kept in sync with src/lib/ble/parse.ts) ---
function u32(b, o) { return ((b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0); }

function parseCsc(bytes) {
  if (bytes.length < 1) return null;
  const flags = bytes[0];
  let off = 1;
  let wheel;
  if (flags & 0x01 && bytes.length >= off + 6) {
    wheel = { revs: u32(bytes, off), time: bytes[off+4] | (bytes[off+5]<<8), res: 1024 };
    off += 6;
  } else if (flags & 0x01) off += 6;
  let crank;
  if (flags & 0x02 && bytes.length >= off + 4) {
    crank = { revs: bytes[off] | (bytes[off+1]<<8), time: bytes[off+2] | (bytes[off+3]<<8) };
  }
  return { crank, wheel };
}

function cadenceFromCrank(prev, curr) {
  let dt = curr.time - prev.time; if (dt < 0) dt += 0x10000; if (dt === 0) return null;
  let dr = curr.revs - prev.revs; if (dr < 0) dr += 0x10000;
  const rpm = (dr * 1024 * 60) / dt;
  return rpm > 0 && rpm < 250 ? Math.round(rpm) : null;
}

function speedFromWheel(prev, curr, mm) {
  let dt = curr.time - prev.time; if (dt < 0) dt += 0x10000; if (dt === 0) return null;
  let dr = curr.revs - prev.revs; if (dr < 0) dr += 0x100000000;
  const seconds = dt / curr.res;
  const metres = (dr * mm) / 1000;
  const kmh = (metres / seconds) * 3.6;
  return kmh >= 0 && kmh < 150 ? Math.round(kmh*10)/10 : null;
}

// helpers to build byte arrays
const le16 = (v) => [v & 0xff, (v>>8)&0xff];
const le32 = (v) => [v & 0xff, (v>>8)&0xff, (v>>16)&0xff, (v>>>24)&0xff];

// 1) CSC with wheel + crank: flags=0x03
const csc = parseCsc(Uint8Array.from([0x03, ...le32(1000), ...le16(2048), ...le16(50), ...le16(1024)]));
assert.ok(csc.wheel && csc.crank, "csc parses both wheel and crank");
assert.equal(csc.wheel.revs, 1000);
assert.equal(csc.wheel.time, 2048);
assert.equal(csc.crank.revs, 50);
console.log("PASS: CSC parses wheel + crank");

// 2) Cadence: 60 crank revs over 1024 ticks (1s) => 60 rpm
assert.equal(cadenceFromCrank({revs:0,time:0},{revs:1,time:1024}), 60);
console.log("PASS: cadence 1 rev/s = 60 rpm");

// 3) Speed: 700x25c (2105mm), 1 rev over 1024 ticks (1s) => 2.105 m/s => 7.6 km/h
const sp = speedFromWheel({revs:0,time:0,res:1024},{revs:1,time:1024,res:1024}, 2105);
assert.equal(sp, 7.6);
console.log("PASS: speed 1 rev/s @2105mm = 7.6 km/h");

// 4) Speed with time rollover: prev.time=65000, curr.time=488 (wrap) dt=1024
const sp2 = speedFromWheel({revs:100,time:65000,res:1024},{revs:101,time:488,res:1024}, 2105);
assert.equal(sp2, 7.6);
console.log("PASS: speed handles event-time rollover");

// 5) uint32 revs rollover
const sp3 = speedFromWheel({revs:0xFFFFFFFF,time:0,res:1024},{revs:0,time:1024,res:1024}, 2105);
assert.equal(sp3, 7.6, "one rev across uint32 wrap");
console.log("PASS: speed handles uint32 rev rollover");

// 6) No new wheel event (same time) => null (hold last speed)
assert.equal(speedFromWheel({revs:5,time:2048,res:1024},{revs:5,time:2048,res:1024},2105), null);
console.log("PASS: no new wheel event returns null");

// 7) Realistic ~35 km/h: 2105mm wheel, need meters/s = 9.72 => revs/s = 4.62 => over 1s ~4.62 revs
const sp4 = speedFromWheel({revs:0,time:0,res:1024},{revs:4.62,time:1024,res:1024}, 2105);
assert.ok(sp4 > 34 && sp4 < 36, `~35km/h got ${sp4}`);
console.log(`PASS: realistic speed ~${sp4} km/h`);

console.log("\nAll BLE parse tests passed ✅");
