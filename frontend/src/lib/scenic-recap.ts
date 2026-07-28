import { ScenicJourney } from "./scenic-routes";

/** Stable string hash → used to seed a deterministic, per-route profile so the
 *  same ride always draws the same elevation trace. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = "climb" | "rolling" | "flat" | "gentle";

function shapeFor(tag?: string, elevation?: number | null): Shape {
  const t = (tag || "").toLowerCase();
  if (/(climb|alpine|mountain|pass|ascent|col|summit|hill\b)/.test(t) || (elevation ?? 0) >= 500) return "climb";
  if (/(rolling|hills|countryside|country)/.test(t) || (elevation ?? 0) >= 200) return "rolling";
  if (/(flat|riverside|greenway|peaceful|lake|coast|shore|canal|water)/.test(t) || (elevation ?? 0) <= 80) return "flat";
  return "gentle";
}

/** A deterministic, decorative elevation profile (array of 0..1 heights) shaped
 *  by the route's character + total climb. Not real GPS — a believable trace. */
export function elevationProfile(journey: ScenicJourney, points = 28): number[] {
  const shape = shapeFor(journey.tag, journey.elevation_m);
  const rnd = mulberry32(hash(`${journey.routeId}|${journey.name}`));
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    let base = 0;
    if (shape === "climb") {
      // build to a high peak ~70% through, then descend
      base = x < 0.72 ? Math.pow(x / 0.72, 1.35) : 1 - (x - 0.72) / 0.28 * 0.55;
    } else if (shape === "rolling") {
      base = 0.45 + 0.32 * Math.sin(x * Math.PI * 3.2) + 0.12 * Math.sin(x * Math.PI * 6.5);
    } else if (shape === "flat") {
      base = 0.28 + 0.08 * Math.sin(x * Math.PI * 4);
    } else {
      base = 0.4 + 0.18 * Math.sin(x * Math.PI * 2.2);
    }
    const jitter = (rnd() - 0.5) * (shape === "flat" ? 0.05 : 0.12);
    out.push(Math.max(0.05, Math.min(1, base + jitter)));
  }
  return out;
}

function fmtDist(km?: number | string | null): number | null {
  if (km == null || km === "") return null;
  const n = typeof km === "string" ? parseFloat(km) : km;
  return isFinite(n) && n > 0 ? n : null;
}

/** A warm, one-line recap caption in the companion coach's voice. Template-based
 *  (instant + free), varied deterministically by the ride's character. */
export function recapCaption(journey: ScenicJourney, coachName?: string): string {
  const rnd = mulberry32(hash(`${journey.routeId}|${journey.at || ""}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const shape = shapeFor(journey.tag, journey.elevation_m);
  const discN = (journey.discoveries || []).length;
  const place = journey.place || journey.name;
  const dist = fmtDist(journey.distance_km);
  const distStr = dist ? `${dist.toFixed(dist >= 10 ? 0 : 1)} km` : null;

  const byShape: Record<Shape, string[]> = {
    climb: [
      `Every metre of that climb was earned — beautifully ridden through ${place}.`,
      `You kept the rhythm on the hard gradients. A proper mountain morning.`,
      `That was a summit-hunter's ride. Strong, steady, unforgettable.`,
    ],
    rolling: [
      `Rolling through ${place} at your own pace — this is what cycling is about.`,
      `Lovely undulating miles. You flowed with the road all the way.`,
      `A playful, rolling ride — you looked completely at home out there.`,
    ],
    flat: [
      `Calm, flowing and unhurried — ${place} treated you kindly today.`,
      `A peaceful spin with the water alongside. Exactly what you needed.`,
      `Smooth and serene through ${place}. Ride, breathe, enjoy.`,
    ],
    gentle: [
      `A gentle, restorative ride through ${place}. Well done.`,
      `Easy miles, open scenery — a lovely way to spend the saddle time.`,
      `You soaked in ${place} at just the right pace today.`,
    ],
  };

  let line = pick(byShape[shape]);
  if (discN >= 3) line = `You paused for ${discN} discoveries along the way — ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  else if (distStr && rnd() > 0.5) line = `${distStr} in the legs — ${line.charAt(0).toLowerCase()}${line.slice(1)}`;

  return coachName ? `${line} — ${coachName}` : line;
}
