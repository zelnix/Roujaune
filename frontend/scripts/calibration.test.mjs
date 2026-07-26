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

console.log("\nAll calibration tests passed ✅");
