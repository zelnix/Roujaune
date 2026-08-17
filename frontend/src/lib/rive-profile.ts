// Central config for the Roujaune Rive rider integration. Flip `RIVE_MODE`
// to "prototype" to drive a simplified test .riv (Artboard "Rider", State
// Machine "Ride", number inputs cadence/effort) while the production file is
// still being produced. Default is the full production spec.

import type { RiderArtboard } from "./rider-animation";
import type { RiderType, BikeType, ClothingStyle } from "./rider-config";

export type RiveMode = "production" | "prototype";

// Switch to "prototype" only for a temporary test asset. Do NOT ship as-is.
export const RIVE_MODE: RiveMode = "production";

// Master switch for mounting the native <Rive> component. The bundled
// `roujaune-riders.riv` is still a placeholder — loading it (or an artboard /
// state machine that doesn't exist yet) throws a FATAL native exception on
// Android that instantly kills the app (onError does not catch it). Keep this
// OFF so ride screens render the sprite-based rider fallback until a real,
// verified .riv is shipped. Flip to `true` once the production asset is in.
export const RIVE_ENABLED = false;

export const RIVE_STATE_MACHINE = "CyclingController";        // production
export const RIVE_VIEW_MODEL_INSTANCE = "Simulation_Default"; // production default instance

export const PROTOTYPE_STATE_MACHINE = "Ride";
export const PROTOTYPE_ARTBOARD = "Rider";

// View-model property names for the configurable bike / clothing selections.
// These are bound as enum/string values on the CyclingTelemetry view model so
// the rider rig can show/hide nested bike + clothing component variants.
export const RIVE_BIKE_PROPERTY = "bikeType";
export const RIVE_CLOTHING_PROPERTY = "clothingStyle";

// Rider identity (riderType) → production artboard name.
export const RIDER_ARTBOARDS: Record<RiderType, RiderArtboard> = {
  younger_male: "Rider_Younger_Male",
  younger_female: "Rider_Younger_Female",
  mature_male: "Rider_Mature_Male",
  mature_female: "Rider_Mature_Female",
};

export function riderArtboardFor(id: RiderType): RiderArtboard {
  return RIDER_ARTBOARDS[id] ?? "Rider_Younger_Male";
}

// Enum string values passed to Rive for bike/clothing selection.
export const bikeEnumValue = (b: BikeType): string => b;         // "road" | "mountain" | "vintage"
export const clothingEnumValue = (c: ClothingStyle): string => c; // "pro" | "get_fit" | "casual"
