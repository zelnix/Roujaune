// Configurable rider appearance: identity + bicycle + clothing, stored
// independently so any rider can use any bike + clothing style. Bike geometry
// values (wheel circumference, hand/foot targets, posture offsets) live here —
// never hard-coded in the animation component.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RiderType = "younger_male" | "younger_female" | "mature_male" | "mature_female";
export type BikeType = "road" | "mountain" | "vintage";
export type ClothingStyle = "pro" | "get_fit" | "casual";

export interface RiderAppearanceConfiguration {
  riderType: RiderType;
  bikeType: BikeType;
  clothingStyle: ClothingStyle;
}

export const DEFAULT_APPEARANCE: RiderAppearanceConfiguration = {
  riderType: "younger_male",
  bikeType: "road",
  clothingStyle: "get_fit",
};

export const RIDER_TYPES: { id: RiderType; label: string }[] = [
  { id: "younger_male", label: "Younger Male" },
  { id: "younger_female", label: "Younger Female" },
  { id: "mature_male", label: "Mature Male" },
  { id: "mature_female", label: "Mature Female" },
];

export const BIKE_TYPES: { id: BikeType; label: string; sub: string }[] = [
  { id: "road", label: "Road Bike", sub: "Lightweight · drop bars · fast" },
  { id: "mountain", label: "Mountain Bike", sub: "Knobby tyres · upright · rugged" },
  { id: "vintage", label: "Vintage Bike", sub: "Classic steel · heritage styling" },
];

export const CLOTHING_STYLES: { id: ClothingStyle; label: string; sub: string }[] = [
  { id: "pro", label: "Pro Rider", sub: "Fitted race kit · strong branding" },
  { id: "get_fit", label: "Get Fit Rider", sub: "Comfort fit · supportive & practical" },
  { id: "casual", label: "Casual Rider", sub: "Relaxed lifestyle cycling" },
];

// Per-bike geometry config. Hand/foot targets & posture offsets are 0..1 ratios
// the Rive rig can consume; wheel circumference drives wheel-phase integration.
// `routeSuitability` maps each terrain kind → how well this bike suits it.
export type TerrainKind = "climb" | "rolling" | "road_fast" | "gravel";
export type CompatLevel = "ideal" | "ok" | "warn";

export type BikeConfig = {
  wheelCircumferenceMetres: number;
  handTarget: { x: number; y: number };
  footTarget: { x: number; y: number };
  posture: { seatedY: number; lean: number };   // relative posture offsets
  routeSuitability: Record<TerrainKind, CompatLevel>;
};

export const BIKE_CONFIG: Record<BikeType, BikeConfig> = {
  road: {
    wheelCircumferenceMetres: 2.105, handTarget: { x: 0.5, y: 0.44 }, footTarget: { x: 0.5, y: 0.72 }, posture: { seatedY: 0.0, lean: 1.0 },
    routeSuitability: { climb: "ideal", rolling: "ideal", road_fast: "ideal", gravel: "warn" },
  },
  mountain: {
    wheelCircumferenceMetres: 2.268, handTarget: { x: 0.5, y: 0.40 }, footTarget: { x: 0.5, y: 0.74 }, posture: { seatedY: -0.03, lean: 0.7 },
    routeSuitability: { climb: "ideal", rolling: "ideal", road_fast: "ok", gravel: "ideal" },
  },
  vintage: {
    wheelCircumferenceMetres: 2.130, handTarget: { x: 0.5, y: 0.38 }, footTarget: { x: 0.5, y: 0.71 }, posture: { seatedY: -0.05, lean: 0.6 },
    routeSuitability: { climb: "warn", rolling: "ideal", road_fast: "ok", gravel: "warn" },
  },
};

export function wheelCircumferenceFor(bike: BikeType): number {
  return (BIKE_CONFIG[bike] ?? BIKE_CONFIG.road).wheelCircumferenceMetres;
}

// Classify a route's character (its picker `tag`) into a terrain kind so bike
// suitability can be evaluated without changing the route data model.
export function terrainKindForTag(tag: string): TerrainKind {
  const t = (tag || "").toLowerCase();
  if (t.includes("rough") || t.includes("wet") || t.includes("gravel") || t.includes("trail")) return "gravel";
  if (t.includes("climb") || t.includes("grind") || t.includes("mountain")) return "climb";
  if (t.includes("flat") || t.includes("sprint") || t.includes("crit") || t.includes("fast")) return "road_fast";
  return "rolling";
}

export type RouteCompatibility = { level: CompatLevel; title: string; message: string };

const COMPAT_COPY: Record<BikeType, Partial<Record<TerrainKind, { title: string; message: string }>>> = {
  road: {
    gravel: { title: "Rough surface ahead", message: "A road bike has limited grip on rough, wet roads — ride cautiously or pick a mountain bike." },
  },
  mountain: {
    road_fast: { title: "Heavier on fast roads", message: "A mountain bike is heavier and slower on fast, flat routes — expect lower top speeds." },
  },
  vintage: {
    climb: { title: "Tough for big climbs", message: "Vintage steel is heavy for long climbs — expect a harder effort, or choose a road bike." },
    gravel: { title: "Not built for rough roads", message: "A vintage bike isn't suited to rough, wet surfaces — a mountain bike will handle it better." },
    road_fast: { title: "Relaxed, not racy", message: "A vintage bike is comfortable but not built for speed on fast, flat routes." },
  },
};

/** Evaluate how well the selected bike suits a route (by its picker tag). */
export function routeCompatibility(bike: BikeType, routeTag: string): RouteCompatibility {
  const kind = terrainKindForTag(routeTag);
  const level = (BIKE_CONFIG[bike] ?? BIKE_CONFIG.road).routeSuitability[kind];
  if (level === "ideal") {
    return { level, title: "Great match", message: "This bike suits this route well." };
  }
  const copy = COMPAT_COPY[bike]?.[kind];
  if (copy) return { level, title: copy.title, message: copy.message };
  return {
    level,
    title: level === "warn" ? "Not the ideal bike" : "Workable choice",
    message: level === "warn" ? "This bike isn't the best fit for this route." : "This bike is a workable choice for this route.",
  };
}

const CACHE_KEY = "roujaune.rider.appearance";
const base = () => (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

function coerce(raw: any): RiderAppearanceConfiguration {
  const rt = RIDER_TYPES.some((r) => r.id === raw?.riderType) ? raw.riderType : DEFAULT_APPEARANCE.riderType;
  const bt = BIKE_TYPES.some((b) => b.id === raw?.bikeType) ? raw.bikeType : DEFAULT_APPEARANCE.bikeType;
  const cs = CLOTHING_STYLES.some((c) => c.id === raw?.clothingStyle) ? raw.clothingStyle : DEFAULT_APPEARANCE.clothingStyle;
  return { riderType: rt, bikeType: bt, clothingStyle: cs };
}

/** Load saved appearance (backend first, AsyncStorage cache fallback). */
export async function loadAppearance(): Promise<RiderAppearanceConfiguration> {
  try {
    const res = await fetch(`${base()}/api/rider/appearance`);
    if (res.ok) {
      const cfg = coerce(await res.json());
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg)).catch(() => {});
      return cfg;
    }
  } catch { /* offline — fall through to cache */ }
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) return coerce(JSON.parse(cached));
  } catch { /* ignore */ }
  return { ...DEFAULT_APPEARANCE };
}

/** Persist appearance to the user profile (never touches training data). */
export async function saveAppearance(cfg: RiderAppearanceConfiguration): Promise<void> {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg)).catch(() => {});
  try {
    await fetch(`${base()}/api/rider/appearance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  } catch { /* best-effort; cache already holds it */ }
}
