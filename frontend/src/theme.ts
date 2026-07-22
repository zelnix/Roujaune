// ROUJAUNE design tokens — premium, cinematic, cycling-focused.
export const colors = {
  bg: "#050505",
  nav: "#080909",
  card: "#111211",
  cardElevated: "#171714",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.06)",

  red: "#E01E2B",
  redBright: "#F2392E",
  redDeep: "#6E1116",
  redDeepBg: "#2A0C0E",

  yellow: "#F5B301",
  yellowBright: "#FFC418",
  gold: "#E9B44C",

  white: "#F4F0E9",
  text: "#F4F0E9",
  textDim: "rgba(244,240,233,0.60)",
  textFaint: "rgba(244,240,233,0.34)",

  green: "#43D17A",
  greenText: "#54DB8B",

  glass: "rgba(18,18,18,0.55)",
  overlay: "rgba(0,0,0,0.55)",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 20, xl: 26, pill: 999 };

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
};
