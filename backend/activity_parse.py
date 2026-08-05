"""Parse an uploaded ride file (.fit / .gpx / .tcx) into a NormalizedActivity
dict (the shape `activity_sync.ingest_activities` expects) plus rich `route_data`
(decimated samples, power curve, zone time) for the ride-analysis screen.

Power-based metrics follow the TrainingPeaks model: NP (30s rolling, 4th-power
mean), IF = NP/FTP, TSS = (sec·NP·IF)/(FTP·3600)·100.
"""
from __future__ import annotations

import hashlib
import io
import math
from datetime import datetime, timezone
from typing import List, Optional

# Coggan 7 power zones as fraction of FTP (upper bounds; Z7 = open-ended).
POWER_ZONE_BOUNDS = [0.55, 0.75, 0.90, 1.05, 1.20, 1.50]
# 5 HR zones as fraction of max HR (upper bounds).
HR_ZONE_BOUNDS = [0.60, 0.70, 0.80, 0.90]
CURVE_WINDOWS = [1, 5, 15, 30, 60, 300, 600, 1200, 1800, 3600]
MAX_SAMPLES = 500


class Sample(dict):
    pass


def _semicircles_to_deg(v):
    return None if v is None else v * (180.0 / 2 ** 31)


# --------------------------------------------------------------------------- #
#  Format parsers -> list of raw records {t(sec), lat, lng, ele, power, hr,   #
#  cad, speed, dist}                                                          #
# --------------------------------------------------------------------------- #
def _parse_fit(raw: bytes):
    from fitparse import FitFile
    ff = FitFile(io.BytesIO(raw))
    recs, start = [], None
    session = {}
    for msg in ff.get_messages(("record", "session")):
        d = {f.name: f.value for f in msg.fields}
        if msg.name == "session":
            session = d
            continue
        ts = d.get("timestamp")
        if start is None and ts is not None:
            start = ts
        t = (ts - start).total_seconds() if (ts and start) else (len(recs))
        lat = d.get("position_lat")
        lng = d.get("position_long")
        recs.append({
            "t": t,
            "lat": _semicircles_to_deg(lat) if isinstance(lat, (int, float)) else None,
            "lng": _semicircles_to_deg(lng) if isinstance(lng, (int, float)) else None,
            "ele": d.get("enhanced_altitude") if d.get("enhanced_altitude") is not None else d.get("altitude"),
            "power": d.get("power"),
            "hr": d.get("heart_rate"),
            "cad": d.get("cadence"),
            "speed": d.get("enhanced_speed") if d.get("enhanced_speed") is not None else d.get("speed"),
            "dist": d.get("distance"),
        })
    meta = {"started_at": start.replace(tzinfo=timezone.utc).isoformat() if start else None,
            "session": session, "device_name": None, "name": None}
    return recs, meta


def _tag(el):
    return el.tag.rsplit("}", 1)[-1].lower()


def _parse_tcx(raw: bytes):
    import xml.etree.ElementTree as ET
    root = ET.fromstring(raw)
    recs, start = [], None
    name = None
    for tp in root.iter():
        if _tag(tp) != "trackpoint":
            continue
        rec = {"t": None, "lat": None, "lng": None, "ele": None, "power": None,
               "hr": None, "cad": None, "speed": None, "dist": None}
        for c in tp.iter():
            tag = _tag(c)
            txt = (c.text or "").strip()
            try:
                if tag == "time" and txt:
                    dt = datetime.fromisoformat(txt.replace("Z", "+00:00"))
                    if start is None:
                        start = dt
                    rec["t"] = (dt - start).total_seconds()
                elif tag == "latitudedegrees":
                    rec["lat"] = float(txt)
                elif tag == "longitudedegrees":
                    rec["lng"] = float(txt)
                elif tag == "altitudemeters":
                    rec["ele"] = float(txt)
                elif tag == "distancemeters":
                    rec["dist"] = float(txt)
                elif tag == "heartratebpm":
                    # HeartRateBpm has a child <Value>.
                    for ch in c:
                        if _tag(ch) == "value" and (ch.text or "").strip():
                            rec["hr"] = int(float(ch.text.strip()))
                elif tag == "cadence" and txt:
                    rec["cad"] = int(float(txt))
                elif tag == "watts" and txt:
                    rec["power"] = float(txt)
                elif tag == "speed" and txt:
                    rec["speed"] = float(txt)
            except (ValueError, TypeError):
                continue
        if rec["t"] is None:
            rec["t"] = len(recs)
        recs.append(rec)
    return recs, {"started_at": start.replace(tzinfo=timezone.utc).isoformat() if start else None,
                  "session": {}, "device_name": None, "name": name}


def _parse_gpx(raw: bytes):
    import gpxpy
    gpx = gpxpy.parse(raw.decode("utf-8", errors="ignore"))
    recs, start = [], None
    for track in gpx.tracks:
        for seg in track.segments:
            for pt in seg.points:
                t = pt.time
                if start is None and t is not None:
                    start = t
                rec = {
                    "t": (t - start).total_seconds() if (t and start) else len(recs),
                    "lat": pt.latitude, "lng": pt.longitude, "ele": pt.elevation,
                    "power": None, "hr": None, "cad": None, "speed": None, "dist": None,
                }
                # Extensions: power / TrackPointExtension (hr, cad)
                for ext in (pt.extensions or []):
                    for node in ext.iter():
                        tag = _tag(node)
                        val = (node.text or "").strip()
                        if not val:
                            continue
                        try:
                            if tag in ("power", "pwr"):
                                rec["power"] = float(val)
                            elif tag in ("hr", "heartrate"):
                                rec["hr"] = int(float(val))
                            elif tag in ("cad", "cadence"):
                                rec["cad"] = int(float(val))
                        except (ValueError, TypeError):
                            pass
                recs.append(rec)
    name = gpx.tracks[0].name if gpx.tracks else None
    return recs, {"started_at": start.replace(tzinfo=timezone.utc).isoformat() if start else None,
                  "session": {}, "device_name": None, "name": name}


# --------------------------------------------------------------------------- #
#  Metrics                                                                    #
# --------------------------------------------------------------------------- #
def _haversine(a, b):
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def _normalized_power(power):
    p = [x for x in power if x is not None]
    if len(p) < 30:
        return round(sum(p) / len(p)) if p else None
    roll = []
    acc = 0.0
    from collections import deque
    q = deque()
    for x in p:
        q.append(x); acc += x
        if len(q) > 30:
            acc -= q.popleft()
        if len(q) == 30:
            roll.append(acc / 30.0)
    if not roll:
        return round(sum(p) / len(p))
    return round((sum(r ** 4 for r in roll) / len(roll)) ** 0.25)


def _power_curve(power):
    p = [x if x is not None else 0 for x in power]
    n = len(p)
    if n == 0:
        return None
    pref = [0.0]
    for x in p:
        pref.append(pref[-1] + x)
    out = []
    for w in CURVE_WINDOWS:
        if w > n:
            break
        best = max((pref[i + w] - pref[i]) / w for i in range(0, n - w + 1))
        out.append({"secs": w, "watts": round(best)})
    return out


def _zone_seconds(values, bounds_frac, ref, nzones):
    if not ref:
        return None
    secs = [0] * nzones
    for v in values:
        if v is None:
            continue
        frac = v / ref
        z = nzones - 1
        for i, b in enumerate(bounds_frac):
            if frac < b:
                z = i
                break
        secs[z] += 1
    return secs if sum(secs) else None


def _decimate(recs, keep=MAX_SAMPLES):
    if len(recs) <= keep:
        return recs
    step = len(recs) / keep
    return [recs[int(i * step)] for i in range(keep)]


def parse_activity_file(filename: str, raw: bytes, ftp: int, max_hr: Optional[int] = None) -> dict:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    if ext == "fit":
        recs, meta = _parse_fit(raw)
    elif ext == "tcx":
        recs, meta = _parse_tcx(raw)
    elif ext in ("gpx",):
        recs, meta = _parse_gpx(raw)
    else:
        raise ValueError(f"Unsupported file type .{ext} (use .fit, .gpx or .tcx)")
    if not recs:
        raise ValueError("No track points found in the file")

    power = [r.get("power") for r in recs]
    hr = [r.get("hr") for r in recs]
    cad = [r.get("cad") for r in recs]
    spd = [r.get("speed") for r in recs]
    has_gps = any(r.get("lat") is not None and r.get("lng") is not None for r in recs)
    pw = [x for x in power if x]
    hrv = [x for x in hr if x]
    cadv = [x for x in cad if x]

    # Duration
    ts = [r["t"] for r in recs if r.get("t") is not None]
    elapsed = int(max(ts) - min(ts)) if len(ts) >= 2 else len(recs)
    elapsed = max(elapsed, 1)

    # Distance + elevation from GPS (fallback to stream distance)
    dist_m, gain, loss = 0.0, 0.0, 0.0
    last_ll = None
    last_ele = None
    for r in recs:
        if has_gps and r.get("lat") is not None and r.get("lng") is not None:
            if last_ll:
                dist_m += _haversine(last_ll, (r["lat"], r["lng"]))
            last_ll = (r["lat"], r["lng"])
        e = r.get("ele")
        if e is not None and last_ele is not None:
            de = e - last_ele
            if de > 0.5:
                gain += de
            elif de < -0.5:
                loss += -de
        if e is not None:
            last_ele = e
    if dist_m == 0:
        streamd = [r.get("dist") for r in recs if r.get("dist") is not None]
        if streamd:
            dist_m = max(streamd) - min(streamd)

    session = meta.get("session") or {}
    # Prefer authoritative device totals (FIT session) when derived values are 0.
    if (not gain) and session.get("total_ascent"):
        gain = float(session["total_ascent"])
    if (not loss) and session.get("total_descent"):
        loss = float(session["total_descent"])
    if (not dist_m) and session.get("total_distance"):
        dist_m = float(session["total_distance"])
    np = _normalized_power(power) if pw else None
    avg_p = round(sum(pw) / len(pw)) if pw else None
    ifv = round(np / ftp, 3) if (np and ftp) else None
    tss = round((elapsed * (np or 0) * (ifv or 0)) / (ftp * 3600) * 100) if (np and ifv and ftp) else None
    kj = round(sum(pw) / 1000) if pw else None

    route_data = {
        "has_gps": has_gps,
        "has_power": bool(pw), "has_hr": bool(hrv), "has_cadence": bool(cadv),
        "samples": [
            {k: (round(v, 5) if isinstance(v, float) and k in ("lat", "lng")
                 else round(v, 1) if isinstance(v, float) else v)
             for k, v in {
                 "t": int(r.get("t") or 0), "lat": r.get("lat"), "lng": r.get("lng"),
                 "ele": r.get("ele"), "power": r.get("power"), "hr": r.get("hr"),
                 "cad": r.get("cad"), "dist": r.get("dist"),
             }.items()}
            for r in _decimate(recs)
        ],
        "power_curve": _power_curve(power) if pw else None,
        "time_in_power_zones": _zone_seconds(power, POWER_ZONE_BOUNDS, ftp, 7),
        "time_in_hr_zones": _zone_seconds(hr, HR_ZONE_BOUNDS, max_hr, 5) if max_hr else None,
        "ftp_used": ftp, "max_hr_used": max_hr,
    }

    fid = hashlib.sha1(raw).hexdigest()[:16]
    return {
        "provider": "upload",
        "external_activity_id": fid,
        "name": meta.get("name") or (filename.rsplit(".", 1)[0] if filename else "Outdoor Ride"),
        "started_at": meta.get("started_at"),
        "elapsed_seconds": elapsed,
        "moving_seconds": elapsed,
        "distance_metres": round(dist_m, 1) if dist_m else None,
        "elevation_gain_metres": round(gain) if gain else None,
        "elevation_loss_metres": round(loss) if loss else None,
        "average_power": avg_p, "maximum_power": round(max(pw)) if pw else None,
        "normalised_power": np,
        "average_heart_rate": round(sum(hrv) / len(hrv)) if hrv else None,
        "maximum_heart_rate": max(hrv) if hrv else None,
        "average_cadence": round(sum(cadv) / len(cadv)) if cadv else None,
        "maximum_cadence": max(cadv) if cadv else None,
        "average_speed": round(sum(x for x in spd if x) / len([x for x in spd if x]), 2) if any(spd) else None,
        "maximum_speed": round(max(x for x in spd if x), 2) if any(spd) else None,
        "calories": kj,
        "training_load": tss,
        "intensity_factor": ifv,
        "route_data": route_data,
        "indoor_outdoor": "outdoor" if has_gps else "indoor",
        "activity_type": "cycling",
        "device_name": meta.get("device_name"),
    }
