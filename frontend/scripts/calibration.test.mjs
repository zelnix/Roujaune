// Tests for GPS wheel-calibration maths (haversine + roll-out computation).
import assert from "node:assert";

function haversineMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function revsDelta(start, curr) { let d = curr - start; if (d < 0) d += 0x100000000; return d; }

// 1) Haversine: ~111.19 m per 0.001° latitude near equator
const d = haversineMeters(0, 0, 0.001, 0);
assert.ok(Math.abs(d - 111.19) < 0.5, `lat 0.001deg ~111m, got ${d}`);
console.log(`PASS: haversine 0.001deg lat = ${d.toFixed(2)} m`);

// 2) Zero distance for identical points
assert.equal(haversineMeters(43.71, 7.26, 43.71, 7.26), 0);
console.log("PASS: haversine identical point = 0");

// 3) revs delta rollover at uint32 boundary
assert.equal(revsDelta(0xFFFFFFF0, 0x0000000F), 31);
console.log("PASS: revs delta handles uint32 rollout");

// 4) Roll-out formula: 200 m over 95 revs => 2105 mm (700x25c)
const circ = (200 * 1000) / 95;
assert.ok(Math.abs(circ - 2105) < 6, `~2105mm, got ${circ}`);
console.log(`PASS: 200m / 95 revs => ${Math.round(circ)} mm`);

// 5) Roll-out formula: 200 m over 88 revs => ~2273 mm (29" MTB territory)
const circ2 = Math.round((200 * 1000) / 88);
assert.ok(circ2 > 2200 && circ2 < 2400, `29er range, got ${circ2}`);
console.log(`PASS: 200m / 88 revs => ${circ2} mm`);

// 6) nearestWheelPreset: 2108 mm should map to 700x25c (+3 mm)
const PRESETS = [
  { label: "700×23c", mm: 2097 }, { label: "700×25c", mm: 2105 }, { label: "700×28c", mm: 2136 },
  { label: "700×32c", mm: 2155 }, { label: '650b · 27.5"', mm: 2086 }, { label: '26" MTB', mm: 2070 },
  { label: '29" MTB', mm: 2299 },
];
function nearestWheelPreset(mm) {
  let best = PRESETS[0];
  for (const p of PRESETS) if (Math.abs(mm - p.mm) < Math.abs(mm - best.mm)) best = p;
  return { label: best.label, mm: best.mm, delta: mm - best.mm };
}
const n1 = nearestWheelPreset(2108);
assert.equal(n1.label, "700×25c");
assert.equal(n1.delta, 3);
const n2 = nearestWheelPreset(2290);
assert.equal(n2.label, '29" MTB');
assert.equal(n2.delta, -9);
console.log(`PASS: 2108mm -> ${n1.label} (${n1.delta >= 0 ? "+" : ""}${n1.delta}mm); 2290mm -> ${n2.label} (${n2.delta}mm)`);

console.log("\nAll calibration tests passed ✅");
