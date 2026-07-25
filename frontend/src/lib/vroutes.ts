// Route data model for Virtual Routes. A route is a series of points along the
// distance axis, each carrying a gradient (%) and a signed curvature (-1..1,
// left..right). The engine interpolates between points to drive resistance,
// rider posture, bike lean and environment motion.
export type VPoint = { km: number; gradient: number; curve: number };
export type VCheckpoint = { km: number; label: string };

export type VRoute = {
  id: string;
  name: string;
  place: string;
  distanceKm: number;
  points: VPoint[];
  checkpoints: VCheckpoint[];
};

export type RouteState = {
  gradient: number;        // current gradient %
  upcomingGradient: number; // gradient ~0.4km ahead
  curve: number;           // -1..1
  progress: number;        // 0..1
  segmentLabel: string;    // nearest upcoming checkpoint
  remainingKm: number;
};

export const VIRTUAL_ROUTE: VRoute = {
  id: "alpine-sunset-pass",
  name: "Alpine Sunset Pass",
  place: "Dolomites, Italy",
  distanceKm: 20,
  points: [
    { km: 0, gradient: 1, curve: 0 },
    { km: 1.5, gradient: 3, curve: 0.3 },
    { km: 3, gradient: 6, curve: -0.5 },
    { km: 5, gradient: 8.5, curve: 0.4 },
    { km: 6.5, gradient: 5, curve: -0.2 },
    { km: 8, gradient: -2, curve: 0.6 },
    { km: 10, gradient: -4, curve: -0.6 },
    { km: 12, gradient: 2, curve: 0.2 },
    { km: 14, gradient: 7, curve: -0.4 },
    { km: 16, gradient: 9.5, curve: 0.5 },
    { km: 17.5, gradient: 4, curve: -0.3 },
    { km: 19, gradient: -3, curve: 0.3 },
    { km: 20, gradient: 0, curve: 0 },
  ],
  checkpoints: [
    { km: 3, label: "Lakeside Bend" },
    { km: 5, label: "First Ramp" },
    { km: 8, label: "Ridge Descent" },
    { km: 12, label: "Valley Straight" },
    { km: 16, label: "Summit Wall" },
    { km: 20, label: "Finish" },
  ],
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function sampleAt(route: VRoute, km: number): { gradient: number; curve: number } {
  const pts = route.points;
  const d = Math.max(0, Math.min(route.distanceKm, km));
  for (let i = 0; i < pts.length - 1; i++) {
    if (d >= pts[i].km && d <= pts[i + 1].km) {
      const t = (d - pts[i].km) / Math.max(0.0001, pts[i + 1].km - pts[i].km);
      return { gradient: lerp(pts[i].gradient, pts[i + 1].gradient, t), curve: lerp(pts[i].curve, pts[i + 1].curve, t) };
    }
  }
  const last = pts[pts.length - 1];
  return { gradient: last.gradient, curve: last.curve };
}

export function routeStateAt(route: VRoute, km: number): RouteState {
  const here = sampleAt(route, km);
  const ahead = sampleAt(route, km + 0.4);
  const next = route.checkpoints.find((c) => c.km >= km) ?? route.checkpoints[route.checkpoints.length - 1];
  return {
    gradient: Math.round(here.gradient * 10) / 10,
    upcomingGradient: Math.round(ahead.gradient * 10) / 10,
    curve: here.curve,
    progress: Math.max(0, Math.min(1, km / route.distanceKm)),
    segmentLabel: next?.label ?? "Finish",
    remainingKm: Math.max(0, route.distanceKm - km),
  };
}
