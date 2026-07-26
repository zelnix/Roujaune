import { VIRTUAL_ROUTES, getVRoute, routeStateAt, routeTerrainBias, RouteState, VRoute } from "./vroutes";

// Pick the virtual route whose terrain best matches the chosen workout's type.
const TYPE_VROUTE: Record<string, string> = {
  climbing: "alpine-sunset-pass",
  threshold: "desert-climb",
  vo2max: "city-night-crit",
  sprints: "coastal-sprint",
  tempo: "forest-loop",
  endurance: "forest-loop",
  recovery: "coastal-sprint",
  restday: "coastal-sprint",
  fb50: "forest-loop",
};

export function vrouteIdForType(typeId?: string): string {
  return TYPE_VROUTE[typeId ?? ""] ?? VIRTUAL_ROUTES[0].id;
}

export type VirtualRideTelemetry = {
  power: number;
  cadence: number;
  speed: number;
  hr: number;
  elapsed: number;
};

export type VirtualRideDerived = {
  vroute: VRoute;
  vState: RouteState;
  vResistance: number;
  vMetrics: { power: number; cadence: number; speed: number; hr: number; elapsed: number; riddenKm: number };
};

/**
 * Derive everything the Virtual Ride player needs from the ongoing workout:
 * maps the workout's 0..1 progress onto the scenic route (so gradient / elevation
 * / checkpoints track along), computes route-aware resistance, and prepares the
 * scene metrics (keeping the rider pedalling with sensible defaults when there's
 * no connected trainer — a time-based ride).
 */
export function deriveVirtualRide(
  vRouteId: string,
  progress: number,
  riddenKm: number,
  t: VirtualRideTelemetry,
  trainerOn: boolean,
  paused: boolean,
): VirtualRideDerived {
  const vroute = getVRoute(vRouteId);
  const vState = routeStateAt(vroute, progress * vroute.distanceKm);
  const vResistance = Math.round(Math.max(55, Math.min(150, 100 + vState.gradient * 7 + routeTerrainBias(vroute.id))));
  const vMetrics = {
    power: Math.round(t.power),
    cadence: trainerOn ? Math.round(t.cadence) : (paused ? 0 : 84),
    speed: trainerOn ? t.speed : (paused ? 0 : Math.max(22, t.speed)),
    hr: Math.round(t.hr),
    elapsed: t.elapsed,
    riddenKm,
  };
  return { vroute, vState, vResistance, vMetrics };
}
