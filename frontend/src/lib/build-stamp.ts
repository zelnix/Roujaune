// Last publish / build timestamp for the ROUJAUNE app.
// Sourced from `extra.buildStamp`, which app.config.js regenerates on every
// Metro start (preview) and every EAS build/publish — so it stays current
// automatically with no manual edits. Shown under the logo in the PREVIEW
// (dev) build only, to confirm code freshness.
import Constants from "expo-constants";

function format(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const s = d.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${s} UTC`;
}

const iso = (Constants.expoConfig as any)?.extra?.buildStamp as string | undefined;

export const BUILD_STAMP = format(iso);
