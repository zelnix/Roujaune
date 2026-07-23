// Roujaune animated cyclist avatar — data model & 4 built-in avatars.
// Identity (face / skin / hair / gender) is FIXED per avatar and never changes.
// Appearance (kit colours + glasses) is fully customisable at runtime.

export type Sex = "male" | "female";
export type HairStyle = "short" | "braid";
export type GlassesType = "none" | "clear" | "dark" | "wraparound";

/** Immutable identity — the rider's face, skin, hair and build. */
export type AvatarIdentity = {
  sex: Sex;
  skin: string;        // skin tone
  skinShade: string;   // shaded/darker skin for depth
  hair: string;        // hair colour
  hairStyle: HairStyle;
  beard: boolean;
};

/** Customisable appearance — kit colours + eyewear. */
export type Appearance = {
  jerseyTop: string;    // jersey gradient (upper)
  jerseyBottom: string; // jersey gradient (lower)
  bib: string;          // bib shorts
  helmet: string;
  shoes: string;
  bike: string;
  glasses: GlassesType;
  glassesFrame: string; // frame colour
  glassesTint: string;  // lens tint colour
};

export type AvatarConfig = {
  id: string;
  name: string;
  identity: AvatarIdentity;
  defaults: Appearance;
};

// Brand palette
export const ROUJAUNE = {
  yellow: "#F2C230",
  gold: "#E79A1F",
  red: "#C4232B",
  burgundy: "#6E1D2B",
  burgundyDark: "#4A1420",
  black: "#141414",
  pink: "#EBA6C4",
  pinkDeep: "#D9789F",
  white: "#F5F1EA",
};

export const AVATARS: AvatarConfig[] = [
  {
    id: "yellow-burgundy-m",
    name: "Yellow / Burgundy",
    identity: { sex: "male", skin: "#B07B54", skinShade: "#8E5F3E", hair: "#C9C6C1", hairStyle: "short", beard: true },
    defaults: {
      jerseyTop: ROUJAUNE.yellow, jerseyBottom: ROUJAUNE.burgundy, bib: ROUJAUNE.burgundy,
      helmet: ROUJAUNE.yellow, shoes: ROUJAUNE.yellow, bike: ROUJAUNE.burgundy,
      glasses: "dark", glassesFrame: ROUJAUNE.black, glassesTint: "#20140A",
    },
  },
  {
    id: "black-burgundy-m",
    name: "Black / Burgundy",
    identity: { sex: "male", skin: "#E4B58F", skinShade: "#C0916B", hair: "#3A2A1E", hairStyle: "short", beard: false },
    defaults: {
      jerseyTop: ROUJAUNE.red, jerseyBottom: ROUJAUNE.black, bib: ROUJAUNE.black,
      helmet: ROUJAUNE.black, shoes: ROUJAUNE.black, bike: ROUJAUNE.black,
      glasses: "wraparound", glassesFrame: ROUJAUNE.black, glassesTint: "#1A1A1A",
    },
  },
  {
    id: "black-burgundy-f",
    name: "Black / Burgundy",
    identity: { sex: "female", skin: "#8A5A3C", skinShade: "#6E4429", hair: "#241A14", hairStyle: "braid", beard: false },
    defaults: {
      jerseyTop: ROUJAUNE.burgundy, jerseyBottom: ROUJAUNE.black, bib: ROUJAUNE.black,
      helmet: ROUJAUNE.black, shoes: ROUJAUNE.black, bike: ROUJAUNE.black,
      glasses: "wraparound", glassesFrame: ROUJAUNE.black, glassesTint: "#1A1A1A",
    },
  },
  {
    id: "pink-burgundy-f",
    name: "Pink / Burgundy",
    identity: { sex: "female", skin: "#C9A07C", skinShade: "#A87E58", hair: "#CFCBC5", hairStyle: "braid", beard: false },
    defaults: {
      jerseyTop: ROUJAUNE.pink, jerseyBottom: ROUJAUNE.burgundy, bib: ROUJAUNE.burgundy,
      helmet: ROUJAUNE.pink, shoes: ROUJAUNE.pink, bike: ROUJAUNE.burgundyDark,
      glasses: "none", glassesFrame: ROUJAUNE.black, glassesTint: "#20140A",
    },
  },
];

export function avatarById(id: string): AvatarConfig {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** Live trainer inputs that drive the animation. */
export type AvatarInputs = {
  cadence: number;    // rpm  -> pedal speed
  power: number;      // watts -> effort / lean
  resistance: number; // 0..100 -> effort / lean
  speed: number;      // km/h -> wheel spin
  isStanding: boolean;
  isPaused: boolean;
};

export const DEFAULT_INPUTS: AvatarInputs = {
  cadence: 85, power: 210, resistance: 45, speed: 28, isStanding: false, isPaused: false,
};
