// Transpile + load the ride-stronger TS module with sucrase, then emit a compact
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

const { RIDE_STRONGER, rsWeekStart } = loadModule("../src/lib/programs/ride-stronger.ts");

function rideId(s) {
  const mm = (s.rideLabel || "").match(/Ride\s+(\d+)/i);
  if (mm) return `rs-ride-${mm[1]}`;
  return `rs-${s.day.toLowerCase()}-${(s.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
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
  const map = { 1: 0.48, 2: 0.55, 3: 0.64, 4: 0.72, 5: 0.8, 6: 0.86 };
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
for (const phase of RIDE_STRONGER.phases) {
  for (const wk of phase.weeks) {
    const days = wk.days.map((s, i) => {
      const base = { day_name: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i], type: s.type, kind: kindOf(s), title: s.title, duration: s.duration || "" };
      if (s.type === "cycling") {
        return { ...base, kind: "cycling", workout_id: rideId(s), zone: rpeRange(s), tss: tss(s), rest: false };
      }
      return base;
    });
    weeks.push({ number: wk.number, phase: phase.number, phase_name: phase.name, phase_weeks: phase.weeksLabel, title: wk.title, objective: wk.objective, start_date: rsWeekStart(wk.number), days });
  }
}

const result = {
  id: RIDE_STRONGER.id,
  title: RIDE_STRONGER.name,
  name: RIDE_STRONGER.name,
  level: "Intermediate",
  type: "structured",
  description: "A 12-week intermediate plan across three phases — Foundation & Control, Strength & Sustainable Power, and Goal Ready — that builds endurance, cadence, tempo, threshold and seated climbing, then converts it into goal-ready performance and a personalised achievement ride.",
  duration_weeks: RIDE_STRONGER.durationWeeks,
  duration_label: `${RIDE_STRONGER.durationWeeks} Weeks`,
  average_label: "3 Rides/Week",
  frequency: RIDE_STRONGER.frequency,
  start_date: RIDE_STRONGER.startDate,
  tip: "Your smoothest controllable cadence is more important than matching an exact number.",
  created_by: "Alberto",
  goals: [
    { id: "g1", title: "Ride Three Times a Week", description: "Build a consistent intermediate routine", status: "incomplete" },
    { id: "g2", title: "Controlled Tempo at RPE 5–6", description: "Repeatable efforts, not tests", status: "incomplete" },
    { id: "g3", title: "Ride 105 Minutes Aerobically", description: "Grow durable endurance", status: "incomplete" },
  ],
  phases: RIDE_STRONGER.phases.map((p) => ({ number: p.number, name: p.name, weeks_label: p.weeksLabel, objective: p.objective })),
  weeks,
};

const dest = path.resolve(__dirname, "../../backend/ride_stronger_plan.json");
fs.writeFileSync(dest, JSON.stringify(result, null, 1));
console.log("Wrote", dest, "| weeks:", weeks.length, "| rides:", weeks.reduce((a, w) => a + w.days.filter((d) => d.kind === "cycling").length, 0));
