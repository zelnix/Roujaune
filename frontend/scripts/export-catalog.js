// Transpile + load workout-catalog.ts (and its relative program deps) with
// sucrase, then emit backend/workout_catalog.json — the seed for the global,
// server-managed workout catalog the HWG console can edit and riders can copy.
const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

const cache = new Map();

function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const src = fs.readFileSync(absPath, "utf8");
  const out = transform(src, { transforms: ["typescript", "imports"] }).code;
  const m = { exports: {} };
  cache.set(absPath, m.exports);
  const dir = path.dirname(absPath);
  const requireShim = (spec) => {
    if (spec.startsWith("@expo/vector-icons")) return { Ionicons: { glyphMap: {} } };
    if (spec.startsWith(".")) {
      let p = path.resolve(dir, spec);
      if (!p.endsWith(".ts") && !p.endsWith(".tsx")) {
        if (fs.existsSync(p + ".ts")) p += ".ts";
        else if (fs.existsSync(p + ".tsx")) p += ".tsx";
        else if (fs.existsSync(path.join(p, "index.ts"))) p = path.join(p, "index.ts");
      }
      return loadModule(p);
    }
    return {};
  };
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", "require", out)(m, m.exports, requireShim);
  cache.set(absPath, m.exports);
  return m.exports;
}

const mod = loadModule(path.resolve(__dirname, "../src/lib/workout-catalog.ts"));
const WORKOUTS = mod.WORKOUTS || [];
if (!Array.isArray(WORKOUTS) || WORKOUTS.length === 0) {
  console.error("No WORKOUTS exported — aborting");
  process.exit(1);
}
const outPath = path.resolve(__dirname, "../../backend/workout_catalog.json");
fs.writeFileSync(outPath, JSON.stringify(WORKOUTS, null, 2));
console.log(`Wrote ${WORKOUTS.length} workouts → ${outPath}`);
