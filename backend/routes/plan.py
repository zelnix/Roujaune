"""Training-plan, calendar and progress routes for ROUJAUNE. All plan/calendar
state and math lives in services.plan_engine; these handlers just orchestrate it
per rider. Scoped per user; never fabricates a demo plan (returns NO_PLAN).
"""
import logging
import re  # noqa: F401
import uuid  # noqa: F401
from datetime import date, datetime, timedelta, timezone  # noqa: F401
from typing import Any, Dict, List, Optional  # noqa: F401

from fastapi import APIRouter, Body, HTTPException, Query  # noqa: F401

import auth
import plans_admin
import companion_plan  # noqa: F401
from auth import udb
from core import now_iso  # noqa: F401
from models import (
    AssignPlanRequest, OnboardingReq, GoalsUpdateRequest, FavToggleRequest,
    ScheduleRequest, MoveSessionRequest, ReviewRequest,
)
from services import plan_engine
from services.plan_engine import (
    NO_PLAN, LEVEL_PLAN, _plan_for_level, NUDGE_ZONES,
    _struct_ctx, _struct_ctx_for_rider, _rider_plan_def, _snapshot_plan_def,
    _ctr_state, _ctr_progress, _ctr_readiness, _ctr_completions, _plan_done,
    _ctr_calendar_week, _ctr_plan_response, _with_adaptation_meta, _free_calendar_week,
    _ctr_today, _ctr_day_date, _fmt_dur, _pm, _apply_companion_ops, _weeks_and_tss,
)  # noqa: F401
from services.plan_common import _active_plan_id, _plan_id_or_active, STRUCTURED_PLAN_IDS, _RIDE_PREFIX  # noqa: F401
from services.rider_common import _rider_doc, _cal_status  # noqa: F401

router = APIRouter()


@router.get("/rider/plan")
async def get_rider_plan():
    """The plan the current rider is assigned to (resolved) + all selectable plans."""
    active = await _active_plan_id()
    plans = await plans_admin.list_plans()
    return {"active_plan_id": active, "plans": plans}


@router.post("/rider/plan")
async def assign_rider_plan(req: AssignPlanRequest):
    """Switch which plan the current rider is on. `plan_id` may be "none" to ride
    free (no plan). Otherwise validated against the `plans` collection."""
    title = "Free Riding"
    if req.plan_id and req.plan_id != "none":
        plan = await plans_admin.get_plan_def(req.plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        title = plan.get("title")
    await udb.rider_profile.update_one(
        {"id": "me"}, {"$set": {"id": "me", "assigned_plan_id": req.plan_id}}, upsert=True,
    )
    await auth._db.users.update_one(
        {"user_id": auth.current_user_id()},
        {"$set": {"onboarded": True, "assigned_plan_id": req.plan_id}},
    )
    if req.reset_progress and req.plan_id in ("couch-to-road", "ride-stronger", "ride-beyond"):
        await udb.plan_state.update_one(
            {"id": req.plan_id},
            {"$set": {"current_week": 1}, "$unset": {"eased_weeks": ""}},
            upsert=True,
        )
    # Give the rider their OWN copy of the plan definition so subsequent edits to
    # the shared plan-list template never alter a rider already on this plan.
    if req.plan_id and req.plan_id != "none":
        existing = await udb.training_plans.find_one({"id": req.plan_id})
        if req.reset_progress or not (existing and existing.get("definition")):
            snap = await _snapshot_plan_def(req.plan_id)
            if snap is not None:
                await udb.training_plans.update_one(
                    {"id": req.plan_id},
                    {"$set": {"id": req.plan_id, "definition": snap, "snapshot_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
    return {"active_plan_id": req.plan_id, "title": title}


# Which plan is the sensible default for each rider level. Falls back gracefully
# until intermediate/advanced plans are authored in the admin project.
# LEVEL_PLAN / _plan_for_level moved to services.plan_engine




def _classify_level(r: "OnboardingReq") -> str:
    """Lightweight onboarding classifier (no ride telemetry yet)."""
    score = 0
    score += min(3, r.experience_years / 2)          # up to 3 (6+ yrs)
    score += min(3, r.weekly_rides)                   # up to 3
    score += min(3, r.longest_ride_min / 45)          # up to 3 (~135min)
    score += 1.5 if r.confident_60min else 0
    score += {"new": 0, "some": 1.5, "confident": 3}.get(r.self_rating, 0)
    if score >= 8:
        return "Advanced"
    if score >= 4:
        return "Intermediate"
    return "Beginner"


@router.post("/onboarding/recommend")
async def onboarding_recommend(req: OnboardingReq):
    """Classify the rider's level from onboarding answers and recommend the default
    plan for that level. The rider can accept it, pick another, or ride free."""
    level = _classify_level(req)
    recommended = await _plan_for_level(level)
    plans = await plans_admin.list_plans()
    return {"level": level, "recommended": recommended, "plans": plans, "allow_free": True}


# ---- Rider profile/season/progress/checkin/achievements moved to routes/rider.py ----


@router.get("/plan/targets")
async def get_plan_targets(plan_id: str = ""):
    """Current adaptive per-zone target bias (fraction, e.g. Z4: 0.04 → +4%) plus
    the recent execution ratios that produced it. The live HUD applies the bias
    on top of FTP × zone%; the Plan screen visualises both."""
    plan_id = await _plan_id_or_active(plan_id)
    plan = (await udb.training_plans.find_one({"id": plan_id})) if plan_id else None
    plan = plan or {}
    return {
        "zone_bias": plan.get("zone_bias") or {},
        "zone_exec": plan.get("zone_exec") or {},
        "zones": NUDGE_ZONES,
    }


@router.get("/plan")
async def get_plan(id: str = ""):
    """Return the rider's current training plan, resolved from their real
    assignment/training state. If the rider has no plan we return NO_PLAN so the
    app can prompt them — we never fall back to a demo ('Build & Climb') plan."""
    try:
        active = await _active_plan_id()
        if active == "none":
            return {"id": "none", "title": "Free Riding", "label": "FREE RIDING", "free": True,
                    "description": "You're riding without a structured plan. Jump into any ride whenever you like.",
                    "workouts": [], "goals": [], "progress_pct": 0}
        if not active:
            return dict(NO_PLAN)
        if active in STRUCTURED_PLAN_IDS:
            spid = active
            pdoc, weeks_map, planned, prefix = await _struct_ctx_for_rider(spid)
            cur, ride_map, supp = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id=spid, ride_prefix=prefix)
            prog = await _ctr_progress(ride_map, ride_prefix=prefix, planned_tss=planned)
            done = _plan_done(weeks_map, cur, int(pdoc.get("duration_weeks") or 16), ride_map, supp)
            return await _with_adaptation_meta(_ctr_plan_response(cur, ride_map, prog, weeks=weeks_map, plan_doc=pdoc, plan_id=spid, plan_complete=done, supp_dates=supp), spid)
        # Non-structured (custom/admin-authored) plan the rider is explicitly on.
        doc = await udb.training_plans.find_one({"id": active})
        base = await _rider_plan_def(active)
        if not base:
            return dict(NO_PLAN)
        base.pop("_id", None)
        # Overlay mutable runtime state the app edits (goals, coach adaptations,
        # adaptive zone bias) onto the admin-managed plan definition.
        merged = dict(base)
        if doc:
            doc.pop("_id", None)
            for k in ("goals", "adaptation_history", "zone_bias", "zone_exec"):
                if k in doc:
                    merged[k] = doc[k]
            for k, v in doc.items():
                if k.startswith("adaptation_ai_"):
                    merged[k] = v
        return merged
    except Exception:
        logging.exception("get_plan failed")
        return dict(NO_PLAN)


@router.get("/plan/adaptations")
async def get_plan_adaptations(plan_id: str = "", coach_name: Optional[str] = None):
    """Return the coach's adaptation history (newest first). Seeds a first entry
    from the plan's current cached/static adaptation if the history is empty."""
    plan_id = await _plan_id_or_active(plan_id)
    if not plan_id:
        return {"adaptations": [], "status": ""}
    plan = await udb.training_plans.find_one({"id": plan_id}) or {}

    history = plan.get("adaptation_history") or []
    if not history:
        coach = coach_name or plan.get("created_by") or "Alberto"
        seed_text = plan.get(f"adaptation_ai_{coach.lower()}") or plan.get("adaptation")
        history = [{
            "id": "seed",
            "coach": coach,
            "text": seed_text,
            "trigger": "Plan start",
            "at": plan.get(f"adaptation_ai_{coach.lower()}_at") or now_iso(),
        }]

    if coach_name:
        history = [h for h in history if str(h.get("coach", "")).lower() == coach_name.lower()] or history

    return {"adaptations": history, "status": plan.get("adaptation_status", "Plan is adapting as you improve")}






@router.put("/plan/goals")
async def update_plan_goals(req: GoalsUpdateRequest):
    """Persist the rider's edited plan goals and return the updated plan."""
    req.plan_id = await _plan_id_or_active(req.plan_id)
    if not req.plan_id:
        raise HTTPException(status_code=400, detail="No active training plan")
    goals = [g.dict() for g in req.goals]
    await udb.training_plans.update_one(
        {"id": req.plan_id},
        {"$set": {"goals": goals, "goals_updated_at": now_iso()}},
    )
    doc = await udb.training_plans.find_one({"id": req.plan_id})
    doc.pop("_id", None)
    return doc


@router.get("/plan/progress")
async def get_plan_progress(plan_id: str = ""):
    """Detailed plan progress for the "View Progress" modal: headline metrics,
    fitness trend series and a per-week completion breakdown."""
    plan_id = await _plan_id_or_active(plan_id)
    if not plan_id:
        return {"progress_pct": 0, "summary": {}, "fitness": [], "trend": [], "metrics": [], "weeks": []}
    plan = await udb.training_plans.find_one({"id": plan_id}) or {}
    plan.pop("_id", None)
    # Structured plans compute their progress live rather than storing weekly_load.
    if plan_id in STRUCTURED_PLAN_IDS:
        try:
            computed = await get_plan(id=plan_id)
            if isinstance(computed, dict):
                plan = {**plan, **computed}
        except Exception:
            pass

    weekly = plan.get("weekly_load", [])
    here = plan.get("you_are_here", 1)
    weeks = [
        {"label": f"Week {i + 1}", "tss": v, "done": (i + 1) < here, "current": (i + 1) == here}
        for i, v in enumerate(weekly)
    ]
    return {
        "progress_pct": plan.get("progress_pct", 0),
        "summary": plan.get("progress", {}),
        "fitness": PROGRESS_DATA["fitness"],
        "trend": PROGRESS_DATA["trend"],
        "metrics": PROGRESS_DATA["metrics"],
        "weeks": weeks,
    }



# ----------------------- Calendar (weekly scheduling) -----------------------
CALENDAR_WEEK = {
    "id": "2025-05-12",
    "start_date": "2025-05-12",
    "end_date": "2025-05-18",
    "range_label": "12 \u2013 18 May 2025",
    "selected_date": "2025-05-13",
    "days": [
        {
            "date": "2025-05-12", "day_name": "MON", "day_num": "12 MAY", "focus": "Endurance Base",
            "cycling": {"id": "c1", "type": "cycling", "title": "Endurance Ride", "duration": "1h 30m", "zone": "Z2", "tss": "65 TSS", "status": "completed", "color": "green", "created_by": "Alberto"},
            "fb50": {"id": "f1", "type": "fb50", "title": "Lower Body Strength", "duration": "20 min", "status": "completed", "category": "FB50"},
            "readiness": {"score": 82, "status": "Good", "source": "Garmin Connect", "metrics": [
                {"key": "energy", "label": "Energy", "value": 82, "display": "High"},
                {"key": "soreness", "label": "Soreness", "value": 78, "display": "Low"},
                {"key": "stress", "label": "Stress", "value": 80, "display": "Low"},
                {"key": "sleep", "label": "Sleep", "value": 86, "display": "7h 45m"}]},
        },
        {
            "date": "2025-05-13", "day_name": "TUE", "day_num": "13 MAY", "focus": "Threshold Power",
            "cycling": {"id": "c2", "type": "cycling", "title": "Threshold Climb", "duration": "1h 00m", "zone": "Z4", "tss": "92 TSS", "status": "today", "color": "rouge", "target_power": 251, "created_by": "Alberto", "profile": [0.5, 0.7, 0.6, 0.85, 0.7, 0.95, 0.75, 0.9, 0.65, 0.88, 0.7, 0.5, 0.6, 0.8]},
            "fb50": {"id": "f2", "type": "fb50", "title": "Mobility Flow", "duration": "15 min", "status": "scheduled", "category": "FB50"},
            "readiness": {"score": 76, "status": "Good", "source": "Garmin Connect", "metrics": [
                {"key": "energy", "label": "Energy", "value": 74, "display": "Good"},
                {"key": "soreness", "label": "Soreness", "value": 72, "display": "Low"},
                {"key": "stress", "label": "Stress", "value": 62, "display": "Moderate"},
                {"key": "sleep", "label": "Sleep", "value": 78, "display": "7h 10m"}]},
        },
        {
            "date": "2025-05-14", "day_name": "WED", "day_num": "14 MAY", "focus": "Recovery",
            "cycling": {"id": "c3", "type": "cycling", "title": "Recovery Ride", "duration": "1h 15m", "zone": "Z1", "tss": "45 TSS", "status": "completed", "color": "blue", "created_by": "Alberto"},
            "fb50": {"id": "f3", "type": "fb50", "title": "Core Stability", "duration": "20 min", "status": "planned", "category": "FB50"},
            "readiness": {"score": 68, "status": "Moderate", "source": "Apple Health", "metrics": [
                {"key": "energy", "label": "Energy", "value": 64, "display": "Moderate"},
                {"key": "soreness", "label": "Soreness", "value": 58, "display": "Moderate"},
                {"key": "stress", "label": "Stress", "value": 60, "display": "Moderate"},
                {"key": "sleep", "label": "Sleep", "value": 66, "display": "6h 30m"}]},
        },
        {
            "date": "2025-05-15", "day_name": "THU", "day_num": "15 MAY", "focus": "Sweet Spot Power",
            "cycling": {"id": "c4", "type": "cycling", "title": "Sweet Spot", "duration": "1h 20m", "zone": "Z3", "tss": "75 TSS", "status": "planned", "color": "amber", "created_by": "Alberto"},
            "fb50": {"id": "f4", "type": "fb50", "title": "Hip Mobility", "duration": "15 min", "status": "planned", "category": "FB50"},
            "readiness": {"score": 78, "status": "Good", "source": "Garmin Connect", "metrics": [
                {"key": "energy", "label": "Energy", "value": 76, "display": "Good"},
                {"key": "soreness", "label": "Soreness", "value": 75, "display": "Low"},
                {"key": "stress", "label": "Stress", "value": 80, "display": "Low"},
                {"key": "sleep", "label": "Sleep", "value": 82, "display": "7h 30m"}]},
        },
        {
            "date": "2025-05-16", "day_name": "FRI", "day_num": "16 MAY", "focus": "Endurance Base",
            "cycling": {"id": "c5", "type": "cycling", "title": "Endurance Ride", "duration": "1h 45m", "zone": "Z2", "tss": "70 TSS", "status": "planned", "color": "green", "created_by": "Alberto"},
            "fb50": {"id": "f5", "type": "fb50", "title": "Upper Body Strength", "duration": "20 min", "status": "planned", "category": "FB50"},
            "readiness": {"score": 72, "status": "Good", "source": "Garmin Connect", "metrics": [
                {"key": "energy", "label": "Energy", "value": 70, "display": "Good"},
                {"key": "soreness", "label": "Soreness", "value": 64, "display": "Moderate"},
                {"key": "stress", "label": "Stress", "value": 76, "display": "Low"},
                {"key": "sleep", "label": "Sleep", "value": 74, "display": "7h 00m"}]},
        },
        {
            "date": "2025-05-17", "day_name": "SAT", "day_num": "17 MAY", "focus": "Long Ride Endurance",
            "cycling": {"id": "c6", "type": "cycling", "title": "Long Ride", "duration": "3h 00m", "zone": "Z2", "tss": "120 TSS", "status": "planned", "color": "green", "created_by": "Alberto"},
            "fb50": {"id": "f6", "type": "fb50", "title": "Post-Ride Mobility", "duration": "20 min", "status": "planned", "category": "FB50"},
            "readiness": {"score": 65, "status": "Moderate", "source": "Apple Health", "metrics": [
                {"key": "energy", "label": "Energy", "value": 62, "display": "Moderate"},
                {"key": "soreness", "label": "Soreness", "value": 55, "display": "Moderate"},
                {"key": "stress", "label": "Stress", "value": 58, "display": "Moderate"},
                {"key": "sleep", "label": "Sleep", "value": 62, "display": "6h 15m"}]},
        },
        {
            "date": "2025-05-18", "day_name": "SUN", "day_num": "18 MAY", "focus": "Recovery",
            "cycling": {"id": "c7", "type": "cycling", "title": "Rest Day", "subtitle": "Wellness Focus", "duration": "", "zone": "", "tss": "", "status": "rest", "color": "purple", "created_by": "Alberto"},
            "fb50": {"id": "f7", "type": "fb50", "title": "Active Recovery Walk", "duration": "30 min", "status": "planned", "category": "Recovery"},
            "readiness": {"score": 84, "status": "Good", "source": "Garmin Connect", "metrics": [
                {"key": "energy", "label": "Energy", "value": 85, "display": "High"},
                {"key": "soreness", "label": "Soreness", "value": 82, "display": "Low"},
                {"key": "stress", "label": "Stress", "value": 84, "display": "Low"},
                {"key": "sleep", "label": "Sleep", "value": 90, "display": "8h 10m"}]},
        },
    ],
    "summary": {
        "workouts_completed": 5, "workouts_planned": 7, "duration": "6h 24m", "tss": "287",
        "zones": [
            {"z": "Z1", "pct": 6, "time": "00:24:15", "color": "green"},
            {"z": "Z2", "pct": 18, "time": "01:12:30", "color": "greenyellow"},
            {"z": "Z3", "pct": 24, "time": "01:36:45", "color": "yellow"},
            {"z": "Z4", "pct": 36, "time": "02:24:00", "color": "orange"},
            {"z": "Z5", "pct": 16, "time": "01:06:30", "color": "rouge"},
        ],
    },
    "tip": "Great week ahead. The threshold session today will make a big difference on the climbs.",
    "seed_version": 2,
}


# _free_calendar_week moved to services.plan_engine


@router.get("/calendar/week")
async def get_calendar_week(start: str = "2025-05-12"):
    """Return a scheduling week (seeded into Mongo on first read)."""
    try:
        rider = await _rider_doc()
        active = await _active_plan_id()
        if active == "couch-to-road":
            cur, ride_map, supp_dates = await _ctr_state()
            doc = _ctr_calendar_week(plan_engine.CTR_WEEKS[cur], ride_map, supp_dates, _ctr_today())
        elif active == "ride-stronger":
            pdoc, weeks_map, planned, prefix = _struct_ctx("ride-stronger")
            cur, ride_map, supp_dates = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id="ride-stronger", ride_prefix=prefix)
            doc = _ctr_calendar_week(weeks_map[cur], ride_map, supp_dates, _ctr_today())
        elif active == "ride-beyond":
            pdoc, weeks_map, planned, prefix = _struct_ctx("ride-beyond")
            cur, ride_map, supp_dates = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id="ride-beyond", ride_prefix=prefix)
            doc = _ctr_calendar_week(weeks_map[cur], ride_map, supp_dates, _ctr_today())
        elif active == "build-and-climb":
            # The dedicated demo account keeps the illustrative demo week.
            doc = await udb.calendar_weeks.find_one({"start_date": start})
            if not doc or doc.get("seed_version") != CALENDAR_WEEK["seed_version"]:
                await udb.calendar_weeks.update_one({"start_date": start}, {"$set": CALENDAR_WEEK}, upsert=True)
                doc = dict(CALENDAR_WEEK)
        else:
            # Casual rider (no structured plan): an OPEN week they can fill with
            # any workouts they pick — never the fabricated demo week.
            doc = _free_calendar_week(start)
        doc.pop("_id", None)
        # Attach rider-scheduled catalog workouts to their matching day.
        try:
            sched = await udb.scheduled_workouts.find().to_list(500)
            by_date: dict = {}
            for sdoc in sched:
                sdoc.pop("_id", None)
                by_date.setdefault(sdoc.get("date"), []).append(sdoc)
            for day in doc.get("days", []):
                day["scheduled"] = by_date.get(day["date"], [])
        except Exception:
            logging.warning("attach scheduled workouts failed")
        # Overlay any Benchmark Week days onto their matching calendar dates.
        try:
            wk = await udb.benchmark_week.find_one({"user_id": auth.current_user_id(), "id": "current"})
            if wk and wk.get("active"):
                by_bm = {d["date"]: d for d in wk.get("days", [])}
                for day in doc.get("days", []):
                    bm = by_bm.get(day["date"])
                    if bm and bm.get("kind") == "test":
                        day["benchmark"] = {"testId": bm.get("testId"), "label": bm.get("label"),
                                            "status": bm.get("status", "scheduled")}
        except Exception:
            logging.warning("attach benchmark week failed")

        # Override today's readiness ring with the rider's latest daily check-in.
        try:
            ci = await udb.daily_checkins.find_one({"id": "latest"})
            if ci:
                sel = doc.get("selected_date")
                for day in doc.get("days", []):
                    if day.get("date") == sel:
                        day["readiness"] = {
                            "score": ci.get("score", 0),
                            "status": _cal_status(int(ci.get("score", 0))),
                            "source": "Daily check-in",
                            "metrics": ci.get("metrics", []),
                        }
        except Exception:
            logging.warning("calendar readiness override failed")
        return doc
    except Exception:
        logging.exception("get_calendar_week failed")
        return _free_calendar_week(start)


# ----------------------- Workout favorites & scheduling -----------------------


@router.get("/workout-favorites")
async def get_workout_favorites():
    doc = await udb.workout_prefs.find_one({"id": "favorites"})
    return {"favorites": (doc or {}).get("ids", [])}


@router.post("/workout-favorites/toggle")
async def toggle_workout_favorite(req: FavToggleRequest):
    doc = await udb.workout_prefs.find_one({"id": "favorites"})
    ids = list((doc or {}).get("ids", []))
    if req.workout_id in ids:
        ids.remove(req.workout_id)
        favorited = False
    else:
        ids.append(req.workout_id)
        favorited = True
    await udb.workout_prefs.update_one({"id": "favorites"}, {"$set": {"ids": ids}}, upsert=True)
    return {"favorites": ids, "favorited": favorited}




@router.get("/calendar/scheduled")
async def get_scheduled_workouts():
    docs = await udb.scheduled_workouts.find().to_list(500)
    for d in docs:
        d.pop("_id", None)
    return {"scheduled": docs}


@router.post("/calendar/schedule")
async def schedule_workout(req: ScheduleRequest):
    entry = {
        "id": uuid.uuid4().hex, "type": "cycling", "workout_id": req.workout_id,
        "title": req.workout_name, "duration": req.duration, "tss": req.tss,
        "zone": req.zone, "color": req.color, "date": req.date,
        "status": "scheduled", "created_by": "You",
    }
    await udb.scheduled_workouts.insert_one(dict(entry))
    entry.pop("_id", None)
    return {"ok": True, "entry": entry}


@router.delete("/calendar/scheduled/{entry_id}")
async def delete_scheduled_workout(entry_id: str):
    await udb.scheduled_workouts.delete_one({"id": entry_id})
    return {"ok": True}




@router.post("/calendar/move")
async def move_calendar_session(req: MoveSessionRequest):
    """Move a session from one day to another and mark it rescheduled."""
    doc = await udb.calendar_weeks.find_one({"start_date": req.week_start})
    if not doc:
        doc = dict(CALENDAR_WEEK)
    days = doc["days"]
    src = next((d for d in days if d["date"] == req.from_date), None)
    dst = next((d for d in days if d["date"] == req.to_date), None)
    if not src or not dst or req.session_type not in ("cycling", "fb50", "wellness"):
        raise HTTPException(status_code=400, detail="Invalid move")
    sess = src.get(req.session_type)
    if not sess:
        raise HTTPException(status_code=400, detail="No session to move")
    sess = dict(sess)
    sess["status"] = "rescheduled"
    sess["scheduled_date"] = req.to_date
    dst[req.session_type] = sess
    src[req.session_type] = None
    await udb.calendar_weeks.update_one({"start_date": req.week_start}, {"$set": {"days": days}}, upsert=True)
    doc.pop("_id", None)
    return doc




@router.post("/calendar/review")
async def review_calendar_change(req: ReviewRequest):
    """Alberto reviews a proposed schedule change and returns supportive guidance."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    fallback = (
        f"Moving {req.session_title} to {req.to_day} looks reasonable. "
        "Keep an easy day either side so you stay fresh for your key efforts."
    )
    if not key:
        return {"message": fallback, "ok": True}
    prompt = (
        f"The rider wants to move their {req.session_type} session '{req.session_title}' "
        f"from {req.from_day} to {req.to_day}. {req.to_day} focus is '{req.to_focus}'"
        + (f" and already has '{req.to_existing}' scheduled." if req.to_existing else ".")
        + " As their coach, review this schedule change in 1 to 2 short sentences: say whether it "
        "works, flag any back-to-back intensity or recovery concern, and suggest an adjustment if "
        "needed. Supportive tone, first person, no lists, no emojis, no quotation marks."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{req.coach_name.lower()}-scheduling",
            system_message=coach_system(req.coach_name, req.coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        text = (reply or "").strip().strip('"') or fallback
        return {"message": text, "ok": True}
    except Exception:
        logging.exception("review_calendar_change failed")
        return {"message": fallback, "ok": True}


# ----------------------- Hub screens (Progress, Routes, Wellness, Community, Connections) -----------------------
PROGRESS_DATA = {
    "headline": "You're getting stronger.",
    "subhead": "Fitness up 8.4 CTL over the last 6 weeks.",
    "fitness": {"ctl": 92, "atl": 84, "tsb": 8, "ctl_delta": "+8.4", "form_label": "Fresh"},
    "trend": {
        "ctl": [62, 66, 70, 73, 78, 82, 86, 88, 90, 91, 92, 92],
        "atl": [70, 58, 74, 80, 66, 88, 92, 78, 84, 96, 88, 84],
        "labels": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    },
    "metrics": [
        {"label": "FTP", "value": "287 W", "delta": "+6 W", "up": True},
        {"label": "Weekly TSS", "value": "612", "delta": "+42", "up": True},
        {"label": "Resting HR", "value": "48 bpm", "delta": "-2", "up": True},
        {"label": "VO2 Max", "value": "58", "delta": "+1", "up": True},
    ],
    "records": [
        {"label": "5 sec", "value": "1180 W", "when": "This month"},
        {"label": "1 min", "value": "642 W", "when": "2 weeks ago"},
        {"label": "5 min", "value": "372 W", "when": "This week"},
        {"label": "20 min", "value": "301 W", "when": "This week"},
        {"label": "60 min", "value": "268 W", "when": "3 weeks ago"},
    ],
    "recent": [
        {"title": "Threshold Climb", "date": "Today", "tss": 92, "distance": "23.7 km", "color": "rouge"},
        {"title": "Recovery Ride", "date": "Yesterday", "tss": 45, "distance": "18.2 km", "color": "blue"},
        {"title": "Sweet Spot", "date": "2 days ago", "tss": 75, "distance": "31.0 km", "color": "amber"},
        {"title": "Endurance Ride", "date": "4 days ago", "tss": 70, "distance": "42.6 km", "color": "green"},
    ],
}


WELLNESS_DATA = {
    "headline": "Well recovered.",
    "subhead": "Your body is ready for a strong week.",
    "readiness": {"score": 82, "status": "Good", "source": "Garmin Connect"},
    "vitals": [
        {"key": "sleep", "label": "Sleep", "value": "7h 45m", "sub": "Good quality", "pct": 86, "icon": "moon-outline", "color": "purple"},
        {"key": "hrv", "label": "HRV", "value": "68 ms", "sub": "Balanced", "pct": 78, "icon": "pulse-outline", "color": "blue"},
        {"key": "rhr", "label": "Resting HR", "value": "48 bpm", "sub": "Low & healthy", "pct": 82, "icon": "heart-outline", "color": "rouge"},
        {"key": "stress", "label": "Stress", "value": "Low", "sub": "Well managed", "pct": 80, "icon": "leaf-outline", "color": "green"},
    ],
    "sleep_week": [7.6, 6.8, 7.9, 7.2, 6.5, 8.1, 7.75],
    "companion": [
        {"title": "Evening Reflection", "duration": "5 min", "tag": "Mindfulness", "done": True},
        {"title": "Breathing Reset", "duration": "6 min", "tag": "Calm", "done": False},
        {"title": "Body Scan Meditation", "duration": "10 min", "tag": "Recovery", "done": False},
        {"title": "Gratitude Reflection", "duration": "5 min", "tag": "Mindset", "done": False},
    ],
    "fb50": {"completed": 12, "planned": 15, "streak": 4, "next": "Mobility Flow", "next_duration": "15 min"},
}


CONNECTIONS_DATA = {
    "devices": [
        {"id": "trainer", "name": "Wahoo KICKR", "type": "Smart Trainer", "status": "connected", "detail": "Battery 88%", "icon": "hardware-chip-outline", "color": "green"},
        {"id": "hr", "name": "Polar H10", "type": "Heart Rate", "status": "connected", "detail": "Battery 72%", "icon": "heart-outline", "color": "green"},
        {"id": "power", "name": "Favero Assioma", "type": "Power Meter", "status": "disconnected", "detail": "Last seen 2d ago", "icon": "flash-outline", "color": "dim"},
    ],
    "services": [
        {"id": "strava", "name": "Strava", "detail": "Auto-sync activities", "connected": True, "icon": "logo-buffer", "color": "orange"},
        {"id": "garmin", "name": "Garmin Connect", "detail": "Readiness & sleep", "connected": True, "icon": "watch-outline", "color": "blue"},
        {"id": "apple", "name": "Apple Health", "detail": "HRV, resting HR", "connected": True, "icon": "heart-circle-outline", "color": "rouge"},
        {"id": "googlefit", "name": "Google Fit", "detail": "Steps, heart points & activity", "connected": False, "icon": "fitness-outline", "color": "green"},
        {"id": "samsung", "name": "Samsung Health", "detail": "Heart rate, sleep & steps", "connected": False, "icon": "watch-outline", "color": "blue"},
        {"id": "wellness", "name": "Harmony Wellness", "detail": "FB50 & Peaceful Companion", "connected": True, "icon": "flower-outline", "color": "purple"},
    ],
}


@router.get("/progress")
async def get_progress():
    return PROGRESS_DATA


# Bucketed timeline windows: (number of buckets, days per bucket).
_TIMELINE_SPEC = {
    "week":  (7, 1),
    "month": (4, 7),
    "3m":    (13, 7),
    "6m":    (6, 30),
    "1y":    (12, 30),
}


def _bucket_label(start, bucket_days):
    if bucket_days == 1:
        return start.strftime("%a")            # Mon, Tue …
    if bucket_days == 30:
        return start.strftime("%b")            # Jan, Feb …
    return start.strftime("%-d %b")            # 3 Jun (weekly buckets)


@router.get("/progress/timeline")
async def get_progress_timeline(rng: str = Query("3m", alias="range"), offset: int = 0):
    """Aggregate the rider's real ride history into a scrollable, bucketed
    timeline. `range` ∈ week|month|3m|6m|1y; `offset` scrolls whole windows
    into the past (0 = the window ending today)."""
    from datetime import date, timedelta

    n_buckets, bucket_days = _TIMELINE_SPEC.get(rng, _TIMELINE_SPEC["3m"])
    span = n_buckets * bucket_days
    offset = max(0, int(offset))
    today = date.today()
    end = today - timedelta(days=offset * span)
    start = end - timedelta(days=span - 1)
    prev_start = start - timedelta(days=span)

    rides = await udb.ride_history.find().sort("created_at", -1).to_list(length=5000)

    buckets = [{"label": _bucket_label(start + timedelta(days=i * bucket_days), bucket_days),
                "tss": 0, "hours": 0.0, "rides": 0} for i in range(n_buckets)]

    tot = {"rides": 0, "tss": 0, "sec": 0, "km": 0.0, "elev": 0, "power_sum": 0, "power_n": 0}
    prev_tss = 0
    recent = []
    for r in rides:
        ds = str(r.get("created_at") or "")[:10]
        if not ds:
            continue
        try:
            y, m, d = (int(x) for x in ds.split("-"))
            rd = date(y, m, d)
        except Exception:
            continue
        tss = int(r.get("tss") or 0)
        if prev_start <= rd < start:
            prev_tss += tss
        if not (start <= rd <= end):
            continue
        idx = min(n_buckets - 1, max(0, (rd - start).days // bucket_days))
        sec = int(r.get("duration_sec") or 0)
        buckets[idx]["tss"] += tss
        buckets[idx]["hours"] += sec / 3600.0
        buckets[idx]["rides"] += 1
        tot["rides"] += 1
        tot["tss"] += tss
        tot["sec"] += sec
        tot["km"] += float(r.get("distance_km") or 0)
        tot["elev"] += int(r.get("elevation_m") or 0)
        if r.get("avg_power"):
            tot["power_sum"] += int(r.get("avg_power") or 0)
            tot["power_n"] += 1
        if len(recent) < 8:
            recent.append({
                "title": r.get("workout") or r.get("route") or "Ride",
                "date": ds,
                "tss": tss,
                "distance": f"{float(r.get('distance_km') or 0):.0f} km",
                "color": "red",
            })

    for b in buckets:
        b["hours"] = round(b["hours"], 1)

    delta_pct = 0
    if prev_tss > 0:
        delta_pct = round((tot["tss"] - prev_tss) / prev_tss * 100)

    if bucket_days == 30:
        window_label = f"{start.strftime('%b %Y')} – {end.strftime('%b %Y')}"
    else:
        window_label = f"{start.strftime('%-d %b')} – {end.strftime('%-d %b %Y')}"

    return {
        "range": rng,
        "offset": offset,
        "has_next": offset > 0,
        "window_label": window_label,
        "buckets": buckets,
        "summary": {
            "rides": tot["rides"],
            "hours": round(tot["sec"] / 3600.0, 1),
            "tss": tot["tss"],
            "distance_km": round(tot["km"]),
            "elevation_m": tot["elev"],
            "avg_power": round(tot["power_sum"] / tot["power_n"]) if tot["power_n"] else 0,
            "tss_delta_pct": delta_pct,
        },
        "recent": recent,
    }




@router.get("/rider/missed")
async def rider_missed():
    """Safe missed-workout handling: count past scheduled cycling sessions that
    weren't completed. Guidance intentionally never encourages stacking or unsafe
    catch-up — the plan simply continues from today."""
    uid = auth.current_user_id()
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        sched = await udb.scheduled_workouts.find().to_list(500)
    except Exception:
        sched = []
    missed = [
        w for w in sched
        if str(w.get("date", "")) < today and w.get("status") not in ("completed", "skipped")
    ]
    missed.sort(key=lambda w: str(w.get("date", "")), reverse=True)
    count = len(missed)
    guidance = (
        "No need to make these up — don't stack hard sessions. Pick up today's ride "
        "as planned; your plan continues safely from here."
    ) if count else ""
    return {
        "count": count,
        "missed": [{"date": w.get("date"), "title": w.get("title") or w.get("name")} for w in missed[:5]],
        "guidance": guidance,
    }
