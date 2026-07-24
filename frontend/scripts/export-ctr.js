// Transpile + load the couch-to-road TS module with sucrase, then emit a compact
// JSON describing every week/day so the FastAPI backend can drive plan progression.
const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

const modPath = path.resolve(__dirname, "../src/lib/programs/couch-to-road.ts");
const src = fs.readFileSync(modPath, "utf8");
const out = transform(src, { transforms: ["typescript", "imports"] }).code;

const m = { exports: {} };
const requireShim = () => ({});
// eslint-disable-next-line no-new-func
new Function("module", "exports", "require", out)(m, m.exports, requireShim);

const { COUCH_TO_ROAD, ctrRideId, ctrWeekStart } = m.exports;

function rideId(s) {
  const mm = (s.rideLabel || "").match(/Ride\s+(\d+)/i);
  if (mm) return `ctr-ride-${mm[1]}`;
  return `ctr-${s.day.toLowerCase()}-${(s.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}
function mins(s) {
  const iv = s.intervals || [];
  return iv.reduce((a, x) => a + (x.minutes || 0), 0);
}
function rpeRange(s) {
  const iv = s.intervals || [];
  const nums = [];
  for (const x of iv) (String(x.rpe || "").match(/\d+/g) || []).forEach((n) => nums.push(+n));
  if (!nums.length) return "";
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? `RPE ${lo}` : `RPE ${lo}\u2013${hi}`;
}
// simple tss estimate consistent with backend rpe mapping
function tss(s) {
  const iv = s.intervals || [];
  let sec = 0, load = 0;
  const map = { 1: 0.48, 2: 0.55, 3: 0.64, 4: 0.72, 5: 0.8, 6: 0.86 };
  for (const x of iv) {
    const low = parseInt((String(x.rpe).match(/\d+/) || [3])[0], 10);
    const IF = map[low] || 0.64;
    const d = (x.minutes || 0) * 60;
    sec += d; load += (d / 3600) * IF * IF * 100;
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
for (const phase of COUCH_TO_ROAD.phases) {
  for (const wk of phase.weeks) {
    const days = wk.days.map((s, i) => {
      const base = { day_name: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i], type: s.type, kind: kindOf(s), title: s.title, duration: s.duration || "" };
      if (s.type === "cycling") {
        const rest = /complete rest/i.test(s.title || "");
        return { ...base, kind: rest ? "rest" : "cycling", workout_id: rest ? null : rideId(s), zone: rest ? "" : rpeRange(s), tss: rest ? 0 : tss(s), rest };
      }
      return base;
    });
    weeks.push({ number: wk.number, phase: phase.number, phase_name: phase.name, phase_weeks: phase.weeksLabel, title: wk.title, objective: wk.objective, start_date: ctrWeekStart(wk.number), days });
  }
}

const result = {
  id: COUCH_TO_ROAD.id,
  title: COUCH_TO_ROAD.title || COUCH_TO_ROAD.name,
  name: COUCH_TO_ROAD.name,
  assigned_to: COUCH_TO_ROAD.assignedTo,
  start_date: COUCH_TO_ROAD.startDate,
  duration_weeks: COUCH_TO_ROAD.durationWeeks,
  frequency: COUCH_TO_ROAD.frequency,
  phases: COUCH_TO_ROAD.phases.map((p) => ({ number: p.number, name: p.name, weeks_label: p.weeksLabel, objective: p.objective })),
  weeks,
};

const dest = path.resolve(__dirname, "../../backend/couch_to_road_plan.json");
fs.writeFileSync(dest, JSON.stringify(result, null, 1));
console.log("Wrote", dest, "| weeks:", weeks.length, "| rides:", weeks.reduce((a, w) => a + w.days.filter((d) => d.kind === "cycling").length, 0));
