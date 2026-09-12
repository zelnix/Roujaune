"""Rider domain — profile, appearance, preferences, settings, key/value store,
personal records, account deletion, season/progress aggregates, supplementary
sessions, achievements, readiness/level classification and daily check-ins.

These endpoints depend only on the per-user DB (`udb`), the readiness/level
services and shared rider helpers — never on the plan/coach/benchmark engine —
so they live cleanly outside server.py.
"""
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Body, HTTPException

import auth
from auth import udb
from core import now_iso
from models import (
    AppearanceUpdate, PrefsUpdate, RiderProfileUpdate, PRSubmit, SupplementaryLog,
)
from services.readiness import compute_readiness
from services.rider_level import compute_rider_level
from services.rider_common import _rider_doc, RIDER_DEFAULT, _cal_status

router = APIRouter()


# ----------------------- Rider profile -----------------------
@router.get("/rider/profile")
async def get_rider_profile():
    return await _rider_doc()


@router.put("/rider/profile")
async def update_rider_profile(req: RiderProfileUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_profile.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    return await _rider_doc()


# ---- Rider appearance (identity + bike + clothing) — decoupled from training ----
APPEARANCE_DEFAULT = {"id": "me", "riderType": "younger_male", "bikeType": "road", "clothingStyle": "get_fit"}


@router.get("/rider/appearance")
async def get_rider_appearance():
    doc = await udb.rider_appearance.find_one({"id": "me"})
    if not doc:
        doc = dict(APPEARANCE_DEFAULT)
        await udb.rider_appearance.insert_one(dict(doc))
    doc.pop("_id", None)
    for k, v in APPEARANCE_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


@router.put("/rider/appearance")
async def update_rider_appearance(req: AppearanceUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_appearance.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.rider_appearance.find_one({"id": "me"})
    doc.pop("_id", None)
    for k, v in APPEARANCE_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


# ---- Rider preferences (coach persona + coaching style) ----
PREFS_DEFAULT = {"id": "me", "coach_id": "alberto", "coach_style": "balanced", "voice_guidance": "full", "speech_rate": 0.95}


@router.get("/rider/prefs")
async def get_rider_prefs():
    doc = await udb.rider_prefs.find_one({"id": "me"})
    if not doc:
        doc = dict(PREFS_DEFAULT)
        await udb.rider_prefs.insert_one(dict(doc))
    doc.pop("_id", None)
    for k, v in PREFS_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


@router.put("/rider/prefs")
async def update_rider_prefs(req: PrefsUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_prefs.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.rider_prefs.find_one({"id": "me"})
    doc.pop("_id", None)
    for k, v in PREFS_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


# ---- Rider settings (live-workout + home location) ----
SETTINGS_DEFAULT = {
    "id": "me", "hasTrainer": False, "hasWearable": False, "demoMode": False,
    "hudEnabled": True, "ftp": 287, "ftpAuto": True, "seatedMode": False,
    "wheelCircumference": 2105,
    "homeCity": "South Perth, Australia", "homeLat": -31.9833, "homeLon": 115.8586,
}


@router.get("/rider/settings")
async def get_rider_settings():
    doc = await udb.settings.find_one({"id": "me"})
    if not doc:
        return {}
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@router.put("/rider/settings")
async def update_rider_settings(payload: Dict[str, Any] = Body(...)):
    upd = {k: v for k, v in (payload or {}).items() if k not in ("id", "user_id", "_id")}
    await udb.settings.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.settings.find_one({"id": "me"})
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


# ---- Activity interest ("Notify me when this launches" for roadmap modes) ----
VALID_MODES = {"gravel", "mountain-bike", "walking", "running", "rowing", "climbing"}


@router.get("/rider/interest")
async def get_mode_interest():
    """Modes the rider has asked to be notified about — powers the teaser
    button's 'we'll let you know' state and gives us a demand signal."""
    rows = await udb.mode_interest.find({}, {"_id": 0, "mode": 1}).to_list(50)
    return {"modes": [r["mode"] for r in rows]}


@router.post("/rider/interest/{mode}")
async def register_mode_interest(mode: str):
    if mode not in VALID_MODES:
        raise HTTPException(status_code=422, detail="Unknown activity mode")
    await udb.mode_interest.update_one(
        {"mode": mode},
        {"$set": {"mode": mode, "at": now_iso()}},
        upsert=True,
    )
    return {"registered": mode}


@router.delete("/rider/interest/{mode}")
async def remove_mode_interest(mode: str):
    await udb.mode_interest.delete_one({"mode": mode})
    return {"removed": mode}



# ---- Generic per-user key/value preference store ----
@router.get("/rider/kv")
async def get_rider_kv():
    doc = await udb.kv_prefs.find_one({"id": "me"}) or {}
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.pop("id", None)
    return doc


@router.put("/rider/kv")
async def set_rider_kv(payload: Dict[str, Any] = Body(...)):
    key = payload.get("key")
    if not key or not isinstance(key, str) or "." in key:
        raise HTTPException(status_code=400, detail="Invalid key")
    value = payload.get("value")
    if value is None:
        await udb.kv_prefs.update_one({"id": "me"}, {"$unset": {key: ""}, "$set": {"id": "me"}}, upsert=True)
    else:
        await udb.kv_prefs.update_one({"id": "me"}, {"$set": {key: value, "id": "me"}}, upsert=True)
    return {"ok": True}


# ----------------------- Personal records -----------------------
def _clean_pr(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.setdefault("segments", {})
    return doc


@router.get("/rider/prs")
async def list_rider_prs():
    """All of the rider's route personal records (for the Profile / picker)."""
    docs = await udb.rider_prs.find().to_list(length=200)
    return {"prs": [_clean_pr(d) for d in docs]}


@router.get("/rider/prs/{route_id}")
async def get_rider_pr(route_id: str):
    doc = await udb.rider_prs.find_one({"id": route_id})
    return _clean_pr(doc) if doc else {"id": route_id, "segments": {}}


@router.post("/rider/prs")
async def submit_rider_pr(body: PRSubmit):
    """Compare a just-finished ride against the rider's stored records for this
    scenic route (fastest time = primary PR, highest avg power = secondary badge)
    plus per-segment split times."""
    existing = await udb.rider_prs.find_one({"id": body.route_id})
    doc = _clean_pr(existing) if existing else {
        "id": body.route_id, "route_name": body.route_name,
        "best_time_sec": None, "best_time_at": None,
        "best_avg_power": None, "best_avg_power_at": None,
        "segments": {}, "attempts": 0,
    }
    prev = {
        "best_time_sec": doc.get("best_time_sec"),
        "best_avg_power": doc.get("best_avg_power"),
    }
    first_time = existing is None or doc.get("best_time_sec") is None

    route_time_pr = False
    route_power_pr = False
    segment_prs: List[str] = []

    now = now_iso()
    if body.route_name:
        doc["route_name"] = body.route_name

    if body.completed and body.time_sec > 0:
        if doc.get("best_time_sec") is None or body.time_sec < doc["best_time_sec"]:
            doc["best_time_sec"] = body.time_sec
            doc["best_time_at"] = now
            route_time_pr = not first_time

    if body.avg_power > 0:
        if doc.get("best_avg_power") is None or body.avg_power > doc["best_avg_power"]:
            was = doc.get("best_avg_power")
            doc["best_avg_power"] = body.avg_power
            doc["best_avg_power_at"] = now
            route_power_pr = was is not None

    segs = dict(doc.get("segments") or {})
    for sp in body.splits:
        if not sp.label or sp.time_sec <= 0:
            continue
        cur = segs.get(sp.label)
        if cur is None or sp.time_sec < cur.get("best_time_sec", 10 ** 9):
            beaten = cur is not None
            segs[sp.label] = {"best_time_sec": sp.time_sec, "km": sp.km, "at": now}
            if beaten:
                segment_prs.append(sp.label)
    doc["segments"] = segs
    doc["attempts"] = int(doc.get("attempts", 0)) + 1
    doc["updated_at"] = now

    await udb.rider_prs.update_one({"id": body.route_id}, {"$set": doc}, upsert=True)

    return {
        "records": {
            "route_time": route_time_pr,
            "route_power": route_power_pr,
            "segments": segment_prs,
            "first_time": first_time and body.completed and body.time_sec > 0,
        },
        "previous": prev,
        "pr": {
            "best_time_sec": doc.get("best_time_sec"),
            "best_avg_power": doc.get("best_avg_power"),
        },
    }


# ----------------------- Account deletion (GDPR cascade) -----------------------
@router.delete("/rider/account")
async def delete_rider_account():
    """Rider-facing self-serve account deletion. Removes the authenticated rider
    and every user-scoped document plus active sessions."""
    actor = auth.require_user()
    uid = actor.get("user_id")
    result = await auth.erase_user_data(uid)
    return {"ok": True, **result}


# ----------------------- Season / progress aggregates -----------------------
@router.get("/rider/season")
async def get_rider_season(days: int = 0):
    """Aggregate the rider's real logged sessions for the Profile screen.
    Optional `days` limits to rides within the last N days (0 = all-time)."""
    query: dict = {}
    if days and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query = {"created_at": {"$gte": cutoff}}
    rides = await udb.ride_history.find(query).to_list(length=5000)
    count = len(rides)
    dist = sum((r.get("distance_km") or 0) for r in rides)
    elev = sum((r.get("elevation_m") or 0) for r in rides)
    secs = sum((r.get("duration_sec") or 0) for r in rides)
    ride_days = {str(r.get("created_at"))[:10] for r in rides if r.get("created_at")}
    streak = 0
    d = date.today()
    while d.isoformat() in ride_days:
        streak += 1
        d -= timedelta(days=1)

    def _agg(rs):
        return {
            "rides": len(rs),
            "distance_km": round(sum((r.get("distance_km") or 0) for r in rs), 1),
            "elevation_m": int(sum((r.get("elevation_m") or 0) for r in rs)),
            "hours": round(sum((r.get("duration_sec") or 0) for r in rs) / 3600, 1),
        }
    outdoor = [r for r in rides if r.get("indoor_outdoor") == "outdoor"]
    indoor = [r for r in rides if r.get("indoor_outdoor") != "outdoor"]
    try:
        supplementary = await udb.supplementary_log.count_documents(query)
    except Exception:
        supplementary = 0
    return {
        "rides": count,
        "distance_km": round(dist, 1),
        "elevation_m": int(elev),
        "hours": round(secs / 3600, 1),
        "streak": streak,
        "supplementary": supplementary,
        "indoor": _agg(indoor),
        "outdoor": _agg(outdoor),
    }


@router.get("/progress/summary")
async def progress_summary():
    """Rich progress rollup for the Today 'Progress' card."""
    uid = auth.current_user_id()
    rides = await udb.ride_history.find().to_list(length=5000)
    ride_count = len(rides)
    total_km = round(sum((r.get("distance_km") or 0) for r in rides), 1)
    total_secs = int(sum((r.get("duration_sec") or 0) for r in rides))

    supp = await udb.supplementary_log.find().to_list(length=5000)
    strength_count = sum(1 for s in supp if s.get("kind") == "strength")
    recovery_mobility_count = sum(1 for s in supp if s.get("kind") in ("recovery", "mobility", "balance"))

    settings = await udb.settings.find_one({"user_id": uid}) or {}
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    cur_ftp = int(settings.get("ftp") or profile.get("ftp") or 0)
    accepted = await udb.benchmark_results.find(
        {"user_id": uid, "decision": "accepted"}).sort("createdAt", 1).to_list(length=200)
    ftp_series = [int((r.get("primaryMetric") or {}).get("value") or 0)
                  for r in accepted if (r.get("primaryMetric") or {}).get("key") == "ftp"]
    ftp_delta = (ftp_series[-1] - ftp_series[0]) if len(ftp_series) >= 2 else 0
    ftp_wkg = profile.get("ftpWkg")

    tests_accepted = len(accepted)
    metric_fields = ["ftp", "fiveMinPower", "oneMinPower", "sprintPower",
                     "aerobicEfficiency", "preferredCadence", "recoveryResponse"]
    tests_measured = sum(1 for f in metric_fields if profile.get(f))

    hrs = total_secs // 3600
    mins = (total_secs % 3600) // 60
    duration_label = f"{hrs}h {mins:02d}m" if hrs else f"{mins}m"

    return {
        "workouts": {
            "ride": ride_count,
            "strength": strength_count,
            "recoveryMobility": recovery_mobility_count,
        },
        "ftp": {"current": cur_ftp, "delta": ftp_delta, "wkg": ftp_wkg},
        "tests": {"accepted": tests_accepted, "measured": tests_measured, "total": len(metric_fields)},
        "totals": {"km": total_km, "durationSec": total_secs, "durationLabel": duration_label, "rides": ride_count},
    }


# ----------------------- Supplementary sessions -----------------------
@router.post("/rider/supplementary/complete")
async def complete_supplementary(body: SupplementaryLog):
    """Toggle a completed non-cycling session for a given date."""
    existing = await udb.supplementary_log.find_one({"date": body.date, "kind": body.kind}) if body.date else None
    if existing:
        await udb.supplementary_log.delete_one({"_id": existing["_id"]})
        return {"ok": True, "completed": False}
    doc = {"id": str(uuid.uuid4()), "created_at": now_iso(), "kind": body.kind, "title": body.title, "date": body.date}
    await udb.supplementary_log.insert_one(doc)
    return {"ok": True, "completed": True}


# ----------------------- Achievements -----------------------
@router.get("/rider/achievements")
async def get_rider_achievements():
    """Compute unlocked achievement badges from the rider's real ride history."""
    rides = await udb.ride_history.find().to_list(length=5000)
    if not rides:
        return {"achievements": []}
    total_dist = sum((r.get("distance_km") or 0) for r in rides)
    total_elev = sum((r.get("elevation_m") or 0) for r in rides)
    max_dist = max((r.get("distance_km") or 0) for r in rides)
    max_elev = max((r.get("elevation_m") or 0) for r in rides)
    count = len(rides)
    ride_days = {str(r.get("created_at"))[:10] for r in rides if r.get("created_at")}
    streak = 0
    d = date.today()
    while d.isoformat() in ride_days:
        streak += 1
        d -= timedelta(days=1)

    unlocked = []

    def add(cond, icon, label, sub, color):
        if cond:
            unlocked.append({"icon": icon, "label": label, "sub": sub, "color": color})

    add(count >= 1, "bicycle", "First Ride", "Your journey begins", "#40A9C6")
    add(max_dist >= 100, "medal", "Century Club", "100 km in a single ride", "#40A9C6")
    add(max_elev >= 1000, "trending-up", "Big Climber", "1,000 m in a single ride", "#9BD84B")
    add(total_dist >= 500, "navigate", "500 km Logged", f"{round(total_dist)} km total", "#E8A33C")
    add(total_dist >= 1000, "trophy", "1,000 km Club", f"{round(total_dist)} km total", "#FFC20A")
    add(streak >= 3, "flame", "3-Day Streak", "Consistency building", "#E8631C")
    add(streak >= 7, "flame", "7-Day Streak", "On fire this week", "#C91727")
    add(total_elev >= 8848, "flag", "Everest Challenge", "8,848 m climbed", "#FFC20A")
    return {"achievements": unlocked}


# ----------------------- Readiness / level / check-in -----------------------
async def _enrich_activity(payload: dict) -> dict:
    """Fill training load + personal HR/HRV baseline from real ride & check-in
    history when the client did not supply it, so readiness reflects recent
    Roujaune activity and the rider's own trend rather than a fixed number."""
    out = dict(payload)
    if not out.get("activity"):
        try:
            now = datetime.now(timezone.utc)
            rides = await udb.ride_history.find().to_list(length=5000)

            def tss_since(days):
                cutoff = (now - timedelta(days=days)).isoformat()
                return sum((r.get("tss") or 0) for r in rides if str(r.get("created_at")) >= cutoff)
            acute = tss_since(7)
            chronic = tss_since(28) / 4.0
            if chronic > 0:
                out["activity"] = {"acute_load": acute, "chronic_load": chronic}
        except Exception:
            pass
    if not out.get("baseline"):
        try:
            cutoff = (date.today() - timedelta(days=14)).isoformat()
            history = await udb.daily_checkins.find(
                {"date": {"$gte": cutoff}, "id": {"$nin": ["latest"]}}
            ).to_list(length=30)
            hrvs = [float((c.get("checkin") or {})["hrv"]) for c in history if (c.get("checkin") or {}).get("hrv")]
            rhrs = [float((c.get("checkin") or {})["resting_hr"]) for c in history if (c.get("checkin") or {}).get("resting_hr")]
            baseline: Dict[str, float] = {}
            if len(hrvs) >= 3:
                baseline["hrv_7d"] = sum(hrvs) / len(hrvs)
            if len(rhrs) >= 3:
                baseline["resting_hr_7d"] = sum(rhrs) / len(rhrs)
            if baseline:
                out["baseline"] = baseline
        except Exception:
            pass
    return out


@router.post("/rider/readiness")
async def rider_readiness(payload: dict):
    """Compute the rider's 0–100 readiness score (see readiness.py)."""
    enriched = await _enrich_activity(payload or {})
    return compute_readiness(enriched)


@router.post("/rider/level")
async def rider_level(payload: dict):
    """Classify the rider as Beginner / Intermediate / Advanced (see rider_level.py)."""
    return compute_rider_level(payload or {})


def _checkin_metrics(c: dict) -> list:
    """Readiness sub-metrics (0–100, higher = better) for the calendar ring detail."""
    def word(v: float) -> str:
        return "High" if v >= 75 else "Good" if v >= 60 else "Moderate" if v >= 45 else "Low"
    out = []

    def add(key, label, val):
        if val is None:
            return
        v = max(0.0, min(100.0, float(val)))
        out.append({"key": key, "label": label, "value": round(v), "display": word(v)})
    if c.get("energy") is not None:
        add("energy", "Energy", float(c["energy"]) * 10)
    if c.get("sleep_quality") is not None:
        add("sleep", "Sleep", float(c["sleep_quality"]) * 10)
    if c.get("stress") is not None:
        add("stress", "Stress", (10 - float(c["stress"])) * 10)
    if c.get("soreness") is not None:
        add("soreness", "Legs", (10 - float(c["soreness"])) * 10)
    return out


async def _downgrade_preview_safe() -> dict:
    """Best-effort wrapper around plan.py's readiness-downgrade preview — a
    domain-crossing helper kept local so a plan-side failure never breaks the
    check-in flow itself."""
    try:
        from routes.plan import _readiness_downgrade_preview
        return await _readiness_downgrade_preview()
    except Exception:
        logging.warning("readiness downgrade preview failed")
        return {"available": False}


@router.post("/rider/checkin")
async def rider_checkin(payload: dict):
    """Store today's daily check-in, return the computed readiness score, and —
    hybrid coaching model — surface (never auto-apply) a one-tap suggestion to
    ease off today's session when the rider's own signals, including a
    manually logged HRV or resting HR, are running low."""
    payload = payload or {}
    enriched = await _enrich_activity(payload)
    result = compute_readiness(enriched)
    d = payload.get("date") or date.today().isoformat()
    checkin = payload.get("checkin") or {}
    symptoms = payload.get("symptoms") or {}
    flags = payload.get("flags") or {}
    illness = bool(symptoms.get("illness") or flags.get("illness"))
    injury = bool(flags.get("injury"))
    returning = bool(flags.get("returning"))
    equipment_changed = bool(flags.get("equipmentChanged"))
    doc = {
        "score": result.get("readinessScore", 0),
        "status": result.get("status"),
        "band": result.get("status"),
        "mainFactors": result.get("mainFactors", []),
        "confidence": result.get("confidence"),
        "safetyOverride": result.get("safetyOverride", False),
        "metrics": _checkin_metrics(checkin),
        "checkin": checkin,
        "symptoms": symptoms,
        "illness": illness,
        "injury": injury,
        "returning": returning,
        "equipmentChanged": equipment_changed,
        "date": d,
        "at": now_iso(),
        # Reset per-day so a stale accept/dismiss from a previous check-in
        # never carries forward and silently hides today's suggestion.
        "downgrade_applied": False,
        "downgrade_dismissed": False,
    }
    try:
        await udb.daily_checkins.update_one({"id": "latest"}, {"$set": {**doc, "id": "latest"}}, upsert=True)
        await udb.daily_checkins.update_one({"id": d}, {"$set": {**doc, "id": d}}, upsert=True)
    except Exception:
        logging.warning("checkin persist failed")
    downgrade = await _downgrade_preview_safe()
    return {**result, "date": d, "downgrade": downgrade}


@router.get("/rider/readiness/today")
async def rider_readiness_today():
    """Return the latest stored daily check-in readiness (or unavailable),
    plus today's coach downgrade suggestion, if any — including one auto-
    triggered by a safety ease during the rider's last ride, even with no
    morning check-in at all."""
    doc = await udb.daily_checkins.find_one({"id": "latest"})
    downgrade = await _downgrade_preview_safe()
    if not doc:
        if downgrade.get("available"):
            return {"available": True, "score": None, "status": downgrade.get("status"),
                    "mainFactors": [downgrade.get("reason")] if downgrade.get("reason") else [],
                    "safetyOverride": False, "downgrade": downgrade}
        return {"available": False}
    doc.pop("_id", None)
    if doc.get("score") is None and not downgrade.get("available"):
        return {"available": False}
    return {"available": True, **doc, "downgrade": downgrade}
