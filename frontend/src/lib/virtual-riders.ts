// The four Roujaune virtual riders. Each entry keeps the supplied rear-view
// scene plate plus brand-accurate accent colours (kit is baked into the image
// and must never be altered).
export type VirtualRider = {
  id: "male" | "female" | "mature_male" | "mature_female";
  name: string;
  tag: string;
  accent: string;   // dominant kit accent (for UI chrome only, never the artwork)
  image: any;
};

export const VIRTUAL_RIDERS: VirtualRider[] = [
  { id: "male", name: "Male Rider", tag: "Black & Burgundy", accent: "#8E1F2B", image: require("../../assets/images/vr_rider_mature_female.png") },
  { id: "female", name: "Female Rider", tag: "Pink & Burgundy", accent: "#C8536B", image: require("../../assets/images/vr_rider_mature_male.png") },
  { id: "mature_male", name: "Mature Male Rider", tag: "Yellow & Burgundy", accent: "#E7B008", image: require("../../assets/images/vr_rider_female.png") },
  { id: "mature_female", name: "Mature Female Rider", tag: "Light Pink & Burgundy", accent: "#E8A6B6", image: require("../../assets/images/vr_rider_male.png") },
];

export function getRider(id: string | null | undefined): VirtualRider {
  return VIRTUAL_RIDERS.find((r) => r.id === id) ?? VIRTUAL_RIDERS[0];
}
