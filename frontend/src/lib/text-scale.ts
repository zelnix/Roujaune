import { Text, TextInput, StyleSheet } from "react-native";

/** Font multiplier applied when Large Text is on. */
export const LARGE_TEXT_SCALE = 1.22;

/**
 * Global Text / TextInput render patch that makes the app-wide accessibility
 * toggles work without touching hundreds of call-sites.
 *
 * RN's Text/TextInput are forwardRef components, so their render function lives
 * on `.render` and can be wrapped. We read each element's own resolved style at
 * render time and append an override (which therefore wins):
 *   - Large Text:    multiply the effective fontSize (and lineHeight) by a scale
 *   - High Contrast: raise dimmed/neutral body text to full white and thicken
 *                    light weights (accent colours are left vivid on the dark UI)
 *
 * Runtime values are module-level so a single re-key at the root re-renders the
 * whole tree the instant a toggle flips.
 */
let _scale = 1;
let _contrast = false;

export function setA11yRuntime(largeText: boolean, highContrast: boolean) {
  _scale = largeText ? LARGE_TEXT_SCALE : 1;
  _contrast = highContrast;
}

// RN default font size when a Text has no explicit size.
const DEFAULT_FONT_SIZE = 14;
const HC_WHITE = "#FFFFFF";

// Neutral (grey / off-white) body-text colours we promote to full white. We
// deliberately DON'T touch saturated accents (yellow/red/green/blue) so the
// brand palette and status colours stay meaningful.
function isNeutralDimColor(color: unknown): boolean {
  if (color == null) return true; // unstyled text → default off-white on dark bg
  if (typeof color !== "string") return false;
  const c = color.trim().toLowerCase();
  // Our theme's neutral text family: rgba(244,240,233, a<1) and #F4F0E9-ish.
  if (c.startsWith("rgba(244") || c.startsWith("rgb(244")) return true;
  if (c.startsWith("rgba(255,255,255") || c.startsWith("rgba(255, 255, 255")) return true;
  const m = c.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // near-grey (low saturation) → treat as neutral body text
    if (max - min <= 24) return true;
  }
  return false;
}

function isLightWeight(w: unknown): boolean {
  if (w == null) return true;
  const s = String(w);
  return s === "normal" || s === "400" || s === "500" || s === "300";
}

function a11yOverride(styleProp: any): Record<string, any> | null {
  if (_scale === 1 && !_contrast) return null;
  const flat = StyleSheet.flatten(styleProp) || {};
  const out: Record<string, any> = {};

  if (_scale !== 1) {
    const base = typeof flat.fontSize === "number" ? flat.fontSize : DEFAULT_FONT_SIZE;
    out.fontSize = Math.round(base * _scale);
    if (typeof flat.lineHeight === "number") out.lineHeight = Math.round(flat.lineHeight * _scale);
  }

  if (_contrast) {
    if (isNeutralDimColor(flat.color)) out.color = HC_WHITE;
    if (isLightWeight(flat.fontWeight)) out.fontWeight = "600";
  }

  return Object.keys(out).length ? out : null;
}

let patched = false;

/** Install the global patch once, at module import time from the root layout. */
export function installA11yTextPatch() {
  if (patched) return;
  patched = true;

  for (const Comp of [Text, TextInput] as any[]) {
    const orig = Comp.render;
    if (typeof orig !== "function") continue;
    Comp.render = function patchedRender(props: any, ref: any) {
      const override = a11yOverride(props?.style);
      if (!override) return orig.call(this, props, ref);
      // Inject into the INPUT style so both native and react-native-web process
      // the combined RN style normally (our override wins as it's last).
      return orig.call(this, { ...props, style: [props?.style, override] }, ref);
    };
  }
}
