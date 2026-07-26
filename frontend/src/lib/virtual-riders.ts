// The four Roujaune virtual riders. Each entry keeps the supplied rear-view
// scene plate plus brand-accurate accent colours (kit is baked into the image
// and must never be altered).
export type VirtualRider = {
  id: "male" | "female" | "mature_male" | "mature_female";
  name: string;
  tag: string;
  accent: string;   // dominant kit accent (for UI chrome only, never the artwork)
  image: any;        // full scene plate (used for setup thumbnails)
  sprite: any;       // transparent rider cutout (composited over route backdrops)
  artboard: "Rider_Younger_Male" | "Rider_Younger_Female" | "Rider_Mature_Male" | "Rider_Mature_Female";  // Rive production artboard
};

export const VIRTUAL_RIDERS: VirtualRider[] = [
  { id: "male", name: "Male Rider", tag: "Black & Burgundy", accent: "#8E1F2B", artboard: "Rider_Younger_Male", image: require("../../assets/images/vr_rider_mature_female.png"), sprite: require("../../assets/images/vr_sprite_mature_female.png") },
  { id: "female", name: "Female Rider", tag: "Pink & Burgundy", accent: "#C8536B", artboard: "Rider_Younger_Female", image: require("../../assets/images/vr_rider_mature_male.png"), sprite: require("../../assets/images/vr_sprite_mature_male.png") },
  { id: "mature_male", name: "Mature Male Rider", tag: "Yellow & Burgundy", accent: "#E7B008", artboard: "Rider_Mature_Male", image: require("../../assets/images/vr_rider_female.png"), sprite: require("../../assets/images/vr_sprite_female.png") },
  { id: "mature_female", name: "Mature Female Rider", tag: "Light Pink & Burgundy", accent: "#E8A6B6", artboard: "Rider_Mature_Female", image: require("../../assets/images/vr_rider_male.png"), sprite: require("../../assets/images/vr_sprite_male.png") },
];

export function getRider(id: string | null | undefined): VirtualRider {
  return VIRTUAL_RIDERS.find((r) => r.id === id) ?? VIRTUAL_RIDERS[0];
}
