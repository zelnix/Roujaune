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
  tag: string;           // short difficulty/character label for the picker
  elevationM: number;    // approx total climb (for summary/history)
  backdrop: any;         // AI-generated cinematic route scenery (rider composited on top)
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

export const VIRTUAL_ROUTES: VRoute[] = [
  {
    id: "alpine-sunset-pass",
    backdrop: require("../../assets/images/route_bg_alpine-sunset-pass.jpg"),
    name: "Alpine Sunset Pass",
    place: "Dolomites, Italy",
    distanceKm: 20,
    tag: "Big Climb",
    elevationM: 640,
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
  },
  {
    id: "coastal-sprint",
    backdrop: require("../../assets/images/route_bg_coastal-sprint.jpg"),
    name: "Coastal Sprint",
    place: "Amalfi Coast, Italy",
    distanceKm: 12,
    tag: "Fast & Flat",
    elevationM: 180,
    points: [
      { km: 0, gradient: 0, curve: 0 },
      { km: 1.5, gradient: 1.5, curve: 0.4 },
      { km: 3, gradient: -1, curve: -0.5 },
      { km: 4.5, gradient: 2, curve: 0.6 },
      { km: 6, gradient: 0, curve: -0.3 },
      { km: 7.5, gradient: 3, curve: 0.5 },
      { km: 9, gradient: -2, curve: -0.6 },
      { km: 10.5, gradient: 1, curve: 0.3 },
      { km: 12, gradient: 0, curve: 0 },
    ],
    checkpoints: [
      { km: 3, label: "Marina Curve" },
      { km: 6, label: "Cliff Straight" },
      { km: 9, label: "Harbour Bend" },
      { km: 12, label: "Finish" },
    ],
  },
  {
    id: "forest-loop",
    backdrop: require("../../assets/images/route_bg_forest-loop.jpg"),
    name: "Forest Loop",
    place: "Black Forest, Germany",
    distanceKm: 15,
    tag: "Rolling Hills",
    elevationM: 340,
    points: [
      { km: 0, gradient: 2, curve: 0 },
      { km: 2, gradient: 4, curve: 0.4 },
      { km: 4, gradient: -2, curve: -0.5 },
      { km: 6, gradient: 3.5, curve: 0.5 },
      { km: 8, gradient: 5, curve: -0.4 },
      { km: 10, gradient: -3, curve: 0.6 },
      { km: 12, gradient: 4, curve: -0.3 },
      { km: 14, gradient: 1, curve: 0.2 },
      { km: 15, gradient: 0, curve: 0 },
    ],
    checkpoints: [
      { km: 4, label: "Pine Gully" },
      { km: 8, label: "Meadow Rise" },
      { km: 12, label: "Creek Crossing" },
      { km: 15, label: "Finish" },
    ],
  },
  {
    id: "desert-climb",
    backdrop: require("../../assets/images/route_bg_desert-climb.jpg"),
    name: "Desert Climb",
    place: "Atacama, Chile",
    distanceKm: 18,
    tag: "Long Grind",
    elevationM: 720,
    points: [
      { km: 0, gradient: 2, curve: 0 },
      { km: 3, gradient: 4, curve: 0.2 },
      { km: 6, gradient: 5.5, curve: -0.3 },
      { km: 9, gradient: 6.5, curve: 0.3 },
      { km: 12, gradient: 7.5, curve: -0.2 },
      { km: 14, gradient: 6, curve: 0.4 },
      { km: 16, gradient: 4, curve: -0.3 },
      { km: 18, gradient: 0, curve: 0 },
    ],
    checkpoints: [
      { km: 4, label: "Dune Gate" },
      { km: 9, label: "Salt Flat Ramp" },
      { km: 14, label: "Canyon Wall" },
      { km: 18, label: "Summit Finish" },
    ],
  },
];

// Backwards-compatible default (first route).
export const VIRTUAL_ROUTE: VRoute = VIRTUAL_ROUTES[0];

export function getVRoute(id: string | null | undefined): VRoute {
  return VIRTUAL_ROUTES.find((r) => r.id === id) ?? VIRTUAL_ROUTES[0];
}

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
