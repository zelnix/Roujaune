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
async def pmc(days: int = 90):
    """Daily Fitness (CTL) / Fatigue (ATL) / Form (TSB) over the last `days`."""
    days = max(14, min(365, days))
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
    if form > 5:
        state = "Fresh"
    elif form >= -10:
        state = "Neutral"
    elif form >= -30:
        state = "Optimal training"
    else:
        state = "High fatigue"
    return {
        "series": series,
        "fitness": last["ctl"], "fatigue": last["atl"], "form": last["tsb"],
        "ramp_rate": ramp, "form_state": state,
        "weekly_tss": round(sum(s["tss"] for s in series[-7:])),
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
