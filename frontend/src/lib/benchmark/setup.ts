// ─────────────────────────────────────────────────────────────────────────
// Benchmark pre-test setup logic (Part 6): sensor levels, test compatibility,
// environment checklists and step definitions. Pure + data-driven so the
// wizard UI stays thin and reusable.
// ─────────────────────────────────────────────────────────────────────────
import type { BenchmarkTest, EquipmentKey } from "./types";

export type SetupStepKey =
  | "overview" | "readiness" | "equipment" | "sensors" | "environment" | "summary";

export const SETUP_STEPS: { key: SetupStepKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "readiness", label: "Readiness" },
  { key: "equipment", label: "Equipment" },
  { key: "sensors", label: "Sensors" },
  { key: "environment", label: "Environment" },
  { key: "summary", label: "Summary" },
];

export type EquipmentState = Record<EquipmentKey, boolean> & { none: boolean };

export const EQUIPMENT_OPTIONS: { key: keyof EquipmentState; label: string; icon: any }[] = [
  { key: "smart_trainer", label: "Smart trainer", icon: "hardware-chip-outline" },
  { key: "power_meter", label: "Power meter", icon: "flash-outline" },
  { key: "heart_rate", label: "Heart-rate monitor", icon: "heart-outline" },
  { key: "cadence", label: "Cadence sensor", icon: "sync-outline" },
  { key: "speed", label: "Speed sensor", icon: "speedometer-outline" },
  { key: "none", label: "No connected sensors", icon: "close-circle-outline" },
];

export function emptyEquipment(): EquipmentState {
  return { smart_trainer: false, power_meter: false, heart_rate: false, cadence: false, speed: false, none: false };
}

export function hasPower(e: EquipmentState): boolean { return e.smart_trainer || e.power_meter; }

// ── Sensor levels (internal data quality classification) ───────────────────
export type SensorLevel = "A" | "B" | "C" | "D";
export const SENSOR_LEVEL_META: Record<SensorLevel, { label: string; blurb: string }> = {
  A: { label: "Level A · Full Performance Data", blurb: "Power, heart rate and cadence available." },
  B: { label: "Level B · Power Based", blurb: "Power available; heart rate or cadence optional." },
  C: { label: "Level C · Heart-Rate Based", blurb: "Heart rate available; no power." },
  D: { label: "Level D · Perceived Effort Based", blurb: "No power or heart-rate monitor required." },
};

export function computeSensorLevel(e: EquipmentState): SensorLevel {
  const power = hasPower(e);
  const hr = e.heart_rate;
  const cad = e.cadence || e.smart_trainer; // smart trainers report cadence
  if (power && hr && cad) return "A";
  if (power) return "B";
  if (hr) return "C";
  return "D";
}

// ── Test compatibility ─────────────────────────────────────────────────────
export const POWER_REQUIRED = new Set(["ramp", "twenty_min_ftp", "five_min_aerobic", "one_min_power", "sprint_power"]);
export const POWER_PREFERRED = new Set(["aerobic_efficiency", "cadence_control"]);
// recovery_response ⇒ heart-rate or perceived-effort compatible (no power needed).

export function checkCompatibility(test: BenchmarkTest, e: EquipmentState): { ok: boolean; preferredWarning: boolean } {
  if (POWER_REQUIRED.has(test.id) && !hasPower(e)) return { ok: false, preferredWarning: false };
  if (POWER_PREFERRED.has(test.id) && !hasPower(e)) return { ok: true, preferredWarning: true };
  return { ok: true, preferredWarning: false };
}

// ── Sprint test safety eligibility (Part 12B) ──────────────────────────────
// The Sprint Power Test is an explosive maximal effort; block it unless the
// rider and setup are suitable. Returns human, non-judgemental reasons.
export function sprintEligibility(opts: {
  capability?: string;
  equipment: EquipmentState;
  envMode: EnvMode;
  envChecks: Record<string, boolean>;
  readiness: "ready" | "caution" | "do_not_start" | null;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if ((opts.capability || "").toLowerCase() === "beginner")
    reasons.push("Sprint efforts are best once you've built a base. Try the Ramp or Aerobic Efficiency tests first.");
  if (!hasPower(opts.equipment))
    reasons.push("A power meter or smart trainer is required for the Sprint Power Test.");
  if (opts.readiness === "do_not_start")
    reasons.push("Your readiness check suggests not starting a maximal effort today.");
  if (opts.envMode === "indoor" && !(opts.envChecks.bike_stable && opts.envChecks.trainer_secure))
    reasons.push("Confirm your bike is stable and your trainer is secure before sprinting.");
  if (opts.envMode === "outdoor")
    reasons.push("The Sprint Power Test should be done indoors on a secure trainer.");
  return { ok: reasons.length === 0, reasons };
}

// ── Environment checklists (indoor vs outdoor differ) ──────────────────────
export type EnvMode = "indoor" | "outdoor";
export const ENV_CHECKS: Record<EnvMode, { id: string; label: string }[]> = {
  indoor: [
    { id: "bike_stable", label: "Bike is stable" },
    { id: "trainer_secure", label: "Trainer is secure" },
    { id: "airflow", label: "Fan or airflow is available" },
    { id: "water", label: "Water is within reach" },
    { id: "towel", label: "Towel is available" },
    { id: "sensors_connected", label: "Sensors are connected" },
    { id: "calibrated", label: "Trainer is calibrated where required" },
    { id: "no_interruptions", label: "Interruptions are unlikely" },
  ],
  outdoor: [
    { id: "route_safe", label: "Route is safe" },
    { id: "min_intersections", label: "Route has minimal intersections" },
    { id: "traffic_ok", label: "Traffic conditions are suitable" },
    { id: "weather_ok", label: "Weather is suitable" },
    { id: "surface_ok", label: "Road surface is appropriate" },
    { id: "no_dangerous_downhill", label: "Route avoids dangerous downhill efforts" },
    { id: "safety_priority", label: "Road safety will take priority over completing the test" },
  ],
};

// ── Coaching preferences ────────────────────────────────────────────────────
export type CoachVoice = "alberto" | "adriana" | "off";
export type CoachDepth = "minimal" | "full";
export const COACH_VOICES: { key: CoachVoice; label: string }[] = [
  { key: "alberto", label: "Alberto" },
  { key: "adriana", label: "Adriana" },
  { key: "off", label: "Voice Off" },
];
export const COACH_DEPTHS: { key: CoachDepth; label: string }[] = [
  { key: "minimal", label: "Minimal Prompts" },
  { key: "full", label: "Full Coaching" },
];

// ── Simulated sensor states (development data) ─────────────────────────────
export type SensorConnState = "Connected" | "Searching" | "Disconnected" | "Calibration Required" | "Battery Low";
export interface SimSensor { key: EquipmentKey; name: string; state: SensorConnState; battery: number | null; signal: string; calibration: string | null; }

/** Build clearly-labelled simulated sensor statuses for the selected equipment. */
export function simulateSensors(e: EquipmentState): SimSensor[] {
  const out: SimSensor[] = [];
  const add = (key: EquipmentKey, name: string, needsCalib: boolean, battery: number | null) =>
    out.push({ key, name, state: "Connected", battery, signal: "Strong", calibration: needsCalib ? "Calibrated" : null });
  if (e.smart_trainer) add("smart_trainer", "Smart trainer", true, null);
  if (e.power_meter) add("power_meter", "Power meter", true, 82);
  if (e.heart_rate) add("heart_rate", "Heart-rate monitor", false, 64);
  if (e.cadence) add("cadence", "Cadence sensor", false, 91);
  if (e.speed) add("speed", "Speed sensor", false, 88);
  return out;
}
