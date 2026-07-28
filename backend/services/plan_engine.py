"""Deterministic training-plan engine for ROUJAUNE — structured plan state
(Couch-to-Road / Ride-Stronger / Ride-Beyond), rider-scoped snapshots, weekly
progression, calendar/plan response builders and adaptive per-zone target nudging.

The three structured plans are cached in module globals (CTR/RS/RB *) and hot-
reloaded from the `plans` collection whenever an admin edits them. Functions
INSIDE this module read those globals directly; EXTERNAL callers must read them
as live module attributes (e.g. `plan_engine.CTR_PLAN`) so they always see the
latest reloaded value. Depends only on lower-level modules (auth/db, plans_admin,
core, plan_common, rider_common) — never on the coach layer — so the coach engine
and the domain routers can import it without a circular dependency.
"""
import os  # noqa: F401
import json
import re
import copy
import logging
from pathlib import Path
from datetime import date, datetime, timedelta, timezone  # noqa: F401

from typing import Any, Dict, List, Optional  # noqa: F401

import auth  # noqa: F401
from auth import udb
from core import now_iso
import plans_admin
from services.plan_common import _RIDE_PREFIX, STRUCTURED_PLAN_IDS, _active_plan_id, _plan_id_or_active  # noqa: F401
from services.rider_common import _rider_doc  # noqa: F401

ROOT_DIR = Path(__file__).resolve().parent.parent


BUILD_AND_CLIMB = {
    "id": "build-and-climb",
    "title": "Build & Climb",
    "label": "BUILD & CLIMB",
    "description": "A 12-week plan to build sustainable power, climbing strength and endurance so you can conquer long climbs with confidence.",
    "duration_weeks": 12,
    "average_days_per_week": 5,
    "current_week": 4,
    "duration_label": "12 Weeks",
    "average_label": "5 Days/Week",
    "phase": {
        "name": "Build Phase",
        "weeks": "Weeks 1\u20134",
        "description": "Build your aerobic base and muscular endurance while introducing sustained threshold work.",
    },
    "goals": [
        {"id": "g1", "title": "Improved Climbing Strength", "description": "Stronger on long climbs", "status": "complete"},
        {"id": "g2", "title": "Raise FTP", "description": "Increase sustainable power", "status": "complete"},
        {"id": "g3", "title": "Build Endurance", "description": "Ride longer with confidence", "status": "complete"},
        {"id": "g4", "title": "Consistent Training", "description": "Stay on track all season", "status": "incomplete"},
    ],
    "phases": [
        {"id": "p1", "number": 1, "name": "Build", "weeks": "Weeks 1\u20134", "pct": 75, "active": True, "points": [0.15, 0.3, 0.42, 0.55, 0.68, 0.82, 0.75, 0.95]},
        {"id": "p2", "number": 2, "name": "Build More", "weeks": "Weeks 5\u20138", "pct": 0, "active": False, "points": [0.1, 0.25, 0.2, 0.4, 0.35, 0.55, 0.5, 0.7]},
        {"id": "p3", "number": 3, "name": "Climb", "weeks": "Weeks 9\u201312", "pct": 0, "active": False, "points": [0.2, 0.3, 0.45, 0.4, 0.6, 0.72, 0.68, 0.9]},
        {"id": "p4", "number": 4, "name": "Peak & Perform", "weeks": "Week 13", "pct": 0, "active": False, "points": [0.3, 0.4, 0.35, 0.5, 0.62, 0.55, 0.7, 0.6]},
    ],
    "weekly_load": [180, 240, 300, 210, 320, 380, 430, 300, 420, 500, 560, 380, 260],
    "you_are_here": 4,
    "workouts": [
        {"id": "w1", "title": "Threshold Climb", "icon": "bicycle", "duration": "1h 00m", "zone": "Z4", "tss": "92 TSS", "footer": "Week 3 \u2022 Tue", "color": "#C91727", "profile": [0.5, 0.7, 0.6, 0.85, 0.7, 0.95, 0.75, 0.9, 0.65, 0.88, 0.7, 0.5]},
        {"id": "w2", "title": "Sweet Spot", "icon": "bicycle", "duration": "1h 20m", "zone": "Z3", "tss": "75 TSS", "footer": "Week 3 \u2022 Thu", "color": "#F0A500", "profile": [0.4, 0.55, 0.7, 0.72, 0.68, 0.75, 0.7, 0.74, 0.66, 0.72, 0.6, 0.45]},
        {"id": "w3", "title": "Endurance Ride", "icon": "bicycle", "duration": "1h 45m", "zone": "Z2", "tss": "70 TSS", "footer": "Week 3 \u2022 Fri", "color": "#55C850", "profile": [0.45, 0.5, 0.55, 0.52, 0.58, 0.55, 0.6, 0.56, 0.58, 0.54, 0.5, 0.46]},
        {"id": "w4", "title": "Long Ride", "icon": "bicycle", "duration": "3h 00m", "zone": "Z2", "tss": "120 TSS", "footer": "Week 4 \u2022 Sat", "color": "#55C850", "profile": [0.4, 0.45, 0.48, 0.5, 0.52, 0.5, 0.53, 0.5, 0.52, 0.49, 0.47, 0.44]},
    ],
    "adaptation": "Great consistency and strong threshold work. I've slightly increased your time in Zone 4 and added more endurance volume to build your climbing engine.",
    "adaptation_status": "Plan is adapting as you improve",
    "week_targets": {"rides": 5, "duration": "6h 24m", "distance_km": 165, "elevation_m": 1800, "supplementary": 2},
    "progress_pct": 25,
    "progress": {"weeks": "3 / 12", "workouts": "15", "time": "10.2 h", "tss": "1,420", "ctl": "+8.4", "atl": "92", "tsb": "+6"},
    "tip": "Consistency compounds. Focus on the process this phase and the results will come.",
    "created_by": "Alberto",
}


# From Couch to Road — beginner 16-week plan (assigned to Green Lantern), driven
# by couch_to_road_plan.json (generated from the frontend plan source) so every
# week's rides + strength/recovery/balance days are available for progression.
with open(ROOT_DIR / "couch_to_road_plan.json", encoding="utf-8") as _f:
    CTR_PLAN = json.load(_f)
CTR_WEEKS = {w["number"]: w for w in CTR_PLAN["weeks"]}
_SUPP_KINDS = ("strength", "mobility", "balance", "recovery")
_RIDE_COLORS = ["#55C850", "#40A9C6", "#55C850"]
_CTR_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in CTR_PLAN["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}
_PHASE_POINTS = {
    1: [0.12, 0.2, 0.28, 0.35, 0.3, 0.4, 0.45, 0.5],
    2: [0.2, 0.3, 0.28, 0.42, 0.4, 0.55, 0.5, 0.62],
    3: [0.3, 0.4, 0.5, 0.48, 0.6, 0.65, 0.7, 0.78],
    4: [0.4, 0.55, 0.6, 0.7, 0.75, 0.82, 0.9, 1.0],
}


async def _reload_ctr_from_db():
    """Refresh the in-memory couch-to-road plan cache from the `plans` collection
    so admin edits (via plans_admin) take effect without a rebuild/restart."""
    global CTR_PLAN, CTR_WEEKS, _CTR_PLANNED_TSS
    doc = await plans_admin.get_plan_def("couch-to-road")
    if not doc or not doc.get("weeks"):
        return
    CTR_PLAN = doc
    CTR_WEEKS = {w["number"]: w for w in doc["weeks"]}
    _CTR_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in doc["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}


# ---- Ride Stronger (Intermediate) structured plan ---------------------------
with open(ROOT_DIR / "ride_stronger_plan.json", encoding="utf-8") as _f:
    RS_PLAN = json.load(_f)
RS_WEEKS = {w["number"]: w for w in RS_PLAN["weeks"]}
_RS_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in RS_PLAN["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}


async def _reload_rs_from_db():
    global RS_PLAN, RS_WEEKS, _RS_PLANNED_TSS
    doc = await plans_admin.get_plan_def("ride-stronger")
    if not doc or not doc.get("weeks"):
        return
    RS_PLAN = doc
    RS_WEEKS = {w["number"]: w for w in doc["weeks"]}
    _RS_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in doc["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}


# ---- Ride Beyond (Advanced) structured plan ---------------------------------
with open(ROOT_DIR / "ride_beyond_plan.json", encoding="utf-8") as _f:
    RB_PLAN = json.load(_f)
RB_WEEKS = {w["number"]: w for w in RB_PLAN["weeks"]}
_RB_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in RB_PLAN["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}


async def _reload_rb_from_db():
    global RB_PLAN, RB_WEEKS, _RB_PLANNED_TSS
    doc = await plans_admin.get_plan_def("ride-beyond")
    if not doc or not doc.get("weeks"):
        return
    RB_PLAN = doc
    RB_WEEKS = {w["number"]: w for w in doc["weeks"]}
    _RB_PLANNED_TSS = {d["workout_id"]: d.get("tss", 0) for w in doc["weeks"] for d in w["days"] if d.get("kind") == "cycling" and d.get("workout_id")}



LEVEL_PLAN = {"Beginner": "couch-to-road", "Intermediate": "ride-stronger", "Advanced": "ride-beyond"}


async def _plan_for_level(level: str):
    """Prefer a plan tagged with this level; else the LEVEL_PLAN default; else None."""
    doc = await plans_admin._db.plans.find_one({"level": level})
    if doc:
        return {"id": doc["id"], "title": doc.get("title"), "authored": True}
    pid = LEVEL_PLAN.get(level)
    if pid:
        p = await plans_admin.get_plan_def(pid)
        if p:
            # A generic default is offered when no plan is authored for this level yet.
            authored = (p.get("level") == level)
            return {"id": pid, "title": p.get("title"), "authored": authored}
    return None



NUDGE_ZONES = ["Z2", "Z3", "Z4", "Z5", "Z6"]
NUDGE_STEP = 0.02          # move 2% per ride toward the rider's demonstrated level
NUDGE_CAP = 0.08           # never drift more than ±8% from the plan's base target
NUDGE_HI = 1.05            # >5% over target = overshoot
NUDGE_LO = 0.95            # >5% under target = fade
NUDGE_MIN_RIDES = 2        # require a repeated pattern before nudging


def _aggregate_ride_zones(intervals: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    """Collapse a ride's measured intervals into per-zone target vs actual
    (duration-weighted). Only segments with a recorded avg are counted."""
    acc: Dict[str, Dict[str, float]] = {}
    for it in intervals or []:
        zone = it.get("zone")
        avg = it.get("avgW")
        tgt = it.get("targetW")
        sec = float(it.get("sec") or 0)
        if zone not in NUDGE_ZONES or avg is None or not tgt or sec <= 0:
            continue
        z = acc.setdefault(zone, {"tgt": 0.0, "act": 0.0, "sec": 0.0})
        z["tgt"] += float(tgt) * sec
        z["act"] += float(avg) * sec
        z["sec"] += sec
    out: Dict[str, Dict[str, float]] = {}
    for zone, z in acc.items():
        if z["sec"] > 0:
            out[zone] = {"target": z["tgt"] / z["sec"], "actual": z["act"] / z["sec"]}
    return out


async def _update_adaptive_targets(plan_id: str, intervals: List[Dict[str, Any]]):
    """Update rolling per-zone execution and nudge the plan's zone target bias.
    Returns (zone_bias, notes) where notes describe any nudge made this ride."""
    ride_zones = _aggregate_ride_zones(intervals)
    if not ride_zones:
        return {}, []
    try:
        plan = await udb.training_plans.find_one({"id": plan_id}) or {}
        zone_exec: Dict[str, List[float]] = dict(plan.get("zone_exec") or {})
        zone_bias: Dict[str, float] = dict(plan.get("zone_bias") or {})
        notes: List[str] = []

        for zone, agg in ride_zones.items():
            if agg["target"] <= 0:
                continue
            ratio = agg["actual"] / agg["target"]
            hist = list(zone_exec.get(zone, []))
            hist.append(round(ratio, 3))
            hist = hist[-5:]  # keep the last 5 rides
            zone_exec[zone] = hist

            if len(hist) < NUDGE_MIN_RIDES:
                continue
            mean = sum(hist) / len(hist)
            bias = float(zone_bias.get(zone, 0.0))
            new_bias = bias
            if mean > NUDGE_HI:
                new_bias = min(NUDGE_CAP, round(bias + NUDGE_STEP, 3))
            elif mean < NUDGE_LO:
                new_bias = max(-NUDGE_CAP, round(bias - NUDGE_STEP, 3))

            if abs(new_bias - bias) > 1e-6:
                zone_bias[zone] = new_bias
                pct = round(new_bias * 100)
                if new_bias > bias:
                    notes.append(f"raised your {zone} targets to +{pct}% (you've been overshooting)")
                else:
                    notes.append(f"eased your {zone} targets to {pct}% (to keep them achievable)")

        await udb.training_plans.update_one(
            {"id": plan_id},
            {"$set": {"zone_exec": zone_exec, "zone_bias": zone_bias}},
            upsert=True,
        )
        return zone_bias, notes
    except Exception:
        logging.exception("adaptive targets update failed")
        return {}, []



def _struct_ctx(plan_id: str):
    """Return (plan_doc, weeks_map, planned_tss, ride_prefix) for a structured plan."""
    if plan_id == "ride-stronger":
        return RS_PLAN, RS_WEEKS, _RS_PLANNED_TSS, "rs-ride-"
    if plan_id == "ride-beyond":
        return RB_PLAN, RB_WEEKS, _RB_PLANNED_TSS, "rb-ride-"
    return CTR_PLAN, CTR_WEEKS, _CTR_PLANNED_TSS, "ctr-ride-"


# STRUCTURED_PLAN_IDS / _RIDE_PREFIX imported from services.plan_common


async def _snapshot_plan_def(plan_id: str):
    """Deep-copy the current plan-list template into a standalone definition dict."""
    template = await plans_admin.get_plan_def(plan_id)
    if not template and plan_id == "build-and-climb":
        template = dict(BUILD_AND_CLIMB)
    if not template:
        return None
    snap = copy.deepcopy(template)
    snap.pop("_id", None)
    return snap


async def _rider_plan_def(plan_id: str):
    """The rider's OWN copy of the assigned plan definition. Snapshotted on first
    access, so later edits to the shared plan-list template never retroactively
    change a rider who is already on the plan."""
    doc = await udb.training_plans.find_one({"id": plan_id})
    if doc and isinstance(doc.get("definition"), dict) and doc["definition"]:
        d = dict(doc["definition"])
        d.pop("_id", None)
        return d
    snap = await _snapshot_plan_def(plan_id)
    if snap is None:
        return None
    await udb.training_plans.update_one(
        {"id": plan_id},
        {"$set": {"id": plan_id, "definition": snap, "snapshot_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return snap


def _weeks_and_tss(def_doc: dict):
    weeks_map = {w["number"]: w for w in def_doc.get("weeks", [])}
    planned = {d["workout_id"]: d.get("tss", 0)
               for w in def_doc.get("weeks", []) for d in w.get("days", [])
               if d.get("kind") == "cycling" and d.get("workout_id")}
    return weeks_map, planned


async def _struct_ctx_for_rider(plan_id: str):
    """Rider-scoped equivalent of _struct_ctx that reads the rider's snapshot
    definition. Falls back to the global default if no snapshot can be built."""
    d = await _rider_plan_def(plan_id)
    prefix = _RIDE_PREFIX.get(plan_id, "ctr-ride-")
    if not d or not d.get("weeks"):
        return _struct_ctx(plan_id)
    weeks_map, planned = _weeks_and_tss(d)
    return d, weeks_map, planned, prefix


async def _on_plan_change(plan_id: str):
    """Callback fired by plans_admin after any plan edit."""
    if plan_id == "couch-to-road":
        await _reload_ctr_from_db()
    elif plan_id == "ride-stronger":
        await _reload_rs_from_db()
    elif plan_id == "ride-beyond":
        await _reload_rb_from_db()


# _active_plan_id / _plan_id_or_active imported from services.plan_common


async def _apply_companion_ops(plan_id: str, ops: list, source: str, reason: str) -> list:
    """Apply sanitized companion ops via the portable plans_admin router."""
    if not ops:
        return []
    res = await plans_admin.adapt_plan(
        plan_id,
        plans_admin.AdaptRequest(
            source=source, reason=reason,
            ops=[plans_admin.AdaptOp(**o) for o in ops],
        ),
    )
    return res.get("applied", [])


def _ctr_today():
    from datetime import date
    return date.today()


def _ctr_day_date(week, i):
    from datetime import date, timedelta
    y, m, d = (int(x) for x in week["start_date"].split("-"))
    return date(y, m, d) + timedelta(days=i)


def _fmt_dur(minutes):
    return f"{minutes // 60}h {minutes % 60:02d}m" if minutes >= 60 else f"{minutes} min"


def _pm(s):
    mm = re.search(r"\d+", s or "")
    return int(mm.group()) if mm else 0


async def _ctr_completions(ride_prefix="ctr-ride-"):
    try:
        rides = await udb.ride_history.find({"workout_id": {"$regex": f"^{ride_prefix}"}}).to_list(3000)
    except Exception:
        rides = []
    ride_map = {}
    for r in rides:
        ride_map[r.get("workout_id")] = {"duration_sec": r.get("duration_sec"), "tss": r.get("tss"), "distance_km": r.get("distance_km")}
    try:
        supp = await udb.supplementary_log.find({}).to_list(3000)
    except Exception:
        supp = []
    supp_dates = {s.get("date") for s in supp if s.get("date")}
    return ride_map, supp_dates


def _ctr_week_complete(week, ride_ids, supp_dates, today):
    for i, day in enumerate(week["days"]):
        dt = _ctr_day_date(week, i)
        kind = day["kind"]
        if kind == "cycling":
            if day.get("workout_id") not in ride_ids:
                return False
        elif kind == "rest":
            if dt >= today:   # a rest day only auto-completes once it has passed
                return False
        else:                 # strength / mobility / balance / recovery
            if dt.isoformat() not in supp_dates:
                return False
    return True


def _plan_done(weeks_map, cur, dw, ride_map, supp_dates):
    """True once the rider is on the final week and that week is fully complete —
    i.e. the whole structured plan has been finished."""
    if cur < dw:
        return False
    wk = weeks_map.get(cur)
    if not wk:
        return False
    return _ctr_week_complete(wk, set(ride_map.keys()), supp_dates, _ctr_today())


async def _ctr_state(weeks=None, duration_weeks=None, plan_id="couch-to-road", ride_prefix="ctr-ride-"):
    """Return (current_week, ride_map, supp_dates), advancing the plan whenever the
    current week is fully completed (all rides + all supplementary + past rest days)."""
    weeks = weeks or CTR_WEEKS
    duration_weeks = duration_weeks or CTR_PLAN["duration_weeks"]
    ride_map, supp_dates = await _ctr_completions(ride_prefix)
    ride_ids = set(ride_map.keys())
    today = _ctr_today()
    state = await udb.plan_state.find_one({"id": plan_id})
    cur = int(state["current_week"]) if state and state.get("current_week") else 1
    cur = max(1, min(cur, duration_weeks))
    changed = state is None
    while cur < duration_weeks and _ctr_week_complete(weeks[cur], ride_ids, supp_dates, today):
        cur += 1
        changed = True
    if changed:
        await udb.plan_state.update_one({"id": plan_id}, {"$set": {"current_week": cur, "updated_at": now_iso()}}, upsert=True)
    return cur, ride_map, supp_dates


async def _ctr_progress(ride_map=None, ride_prefix="ctr-ride-", planned_tss=None):
    planned_tss = planned_tss if planned_tss is not None else _CTR_PLANNED_TSS
    if ride_map is None:
        ride_map, _ = await _ctr_completions(ride_prefix)
    total_sec = sum(int(v.get("duration_sec") or 0) for v in ride_map.values())
    total_tss = sum(int(v.get("tss") or 0) for v in ride_map.values())
    adj = ""
    try:
        recent = await udb.ride_history.find({"workout_id": {"$regex": f"^{ride_prefix}"}}).sort("created_at", -1).to_list(1)
    except Exception:
        recent = []
    if recent:
        last = recent[0]
        planned = planned_tss.get(last.get("workout_id"))
        actual = int(last.get("tss") or 0)
        if planned and actual:
            if actual > planned * 1.15:
                adj = "Your last ride ran a little harder than planned, so I've kept your next session relaxed to protect recovery."
            elif actual < planned * 0.7:
                adj = "Your last ride stayed nicely controlled \u2014 you're ready to build gently from here."
            else:
                adj = "Your last ride was right on plan. Keep this steady rhythm going into your next session."
        else:
            adj = "Great work \u2014 I've logged that ride and factored it into your plan."
    return {"completed": ride_map, "count": len(ride_map), "hours": round(total_sec / 3600.0, 1), "tss": total_tss, "auto_adjustment": adj}


def _ctr_readiness(score=80):
    return {"score": score, "status": "Good", "source": "Daily check-in", "metrics": [
        {"key": "energy", "label": "Energy", "value": score, "display": "Good"},
        {"key": "soreness", "label": "Soreness", "value": min(100, score + 2), "display": "Low"},
        {"key": "stress", "label": "Stress", "value": score, "display": "Low"},
        {"key": "sleep", "label": "Sleep", "value": min(100, score + 4), "display": "7h 50m"}]}


def _ctr_calendar_week(week, ride_map, supp_dates, today):
    from datetime import date, timedelta
    y, m, d = (int(x) for x in week["start_date"].split("-"))
    start = date(y, m, d)
    ride_ids = set(ride_map.keys())
    days = []
    ci = 0
    completed_rides = 0
    for i, day in enumerate(week["days"]):
        dt = start + timedelta(days=i)
        entry = {"date": dt.isoformat(), "day_name": day["day_name"], "day_num": dt.strftime("%-d %b").upper(),
                 "focus": day["title"], "cycling": None, "fb50": None, "wellness": None, "readiness": _ctr_readiness(78 if i == 1 else 80)}
        kind = day["kind"]
        if kind == "cycling":
            done = day.get("workout_id") in ride_ids
            act = ride_map.get(day.get("workout_id")) or {}
            status = "completed" if done else ("today" if dt == today else "planned")
            dur = f"{round(act['duration_sec'] / 60)} min" if done and act.get("duration_sec") else day.get("duration", "")
            tssv = f"{act['tss']} TSS" if done and act.get("tss") is not None else (f"{day['tss']} TSS" if day.get("tss") else "")
            entry["cycling"] = {"type": "cycling", "title": day["title"], "workout_id": day.get("workout_id"), "duration": dur,
                                "zone": day.get("zone", ""), "tss": tssv, "status": status,
                                "color": "green" if done else _RIDE_COLORS[ci % 3], "created_by": "Alberto"}
            ci += 1
            if done:
                completed_rides += 1
        elif kind == "rest":
            done = dt < today
            entry["cycling"] = {"type": "cycling", "title": day["title"], "subtitle": "Recovery Focus", "duration": "",
                                "zone": "", "tss": "", "status": "completed" if done else "rest", "color": "purple", "created_by": "Alberto"}
        elif kind == "recovery":
            done = dt.isoformat() in supp_dates
            entry["wellness"] = {"type": "wellness", "title": day["title"], "brand": "Recovery",
                                 "duration": day.get("duration", "10 min"), "status": "completed" if done else "scheduled"}
        else:
            done = dt.isoformat() in supp_dates
            entry["fb50"] = {"type": "fb50", "title": day["title"], "duration": day.get("duration", "~15 min"),
                             "status": "completed" if done else "planned", "category": kind.capitalize()}
        days.append(entry)
    end = start + timedelta(days=6)
    planned_rides = sum(1 for dd in week["days"] if dd["kind"] == "cycling")
    sel = today.isoformat() if start <= today <= end else next((dd["date"] for dd in days if dd["cycling"] and dd["cycling"]["status"] in ("today", "planned")), days[1]["date"])
    return {"id": f"ctr-week-{week['number']}", "start_date": start.isoformat(), "end_date": end.isoformat(),
            "range_label": f"{start.strftime('%-d')} \u2013 {end.strftime('%-d %b %Y')}", "selected_date": sel, "days": days,
            "summary": {"workouts_completed": completed_rides, "workouts_planned": planned_rides, "duration": "1h 15m", "tss": "45", "zones": [
                {"z": "Z1", "pct": 30, "time": "00:22:00", "color": "green"},
                {"z": "Z2", "pct": 55, "time": "00:41:00", "color": "greenyellow"},
                {"z": "Z3", "pct": 15, "time": "00:12:00", "color": "yellow"}]},
            "tip": (week.get("objective") or "")[:140], "seed_version": 2}


def _ctr_plan_response(cur, ride_map, prog, weeks=None, plan_doc=None, plan_id="couch-to-road", plan_complete=False, supp_dates=None):
    from datetime import date, timedelta
    weeks_map = weeks or CTR_WEEKS
    pdoc = plan_doc or CTR_PLAN
    is_ctr = (plan_id == "couch-to-road")
    week = weeks_map[cur]
    ride_ids = set(ride_map.keys())
    supp_set = set(supp_dates or [])
    today = _ctr_today()
    cyc = [d for d in week["days"] if d["kind"] == "cycling"]
    supp_days = [d for d in week["days"] if d["kind"] in _SUPP_KINDS]
    total_min = sum(_pm(d.get("duration")) for d in cyc)
    dw = int(pdoc.get("duration_weeks") or len(weeks_map))

    # Presentation metadata for the non-cycling day types shown on the card.
    _TYPE_META = {
        "rest":     {"icon": "bed-outline",      "color": "#8A6FE0", "subtitle": "Rest & Recovery"},
        "recovery": {"icon": "leaf-outline",     "color": "#55C850", "subtitle": "Recovery Focus"},
        "strength": {"icon": "barbell-outline",  "color": "#E0A93A", "subtitle": "Strength"},
        "mobility": {"icon": "body-outline",     "color": "#E0A93A", "subtitle": "Mobility"},
        "balance":  {"icon": "walk-outline",     "color": "#E0A93A", "subtitle": "Balance"},
    }

    def _week_start(wknum):
        wk = weeks_map.get(wknum) or {}
        try:
            y, m, dd = (int(x) for x in str(wk.get("start_date", "")).split("-"))
            return date(y, m, dd)
        except Exception:
            return None

    def _mk_workout(d, ride_idx, wknum, day_pos):
        """Build a Training Plan card entry for ANY day (ride, recovery, rest,
        strength/mobility/balance), folding in completion state so the card can
        surface the rider's full upcoming schedule — not just the rides."""
        kind = d.get("kind", "cycling")
        ws = _week_start(wknum)
        dt = (ws + timedelta(days=day_pos)) if ws is not None else None
        w = {"id": d.get("workout_id") or f"{kind}-w{wknum}-d{day_pos}",
             "title": d.get("title", ""), "type": kind,
             "duration": d.get("duration", ""),
             "footer": f"Week {wknum} \u2022 {d.get('day_name', '').capitalize()}"}
        if dt is not None:
            w["date"] = dt.isoformat()
            w["date_label"] = dt.strftime("%a %-d %b")
            w["is_today"] = (dt == today)
        if kind == "cycling":
            done = d.get("workout_id") in ride_ids
            act = ride_map.get(d.get("workout_id")) or {}
            w["icon"] = "bicycle"
            w["zone"] = d.get("zone", "")
            w["tss"] = f"{d.get('tss', 0)} TSS"
            w["color"] = _RIDE_COLORS[ride_idx % 3]
            w["profile"] = [0.4, 0.5, 0.6, 0.6, 0.55, 0.5, 0.5, 0.45]
            if done:
                w["status"] = "completed"; w["completed"] = True
                if act.get("tss") is not None:
                    w["actual_tss"] = f"{act['tss']} TSS"
                if act.get("duration_sec"):
                    w["actual_duration"] = f"{round(act['duration_sec'] / 60)} min"
                    w["duration"] = f"{round(act['duration_sec'] / 60)} min"
        else:
            meta = _TYPE_META.get(kind, {"icon": "ellipse-outline", "color": "#8A6FE0", "subtitle": kind.capitalize()})
            w["icon"] = meta["icon"]; w["color"] = meta["color"]
            w["subtitle"] = meta["subtitle"]; w["tss"] = ""
            if kind == "rest":
                done = dt is not None and dt < today
            else:
                done = dt is not None and dt.isoformat() in supp_set
            if done:
                w["status"] = "completed"; w["completed"] = True
        return w

    # Build the schedule in chronological order across whole weeks, starting at
    # the current week, and keep adding weeks until we have enough upcoming
    # (incomplete) entries so the card's list never collapses once live loads.
    UPCOMING_TARGET = 5  # 1 primary + up to 4 "up next" rows
    workouts = []
    ride_idx = 0
    incomplete = 0
    wknum = cur
    while wknum <= dw:
        wk = weeks_map.get(wknum)
        if wk:
            for pos, d in enumerate(wk.get("days", [])):
                w = _mk_workout(d, ride_idx, wknum, pos)
                if d.get("kind") == "cycling":
                    ride_idx += 1
                workouts.append(w)
                if not w.get("completed"):
                    incomplete += 1
        if incomplete >= UPCOMING_TARGET:
            break
        wknum += 1
    phase_idx = (cur - 1) // 4 + 1
    week_in_phase = ((cur - 1) % 4) + 1
    phases = []
    for p in pdoc.get("phases", []):
        n = p["number"]
        if n < phase_idx:
            pct, active = 100, False
        elif n == phase_idx:
            pct, active = round((week_in_phase - 1) / 4 * 100), True
        else:
            pct, active = 0, False
        phases.append({"id": f"p{n}", "number": n, "name": p["name"], "weeks": p.get("weeks_label", ""), "pct": pct, "active": active, "objective": p.get("objective", ""), "points": _PHASE_POINTS.get(n, [])})
    level = pdoc.get("level") or ("Beginner" if is_ctr else "Intermediate")
    if is_ctr:
        weekly_load = [55, 70, 90, 65, 100, 115, 130, 90, 120, 140, 160, 110, 150, 170, 195, 120]
        description = "A 16-week beginner plan to build endurance, confidence and cycling skills from your very first ride to a 90-minute achievement ride."
        goals = [{"id": "g1", "title": "Ride Three Times a Week", "description": "Build a consistent routine", "status": "incomplete"},
                 {"id": "g2", "title": "Ride 40 Minutes Continuously", "description": "Grow your endurance base", "status": "incomplete"},
                 {"id": "g3", "title": "Smooth Cadence & Pacing", "description": "Control your effort", "status": "incomplete"}]
    else:
        weekly_load = [sum(int(dd.get("tss", 0) or 0) for dd in weeks_map[n]["days"] if dd["kind"] == "cycling") for n in sorted(weeks_map)]
        description = pdoc.get("description", "")
        goals = pdoc.get("goals") or []
    plan = {
        "id": plan_id, "title": pdoc.get("title"), "label": (pdoc.get("title") or "").upper(),
        "description": description,
        "duration_weeks": dw, "average_days_per_week": 3, "current_week": cur, "start_date": pdoc.get("start_date"),
        "duration_label": pdoc.get("duration_label", f"{dw} Weeks"), "average_label": pdoc.get("average_label", "3 Rides/Week"),
        "phase": {"name": week.get("phase_name", ""), "weeks": week.get("phase_weeks", ""),
                  "description": next((p["objective"] for p in pdoc.get("phases", []) if p["number"] == week.get("phase")), "")},
        "goals": goals,
        "phases": phases,
        "weekly_load": weekly_load,
        "you_are_here": cur, "workouts": workouts,
        "hero": {
            "week": cur,
            "phase_number": phase_idx,
            "phase_name": next((p["name"] for p in pdoc.get("phases", []) if p["number"] == phase_idx), ""),
            "week_in_phase": week_in_phase,
            "is_phase_start": week_in_phase == 1,
        },
        "plan_complete": plan_complete,
        "adaptation": f"Week {cur} \u2014 {week['title']}. {week['objective']}",
        "adaptation_status": f"{level} plan \u2014 week {cur} of {dw}",
        "week_targets": {"rides": len(cyc), "duration": _fmt_dur(total_min), "distance_km": round(total_min * 0.34), "elevation_m": 50 + cur * 6, "supplementary": len(supp_days)},
        "progress": {"weeks": f"{cur} / {dw}", "workouts": str(prog["count"]), "time": f"{prog['hours']} h", "tss": str(prog["tss"]), "ctl": "\u2014", "atl": "\u2014", "tsb": "\u2014"},
        "progress_pct": min(100, round(prog["count"] / max(1, dw * 3) * 100)),
        "tip": pdoc.get("tip", "Your smoothest controllable cadence is more important than matching an exact number."),
        "created_by": pdoc.get("created_by", "Alberto"),
    }
    if prog["auto_adjustment"]:
        plan["auto_adjustment"] = prog["auto_adjustment"]
    return plan



async def _with_adaptation_meta(resp, plan_id):
    """Attach the plan's adaptation refresh timestamps to the computed response so
    the client's 'plan updated' nudge/badge can detect a post-ride refresh."""
    try:
        doc = await udb.training_plans.find_one(
            {"id": plan_id},
            {"adaptation_ai_alberto_at": 1, "adaptation_ai_adriana_at": 1,
             "adaptation_detail_alberto_at": 1, "adaptation_detail_adriana_at": 1},
        )
        if doc and isinstance(resp, dict):
            for k in ("adaptation_ai_alberto_at", "adaptation_ai_adriana_at",
                      "adaptation_detail_alberto_at", "adaptation_detail_adriana_at"):
                if doc.get(k):
                    resp[k] = doc[k]
    except Exception:
        pass
    return resp


NO_PLAN = {
    "id": "none",
    "title": "No training plan yet",
    "label": "TRAINING PLAN",
    "no_plan": True,
    "free": False,
    "description": "",
    "workouts": [],
    "goals": [],
    "phases": [],
    "progress_pct": 0,
}


def _free_calendar_week(start: str) -> dict:
    """An open (planless) week for casual riders: real dates, no fabricated plan
    sessions. Rider-scheduled workouts get attached to their day by the caller."""
    from datetime import datetime, timedelta
    try:
        base = datetime.strptime(start, "%Y-%m-%d").date()
    except Exception:
        base = datetime.utcnow().date()
    mon = base - timedelta(days=base.weekday())
    end = mon + timedelta(days=6)
    today = datetime.utcnow().date()
    names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    days = [{
        "date": (mon + timedelta(days=i)).isoformat(),
        "day_name": names[i],
        "day_num": (mon + timedelta(days=i)).strftime("%d %b").upper(),
        "focus": "Open",
    } for i in range(7)]
    sel = today.isoformat() if mon <= today <= end else mon.isoformat()
    return {
        "id": mon.isoformat(),
        "start_date": mon.isoformat(),
        "end_date": end.isoformat(),
        "range_label": f"{mon.strftime('%d')} \u2013 {end.strftime('%d %b %Y')}",
        "selected_date": sel,
        "free": True,
        "days": days,
    }

