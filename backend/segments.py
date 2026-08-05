"""GPS climb detection + matching for Segment Compare.

Given two rides' decimated GPS samples, find climbs in each and match the same
physical climb across both rides (by start-point proximity + similar length) so
they can be compared hill-for-hill.
"""
from __future__ import annotations

import math
from typing import List, Optional


def haversine(a: tuple, b: tuple) -> float:
    R = 6371000.0
    lat1, lon1 = a
    lat2, lon2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def build_track(samples: List[dict]) -> List[dict]:
    """Points {d: cumulative metres, ele, lat, lng, t} for samples with elevation."""
    pts: List[dict] = []
    cum = 0.0
    last_ll = None
    for s in samples or []:
        lat, lng = s.get("lat"), s.get("lng")
        d = s.get("dist")
        if d is not None:
            cum = float(d)
        elif lat is not None and lng is not None:
            if last_ll is not None:
                cum += haversine(last_ll, (lat, lng))
            last_ll = (lat, lng)
        ele = s.get("ele")
        if ele is None:
            continue
        pts.append({"d": cum, "ele": float(ele), "lat": lat, "lng": lng, "t": float(s.get("t") or 0)})
    return pts


def _smooth_ele(pts: List[dict], win: int = 3) -> None:
    n = len(pts)
    ele = [p["ele"] for p in pts]
    for i in range(n):
        lo = max(0, i - win)
        hi = min(n, i + win + 1)
        pts[i]["se"] = sum(ele[lo:hi]) / (hi - lo)


def detect_climbs(pts: List[dict], min_gain: float = 30.0, min_grad: float = 0.03,
                  min_len: float = 400.0) -> List[dict]:
    """Greedy valley→peak climb detector with small-dip tolerance."""
    n = len(pts)
    if n < 6:
        return []
    _smooth_ele(pts)
    climbs: List[dict] = []
    i = 0
    while i < n - 1:
        if pts[i + 1]["se"] <= pts[i]["se"]:
            i += 1
            continue
        # Ascent begins at i. Extend to the peak, tolerating minor dips.
        j = i
        peak = i
        while j < n - 1:
            nxt = pts[j + 1]["se"]
            # Stop once we've dropped >12 m below the running peak (real descent).
            if pts[peak]["se"] - nxt > 12.0:
                break
            j += 1
            if pts[j]["se"] > pts[peak]["se"]:
                peak = j
        gain = pts[peak]["se"] - pts[i]["se"]
        length = pts[peak]["d"] - pts[i]["d"]
        if gain >= min_gain and length >= min_len and (gain / length) >= min_grad:
            climbs.append({
                "start": i, "end": peak, "gain": round(gain, 1), "length": round(length, 1),
                "start_lat": pts[i].get("lat"), "start_lng": pts[i].get("lng"),
            })
        i = max(peak, i + 1)
    return climbs


def _interp_at(pts: List[dict], start: int, end: int, target_d: float) -> dict:
    """Interpolate {ele, t} at absolute cumulative distance target_d within [start,end]."""
    lo, hi = start, end
    # clamp
    if target_d <= pts[start]["d"]:
        p = pts[start]
        return {"ele": p["ele"], "t": p["t"]}
    if target_d >= pts[end]["d"]:
        p = pts[end]
        return {"ele": p["ele"], "t": p["t"]}
    k = start
    while k < end and pts[k + 1]["d"] < target_d:
        k += 1
    a, b = pts[k], pts[k + 1]
    span = (b["d"] - a["d"]) or 1.0
    f = (target_d - a["d"]) / span
    return {"ele": a["ele"] + (b["ele"] - a["ele"]) * f, "t": a["t"] + (b["t"] - a["t"]) * f}


def resample_climb(pts: List[dict], climb: dict, n: int = 50) -> dict:
    """Sample the climb into n points by fraction of its distance; derive speed."""
    start, end = climb["start"], climb["end"]
    start_d = pts[start]["d"]
    length = climb["length"] or 1.0
    start_t = pts[start]["t"]
    series = []
    prev = None
    for i in range(n + 1):
        f = i / n
        target_d = start_d + f * length
        v = _interp_at(pts, start, end, target_d)
        seg_d = length / n  # metres per step
        speed = None
        if prev is not None:
            dt = v["t"] - prev["t"]
            speed = round((seg_d / dt) * 3.6, 1) if dt > 0.1 else None
        pt = {
            "f": round(f, 3),
            "d": round(f * length, 1),
            "ele": round(v["ele"], 1),
            "t": round(v["t"] - start_t, 1),
            "speed": speed,
        }
        series.append(pt)
        prev = v
    total_t = pts[end]["t"] - start_t
    avg_speed = round((length / total_t) * 3.6, 1) if total_t > 0 else None
    return {"time_s": round(total_t, 1), "avg_speed_kmh": avg_speed, "series": series}


def match_climbs(climbs_a: List[dict], pts_a: List[dict],
                 climbs_b: List[dict], pts_b: List[dict],
                 max_start_gap: float = 300.0, len_tol: float = 0.45) -> List[tuple]:
    """Pair the same physical climb across two rides (needs GPS on both)."""
    pairs: List[tuple] = []
    used_b = set()
    for ca in sorted(climbs_a, key=lambda c: -c["gain"]):
        if ca.get("start_lat") is None:
            continue
        best = None
        best_score: Optional[float] = None
        for k, cb in enumerate(climbs_b):
            if k in used_b or cb.get("start_lat") is None:
                continue
            gap = haversine((ca["start_lat"], ca["start_lng"]), (cb["start_lat"], cb["start_lng"]))
            if gap > max_start_gap:
                continue
            lr = abs(ca["length"] - cb["length"]) / max(ca["length"], cb["length"], 1.0)
            if lr > len_tol:
                continue
            score = gap + lr * 1000.0
            if best_score is None or score < best_score:
                best_score = score
                best = (k, cb)
        if best is not None:
            used_b.add(best[0])
            pairs.append((ca, best[1]))
    return pairs
