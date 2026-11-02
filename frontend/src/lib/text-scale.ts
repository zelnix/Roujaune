import { StyleSheet } from "react-native";

/** Font multiplier applied when Large Text is on. */
export const LARGE_TEXT_SCALE = 1.22;

/**
 * Accessibility runtime state.  These module-level values are updated by
 * `setA11yRuntime()` and read by components that opt-in to the a11y system
 * (via `useA11y()` or `getA11yOverrideStyle()`).
 *
 * The old approach monkey-patched Text.render at module scope — an unsupported
 * internal API that broke with Fabric/new-architecture runtimes.  The new
 * approach is declarative: each Text/TextInput can call `getA11yOverrideStyle`
 * for its own style prop, and the root AuthGate re-keys the Stack to force a
 * full re-render when a toggle changes.  Screens that don't call the helper
 * inherit the system's native font-scale instead.
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

function isNeutralDimColor(color: unknown): boolean {
  if (color == null) return true;
  if (typeof color !== "string") return false;
  const c = color.trim().toLowerCase();
  if (c.startsWith("rgba(244") || c.startsWith("rgb(244")) return true;
  if (c.startsWith("rgba(255,255,255") || c.startsWith("rgba(255, 255, 255")) return true;
  const m = c.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min <= 24) return true;
  }
  return false;
}

function isLightWeight(w: unknown): boolean {
  if (w == null) return true;
  const s = String(w);
  return s === "normal" || s === "400" || s === "500" || s === "300";
}

/**
 * Returns an override style object when Large Text or High Contrast is active,
 * or null when no modification is needed.  Call from individual components:
 *
 *   const override = getA11yOverrideStyle(style);
 *   return <Text style={[style, override]}>{...}</Text>;
 */
export function getA11yOverrideStyle(styleProp: any): Record<string, any> | null {
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
