// Central config for the Roujaune Rive rider integration. Flip `RIVE_MODE`
// to "prototype" to drive a simplified test .riv (Artboard "Rider", State
// Machine "Ride", number inputs cadence/effort) while the production file is
// still being produced. Default is the full production spec.

import type { RiderArtboard } from "./rider-animation";

export type RiveMode = "production" | "prototype";

// Switch to "prototype" only for a temporary test asset. Do NOT ship as-is.
export const RIVE_MODE: RiveMode = "production";

export const RIVE_STATE_MACHINE = "CyclingController";       // production
export const RIVE_VIEW_MODEL_INSTANCE = "Simulation_Default"; // production default instance

export const PROTOTYPE_STATE_MACHINE = "Ride";
export const PROTOTYPE_ARTBOARD = "Rider";

// Rider id (VirtualRider.id) → production artboard name.
export const RIDER_ARTBOARDS: Record<string, RiderArtboard> = {
  male: "Rider_Younger_Male",
  female: "Rider_Younger_Female",
  mature_male: "Rider_Mature_Male",
  mature_female: "Rider_Mature_Female",
};

export function riderArtboardFor(id: string): RiderArtboard {
  return RIDER_ARTBOARDS[id] ?? "Rider_Younger_Male";
}
