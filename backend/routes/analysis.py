"""Aggregate performance analysis: Performance Management Chart (Fitness /
Fatigue / Form) and all-time power records — combining indoor + outdoor rides.

PMC follows TrainingPeaks: CTL (Fitness, 42-day exp), ATL (Fatigue, 7-day exp),
TSB (Form) = yesterday's CTL - yesterday's ATL.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

import auth

udb = auth.udb
router = APIRouter(prefix="/analysis", tags=["analysis"])

CTL_TC = 42
ATL_TC = 7
RECORD_WINDOWS = [5, 60, 300, 1200]  # 5s, 1min, 5min, 20min
RECORD_LABELS = {5: "5 sec", 60: "1 min", 300: "5 min", 1200: "20 min"}


def _date_of(iso) -> str | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()
    except Exception:
        return None


@router.get("/pmc")
async def pmc(days: int = 90, forecast_days: int = 14):
    """Daily Fitness (CTL) / Fatigue (ATL) / Form (TSB) over the last `days`,
    plus a projected `forecast` of the next `forecast_days` assuming the rider
    keeps their recent (14-day) training rhythm."""
    days = max(14, min(365, days))
    forecast_days = max(0, min(28, forecast_days))
    rides = await udb.ride_history.find({}, {"_id": 0, "created_at": 1, "tss": 1, "duration_sec": 1}).to_list(length=2000)

    # Daily TSS totals.
    daily: dict[str, float] = {}
    earliest = None
    for r in rides:
        d = _date_of(r.get("created_at"))
        if not d:
            continue
        tss = r.get("tss")
        if tss is None and r.get("duration_sec"):
            tss = round((r["duration_sec"] / 3600.0) * 40)  # rough fallback
        if not tss:
            continue
        daily[d] = daily.get(d, 0) + float(tss)
        earliest = d if (earliest is None or d < earliest) else earliest

    today = datetime.now(timezone.utc).date()
    # Warm up CTL/ATL from all available history (start ~180d before window).
    start = today - timedelta(days=days + 180)
    ctl = atl = 0.0
    ka = 1 - math.exp(-1 / CTL_TC)
    kb = 1 - math.exp(-1 / ATL_TC)
    series = []
    cur = start
    while cur <= today:
        key = cur.isoformat()
        prev_ctl, prev_atl = ctl, atl
        load = daily.get(key, 0.0)
        ctl = prev_ctl + (load - prev_ctl) * ka
        atl = prev_atl + (load - prev_atl) * kb
        if cur > today - timedelta(days=days):
            series.append({
                "date": key,
                "ctl": round(ctl, 1),      # Fitness
                "atl": round(atl, 1),      # Fatigue
                "tsb": round(prev_ctl - prev_atl, 1),  # Form (from yesterday)
                "tss": round(load),
            })
        cur += timedelta(days=1)

    last = series[-1] if series else {"ctl": 0, "atl": 0, "tsb": 0}
    ramp = 0.0
    if len(series) >= 8:
        ramp = round(series[-1]["ctl"] - series[-8]["ctl"], 1)  # 7-day CTL ramp
    form = last["tsb"]

    # --- Form Forecast: project the next `forecast_days` assuming the rider's
    # recent 14-day average daily load continues.
    recent_load = sum(daily.get((today - timedelta(days=k)).isoformat(), 0.0) for k in range(14))
    proj = recent_load / 14.0
    fctl, fatl = ctl, atl
    forecast = []
    fcur = today + timedelta(days=1)
    for _ in range(forecast_days):
        p_ctl, p_atl = fctl, fatl
        fctl = p_ctl + (proj - p_ctl) * ka
        fatl = p_atl + (proj - p_atl) * kb
        forecast.append({
            "date": fcur.isoformat(),
            "ctl": round(fctl, 1), "atl": round(fatl, 1),
            "tsb": round(p_ctl - p_atl, 1), "tss": round(proj), "projected": True,
        })
        fcur += timedelta(days=1)
    fc_last = forecast[-1] if forecast else last

    return {
        "series": series,
        "fitness": last["ctl"], "fatigue": last["atl"], "form": last["tsb"],
        "ramp_rate": ramp, "form_state": _form_state(form),
        "weekly_tss": round(sum(s["tss"] for s in series[-7:])),
        "forecast": forecast,
        "forecast_fitness": fc_last["ctl"], "forecast_form": fc_last["tsb"],
        "forecast_state": _form_state(fc_last["tsb"]),
        "projected_daily_tss": round(proj, 1),
    }


def _form_state(form: float) -> str:
    if form > 5:
        return "Fresh"
    if form >= -10:
        return "Neutral"
    if form >= -30:
        return "Optimal training"
    return "High fatigue"


@router.get("/weekly-digest")
async def weekly_digest():
    """This week's recap: TSS, hours, rides, distance (vs last week) + any new
    all-time power records set in the last 7 days."""
    now = datetime.now(timezone.utc)
    wk_start = now - timedelta(days=7)
    prev_start = now - timedelta(days=14)

    def _dt(iso):
        try:
            return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None

    rides = await udb.ride_history.find(
        {}, {"_id": 0, "created_at": 1, "tss": 1, "duration_sec": 1, "distance_km": 1}).to_list(length=2000)

    def _bucket(lo, hi):
        agg = {"tss": 0.0, "seconds": 0.0, "rides": 0, "distance_km": 0.0}
        for r in rides:
            t = _dt(r.get("created_at"))
            if not t or not (lo <= t < hi):
                continue
            agg["rides"] += 1
            agg["tss"] += float(r.get("tss") or 0)
            agg["seconds"] += float(r.get("duration_sec") or 0)
            agg["distance_km"] += float(r.get("distance_km") or 0)
        return agg

    this_wk = _bucket(wk_start, now)
    last_wk = _bucket(prev_start, wk_start)

    # New power records this week: best watts this week beating everything before.
    acts = await udb.cycling_activities.find(
        {"route_data.power_curve": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "canonical_activity_id": 1, "name": 1, "started_at": 1, "route_data.power_curve": 1},
    ).to_list(length=1000)
    best_before: dict[int, float] = {}
    best_week: dict[int, dict] = {}
    for a in acts:
        curve = (a.get("route_data") or {}).get("power_curve") or []
        pt = {p["secs"]: p["watts"] for p in curve}
        t = _dt(a.get("started_at"))
        in_week = bool(t and t >= wk_start)
        for w in RECORD_WINDOWS:
            if w not in pt:
                continue
            watts = pt[w]
            if in_week:
                if w not in best_week or watts > best_week[w]["watts"]:
                    best_week[w] = {"watts": watts, "name": a.get("name") or "Ride",
                                    "activity_id": a.get("canonical_activity_id") or a.get("id")}
            else:
                if w not in best_before or watts > best_before[w]:
                    best_before[w] = watts
    new_records = []
    for w in RECORD_WINDOWS:
        if w in best_week:
            prev = best_before.get(w)
            if prev is None or best_week[w]["watts"] > prev:
                new_records.append({
                    "secs": w, "label": RECORD_LABELS[w], "watts": best_week[w]["watts"],
                    "prev": prev, "name": best_week[w]["name"], "activity_id": best_week[w]["activity_id"],
                })

    def _delta(a, b):
        return round(a - b, 1)

    return {
        "week_start": wk_start.date().isoformat(),
        "this_week": {
            "tss": round(this_wk["tss"]), "hours": round(this_wk["seconds"] / 3600.0, 1),
            "rides": this_wk["rides"], "distance_km": round(this_wk["distance_km"], 1),
        },
        "deltas": {
            "tss": _delta(this_wk["tss"], last_wk["tss"]),
            "hours": _delta(this_wk["seconds"] / 3600.0, last_wk["seconds"] / 3600.0),
            "rides": this_wk["rides"] - last_wk["rides"],
            "distance_km": _delta(this_wk["distance_km"], last_wk["distance_km"]),
        },
        "new_records": new_records,
        "has_activity": this_wk["rides"] > 0,
    }


async def _load_ride_samples(activity_id: str) -> dict | None:
    cid = activity_id[len("import-"):] if activity_id.startswith("import-") else activity_id
    return await udb.cycling_activities.find_one(
        {"$or": [{"id": cid}, {"canonical_activity_id": cid}]},
        {"_id": 0, "name": 1, "route_data": 1, "average_power": 1})


@router.get("/segment-compare")
async def segment_compare(a: str, b: str):
    """Match the same GPS climb across two rides so they line up hill-for-hill."""
    import segments as seg

    da = await _load_ride_samples(a)
    db_ = await _load_ride_samples(b)
    if not da or not db_:
        return {"matched": False, "reason": "not_found", "segments": []}

    pts_a = seg.build_track((da.get("route_data") or {}).get("samples") or [])
    pts_b = seg.build_track((db_.get("route_data") or {}).get("samples") or [])
    if len(pts_a) < 6 or len(pts_b) < 6:
        return {"matched": False, "reason": "no_gps", "segments": [],
                "a_name": da.get("name"), "b_name": db_.get("name")}

    climbs_a = seg.detect_climbs(pts_a)
    climbs_b = seg.detect_climbs(pts_b)
    pairs = seg.match_climbs(climbs_a, pts_a, climbs_b, pts_b)

    out = []
    for ca, cb in pairs:
        ra = seg.resample_climb(pts_a, ca)
        rb = seg.resample_climb(pts_b, cb)
        gain = round((ca["gain"] + cb["gain"]) / 2, 1)
        length = round((ca["length"] + cb["length"]) / 2, 1)
        delta = (rb["time_s"] or 0) - (ra["time_s"] or 0)
        out.append({
            "gain_m": gain, "length_m": length,
            "length_m_a": ca["length"], "length_m_b": cb["length"],
            "grad_pct": round((gain / length) * 100, 1) if length else None,
            "a": ra, "b": rb,
            "delta_s": round(delta, 1),
            "faster": "a" if delta > 0 else ("b" if delta < 0 else "tie"),
        })
    out.sort(key=lambda s: -s["gain_m"])
    return {
        "matched": bool(out), "segments": out,
        "a_name": da.get("name") or "Ride A", "b_name": db_.get("name") or "Ride B",
        "reason": None if out else "no_shared_climb",
    }


@router.get("/records")
async def records():
    """All-time best average power for key durations across every ride that has
    a power stream (uploaded/synced activities)."""
    acts = await udb.cycling_activities.find(
        {"route_data.power_curve": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "canonical_activity_id": 1, "name": 1, "started_at": 1, "route_data.power_curve": 1},
    ).to_list(length=1000)

    best: dict[int, dict] = {}
    for a in acts:
        curve = (a.get("route_data") or {}).get("power_curve") or []
        pt = {p["secs"]: p["watts"] for p in curve}
        for w in RECORD_WINDOWS:
            if w in pt and (w not in best or pt[w] > best[w]["watts"]):
                best[w] = {
                    "watts": pt[w],
                    "activity_id": a.get("canonical_activity_id") or a.get("id"),
                    "name": a.get("name") or "Ride",
                    "date": _date_of(a.get("started_at")),
                }
    return {
        "records": [
            {"secs": w, "label": RECORD_LABELS[w], **(best.get(w) or {"watts": None})}
            for w in RECORD_WINDOWS
        ],
        "has_data": bool(best),
    }
