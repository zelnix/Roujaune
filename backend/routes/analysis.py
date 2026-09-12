"""Aggregate performance analysis: Performance Management Chart (Fitness /
Fatigue / Form) and all-time power records — combining indoor + outdoor rides.

PMC follows TrainingPeaks: CTL (Fitness, 42-day exp), ATL (Fatigue, 7-day exp),
TSB (Form) = yesterday's CTL - yesterday's ATL.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone, date

from fastapi import APIRouter, HTTPException

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


def _lin_trend(pairs: list) -> dict | None:
    """Least-squares slope of (index, value) points + first/last averages.
    `pairs` is a chronological list of numeric values."""
    vals = [v for v in pairs if v is not None]
    if len(vals) < 3:
        return None
    n = len(vals)
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(vals) / n
    denom = sum((x - mx) ** 2 for x in xs) or 1.0
    slope = sum((x - mx) * (v - my) for x, v in zip(xs, vals)) / denom
    third = max(1, n // 3)
    early = sum(vals[:third]) / third
    late = sum(vals[-third:]) / third
    pct = ((late - early) / abs(early) * 100) if early else 0.0
    return {"slope": round(slope, 4), "early": round(early, 3), "late": round(late, 3),
            "pct": round(pct, 1), "n": n}


@router.get("/adaptation")
async def adaptation(weeks: int = 8):
    """Longitudinal adaptation assessment: EF / decoupling / HRR / W'-drain trends
    over recent rides, the TSB training-load band, 'what's improving' callouts, and
    a coach-acting recommendation (small tweaks auto-apply; big changes to confirm)."""
    weeks = max(2, min(26, weeks))
    since = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).isoformat()
    rides = await udb.ride_history.find(
        {"created_at": {"$gte": since}},
        {"_id": 0, "created_at": 1, "workout": 1, "ef": 1, "vi": 1, "decoupling": 1,
         "hrr60": 1, "w_prime_min_pct": 1, "intensity": 1, "avg_hr": 1, "norm_power": 1, "tiz": 1},
    ).sort("created_at", 1).to_list(length=2000)

    def _series(key):
        return [r.get(key) for r in rides if r.get(key) is not None]

    ef_t = _lin_trend(_series("ef"))
    dc_t = _lin_trend(_series("decoupling"))
    hrr_t = _lin_trend(_series("hrr60"))
    wp_t = _lin_trend(_series("w_prime_min_pct"))

    # Zone-2 EF trend (aerobic efficiency at endurance intensity) is the cleanest
    # adaptation signal — filter to steady endurance rides (IF 0.6–0.85).
    z2 = [r.get("ef") for r in rides if r.get("ef") and 0.55 <= (r.get("intensity") or 0) <= 0.85]
    ef_z2_t = _lin_trend(z2)

    try:
        pmc_data = await pmc(days=max(42, weeks * 7), forecast_days=0)
    except Exception:
        pmc_data = {}
    tsb = pmc_data.get("form", 0)
    ctl = pmc_data.get("fitness", 0)
    ramp = pmc_data.get("ramp_rate", 0)

    callouts: list[dict] = []
    if (ef_z2_t or ef_t) and (ef_z2_t or ef_t)["pct"] >= 3:
        t = ef_z2_t or ef_t
        callouts.append({"kind": "ef", "good": True,
            "text": f"Aerobic efficiency is up {t['pct']}% — you're making more watts for the same heart rate."})
    elif (ef_z2_t or ef_t) and (ef_z2_t or ef_t)["pct"] <= -4:
        t = ef_z2_t or ef_t
        callouts.append({"kind": "ef", "good": False,
            "text": f"Aerobic efficiency has dipped {abs(t['pct'])}% lately — likely fatigue or under-fuelling."})
    if dc_t and dc_t["late"] < dc_t["early"] - 1:
        callouts.append({"kind": "decoupling", "good": True,
            "text": f"Your power-to-HR is holding steadier late in rides ({dc_t['late']}% drift vs {dc_t['early']}%) — better muscular endurance."})
    elif dc_t and dc_t["late"] > 8:
        callouts.append({"kind": "decoupling", "good": False,
            "text": f"HR is drifting up ~{dc_t['late']}% in the back half of rides — ease the intensity or fuel earlier."})
    if hrr_t and hrr_t["pct"] >= 8:
        callouts.append({"kind": "hrr", "good": True,
            "text": f"Heart-rate recovery is quicker (+{hrr_t['pct']}%) — your fitness base is deepening."})
    if wp_t and wp_t["late"] > wp_t["early"] + 4:
        callouts.append({"kind": "w_prime", "good": True,
            "text": f"You're finishing hard efforts with more in the tank ({wp_t['late']}% vs {wp_t['early']}%) — anaerobic stamina is up."})

    # Coach acting: hybrid. Small nudges auto-apply via the existing zone-bias
    # engine; big load changes are surfaced here for the rider to confirm.
    auto_apply: list[str] = []
    confirm: list[dict] = []
    if ctl and ramp is not None:
        if ramp > 8:
            confirm.append({"kind": "ease_volume",
                "text": f"Your fitness is ramping fast (+{ramp}/wk). Want me to hold next week's volume steady so fatigue doesn't outrun recovery?"})
        elif ramp < -6 and tsb > 10:
            confirm.append({"kind": "add_volume",
                "text": f"You're fresh (Form +{tsb}) and training has dropped off. Want me to add an endurance ride next week to rebuild fitness?"})
    if tsb is not None and tsb < -25:
        confirm.append({"kind": "recovery_week",
            "text": f"Form is deep in the hole (TSB {tsb}). I'd recommend an easier recovery week — apply it?"})
    if (ef_z2_t or ef_t) and (ef_z2_t or ef_t)["pct"] >= 6:
        auto_apply.append("Nudged your endurance targets up slightly to match your improved efficiency.")

    return {
        "has_data": len(rides) >= 3,
        "ride_count": len(rides),
        "trends": {"ef": ef_t, "ef_z2": ef_z2_t, "decoupling": dc_t, "hrr": hrr_t, "w_prime": wp_t},
        "series": {
            "ef": _series("ef")[-12:],
            "decoupling": _series("decoupling")[-12:],
            "hrr": _series("hrr60")[-12:],
            "w_prime": _series("w_prime_min_pct")[-12:],
        },
        "load": {"ctl": ctl, "tsb": tsb, "ramp_rate": ramp, "form_state": pmc_data.get("form_state")},
        "callouts": callouts,
        "coach_actions": {"auto_apply": auto_apply, "confirm": confirm},
    }



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


async def _daily_tss() -> dict:
    rides = await udb.ride_history.find({}, {"_id": 0, "created_at": 1, "tss": 1, "duration_sec": 1}).to_list(length=2000)
    daily: dict[str, float] = {}
    for r in rides:
        d = _date_of(r.get("created_at"))
        if not d:
            continue
        tss = r.get("tss")
        if tss is None and r.get("duration_sec"):
            tss = round((r["duration_sec"] / 3600.0) * 40)
        if not tss:
            continue
        daily[d] = daily.get(d, 0) + float(tss)
    return daily


def _ctl_atl_today(daily: dict, today: date) -> tuple:
    """Current CTL/ATL by walking the whole history to today. Returns (ctl, atl,
    ka, kb, recent_avg_daily_load)."""
    ka = 1 - math.exp(-1 / CTL_TC)
    kb = 1 - math.exp(-1 / ATL_TC)
    ctl = atl = 0.0
    start = date.fromisoformat(min(daily)) if daily else today
    cur = start
    while cur <= today:
        load = daily.get(cur.isoformat(), 0.0)
        ctl += (load - ctl) * ka
        atl += (load - atl) * kb
        cur += timedelta(days=1)
    recent = sum(daily.get((today - timedelta(days=k)).isoformat(), 0.0) for k in range(14)) / 14.0
    return ctl, atl, ka, kb, recent


@router.get("/event")
async def get_event():
    doc = await udb.settings.find_one({"id": "event"}) or {}
    return {"event_date": doc.get("event_date"), "event_name": doc.get("event_name")}


@router.put("/event")
async def put_event(body: dict):
    ed = (body or {}).get("event_date")
    en = (body or {}).get("event_name")
    await udb.settings.update_one({"id": "event"}, {"$set": {"event_date": ed, "event_name": en}}, upsert=True)
    return {"event_date": ed, "event_name": en}


@router.get("/form-target")
async def form_target():
    """Project the rider's Form (TSB) onto their saved event date and say whether
    they're on track to arrive fresh."""
    doc = await udb.settings.find_one({"id": "event"}) or {}
    ed = doc.get("event_date")
    if not ed:
        return {"has_event": False}
    try:
        target = date.fromisoformat(str(ed)[:10])
    except Exception:
        return {"has_event": False}
    today = datetime.now(timezone.utc).date()
    days_out = (target - today).days
    base = {"has_event": True, "event_date": ed, "event_name": doc.get("event_name"), "days_out": days_out}
    if days_out < 0:
        return {**base, "past": True}

    daily = await _daily_tss()
    ctl, atl, ka, kb, proj = _ctl_atl_today(daily, today)
    p_ctl, p_atl = ctl, atl
    fctl, fatl = ctl, atl
    for _ in range(max(0, days_out)):
        p_ctl, p_atl = fctl, fatl
        fctl = p_ctl + (proj - p_ctl) * ka
        fatl = p_atl + (proj - p_atl) * kb
    form = round(p_ctl - p_atl, 1)  # TSB on event morning
    state = _form_state(form)
    return {
        **base, "past": False,
        "projected_form": form, "projected_fitness": round(fctl, 1),
        "state": state, "fresh": form > 5, "projected_daily_tss": round(proj, 1),
        "current_form": round(ctl - atl, 1), "current_fitness": round(ctl, 1),
    }


@router.get("/climb-leaderboard")
async def climb_leaderboard():
    """Group every GPS climb the rider has done into repeatable climbs and rank
    each climb's attempts fastest-first (PR at the top)."""
    import segments as seg

    acts = await udb.cycling_activities.find(
        {"route_data.samples": {"$exists": True}},
        {"_id": 0, "id": 1, "canonical_activity_id": 1, "name": 1, "started_at": 1, "route_data.samples": 1},
    ).to_list(length=300)

    entries = []
    latest_date = ""
    for a in acts:
        pts = seg.build_track((a.get("route_data") or {}).get("samples") or [])
        if len(pts) < 6:
            continue
        aid = a.get("canonical_activity_id") or a.get("id")
        adate = a.get("started_at") or ""
        if adate > latest_date:
            latest_date = adate
        for c in seg.detect_climbs(pts):
            if c.get("start_lat") is None:
                continue
            r = seg.resample_climb(pts, c)
            entries.append({
                "aid": aid, "name": a.get("name") or "Ride", "date": adate,
                "gain": c["gain"], "length": c["length"],
                "start": (c["start_lat"], c["start_lng"]),
                "time_s": r["time_s"], "avg_speed": r["avg_speed_kmh"],
                "path": seg.climb_path(pts, c),
            })

    clusters: list = []
    for e in entries:
        placed = False
        for cl in clusters:
            rep = cl[0]
            gap = seg.haversine(e["start"], rep["start"])
            lr = abs(e["length"] - rep["length"]) / max(e["length"], rep["length"], 1.0)
            if gap < 300 and lr < 0.45:
                cl.append(e)
                placed = True
                break
        if not placed:
            clusters.append([e])

    out = []
    for atts in clusters:
        if len(atts) < 2:
            continue
        ranked = sorted(atts, key=lambda x: (x["time_s"] is None, x["time_s"] or 0))
        best = ranked[0]["time_s"] or 0
        second = ranked[1]["time_s"] if len(ranked) > 1 and ranked[1]["time_s"] is not None else None
        gain = round(sum(a["gain"] for a in atts) / len(atts), 1)
        length = round(sum(a["length"] for a in atts) / len(atts), 1)
        # A "new PR" = the fastest attempt is the rider's most recent ride overall,
        # and it beat their previous best on this climb.
        pr_att = ranked[0]
        new_pr = bool(latest_date and pr_att["date"] == latest_date and second is not None and best < second)
        out.append({
            "id": f"climb-{round(atts[0]['start'][0], 4)}-{round(atts[0]['start'][1], 4)}",
            "name": ranked[0]["name"],
            "gain_m": gain, "length_m": length,
            "grad_pct": round(gain / length * 100, 1) if length else None,
            "count": len(atts),
            "path": pr_att.get("path") or [],
            "new_pr": new_pr,
            "pr_improvement_s": round(second - best, 1) if (new_pr and second is not None) else None,
            "attempts": [{
                "activity_id": a["aid"], "name": a["name"], "date": a["date"],
                "time_s": a["time_s"], "avg_speed_kmh": a["avg_speed"],
                "pr": a["time_s"] == best,
                "gap_s": round((a["time_s"] or 0) - best, 1) if a["time_s"] is not None else None,
            } for a in ranked],
        })
    out.sort(key=lambda c: (not c["new_pr"], -c["count"]))
    return {"climbs": out, "has_data": bool(out)}


def _prev_week(y, w):
    d = date.fromisocalendar(y, w, 1) - timedelta(days=7)
    i = d.isocalendar()
    return (i[0], i[1])


def _run_from(covered: set, this_week_key: tuple) -> tuple:
    """Current streak length walking back over `covered` weeks + the first
    uncovered (gap) week where it stops."""
    current = 0
    cursor = this_week_key
    if this_week_key not in covered:
        cursor = _prev_week(*this_week_key)
    while cursor in covered:
        current += 1
        cursor = _prev_week(*cursor)
    return current, cursor


async def _ride_weeks() -> tuple:
    rides = await udb.ride_history.find({}, {"_id": 0, "created_at": 1}).to_list(length=3000)
    weeks = set()
    per_week: dict = {}
    for r in rides:
        d = _date_of(r.get("created_at"))
        if not d:
            continue
        try:
            iso = date.fromisoformat(d).isocalendar()
        except Exception:
            continue
        key = (iso[0], iso[1])
        weeks.add(key)
        per_week[key] = per_week.get(key, 0) + 1
    return weeks, per_week


@router.get("/streak")
async def training_streak():
    """Weekly consistency streak (with optional Streak Freeze tokens that bridge
    an off-week). Returns current + best streak, this week's rides, at-risk nudge,
    and freeze-token state."""
    ride_weeks, per_week = await _ride_weeks()
    freeze = await udb.settings.find_one({"id": "streak_freeze"}) or {}
    frozen = set(tuple(x) for x in freeze.get("frozen", []))
    covered = ride_weeks | frozen

    today = datetime.now(timezone.utc).date()
    this_iso = today.isocalendar()
    this_week_key = (this_iso[0], this_iso[1])
    this_week_rides = per_week.get(this_week_key, 0)

    current, gap = _run_from(covered, this_week_key)
    active = this_week_key in covered or current > 0

    best = 0
    for wk in covered:
        run = 0
        c = wk
        while c in covered:
            run += 1
            c = _prev_week(*c)
        best = max(best, run)

    earned = min(3, 1 + len(ride_weeks) // 4)
    tokens = max(0, earned - len(frozen))
    before_gap = _prev_week(*gap)
    can_freeze = bool(tokens > 0 and gap not in covered and before_gap in covered and current > 0)
    at_risk = bool(active and this_week_rides == 0 and today.isoweekday() >= 4)

    return {"current_weeks": current, "best_weeks": best, "this_week_rides": this_week_rides,
            "active": active, "weeks_ridden": len(ride_weeks),
            "at_risk": at_risk,
            "days_left": 7 - today.isoweekday(), "weekday": today.isoweekday(),
            "freeze_tokens": tokens, "frozen_weeks": len(frozen), "can_freeze": can_freeze,
            "suggest_freeze": bool(can_freeze or (at_risk and tokens > 0)),
            "gap_week": f"{gap[0]}-W{gap[1]:02d}"}


@router.post("/streak-freeze")
async def streak_freeze():
    """Spend a Streak Freeze token — bridges the off-week breaking the streak, or
    (if the streak is at risk this week) pre-emptively protects the current week."""
    ride_weeks, per_week = await _ride_weeks()
    freeze = await udb.settings.find_one({"id": "streak_freeze"}) or {}
    frozen = set(tuple(x) for x in freeze.get("frozen", []))
    covered = ride_weeks | frozen

    today = datetime.now(timezone.utc).date()
    this_iso = today.isocalendar()
    this_week_key = (this_iso[0], this_iso[1])
    this_week_rides = per_week.get(this_week_key, 0)
    current, gap = _run_from(covered, this_week_key)

    earned = min(3, 1 + len(ride_weeks) // 4)
    tokens = max(0, earned - len(frozen))
    before_gap = _prev_week(*gap)
    active = this_week_key in covered or current > 0
    at_risk = bool(active and this_week_rides == 0 and today.isoweekday() >= 4)

    if tokens <= 0:
        return {"ok": False, "reason": "no_tokens"}
    if gap not in covered and before_gap in covered and current > 0:
        target = gap  # bridge the off-week that breaks the run
    elif at_risk and this_week_key not in covered:
        target = this_week_key  # pre-emptively protect this week
    else:
        return {"ok": False, "reason": "nothing_to_freeze"}

    frozen.add(target)
    await udb.settings.update_one(
        {"id": "streak_freeze"}, {"$set": {"frozen": [list(f) for f in frozen]}}, upsert=True)
    return {"ok": True, "frozen_week": f"{target[0]}-W{target[1]:02d}"}


def _cluster_climbs(entries: list) -> list:
    import segments as seg
    clusters: list = []
    for e in entries:
        placed = False
        for cl in clusters:
            rep = cl[0]
            gap = seg.haversine(e["start"], rep["start"])
            lr = abs(e["length"] - rep["length"]) / max(e["length"], rep["length"], 1.0)
            if gap < 300 and lr < 0.45:
                cl.append(e)
                placed = True
                break
        if not placed:
            clusters.append([e])
    return clusters


@router.get("/milestone-wall")
async def milestone_wall():
    """Every milestone across rides / distance / hours, marked earned or locked."""
    ms = await milestones()

    def _rows(arr, total, unit=""):
        return [{"value": m, "label": f"{m:,}{unit}", "reached": total >= m} for m in arr]

    cats = [
        {"key": "rides", "title": "Rides", "icon": "bicycle", "current": ms["total_rides"],
         "rows": _rows(MILESTONE_RIDES, ms["total_rides"])},
        {"key": "distance", "title": "Distance", "icon": "map", "current": round(ms["total_km"]),
         "rows": _rows(MILESTONE_KM, ms["total_km"], " km")},
        {"key": "hours", "title": "Hours", "icon": "time", "current": round(ms["total_hours"]),
         "rows": _rows(MILESTONE_HOURS, ms["total_hours"], " h")},
    ]
    earned = sum(1 for c in cats for r in c["rows"] if r["reached"])
    total = sum(len(c["rows"]) for c in cats)
    return {"categories": cats, "earned": earned, "total": total}


@router.get("/season-recap")
async def season_recap(year: int | None = None):
    """Shareable end-of-season summary: distance, climbs conquered, records set."""
    import segments as seg
    now = datetime.now(timezone.utc)
    y = year or now.year

    rides = await udb.ride_history.find(
        {}, {"_id": 0, "created_at": 1, "distance_km": 1, "duration_sec": 1, "tss": 1}).to_list(length=5000)
    total_rides = total_km = total_hours = total_tss = 0.0
    longest_km = 0.0
    for r in rides:
        d = _date_of(r.get("created_at"))
        if not d or not d.startswith(str(y)):
            continue
        total_rides += 1
        km = float(r.get("distance_km") or 0)
        total_km += km
        longest_km = max(longest_km, km)
        total_hours += float(r.get("duration_sec") or 0) / 3600.0
        total_tss += float(r.get("tss") or 0)

    # Climbs conquered + biggest climb this season.
    acts = await udb.cycling_activities.find(
        {"route_data.samples": {"$exists": True}},
        {"_id": 0, "id": 1, "canonical_activity_id": 1, "started_at": 1, "route_data.samples": 1,
         "route_data.power_curve": 1}).to_list(length=400)
    entries, biggest = [], 0.0
    for a in acts:
        if not str(a.get("started_at") or "").startswith(str(y)):
            continue
        pts = seg.build_track((a.get("route_data") or {}).get("samples") or [])
        if len(pts) < 6:
            continue
        for c in seg.detect_climbs(pts):
            if c.get("start_lat") is None:
                continue
            biggest = max(biggest, c["gain"])
            entries.append({"start": (c["start_lat"], c["start_lng"]), "length": c["length"]})
    climbs_conquered = len(_cluster_climbs(entries))

    # Records set this season: power windows whose all-time best was set this year.
    best = {}
    for a in await udb.cycling_activities.find(
            {"route_data.power_curve": {"$exists": True, "$ne": None}},
            {"_id": 0, "started_at": 1, "route_data.power_curve": 1}).to_list(length=1000):
        yr = str(a.get("started_at") or "")[:4]
        for p in (a.get("route_data") or {}).get("power_curve") or []:
            w, watts = p["secs"], p["watts"]
            if w not in best or watts > best[w]["watts"]:
                best[w] = {"watts": watts, "year": yr}
    records_set = sum(1 for w in RECORD_WINDOWS if w in best and best[w]["year"] == str(y))

    return {
        "year": y, "rides": int(total_rides), "distance_km": round(total_km),
        "hours": round(total_hours), "tss": round(total_tss),
        "climbs_conquered": climbs_conquered, "biggest_climb_m": round(biggest),
        "longest_ride_km": round(longest_km, 1), "records_set": records_set,
        "has_data": total_rides > 0,
    }


@router.get("/climb-detail")
async def climb_detail(id: str):
    """Full detail for one repeated climb: shared elevation profile + every
    attempt's speed/time overlaid, aligned base->summit."""
    import segments as seg
    acts = await udb.cycling_activities.find(
        {"route_data.samples": {"$exists": True}},
        {"_id": 0, "id": 1, "canonical_activity_id": 1, "name": 1, "started_at": 1, "route_data.samples": 1},
    ).to_list(length=300)

    entries = []
    for a in acts:
        pts = seg.build_track((a.get("route_data") or {}).get("samples") or [])
        if len(pts) < 6:
            continue
        aid = a.get("canonical_activity_id") or a.get("id")
        for c in seg.detect_climbs(pts):
            if c.get("start_lat") is None:
                continue
            r = seg.resample_climb(pts, c)
            entries.append({
                "aid": aid, "name": a.get("name") or "Ride", "date": a.get("started_at"),
                "gain": c["gain"], "length": c["length"], "start": (c["start_lat"], c["start_lng"]),
                "time_s": r["time_s"], "avg_speed": r["avg_speed_kmh"],
                "series": r["series"], "path": seg.climb_path(pts, c),
            })

    for atts in _cluster_climbs(entries):
        if len(atts) < 2:
            continue
        cid = f"climb-{round(atts[0]['start'][0], 4)}-{round(atts[0]['start'][1], 4)}"
        if cid != id:
            continue
        ranked = sorted(atts, key=lambda x: (x["time_s"] is None, x["time_s"] or 0))
        best = ranked[0]["time_s"] or 0
        gain = round(sum(a["gain"] for a in atts) / len(atts), 1)
        length = round(sum(a["length"] for a in atts) / len(atts), 1)
        splits = _climb_splits(ranked, length, n=4)
        # Split PRs: sections the rider's MOST RECENT attempt was fastest through,
        # even if that ride wasn't the overall PB.
        recent_aid = max(atts, key=lambda a: a.get("date") or "")["aid"]
        pb_aid = ranked[0]["aid"]
        recent_split_prs = []
        if recent_aid != pb_aid:
            for sp in splits:
                if sp["fastest"] == recent_aid:
                    recent_split_prs.append({"index": sp["index"], "from_d": sp["from_d"],
                                             "to_d": sp["to_d"], "time_s": sp["times"].get(recent_aid)})
        return {
            "found": True, "id": cid, "name": ranked[0]["name"],
            "gain_m": gain, "length_m": length,
            "grad_pct": round(gain / length * 100, 1) if length else None,
            "count": len(atts), "path": ranked[0]["path"],
            "profile": [{"d": p["d"], "ele": p["ele"]} for p in ranked[0]["series"]],
            "splits": splits, "recent_split_prs": recent_split_prs, "recent_activity_id": recent_aid,
            "attempts": [{
                "activity_id": a["aid"], "name": a["name"], "date": a["date"],
                "time_s": a["time_s"], "avg_speed_kmh": a["avg_speed"],
                "pr": a["time_s"] == best,
                "gap_s": round((a["time_s"] or 0) - best, 1) if a["time_s"] is not None else None,
                "series": [{"d": p["d"], "speed": p["speed"], "t": p["t"]} for p in a["series"]],
            } for a in ranked],
        }
    return {"found": False}


def _climb_splits(ranked: list, length: float, n: int = 4) -> list:
    """Split the climb into n equal-distance segments; each attempt's time per
    split, with the fastest attempt flagged."""
    bounds = [length * i / n for i in range(n + 1)]

    def t_at(series, d):
        if not series:
            return 0.0
        if d <= series[0]["d"]:
            return series[0]["t"]
        if d >= series[-1]["d"]:
            return series[-1]["t"]
        for k in range(len(series) - 1):
            if series[k + 1]["d"] >= d:
                a, b = series[k], series[k + 1]
                span = (b["d"] - a["d"]) or 1.0
                f = (d - a["d"]) / span
                return a["t"] + (b["t"] - a["t"]) * f
        return series[-1]["t"]

    splits = []
    for i in range(n):
        lo, hi = bounds[i], bounds[i + 1]
        times = {}
        for a in ranked:
            s = a["series"]
            if not s:
                continue
            times[a["aid"]] = round(t_at(s, hi) - t_at(s, lo), 1)
        fastest = min(times, key=times.get) if times else None
        splits.append({
            "index": i + 1, "from_d": round(lo), "to_d": round(hi),
            "times": times, "fastest": fastest,
        })
    return splits


MILESTONE_RIDES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000]
MILESTONE_KM = [100, 250, 500, 1000, 2500, 5000, 10000, 15000, 20000, 25000, 50000]
MILESTONE_HOURS = [10, 25, 50, 100, 250, 500, 1000]


@router.get("/milestones")
async def milestones():
    """Lifetime totals + any big round-number milestone just crossed by the most
    recent ride (or a new all-time aerobic-efficiency best), plus the next
    milestone to chase."""
    rides = await udb.ride_history.find(
        {}, {"_id": 0, "created_at": 1, "distance_km": 1, "duration_sec": 1, "tss": 1,
             "ef": 1, "intensity": 1}).to_list(length=5000)
    total_rides = len(rides)
    total_km = round(sum(float(r.get("distance_km") or 0) for r in rides), 1)
    total_hours = round(sum(float(r.get("duration_sec") or 0) for r in rides) / 3600.0, 1)
    total_tss = round(sum(float(r.get("tss") or 0) for r in rides))

    last = None
    for r in rides:
        c = r.get("created_at") or ""
        if last is None or c > (last.get("created_at") or ""):
            last = r
    last_km = float((last or {}).get("distance_km") or 0)

    recent = None
    if total_rides in MILESTONE_RIDES:
        recent = {"kind": "rides", "label": f"{total_rides} rides", "value": total_rides,
                  "blurb": f"You've now completed {total_rides} rides with ROUJAUNE!"}
    if recent is None:
        for m in MILESTONE_KM:
            if total_km - last_km < m <= total_km:
                recent = {"kind": "distance", "label": f"{m:,} km", "value": m,
                          "blurb": f"You've ridden over {m:,} km in total. Incredible mileage!"}
                break
    if recent is None:
        # New all-time aerobic-efficiency best (steady endurance rides only —
        # IF 0.55-0.90 — so a hard interval session can't fake a "better" EF).
        steady = [r for r in sorted(rides, key=lambda r: r.get("created_at") or "")
                  if r.get("ef") and 0.55 <= (r.get("intensity") or 0) <= 0.90]
        if len(steady) >= 4 and steady[-1] is last and (last or {}).get("ef"):
            prior_best = max((r["ef"] for r in steady[:-1]), default=0)
            if steady[-1]["ef"] > prior_best > 0:
                pct = round((steady[-1]["ef"] / prior_best - 1) * 100)
                recent = {"kind": "ef_best", "label": "New efficiency best", "value": steady[-1]["ef"],
                          "blurb": f"New aerobic-efficiency best — {pct}% more watts per heartbeat than ever before!"}

    def _prev_next(total, arr):
        prev, nxt = 0, None
        for m in arr:
            if m <= total:
                prev = m
            else:
                nxt = m
                break
        return prev, nxt

    prev_rides, next_rides = _prev_next(total_rides, MILESTONE_RIDES)
    prev_km, next_km = _prev_next(total_km, MILESTONE_KM)
    rides_progress = round((total_rides - prev_rides) / (next_rides - prev_rides), 3) if next_rides else 1.0
    km_progress = round((total_km - prev_km) / (next_km - prev_km), 3) if next_km else 1.0
    return {
        "total_rides": total_rides, "total_km": total_km, "total_hours": total_hours, "total_tss": total_tss,
        "recent": recent,
        "next_rides": next_rides, "rides_to_next": (next_rides - total_rides) if next_rides else None,
        "prev_rides": prev_rides, "rides_progress": rides_progress,
        "next_km": next_km, "km_to_next": round(next_km - total_km, 1) if next_km else None,
        "prev_km": prev_km, "km_progress": km_progress,
    }


@router.get("/struggle-trend")
async def struggle_trend(weeks: int = 8):
    """Weekly frequency of live-detected struggle moments (cadence decay, HR
    decoupling, power drops, W' depletion) across the last N weeks — powers the
    dashboard's Struggle Recap card so a rider can see if tough moments are
    trending up (fatigue building) or down (adapting well)."""
    weeks = max(2, min(weeks, 26))
    today = date.today()
    start = today - timedelta(weeks=weeks)
    rides = await udb.ride_history.find(
        {"created_at": {"$gte": start.isoformat()}},
        {"_id": 0, "created_at": 1, "struggle_count": 1, "struggle_types": 1},
    ).to_list(2000)

    buckets: Dict[str, Dict[str, Any]] = {}
    for r in rides:
        c = r.get("created_at") or ""
        try:
            dt = datetime.fromisoformat(c.replace("Z", "+00:00")) if c else None
        except Exception:
            dt = None
        if not dt:
            continue
        wk = _iso_week(dt)
        b = buckets.setdefault(wk, {"week": wk, "rides": 0, "struggles": 0, "types": {}})
        b["rides"] += 1
        cnt = r.get("struggle_count")
        if cnt is not None:
            b["struggles"] += int(cnt)
        for t in (r.get("struggle_types") or []):
            b["types"][t] = b["types"].get(t, 0) + 1

    # Fill every week in the window, even ones with zero rides, so the trend line is continuous.
    ordered = []
    cur = start
    while cur <= today:
        wk = _iso_week(datetime(cur.year, cur.month, cur.day))
        b = buckets.get(wk) or {"week": wk, "rides": 0, "struggles": 0, "types": {}}
        top_type = max(b["types"], key=b["types"].get) if b["types"] else None
        ordered.append({
            "week": wk, "rides": b["rides"], "struggles": b["struggles"],
            "per_ride": round(b["struggles"] / b["rides"], 2) if b["rides"] else 0.0,
            "top_type": top_type,
        })
        cur += timedelta(days=7)
    # De-dupe (multiple days can map to the same iso week at the boundary).
    seen = set()
    dedup = []
    for w in ordered:
        if w["week"] in seen:
            continue
        seen.add(w["week"])
        dedup.append(w)

    recent = dedup[-4:] if len(dedup) >= 4 else dedup
    prior = dedup[-8:-4] if len(dedup) >= 8 else []
    recent_avg = round(sum(w["struggles"] for w in recent) / len(recent), 2) if recent else 0.0
    prior_avg = round(sum(w["struggles"] for w in prior) / len(prior), 2) if prior else None
    trend = "flat"
    if prior_avg is not None and prior_avg > 0:
        if recent_avg <= prior_avg * 0.8:
            trend = "improving"
        elif recent_avg >= prior_avg * 1.2:
            trend = "rising"
    return {"weeks": dedup, "recent_avg": recent_avg, "prior_avg": prior_avg, "trend": trend}


async def check_and_email_milestones():
    """Fire a celebratory email the moment a rider crosses a big milestone
    (rides / distance / hours). Baselines silently on first run so we never spam
    milestones a rider already had. Called (best-effort) after a ride is saved."""
    user = auth._current_user.get()
    if not user or not user.get("email"):
        return
    ms = await milestones()
    reached: list[tuple[str, str, str]] = []
    for m in MILESTONE_RIDES:
        if ms["total_rides"] >= m:
            reached.append((f"rides:{m}", f"{m} rides", f"You've completed {m} rides with ROUJAUNE!"))
    for m in MILESTONE_KM:
        if ms["total_km"] >= m:
            reached.append((f"km:{m}", f"{m:,} km", f"You've ridden {m:,} km in total — incredible mileage!"))
    for m in MILESTONE_HOURS:
        if ms["total_hours"] >= m:
            reached.append((f"hours:{m}", f"{m} hours", f"You've spent {m} hours in the saddle!"))
    reached_keys = {k for k, _, _ in reached}

    doc = await udb.settings.find_one({"id": "milestone_emails"}) or {}
    emailed = set(doc.get("emailed", []))
    if not doc.get("baselined"):
        # First time we see this rider — record what's already done, send nothing.
        await udb.settings.update_one(
            {"id": "milestone_emails"},
            {"$set": {"emailed": sorted(reached_keys), "baselined": True}}, upsert=True)
        return

    new_keys = reached_keys - emailed
    if not new_keys:
        return
    # Celebrate the newly-crossed milestones (biggest first).
    def _rank(item):
        kind, m = item[0].split(":")
        return ({"km": 3, "hours": 2, "rides": 1}[kind], int(m))
    new_items = sorted([r for r in reached if r[0] in new_keys], key=_rank, reverse=True)
    items = [{"label": lbl, "blurb": blurb} for _, lbl, blurb in new_items]
    name = (user.get("name") or "there").split(" ")[0]
    ok = await emailer.send_email(
        user["email"], f"🏆 {items[0]['label']} — a new ROUJAUNE milestone!",
        emailer.milestone_email_html(name, items))
    if ok:
        await udb.settings.update_one(
            {"id": "milestone_emails"},
            {"$set": {"emailed": sorted(reached_keys)}}, upsert=True)



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


# ── Weekly digest email (Resend) ────────────────────────────────────────────
import asyncio  # noqa: E402
import logging  # noqa: E402
import secrets  # noqa: E402
import emailer  # noqa: E402
from fastapi.responses import HTMLResponse  # noqa: E402

_dlog = logging.getLogger("server")
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _iso_week(dt: datetime) -> str:
    ic = dt.isocalendar()
    return f"{ic[0]}-W{ic[1]:02d}"


async def _ensure_unsub_token(uid: str) -> str:
    """One stable, unguessable token per rider used for one-tap email unsubscribe."""
    db = udb._db
    doc = await db.settings.find_one({"user_id": uid, "id": "email_prefs"}) or {}
    tok = doc.get("unsub_token")
    if not tok:
        tok = secrets.token_urlsafe(24)
        await db.settings.update_one(
            {"user_id": uid, "id": "email_prefs"},
            {"$set": {"unsub_token": tok}, "$setOnInsert": {"user_id": uid, "id": "email_prefs"}},
            upsert=True,
        )
    return tok


def _unsub_url(token: str) -> str:
    base = auth.cached_base_url()
    return f"{base}/api/analysis/unsubscribe?token={token}" if base else ""


@router.get("/email-prefs")
async def get_email_prefs():
    """The rider's weekly digest email settings: opt-in + preferred send day."""
    doc = await udb.settings.find_one({"id": "email_prefs"}) or {}
    wd = doc.get("digest_weekday")
    return {
        "weekly_digest": bool(doc.get("weekly_digest", False)),
        "digest_weekday": int(wd) if isinstance(wd, int) and 0 <= wd <= 6 else 0,
    }


@router.put("/email-prefs")
async def put_email_prefs(body: dict):
    """Partial update — only the provided keys change."""
    upd: dict = {}
    if "weekly_digest" in body:
        upd["weekly_digest"] = bool(body.get("weekly_digest"))
    if "digest_weekday" in body:
        try:
            d = int(body.get("digest_weekday"))
            if 0 <= d <= 6:
                upd["digest_weekday"] = d
        except (TypeError, ValueError):
            pass
    if upd:
        await udb.settings.update_one({"id": "email_prefs"}, {"$set": upd}, upsert=True)
    doc = await udb.settings.find_one({"id": "email_prefs"}) or {}
    return {"ok": True, "weekly_digest": bool(doc.get("weekly_digest", False)),
            "digest_weekday": int(doc.get("digest_weekday", 0) or 0)}


@router.post("/email-digest")
async def email_digest():
    """Send the signed-in rider a PREVIEW/test of their weekly recap email now."""
    user = auth.require_user()
    email = user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email on file for this account")
    digest = await weekly_digest()
    name = (user.get("name") or "there").split(" ")[0]
    token = await _ensure_unsub_token(user["user_id"])
    ok = await emailer.send_email(
        email, "[Preview] Your ROUJAUNE week in review",
        emailer.weekly_digest_email_html(name, digest, _unsub_url(token), preview=True),
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Couldn't send the email right now. Please try again shortly.")
    return {"ok": True}


def _unsub_page(ok: bool) -> HTMLResponse:
    title = "You're unsubscribed" if ok else "Link not recognised"
    msg = ("You won't receive the weekly recap email any more. You can turn it back "
           "on any time in the ROUJAUNE app under Settings → Email."
           if ok else "This unsubscribe link is invalid or has already been used.")
    icon, color = ("✓", "#FFC20A") if ok else ("!", "#C91727")
    return HTMLResponse(f"""\
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} · ROUJAUNE</title></head>
<body style="margin:0;background:#0B0C0C;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F3F1EA;">
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;width:100%;background:#141615;border:1px solid rgba(255,194,10,0.28);border-radius:18px;padding:34px 30px;text-align:center;">
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:22px;">ROU<span style="color:#FFC20A;">JAUNE</span></div>
    <div style="width:66px;height:66px;border-radius:50%;border:3px solid {color};display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:32px;color:{color};font-weight:800;">{icon}</div>
    <h1 style="font-size:20px;margin:0 0 10px;">{title}</h1>
    <p style="color:#C9CAC7;font-size:15px;line-height:1.6;margin:0;">{msg}</p>
  </div>
</div></body></html>""")


@router.get("/unsubscribe")
async def unsubscribe(token: str = ""):
    """One-tap public unsubscribe from the weekly digest email (no login)."""
    if not token:
        return _unsub_page(False)
    db = udb._db
    doc = await db.settings.find_one({"id": "email_prefs", "unsub_token": token})
    if not doc:
        return _unsub_page(False)
    await db.settings.update_one(
        {"user_id": doc["user_id"], "id": "email_prefs"},
        {"$set": {"weekly_digest": False}},
    )
    return _unsub_page(True)


async def _run_weekly_digests():
    """Email opted-in, email-verified riders their weekly recap once per ISO week,
    on each rider's chosen weekday (~08:00 UTC). Best-effort; skips no-activity."""
    now = datetime.now(timezone.utc)
    if now.hour != 8:  # single daily 08:00–08:59 UTC window
        return
    today = now.weekday()
    week = _iso_week(now)
    db = udb._db
    users = await db.users.find(
        {"provider": "password", "email_verified": True},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1},
    ).to_list(length=5000)
    for u in users:
        uid, email = u.get("user_id"), u.get("email")
        if not uid or not email:
            continue
        prefs = await db.settings.find_one({"user_id": uid, "id": "email_prefs"}) or {}
        if not prefs.get("weekly_digest") or prefs.get("last_sent_week") == week:
            continue
        if int(prefs.get("digest_weekday", 0) or 0) != today:  # rider's chosen send day
            continue
        token = auth._current_user.set({"user_id": uid})
        try:
            digest = await weekly_digest()
        finally:
            auth._current_user.reset(token)
        if not digest.get("has_activity"):
            continue
        name = (u.get("name") or "there").split(" ")[0]
        unsub = await _ensure_unsub_token(uid)
        ok = await emailer.send_email(
            email, "Your ROUJAUNE week in review",
            emailer.weekly_digest_email_html(name, digest, _unsub_url(unsub)),
        )
        if ok:
            await db.settings.update_one(
                {"user_id": uid, "id": "email_prefs"},
                {"$set": {"last_sent_week": week}}, upsert=True,
            )


async def weekly_digest_loop():
    """Hourly tick that fires the weekly digest send during the daily 08:00 window."""
    while True:
        try:
            await _run_weekly_digests()
        except Exception:  # noqa: BLE001
            _dlog.exception("weekly digest loop error")
        await asyncio.sleep(3600)
