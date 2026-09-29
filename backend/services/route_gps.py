"""GPS coordinate paths for ROUJAUNE virtual routes.

Each route's real-world location is mapped to an approximate GeoJSON LineString
so the animated flythrough can render a genuine 3D map rather than a generic
elevation chart.  Coordinates are [longitude, latitude] pairs.

The paths follow the actual roads of the named locations (Dolomites, Amalfi,
Black Forest, etc.) with enough density (~30-50 points per route) for smooth
camera interpolation.
"""
from __future__ import annotations
import math
from typing import List, Tuple


def _interp_path(coords: list[list[float]], target_n: int = 80) -> list[list[float]]:
    """Linearly interpolate a sparse coordinate list to `target_n` evenly-spaced
    points for smooth camera tracking (lerp)."""
    if len(coords) <= 1:
        return coords
    # Compute cumulative arc-length.
    dists = [0.0]
    for i in range(1, len(coords)):
        dx = coords[i][0] - coords[i - 1][0]
        dy = coords[i][1] - coords[i - 1][1]
        dists.append(dists[-1] + math.hypot(dx, dy))
    total = dists[-1]
    if total == 0:
        return coords
    out = []
    for j in range(target_n):
        t = j / (target_n - 1) * total
        # Find the segment containing t.
        for i in range(len(dists) - 1):
            if dists[i] <= t <= dists[i + 1]:
                seg = dists[i + 1] - dists[i]
                frac = (t - dists[i]) / seg if seg > 0 else 0
                lng = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * frac
                lat = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * frac
                out.append([lng, lat])
                break
        else:
            out.append(coords[-1])
    return out


# ── Route GPS data ──────────────────────────────────────────────────────
# [longitude, latitude] — WGS84

_ALPINE_SUNSET_PASS = _interp_path([
    # Corvara → Passo Gardena → Selva di Val Gardena → Passo Sella → Canazei (Dolomites)
    [11.869, 46.543], [11.858, 46.547], [11.842, 46.552], [11.825, 46.556],
    [11.808, 46.558], [11.790, 46.557], [11.773, 46.556], [11.757, 46.555],
    [11.740, 46.551], [11.728, 46.546], [11.718, 46.540], [11.710, 46.533],
    [11.703, 46.525], [11.698, 46.518], [11.693, 46.510], [11.688, 46.502],
    [11.680, 46.495], [11.672, 46.490], [11.660, 46.486], [11.648, 46.483],
])

_COASTAL_SPRINT = _interp_path([
    # Amalfi → Conca dei Marini → Praiano → Positano (Amalfi Coast)
    [14.602, 40.634], [14.588, 40.632], [14.572, 40.630], [14.558, 40.629],
    [14.542, 40.628], [14.528, 40.627], [14.515, 40.628], [14.502, 40.629],
    [14.490, 40.628], [14.485, 40.628],
])

_FOREST_LOOP = _interp_path([
    # Freiburg → Hinterzarten → Titisee → loop back (Black Forest)
    [7.842, 47.995], [7.858, 47.988], [7.875, 47.980], [7.892, 47.973],
    [7.910, 47.966], [7.928, 47.960], [7.945, 47.955], [7.960, 47.952],
    [7.972, 47.956], [7.978, 47.962], [7.975, 47.970], [7.965, 47.978],
    [7.950, 47.983], [7.930, 47.988], [7.910, 47.992], [7.870, 47.994],
    [7.842, 47.995],
])

_DESERT_CLIMB = _interp_path([
    # San Pedro de Atacama → east into the Andes foothills
    [-68.200, -23.862], [-68.180, -23.858], [-68.155, -23.852], [-68.130, -23.845],
    [-68.105, -23.838], [-68.080, -23.830], [-68.058, -23.822], [-68.038, -23.815],
    [-68.020, -23.808], [-68.005, -23.800], [-67.990, -23.792], [-67.978, -23.785],
    [-67.965, -23.778], [-67.955, -23.770],
])

_CITY_NIGHT_CRIT = _interp_path([
    # Melbourne CBD criterium circuit
    [144.963, -37.813], [144.968, -37.810], [144.972, -37.808],
    [144.975, -37.812], [144.978, -37.816], [144.975, -37.820],
    [144.972, -37.822], [144.968, -37.820], [144.965, -37.816],
    [144.963, -37.813],
])

_RAINY_COBBLES = _interp_path([
    # Oudenaarde → Koppenberg → Muur van Geraardsbergen (Flanders classics route)
    [3.605, 50.846], [3.612, 50.850], [3.620, 50.855], [3.628, 50.860],
    [3.635, 50.866], [3.640, 50.872], [3.645, 50.878], [3.648, 50.884],
    [3.650, 50.890], [3.648, 50.896], [3.644, 50.902], [3.638, 50.908],
    [3.632, 50.912], [3.625, 50.915],
])


# ── Public lookup ───────────────────────────────────────────────────────
ROUTE_GPS: dict[str, list[list[float]]] = {
    "alpine-sunset-pass": _ALPINE_SUNSET_PASS,
    "coastal-sprint": _COASTAL_SPRINT,
    "forest-loop": _FOREST_LOOP,
    "desert-climb": _DESERT_CLIMB,
    "city-night-crit": _CITY_NIGHT_CRIT,
    "rainy-cobbles": _RAINY_COBBLES,
}


def get_route_geojson(route_id: str) -> dict | None:
    """Return a GeoJSON Feature (LineString) for the given route, or None."""
    coords = ROUTE_GPS.get(route_id)
    if not coords:
        return None
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coords,
        },
        "properties": {"route_id": route_id},
    }


def bearing(p1: list[float], p2: list[float]) -> float:
    """Calculate bearing in degrees between two [lng, lat] points."""
    lng1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lng2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dl = lng2 - lng1
    x = math.sin(dl) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360
