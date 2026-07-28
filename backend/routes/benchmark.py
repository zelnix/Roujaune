"""Benchmark domain — headline profile, sessions, results (accept/exclude →
profile), training zones, plan-start gate (F-02/F-03), Today-screen nudge,
plan-review (FTP change approval), progress trends, benchmark-week scheduling
and the recommendation engine. Scoped per user.
"""
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException

import auth
import plans_admin
import push
from auth import udb
from services.benchmark_decision import decide_benchmark, BenchmarkDecisionInput
from services.coach_llm import coach_line as _coach_line
from services.plan_common import _active_plan_id

router = APIRouter()


# ---- Benchmark Workouts: sessions, results & headline profile ----
#      Sessions capture the readiness/setup flow; results (accepted) feed the
#      rider's headline benchmark profile. Scoped per user.
@router.get("/benchmark/profile")
async def get_benchmark_profile():
    doc = await udb.benchmark_profile.find_one({"user_id": auth.current_user_id()}) or {}
    keys = ["ftp", "ftpWkg", "fiveMinPower", "oneMinPower", "sprintPower",
            "aerobicEfficiency", "preferredCadence", "recoveryResponse", "lastBenchmarkDate"]
    return {k: doc.get(k) for k in keys}


@router.get("/benchmark/results")
async def get_benchmark_results():
    docs = await udb.benchmark_results.find(
        {"user_id": auth.current_user_id()}
    ).sort("createdAt", -1).to_list(length=200)
    for d in docs:
        d.pop("_id", None)
        d.pop("user_id", None)
    return {"results": docs}


@router.post("/benchmark/sessions")
async def create_benchmark_session(payload: Dict[str, Any] = Body(...)):
    test_id = payload.get("testId")
    if not test_id or not isinstance(test_id, str):
        raise HTTPException(status_code=400, detail="testId is required")
    sid = str(uuid.uuid4())
    session = {
        "id": sid,
        "user_id": auth.current_user_id(),
        "testId": test_id,
        "status": payload.get("status", "in_progress"),
        "readinessAnswers": payload.get("readinessAnswers") or {},
        "readiness": payload.get("readiness"),
        "usingDevData": bool(payload.get("usingDevData", False)),
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }
    await udb.benchmark_sessions.insert_one(dict(session))
    session.pop("user_id", None)
    return session


@router.get("/benchmark/sessions/{sid}")
async def get_benchmark_session(sid: str):
    doc = await udb.benchmark_sessions.find_one({"id": sid, "user_id": auth.current_user_id()})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@router.patch("/benchmark/sessions/{sid}")
async def update_benchmark_session(sid: str, payload: Dict[str, Any] = Body(...)):
    upd = {k: v for k, v in (payload or {}).items() if k not in ("id", "user_id", "_id")}
    res = await udb.benchmark_sessions.update_one(
        {"id": sid, "user_id": auth.current_user_id()}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = await udb.benchmark_sessions.find_one({"id": sid, "user_id": auth.current_user_id()})
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


# ---- Benchmark results: save, accept/exclude (profile update), training zones ----
#      SAFETY: results flagged isDevData (simulated) are recorded for practice but
#      NEVER update the rider's genuine benchmark profile. Accepting is explicit.

# Which result metric key maps onto which headline profile field.
_BM_METRIC_TO_PROFILE = {
    "ftp": "ftp",
    "p5": "fiveMinPower",
    "p1": "oneMinPower",
    "peak": "sprintPower",
    "decoupling": "aerobicEfficiency",
    "preferred_cadence": "preferredCadence",
    "hrr": "recoveryResponse",
}


async def _apply_benchmark_result_to_profile(result: Dict[str, Any]):
    """Write an ACCEPTED, non-simulated result's metrics onto the rider profile."""
    if result.get("isDevData"):
        return  # never update a genuine profile from simulated data
    uid = auth.current_user_id()
    upd: Dict[str, Any] = {"lastBenchmarkDate": datetime.now(timezone.utc).isoformat()}
    for m in (result.get("metrics") or []):
        field = _BM_METRIC_TO_PROFILE.get(m.get("key"))
        if field and isinstance(m.get("value"), (int, float)):
            upd[field] = m["value"]
    if "ftp" in upd:
        # try to derive W/kg from the rider's weight if available
        rider = await udb.rider_profile.find_one({"user_id": uid}) or {}
        wt = rider.get("weightKg") or rider.get("weight_kg")
        if isinstance(wt, (int, float)) and wt > 0:
            upd["ftpWkg"] = round(upd["ftp"] / wt, 2)
    await udb.benchmark_profile.update_one(
        {"user_id": uid}, {"$set": {**upd, "user_id": uid}}, upsert=True)


@router.post("/benchmark/results")
async def create_benchmark_result(payload: Dict[str, Any] = Body(...)):
    rid = str(uuid.uuid4())
    result = {
        "id": rid,
        "user_id": auth.current_user_id(),
        "sessionId": payload.get("sessionId"),
        "testId": payload.get("testId"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "decision": payload.get("decision", "pending"),
        "quality": payload.get("quality", "moderate"),
        "confidence": payload.get("confidence", 0),
        "metrics": payload.get("metrics") or [],
        "primaryMetric": payload.get("primaryMetric"),
        "calcVersion": payload.get("calcVersion", "v1"),
        "isDevData": bool(payload.get("isDevData", False)),
        "insight": payload.get("insight"),
        "notes": payload.get("notes"),
        "reflection": payload.get("reflection"),
        "status": payload.get("status"),
        "stoppedReason": payload.get("stoppedReason"),
        "rpe": payload.get("rpe"),
    }
    await udb.benchmark_results.insert_one(dict(result))
    if result["decision"] == "accepted":
        await _apply_benchmark_result_to_profile(result)
    result.pop("user_id", None)
    return result


@router.post("/benchmark/results/{rid}/decision")
async def set_benchmark_result_decision(rid: str, payload: Dict[str, Any] = Body(...)):
    decision = payload.get("decision")
    if decision not in ("pending", "accepted", "excluded"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    res = await udb.benchmark_results.update_one(
        {"id": rid, "user_id": auth.current_user_id()}, {"$set": {"decision": decision}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Result not found")
    doc = await udb.benchmark_results.find_one({"id": rid, "user_id": auth.current_user_id()})
    if decision == "accepted":
        await _apply_benchmark_result_to_profile(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


def _training_zones(ftp: int) -> List[Dict[str, Any]]:
    """Classic 7-zone model derived from FTP (%FTP boundaries)."""
    if not ftp or ftp <= 0:
        return []
    bounds = [
        ("Z1", "Active Recovery", 0, 0.55),
        ("Z2", "Endurance", 0.56, 0.75),
        ("Z3", "Tempo", 0.76, 0.90),
        ("Z4", "Threshold", 0.91, 1.05),
        ("Z5", "VO2 Max", 1.06, 1.20),
        ("Z6", "Anaerobic", 1.21, 1.50),
        ("Z7", "Neuromuscular", 1.51, 0),  # open-ended
    ]
    out = []
    for key, name, lo, hi in bounds:
        out.append({
            "key": key, "name": name,
            "lowPct": round(lo * 100), "highPct": round(hi * 100) if hi else None,
            "lowW": round(ftp * lo), "highW": round(ftp * hi) if hi else None,
        })
    return out


@router.get("/benchmark/zones")
async def get_benchmark_zones():
    uid = auth.current_user_id()
    prof = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    ftp = prof.get("ftp")
    if not ftp:
        settings = await udb.settings.find_one({"user_id": uid}) or {}
        ftp = settings.get("ftp")
    ftp = int(ftp) if ftp else 0
    return {"ftp": ftp, "zones": _training_zones(ftp)}


# ---- WP-G: Benchmark requirement at plan start ----
BM_STATUS_LABEL = {
    "required": "Benchmark Required",
    "recommended": "Benchmark Recommended",
    "approved": "Existing Benchmark Approved",
    "deferred": "Benchmark Deferred",
    "submaximal": "Submaximal Assessment Recommended",
    "coach_review": "Coach Review Required",
}
BM_STATUS_MESSAGE = {
    "required": "Your recent training history suggests that a fresh benchmark will help set the right targets for this plan.",
    "recommended": "A fresh benchmark would sharpen your targets, but your existing result can still be used to begin.",
    "approved": "Your existing benchmark has been reviewed and is still suitable to personalise this plan.",
    "deferred": "We'll use your existing data for now and revisit a benchmark once you're settled into the plan.",
    "submaximal": "A lighter, submaximal assessment is enough to personalise this plan for now.",
    "coach_review": "Your coach would like to review your recent training before setting a benchmark.",
}
FTP_RETEST_DAYS = 56


async def _plan_level(plan_id: str) -> str:
    try:
        pdef = await plans_admin.get_plan_def(plan_id)
        lvl = (pdef or {}).get("level")
        if lvl:
            return str(lvl)
    except Exception:
        pass
    return "Intermediate"


@router.get("/benchmark/plan-gate")
async def benchmark_plan_gate(plan_id: str, coach_name: str = "Alberto", coach_gender: str = "male"):
    uid = auth.current_user_id()
    level = await _plan_level(plan_id)
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    rider = await udb.rider_profile.find_one({"user_id": uid}) or {}
    checkin = await udb.daily_checkins.find_one({"user_id": uid, "id": "latest"}) or {}
    rec = await _benchmark_recommendation()

    results = await udb.benchmark_results.find(
        {"user_id": uid, "decision": "accepted"}).sort("createdAt", -1).to_list(length=50)
    last_ftp = next((r for r in results if (r.get("primaryMetric") or {}).get("key") == "ftp"), None)

    ftp = profile.get("ftp")
    last_days = _days_since(profile.get("lastBenchmarkDate"))
    low_conf = bool(last_ftp and (last_ftp.get("confidence") or 0) < 50)

    # Deterministic decision (F-03) — pure logic, no DB/LLM. Safety flags now
    # come from the persisted canonical daily check-in (F-02).
    decision = decide_benchmark(BenchmarkDecisionInput(
        plan_level=level,
        has_ftp=bool(ftp),
        days_since_last=last_days,
        illness=bool(checkin.get("illness")),
        injury=bool(checkin.get("injury")),
        returning=bool(checkin.get("returning")),
        equipment_changed=bool(checkin.get("equipmentChanged")),
        low_confidence=low_conf,
        ftp_retest_days=FTP_RETEST_DAYS,
    ))
    status = decision.status
    reasons = decision.reasons

    base_msg = BM_STATUS_MESSAGE[status]
    prompt = (
        f"You are advising a rider starting the '{plan_id}' ({level}) training plan. "
        f"Benchmark decision: {BM_STATUS_LABEL[status]}. Reasons: {', '.join(reasons)}. "
        f"Recommended benchmark if any: {BM_TEST_NAME.get(rec['primary']['testId'], 'a benchmark')}. "
        "In ONE warm, plain-language sentence, explain the decision to the rider. "
        "Do not use medical or pass/fail language."
    )
    coach_line = await _coach_line(coach_name, coach_gender, prompt)

    return {
        "planId": plan_id,
        "planLevel": level,
        "status": status,
        "statusLabel": BM_STATUS_LABEL[status],
        "message": base_msg,
        "coachMessage": coach_line or base_msg,
        "reasons": reasons,
        "recommendedTestId": rec["primary"]["testId"],
        "recommendedTestName": BM_TEST_NAME.get(rec["primary"]["testId"]),
        "requiresBenchmark": decision.requires_benchmark,
        "hasPower": rec["hasPower"],
        "lastBenchmarkDate": profile.get("lastBenchmarkDate"),
    }


@router.get("/benchmark/nudge")
async def benchmark_nudge():
    """Lightweight Today-screen signal: does the rider's CURRENT plan need a
    fresh benchmark right now? Uses the deterministic decision engine only (no
    LLM), and fires just for the strongest 'required' state so the Today nudge
    stays high-signal."""
    uid = auth.current_user_id()
    plan_id = await _active_plan_id()
    if not plan_id:
        return {"required": False, "status": "none", "planId": ""}
    level = await _plan_level(plan_id)
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    checkin = await udb.daily_checkins.find_one({"user_id": uid, "id": "latest"}) or {}
    results = await udb.benchmark_results.find(
        {"user_id": uid, "decision": "accepted"}).sort("createdAt", -1).to_list(length=50)
    last_ftp = next((r for r in results if (r.get("primaryMetric") or {}).get("key") == "ftp"), None)
    ftp = profile.get("ftp")
    last_days = _days_since(profile.get("lastBenchmarkDate"))
    low_conf = bool(last_ftp and (last_ftp.get("confidence") or 0) < 50)
    decision = decide_benchmark(BenchmarkDecisionInput(
        plan_level=level, has_ftp=bool(ftp), days_since_last=last_days,
        illness=bool(checkin.get("illness")), injury=bool(checkin.get("injury")),
        returning=bool(checkin.get("returning")), equipment_changed=bool(checkin.get("equipmentChanged")),
        low_confidence=low_conf, ftp_retest_days=FTP_RETEST_DAYS,
    ))
    rec = await _benchmark_recommendation()
    return {
        "required": decision.status == "required",
        "status": decision.status,
        "planId": plan_id,
        "planLevel": level,
        "reason": decision.reasons[0] if decision.reasons else "",
        "recommendedTestId": rec["primary"]["testId"],
        "recommendedTestName": BM_TEST_NAME.get(rec["primary"]["testId"]),
    }


# ---- WP-E: Training Plan review (proposed changes require explicit approval) ----
def _next_monday_iso() -> str:
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    return (today + timedelta(days=(7 - today.weekday()) % 7 or 7)).isoformat()


@router.get("/benchmark/plan-review")
async def benchmark_plan_review():
    uid = auth.current_user_id()
    settings = await udb.settings.find_one({"user_id": uid}) or {}
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    cur_ftp = int(settings.get("ftp") or 0)
    new_ftp = int(profile.get("ftp") or 0)
    dismissed_for = profile.get("planReviewDismissedFor")
    if not new_ftp or not cur_ftp or new_ftp == cur_ftp or dismissed_for == new_ftp:
        return {"hasProposal": False}
    zc, zn = _training_zones(cur_ftp), _training_zones(new_ftp)
    zones_preview = []
    for a, b in zip(zc, zn):
        zones_preview.append({
            "key": a["key"], "name": a["name"],
            "oldLow": a["lowW"], "oldHigh": a["highW"], "newLow": b["lowW"], "newHigh": b["highW"],
        })
    delta = new_ftp - cur_ftp
    results = await udb.benchmark_results.find(
        {"user_id": uid, "decision": "accepted"}).sort("createdAt", -1).to_list(length=50)
    src = next((r for r in results if (r.get("primaryMetric") or {}).get("key") == "ftp"), None)
    return {
        "hasProposal": True,
        "metric": "FTP",
        "previous": cur_ftp,
        "next": new_ftp,
        "delta": delta,
        "deltaPct": round(delta / cur_ftp * 100, 1),
        "effectiveDate": _next_monday_iso(),
        "reason": "Your accepted benchmark suggests a different FTP than your current training targets. Review and approve before we adjust your plan.",
        "affected": ["Workout power targets", "Training zones", "Threshold & VO2 interval intensity", "Recovery target power"],
        "zonesPreview": zones_preview,
        "sourceTestId": (src or {}).get("testId"),
    }


@router.post("/benchmark/plan-review/apply")
async def benchmark_plan_review_apply():
    uid = auth.current_user_id()
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    new_ftp = int(profile.get("ftp") or 0)
    if not new_ftp:
        raise HTTPException(status_code=400, detail="No benchmark FTP to apply")
    await udb.settings.update_one({"user_id": uid}, {"$set": {"ftp": new_ftp}}, upsert=True)
    await udb.benchmark_profile.update_one({"user_id": uid}, {"$set": {"planReviewDismissedFor": new_ftp}})
    return {"applied": True, "ftp": new_ftp}


@router.post("/benchmark/plan-review/dismiss")
async def benchmark_plan_review_dismiss():
    uid = auth.current_user_id()
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    new_ftp = int(profile.get("ftp") or 0)
    await udb.benchmark_profile.update_one({"user_id": uid}, {"$set": {"planReviewDismissedFor": new_ftp}}, upsert=True)
    return {"dismissed": True}


# ---- WP-E: Benchmark progress trends (personal history over time) ----
@router.get("/benchmark/trends")
async def benchmark_trends(range: str = "3m"):
    uid = auth.current_user_id()
    days = {"4w": 28, "3m": 92, "6m": 183, "12m": 366, "all": 0}.get(range, 92)
    cutoff = None
    if days:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days))
    results = await udb.benchmark_results.find(
        {"user_id": uid, "decision": {"$ne": "excluded"}}).sort("createdAt", 1).to_list(length=500)
    # metric key -> series of {date, value}
    series: Dict[str, List[Dict[str, Any]]] = {}
    labels: Dict[str, str] = {}
    units: Dict[str, str] = {}
    for r in results:
        ts = r.get("createdAt")
        if cutoff and ts:
            try:
                if datetime.fromisoformat(ts.replace("Z", "+00:00")) < cutoff:
                    continue
            except Exception:
                pass
        for m in (r.get("metrics") or []):
            k = m.get("key")
            if k in ("ftp", "ftpWkg", "p5", "p1", "peak", "decoupling", "preferred_cadence", "hrr"):
                series.setdefault(k, []).append({"date": ts, "value": m.get("value")})
                labels[k] = m.get("label", k)
                units[k] = m.get("unit", "")
    return {"range": range, "series": series, "labels": labels, "units": units}




# ---- Benchmark recommendation engine (Part 14 pt.1) ----
BM_RETEST_DAYS = {
    "ramp": 56, "twenty_min_ftp": 56, "five_min_aerobic": 70, "one_min_power": 70,
    "sprint_power": 70, "aerobic_efficiency": 35, "cadence_control": 84, "recovery_response": 42,
}
BM_PRIMARY_METRIC = {
    "ramp": "ftp", "twenty_min_ftp": "ftp", "five_min_aerobic": "fiveMinPower",
    "one_min_power": "oneMinPower", "sprint_power": "sprintPower",
    "aerobic_efficiency": "aerobicEfficiency", "cadence_control": "preferredCadence",
    "recovery_response": "recoveryResponse",
}
BM_REQUIRES_POWER = {"ramp", "twenty_min_ftp", "five_min_aerobic", "one_min_power", "sprint_power"}
BM_TEST_NAME = {
    "ramp": "Ramp Test", "twenty_min_ftp": "Twenty-Minute FTP Test",
    "five_min_aerobic": "Five-Minute Aerobic Power Test", "one_min_power": "One-Minute Power Test",
    "sprint_power": "Sprint Power Test", "aerobic_efficiency": "Aerobic Efficiency Ride",
    "cadence_control": "Cadence Control Assessment", "recovery_response": "Submaximal Recovery Response Test",
}
BM_ALL_TESTS = list(BM_PRIMARY_METRIC.keys())
BM_MAXIMAL_TESTS = {"ramp", "twenty_min_ftp", "five_min_aerobic", "one_min_power", "sprint_power"}


def _default_week_days(start: "date", has_power: bool) -> List[Dict[str, Any]]:
    from datetime import timedelta
    day1 = "ramp" if has_power else "recovery_response"
    day5 = "five_min_aerobic" if has_power else "aerobic_efficiency"
    plan = [
        {"kind": "test", "testId": day1, "label": BM_TEST_NAME.get(day1, day1)},
        {"kind": "recovery", "label": "Recovery or easy ride"},
        {"kind": "test", "testId": "cadence_control", "label": BM_TEST_NAME["cadence_control"]},
        {"kind": "rest", "label": "Recovery or rest"},
        {"kind": "test", "testId": day5, "label": BM_TEST_NAME.get(day5, day5)},
        {"kind": "recovery", "label": "Recovery or easy ride"},
        {"kind": "test", "testId": "aerobic_efficiency", "label": BM_TEST_NAME["aerobic_efficiency"]},
    ]
    for i, d in enumerate(plan):
        d["index"] = i
        d["date"] = (start + timedelta(days=i)).isoformat()
        d["status"] = "scheduled"
    return plan


def _maximal_spacing_ok(days: List[Dict[str, Any]]) -> bool:
    """No two maximal tests on consecutive days."""
    for i in range(len(days) - 1):
        a, b = days[i], days[i + 1]
        if a.get("testId") in BM_MAXIMAL_TESTS and b.get("testId") in BM_MAXIMAL_TESTS:
            return False
    return True


@router.get("/benchmark/week")
async def get_benchmark_week():
    doc = await udb.benchmark_week.find_one({"user_id": auth.current_user_id(), "id": "current"})
    if not doc:
        return {"active": False, "days": []}
    doc.pop("_id", None); doc.pop("user_id", None)
    return doc


@router.post("/benchmark/week/start")
async def start_benchmark_week(payload: Dict[str, Any] = Body(default={})):
    from datetime import date, timedelta
    uid = auth.current_user_id()
    start_str = payload.get("startDate")
    if start_str:
        y, m, d = (int(x) for x in start_str.split("-")); start = date(y, m, d)
    else:
        # default: next Monday
        today = datetime.now(timezone.utc).date()
        start = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    rec = await _benchmark_recommendation()
    days = _default_week_days(start, rec["hasPower"])
    doc = {"id": "current", "user_id": uid, "active": True, "startDate": start.isoformat(),
           "days": days, "createdAt": datetime.now(timezone.utc).isoformat()}
    await udb.benchmark_week.update_one({"user_id": uid, "id": "current"}, {"$set": doc}, upsert=True)
    # Confirmation push — fire-and-forget so a push failure never blocks scheduling.
    first_test = next((d for d in days if d.get("kind") == "test"), None)
    try:
        await push.send_push(
            recipients=[uid],
            data={
                "title": "Benchmark week scheduled",
                "message": (
                    f"Your benchmark week starts {start.strftime('%a %d %b')}"
                    + (f" with {first_test['label']}." if first_test else ".")
                ),
                "action_url": "/benchmark",
            },
            idempotency_key=f"bmweek-{uid}-{start.isoformat()}-scheduled",
        )
    except Exception as e:
        logging.warning(f"benchmark scheduling push failed (non-blocking): {e}")
    doc.pop("user_id", None)
    return doc


@router.patch("/benchmark/week/day/{index}")
async def patch_benchmark_week_day(index: int, payload: Dict[str, Any] = Body(...)):
    uid = auth.current_user_id()
    doc = await udb.benchmark_week.find_one({"user_id": uid, "id": "current"})
    if not doc or index < 0 or index >= len(doc.get("days", [])):
        raise HTTPException(status_code=404, detail="Benchmark week day not found")
    days = doc["days"]
    day = days[index]
    if "testId" in payload:
        tid = payload["testId"]
        candidate = list(days)
        candidate[index] = {**day, "kind": "test" if tid else day["kind"], "testId": tid,
                            "label": BM_TEST_NAME.get(tid, tid) if tid else day["label"]}
        if tid in BM_MAXIMAL_TESTS and not _maximal_spacing_ok(candidate):
            raise HTTPException(status_code=400, detail="Maximal tests cannot be scheduled on consecutive days.")
        day.update(candidate[index])
    if "status" in payload:
        if payload["status"] not in ("scheduled", "done", "skipped"):
            raise HTTPException(status_code=400, detail="Invalid status")
        day["status"] = payload["status"]
    if "date" in payload:
        day["date"] = payload["date"]
    await udb.benchmark_week.update_one({"user_id": uid, "id": "current"}, {"$set": {"days": days}})
    doc.pop("_id", None); doc.pop("user_id", None)
    return doc


@router.post("/benchmark/week/cancel")
async def cancel_benchmark_week():
    await udb.benchmark_week.delete_one({"user_id": auth.current_user_id(), "id": "current"})
    return {"active": False, "days": []}




def _days_since(iso: Optional[str]) -> Optional[int]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).days
    except Exception:
        return None


async def _benchmark_recommendation() -> Dict[str, Any]:
    uid = auth.current_user_id()
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    results = await udb.benchmark_results.find({"user_id": uid}).sort("createdAt", -1).to_list(length=200)
    settings = await udb.settings.find_one({"user_id": uid}) or {}
    rider = await udb.rider_profile.find_one({"user_id": uid}) or {}
    capability = (rider.get("capability") or "intermediate").lower()
    has_power = bool(settings.get("hasTrainer")) or bool(settings.get("ftp")) or bool(profile.get("ftp"))

    accepted = [r for r in results if r.get("decision") == "accepted"]
    is_new = len(accepted) == 0
    # most recent accepted per test
    last_by_test: Dict[str, Dict[str, Any]] = {}
    for r in accepted:
        t = r.get("testId")
        if t and t not in last_by_test:
            last_by_test[t] = r

    scored = []
    for t in BM_ALL_TESTS:
        requires_power = t in BM_REQUIRES_POWER
        if requires_power and not has_power:
            continue
        reasons: List[str] = []
        score = 0
        metric = BM_PRIMARY_METRIC[t]
        if not profile.get(metric):
            score += 50
            reasons.append("not yet measured")
        last = last_by_test.get(t)
        if last:
            age = _days_since(last.get("createdAt"))
            interval = BM_RETEST_DAYS[t]
            if age is not None and age > interval:
                score += min(40, 20 + ((age - interval) // 7) * 3)
                reasons.append(f"last tested {age} days ago")
            if (last.get("confidence") or 0) < 50:
                score += 25
                reasons.append("previous result had low confidence")
        # capability weighting
        if t in ("sprint_power", "one_min_power"):
            score += 10 if capability == "advanced" else (-40 if capability == "beginner" else 0)
        if t in ("recovery_response", "aerobic_efficiency", "cadence_control"):
            score += 8 if capability == "beginner" else 0
        if t == "ramp":
            score += 15  # reliable anchor for FTP
        # new riders: prefer gentle, foundational assessments
        if is_new and t in ("cadence_control", "aerobic_efficiency", "recovery_response"):
            score += 6
        scored.append({"testId": t, "score": score, "reasons": reasons})

    scored.sort(key=lambda x: x["score"], reverse=True)
    primary = scored[0] if scored else {"testId": "recovery_response", "score": 0, "reasons": []}
    top_score = primary["score"]
    if is_new:
        status = "recommended"
    elif top_score >= 40:
        status = "recommended"
    else:
        status = "approved"
    return {
        "primary": primary,
        "ordered": scored[:4],
        "status": status,
        "hasPower": has_power,
        "isNew": is_new,
        "capability": capability,
        "lastBenchmarkDate": profile.get("lastBenchmarkDate"),
    }


@router.get("/benchmark/recommendation")
async def get_benchmark_recommendation():
    return await _benchmark_recommendation()
