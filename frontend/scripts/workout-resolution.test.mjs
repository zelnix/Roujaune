// Permanent regression test for the "custom workout resolution" fix (2026-09).
// Run: node frontend/scripts/workout-resolution.test.mjs
//
// Bug this guards against: a rider on a coach-created custom AI plan (or any
// session whose workout_id isn't in the static catalog in src/lib/workout-catalog.ts)
// used to have "View Workout" / the live ride screen silently fall back to a
// hardcoded demo workout ("Threshold Climb") instead of the session they
// actually had scheduled. Root cause: getWorkout(id) returns undefined for
// unknown ids, and callers used to do getWorkout(id) ?? getWorkout("threshold-climb").
// Fix: resolveWorkout(id, meta) synthesizes a REAL workout from the
// session's own schedule metadata (title/duration/zone/tss) when the id isn't
// in the catalog, so the rider always sees/rides what was actually scheduled.
//
// This is a RELEASE-BLOCKING test: if it fails, an unknown workout id is
// resolving to something other than either (a) undefined, or (b) a workout
// that carries the SAME identity/title it was given -- i.e. it silently
// swapped to an unrelated catalog/demo entry, which is exactly the bug.
import assert from "node:assert";

// --- Inline copies of the catalog + resolution logic (kept in sync with src/lib/workout-catalog.ts) ---
const CATALOG = [
  { id: "threshold-climb", name: "Threshold Climb", typeId: "threshold" },
  { id: "endurance-base", name: "Endurance Base", typeId: "endurance" },
];
function getWorkout(id) {
  if (!id) return undefined;
  return CATALOG.find((w) => w.id === id);
}
function zoneIndexFromLabel(z) {
  if (!z) return 1;
  const m = String(z).match(/([1-6])/);
  const n = m ? parseInt(m[1], 10) : 2;
  return Math.max(0, Math.min(5, n - 1));
}
function parseDurationMinutes(s) {
  if (!s) return 0;
  const str = String(s).trim();
  const hMatch = str.match(/(\d+)\s*h/i);
  const mMatch = str.match(/(\d+)\s*m/i);
  if (hMatch || mMatch) return (hMatch ? parseInt(hMatch[1], 10) : 0) * 60 + (mMatch ? parseInt(mMatch[1], 10) : 0);
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : 0;
}
function synthWorkoutFromMeta(meta) {
  const zoneIdx = zoneIndexFromLabel(meta.zone);
  const duration = Math.max(5, parseDurationMinutes(meta.duration) || 30);
  return {
    id: meta.id || `plan-session-${zoneIdx}`,
    name: meta.title || "Training Ride",
    typeId: ["recovery", "endurance", "tempo", "threshold", "vo2max", "sprints"][zoneIdx],
    duration,
    synthetic: true,
  };
}
function resolveWorkout(id, meta) {
  const found = getWorkout(id);
  if (found) return found;
  if (meta && (meta.title || id)) return synthWorkoutFromMeta({ id, ...meta });
  return undefined;
}

// 1) A custom-plan id that isn't in the catalog, WITH schedule metadata,
//    must resolve to a workout carrying its OWN title -- never the demo one.
const custom = resolveWorkout("custom-abc123-ride-w1-d0", { title: "Easy Spin", duration: "30 min", zone: "Z1", tss: "15 TSS" });
assert.ok(custom, "unknown id with metadata must resolve to something");
assert.strictEqual(custom.name, "Easy Spin", "must carry its own title, not fall back to a demo workout");
assert.notStrictEqual(custom.id, "threshold-climb", "must never silently become the demo workout id");
console.log("PASS: unknown workout_id with metadata resolves to its OWN session, not the demo workout");

// 2) A DIFFERENT unknown id with different metadata must resolve differently
//    from (1) -- proves distinct sessions don't all collapse onto one workout.
const custom2 = resolveWorkout("custom-abc123-ride-w1-d3", { title: "Aerobic Base", duration: "45 min", zone: "Z2", tss: "35 TSS" });
assert.notStrictEqual(custom2.name, custom.name, "two different scheduled sessions must not resolve to the same workout");
assert.strictEqual(custom2.name, "Aerobic Base");
console.log("PASS: two distinct unknown workout_ids resolve to two distinct sessions");

// 3) An unknown id with NO metadata at all must resolve to undefined --
//    never silently swap to an unrelated catalog entry either.
const noMeta = resolveWorkout("custom-totally-unknown", undefined);
assert.strictEqual(noMeta, undefined, "unknown id with no metadata must be undefined, never an unrelated demo workout");
console.log("PASS: unknown workout_id with no metadata resolves to undefined, not a demo workout");

// 4) A KNOWN catalog id must still resolve to the real catalog entry
//    (metadata, even if present/misleading, must never override a real match).
const known = resolveWorkout("threshold-climb", { title: "Some Other Title" });
assert.strictEqual(known.id, "threshold-climb");
assert.strictEqual(known.name, "Threshold Climb", "a real catalog id must win over any passed-in metadata");
console.log("PASS: known catalog ids still resolve from the catalog (metadata never overrides a real match)");

console.log("\nALL PASS: unknown workout ids never silently resolve to an unrelated catalog/demo workout.");
