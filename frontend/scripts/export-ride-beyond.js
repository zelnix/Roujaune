// Transpile + load the ride-beyond TS module with sucrase, then emit a compact
// JSON describing every week/day so the FastAPI backend can drive plan progression.
const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

function loadModule(rel) {
  const modPath = path.resolve(__dirname, rel);
  const src = fs.readFileSync(modPath, "utf8");
  const out = transform(src, { transforms: ["typescript", "imports"] }).code;
  const m = { exports: {} };
  const requireShim = () => ({}); // types-only import from couch-to-road
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", "require", out)(m, m.exports, requireShim);
  return m.exports;
}

const { RIDE_BEYOND, rbWeekStart } = loadModule("../src/lib/programs/ride-beyond.ts");

function rideId(s) {
  const mm = (s.rideLabel || "").match(/Ride\s+(\d+)/i);
  if (mm) return `rb-ride-${mm[1]}`;
  return `rb-${s.day.toLowerCase()}-${(s.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}
function rpeRange(s) {
  const iv = s.intervals || [];
  const nums = [];
  for (const x of iv) (String(x.rpe || "").match(/\d+/g) || []).forEach((n) => nums.push(+n));
  if (!nums.length) return "";
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? `RPE ${lo}` : `RPE ${lo}\u2013${hi}`;
}
function tss(s) {
  const iv = s.intervals || [];
  let load = 0;
  const map = { 1: 0.48, 2: 0.55, 3: 0.64, 4: 0.72, 5: 0.8, 6: 0.86, 7: 0.92, 8: 1.0 };
  for (const x of iv) {
    const low = parseInt((String(x.rpe).match(/\d+/) || [3])[0], 10);
    const IF = map[low] || 0.64;
    const d = (x.minutes || 0) * 60;
    load += (d / 3600) * IF * IF * 100;
  }
  return Math.round(load);
}
const kindOf = (s) => {
  if (s.type === "cycling") return "cycling";
  if (s.type === "recovery" || s.type === "wellness") return "recovery";
  if (s.type === "rest") return "rest";
  const t = (s.category || s.title || "").toLowerCase();
  if (t.includes("balance")) return "balance";
  if (t.includes("mobility")) return "mobility";
  return "strength";
};

const weeks = [];
for (const phase of RIDE_BEYOND.phases) {
  for (const wk of phase.weeks) {
    const days = wk.days.map((s, i) => {
      const base = { day_name: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i], type: s.type, kind: kindOf(s), title: s.title, duration: s.duration || "" };
      if (s.type === "cycling") {
        return { ...base, kind: "cycling", workout_id: rideId(s), zone: rpeRange(s), tss: tss(s), rest: false };
      }
      return base;
    });
    weeks.push({ number: wk.number, phase: phase.number, phase_name: phase.name, phase_weeks: phase.weeksLabel, title: wk.title, objective: wk.objective, start_date: rbWeekStart(wk.number), days });
  }
}

const result = {
  id: RIDE_BEYOND.id,
  title: RIDE_BEYOND.name,
  name: RIDE_BEYOND.name,
  level: "Advanced",
  type: "structured",
  description: "An advanced 12-week performance plan across three phases — Performance Foundation, Power & Durability, and Peak Performance — that develops sustainable power, aerobic durability, climbing strength, cadence control and performance under fatigue, toward a personalised achievement ride.",
  duration_weeks: RIDE_BEYOND.durationWeeks,
  duration_label: `${RIDE_BEYOND.durationWeeks} Weeks`,
  average_label: "3 Rides/Week",
  frequency: RIDE_BEYOND.frequency,
  start_date: RIDE_BEYOND.startDate,
  tip: "Cadence should never be forced at the expense of comfort, coordination or safe technique.",
  created_by: "Alberto",
  goals: [
    { id: "g1", title: "Three Quality Rides a Week", description: "Consistent advanced training rhythm", status: "incomplete" },
    { id: "g2", title: "Controlled Threshold at RPE 7–8", description: "Repeatable, evenly paced efforts", status: "incomplete" },
    { id: "g3", title: "Ride 2.5–3 Hours Aerobically", description: "Build advanced endurance durability", status: "incomplete" },
  ],
  phases: RIDE_BEYOND.phases.map((p) => ({ number: p.number, name: p.name, weeks_label: p.weeksLabel, objective: p.objective })),
  weeks,
};

const dest = path.resolve(__dirname, "../../backend/ride_beyond_plan.json");
fs.writeFileSync(dest, JSON.stringify(result, null, 1));
console.log("Wrote", dest, "| weeks:", weeks.length, "| rides:", weeks.reduce((a, w) => a + w.days.filter((d) => d.kind === "cycling").length, 0));
