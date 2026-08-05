"""Coach routes for ROUJAUNE — live in-workout cue, extend-advice decision,
post-ride debrief, conversational coach chat (with rider+plan context) and the
plan-adaptation summary/detail generators. LLM personas come from
services.coach_llm; all plan math from services.plan_engine (one-way dependency).
"""
import os  # noqa: F401
import json
import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone  # noqa: F401
from typing import Any, Dict, List, Optional  # noqa: F401

from fastapi import APIRouter, HTTPException  # noqa: F401

import auth  # noqa: F401
import plans_admin
import companion_plan
from auth import udb
from core import now_iso
from models import (
    CoachCueRequest, ExtendAdviceRequest, CoachDebriefRequest, CoachChatRequest, AdaptationRequest,
)
from services.coach_llm import coach_system, coach_chat_system, STYLE_TONE, coach_line  # noqa: F401
from services.rider_common import _rider_doc, _rider_line  # noqa: F401
from services.plan_common import _active_plan_id, _plan_id_or_active, STRUCTURED_PLAN_IDS  # noqa: F401
from services import plan_engine  # noqa: F401
from services.plan_engine import (
    _struct_ctx, _struct_ctx_for_rider, _rider_plan_def, _ctr_state, _ctr_progress,
    _ctr_plan_response, _plan_done, _with_adaptation_meta, _apply_companion_ops,
    _update_adaptive_targets, _aggregate_ride_zones, _ctr_today, _fmt_dur, NO_PLAN,
)  # noqa: F401

router = APIRouter()

# Shared with the plan routes (one-way coach -> plan dependency; plan.py never
# imports coach, so no cycle). get_plan gives structured-plan grounding for the
# adaptation detail; WELLNESS_DATA feeds the readiness snippet in coach context.
from routes.plan import get_plan, WELLNESS_DATA  # noqa: E402


@router.post("/coach/cue")
async def coach_cue(req: CoachCueRequest):
    """Generate a live, in-persona coaching cue from the rider's telemetry."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    minutes = req.elapsed // 60
    seg = f" Current segment: {req.segment} ({req.zone})." if req.segment else ""
    seated = (
        " The rider is in SEATED MODE for this endurance session — they stay in the saddle throughout. "
        "Never cue standing or out-of-the-saddle efforts; instead coach relaxed upper body, steady seated cadence, breathing and posture."
        if req.seated else ""
    )
    rider = await _rider_line()
    if req.cue_kind == "intro":
        instruction = (
            f"The rider is just beginning the '{req.segment or 'first'}' step "
            f"({req.zone or ''}, target {req.power_target} W). "
            "Introduce this step in one short, motivating sentence — what it is and how to approach it."
        )
    elif req.cue_kind == "next_preview":
        instruction = (
            f"The rider is about to finish the current step and transition to "
            f"'{req.next_segment or 'the next step'}' ({req.next_zone or ''}, target {req.next_target or req.power_target} W). "
            "In one short sentence, prepare them for this upcoming change so they're ready."
        )
    elif req.cue_kind == "extend_advice":
        instruction = (
            "The rider has just COMPLETED the workout. Based on their live numbers and how the session went, "
            "advise in 1-2 short sentences whether it is wise to extend the ride with extra easy/endurance time "
            "or to finish now and recover. Be specific, caring, and decisive."
        )
    else:
        instruction = "Give the rider one short coaching cue right now."
    prompt = (
        f"{rider}\n"
        f"Workout: {req.workout}. Route: {req.route or 'indoor'}. "
        f"Elapsed: {minutes} minutes.{seg}{seated}\n"
        f"Live: power {req.power} W (target {req.power_target} W), "
        f"cadence {req.cadence} rpm (aim {req.cadence_low}-{req.cadence_high}), "
        f"heart rate {req.hr} bpm, speed {req.speed} km/h.\n"
        f"{instruction}"
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{req.coach_name.lower()}-live-coach",
            system_message=coach_system(req.coach_name, req.coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        cue = (reply or "").strip().strip('"').split("\n")[0]
        if not cue:
            raise ValueError("empty cue")
        return {"cue": cue}
    except Exception as e:
        logging.exception("coach_cue failed")
        raise HTTPException(status_code=502, detail=f"Coaching generation failed: {e}")




HARD_TYPES = {"threshold", "vo2max", "sprints", "climbing"}
EASY_TYPES = {"recovery", "restday"}
STEADY_TYPES = {"endurance", "tempo"}


def _extend_decision(req: ExtendAdviceRequest) -> Dict[str, Any]:
    """Rule-based call on whether extending the ride is wise, and by how much,
    from the rider's effort/HR, the workout type and how long they've ridden."""
    minutes = req.elapsed // 60
    score = 0
    if req.type_id in HARD_TYPES:
        score -= 1
    if req.type_id in EASY_TYPES:
        score -= 1  # keep an easy/recovery ride easy — don't turn it into a session
    if req.type_id in STEADY_TYPES:
        score += 1
    if req.wearable_on and req.hr > 0:
        if req.hr >= 165:
            score -= 2
        elif req.hr >= 150:
            score -= 1
        elif req.hr <= 130:
            score += 1
    if minutes >= 75:
        score -= 2
    elif minutes <= 45:
        score += 1

    if score >= 1:
        recommend = "extend"
        if req.type_id in STEADY_TYPES:
            suggested = "5km"
        elif score >= 2:
            suggested = "20min"
        else:
            suggested = "10min"
    else:
        recommend = "finish"
        suggested = None
    return {"recommend": recommend, "suggested": suggested, "score": score, "minutes": minutes}


@router.post("/coach/extend-advice")
async def coach_extend_advice(req: ExtendAdviceRequest):
    """After the rider completes the workout, decide whether extending is wise
    and return the coach's advice aligned to that decision (with the best option)."""
    decision = _extend_decision(req)
    recommend = decision["recommend"]
    suggested = decision["suggested"]
    label = {"10min": "about 10 more easy minutes", "20min": "about 20 more endurance minutes", "5km": "an extra ~5 km easy"}.get(suggested or "", "a short easy spin")

    key = os.environ.get("EMERGENT_LLM_KEY")
    # Rule-based fallback advice, used if the model isn't available/fails.
    if recommend == "extend":
        fallback = f"Nice work — you still look strong, so if you're keen, add {label} at an easy pace. Otherwise finishing here is perfectly good."
    else:
        fallback = "That was a solid, complete effort — the smart call now is to finish, spin down and recover so you're fresh for the next ride."

    advice = fallback
    if key:
        rider = await _rider_line()
        if recommend == "extend":
            steer = f"We ADVISE the rider they can extend with {label} at an easy pace if they feel good. Encourage it lightly but leave the choice open."
        else:
            steer = "We ADVISE the rider to FINISH NOW and recover rather than extend. Be caring and decisive about why recovery is the right call."
        prompt = (
            f"{rider}\n"
            f"The rider just COMPLETED: {req.workout} ({req.type_id}). "
            f"Time ridden {decision['minutes']} min. Final live numbers: power {req.power} W, "
            f"heart rate {req.hr if req.wearable_on else 'n/a'} bpm, cadence {req.cadence} rpm.\n"
            f"{steer}\n"
            "Reply with 1-2 short, caring sentences in your voice. No preamble."
        )
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=key,
                session_id=f"{req.coach_name.lower()}-extend-advice",
                system_message=coach_system(req.coach_name, req.coach_gender),
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=prompt))
            txt = (reply or "").strip().strip('"')
            if txt:
                advice = txt
        except Exception:
            logging.exception("coach_extend_advice generation failed (using fallback)")

    return {"advice": advice, "recommend": recommend, "suggested": suggested}




@router.post("/coach/debrief")
async def coach_debrief(req: CoachDebriefRequest):
    """The coach's post-ride debrief: effort, zones and one tip for next time."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Return the cached debrief if this ride already has one (keyed by coach).
    cache_key = f"debrief_{req.coach_name.lower()}"
    if req.ride_id:
        try:
            doc = await udb.ride_history.find_one({"id": req.ride_id})
            if doc and doc.get(cache_key):
                return {"debrief": doc[cache_key], "cached": True}
        except Exception:
            logging.warning("debrief cache lookup failed")

    mins = req.duration_sec // 60
    zones_txt = ", ".join(f"{z.get('z')} {z.get('pct', 0)}%" for z in req.zones) if req.zones else "n/a"
    extended_txt = (
        f"\nThe rider CHOSE TO EXTEND the ride by an extra {req.extended_min} min beyond the planned session — "
        "acknowledge this extra volume, credit their commitment, and factor it into their weekly load."
        if req.extended_min > 0 else ""
    )
    adjust_txt = ""
    if req.adjustments:
        joined = "; ".join(req.adjustments[:12])
        adjust_txt = (
            f"\nMid-ride the rider made these adjustments (time · action): {joined}. "
            "If any of these explain anomalies in the numbers (e.g. a skipped interval, changed intensity, or pause), "
            "briefly reference the most relevant one so the review makes sense."
        )
    intervals_txt = ""
    if req.intervals:
        parts = [
            f"{i.get('label')} target {i.get('targetW')}W / rode {i.get('avgW')}W ({i.get('compliance')}% on target)"
            for i in req.intervals
        ]
        intervals_txt = (
            f"\nPer-interval accuracy (overall {req.interval_compliance}% on target): "
            + "; ".join(parts) + "."
        )
    prompt = (
        f"{await _rider_line()}\n"
        f"The rider just finished: {req.workout} on {req.route or 'the trainer'}.\n"
        f"Duration {mins} min, {req.distance_km} km, {req.elevation_m} m climbing.\n"
        f"Avg power {req.avg_power} W (normalised {req.norm_power} W, target {req.power_target} W), "
        f"avg cadence {req.avg_cadence} rpm, avg HR {req.avg_hr} bpm (max {req.max_hr}).\n"
        f"TSS {req.tss}, intensity {req.intensity}, calories {req.calories}, "
        f"plan compliance {req.compliance}%. Time in zones: {zones_txt}.{intervals_txt}{extended_txt}{adjust_txt}\n"
        "Give a warm, personal post-ride debrief: 2 to 3 short sentences. "
        "Praise what went well, reference how well they held their interval power targets "
        "(call out a specific strong or weak segment if notable), and end with "
        f"one concrete tip for next time. Speak as {req.coach_name}, first person, no lists, no emojis."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{req.coach_name.lower()}-debrief",
            system_message=coach_system(req.coach_name, req.coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        text = (reply or "").strip().strip('"')
        if not text:
            raise ValueError("empty debrief")
        # Cache it against the ride so revisits don't re-generate (or re-charge).
        if req.ride_id:
            try:
                await udb.ride_history.update_one({"id": req.ride_id}, {"$set": {cache_key: text}})
            except Exception:
                logging.warning("debrief cache write failed")
        # A completed ride makes the plan react: refresh the coach's adaptation
        # note in the background so it reflects this session on the next plan load.
        _plan_id = await _active_plan_id()
        asyncio.create_task(_refresh_adaptation_after_ride(req, _plan_id))
        return {"debrief": text, "cached": False}
    except Exception as e:
        logging.exception("coach_debrief failed")
        raise HTTPException(status_code=502, detail=f"Debrief generation failed: {e}")


# ----------------------- Coach: conversational chat -----------------------
def _chat_id(coach_name: str) -> str:
    return f"chat-{coach_name.lower()}"


# ----------------------- Rider domain moved to routes/rider.py --------------
# (_rider_doc / _rider_line / _cal_status now imported from services.rider_common)


# ---- Benchmark domain moved to routes/benchmark.py ----






# ---- Personal Records (Best Time / avg power per scenic route + segments) ----




# ----------------------- Personal records moved to routes/rider.py ----------


# Plan/calendar/progress routes moved to routes/plan.py

async def _build_rider_context(plan_id: str = "") -> str:
    """Assemble a compact, factual snapshot of the rider (latest ride, current
    plan phase/progress, readiness) so the coach can reference real numbers in
    chat. Best-effort — returns whatever is available, never raises."""
    lines: List[str] = []
    rl = await _rider_line()
    if rl:
        lines.append(rl)
    try:
        plan_id = await _plan_id_or_active(plan_id)
        plan = (await udb.training_plans.find_one({"id": plan_id})) if plan_id else None
        if not plan:
            plan = {}
        phase = plan.get("phase", {})
        prog = plan.get("progress", {})
        goals = [g.get("title") for g in plan.get("goals", []) if g.get("status") != "complete"]
        lines.append(
            f"Plan: {plan.get('title')} — {phase.get('name')} ({phase.get('weeks')}), "
            f"week {plan.get('current_week')} of {plan.get('duration_weeks')}."
        )
        if prog:
            lines.append(
                f"Progress: {prog.get('workouts')} workouts done, {prog.get('time')} ridden, "
                f"{prog.get('tss')} TSS, fitness CTL {prog.get('ctl')}, fatigue ATL {prog.get('atl')}, form TSB {prog.get('tsb')}."
            )
        if goals:
            lines.append("Open goals: " + ", ".join(goals) + ".")
    except Exception:
        logging.warning("rider context: plan lookup failed")

    try:
        ride = await udb.ride_history.find().sort("created_at", -1).to_list(length=1)
        if ride:
            r = ride[0]
            mins = (r.get("duration_sec") or 0) // 60
            lines.append(
                f"Last ride: {r.get('workout')} on {r.get('route') or 'the trainer'}, "
                f"{mins} min, {r.get('distance_km')} km, avg power {r.get('avg_power')} W, TSS {r.get('tss')}."
            )
    except Exception:
        logging.warning("rider context: ride lookup failed")

    try:
        rd = WELLNESS_DATA.get("readiness", {})
        vit = {v.get("key"): v for v in WELLNESS_DATA.get("vitals", [])}
        sleep = vit.get("sleep", {}).get("value")
        hrv = vit.get("hrv", {}).get("value")
        stress = vit.get("stress", {}).get("value")
        lines.append(
            f"Readiness: {rd.get('score')}% ({rd.get('status')}); sleep {sleep}, HRV {hrv}, stress {stress}."
        )
    except Exception:
        logging.warning("rider context: readiness lookup failed")

    if not lines:
        return ""
    return (
        "Here is the rider's current context (use it naturally only when relevant; "
        "do not dump these numbers unprompted):\n- " + "\n- ".join(lines)
    )




@router.get("/coach/chat/history")
async def coach_chat_history(coach_name: str = "Alberto"):
    """Return the rider's saved conversation with the given coach (per-coach thread)."""
    doc = await udb.coach_chats.find_one({"id": _chat_id(coach_name)})
    return {"messages": (doc or {}).get("messages", [])}


@router.delete("/coach/chat/history")
async def clear_coach_chat_history(coach_name: str = "Alberto"):
    await udb.coach_chats.update_one(
        {"id": _chat_id(coach_name)}, {"$set": {"messages": []}}, upsert=True
    )
    return {"ok": True}


@router.post("/coach/chat")
async def coach_chat(req: CoachChatRequest):
    """Send a message to the selected coach and get an in-persona reply. The full
    conversation is persisted per coach so history survives across sessions."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    if not (req.message or "").strip():
        raise HTTPException(status_code=400, detail="Empty message")

    cid = _chat_id(req.coach_name)
    doc = await udb.coach_chats.find_one({"id": cid})
    history = (doc or {}).get("messages", [])

    rider_ctx = await _build_rider_context()

    # Companion plan editing: if the rider asks for a plan change, turn it into
    # safe structured edits and apply them so the coach can confirm in-reply.
    applied_note = ""
    plan_updated = False
    if companion_plan.has_plan_edit_intent(req.message):
        try:
            plan_id = await _active_plan_id()
            plan_def = await plans_admin.get_plan_def(plan_id)
            if plan_def and plan_def.get("weeks"):
                state = await udb.plan_state.find_one({"id": plan_id}) or {}
                cur = int(state.get("current_week", 1))
                ops, summary = await companion_plan.extract_plan_ops(
                    req.message, plan_def, cur, req.coach_name, req.coach_gender, key,
                )
                applied = await _apply_companion_ops(
                    plan_id, ops, "rider-request", req.message.strip()[:140],
                )
                if applied:
                    plan_updated = True
                    applied_note = summary or ("; ".join(applied))
                    await _record_adaptation(
                        plan_id, req.coach_name,
                        f"At your request, I {applied_note}.", "At your request",
                    )
        except Exception:
            logging.warning("chat plan-edit failed")

    recent = history[-10:]
    transcript = "\n".join(
        f"{'Rider' if m.get('role') == 'user' else req.coach_name}: {m.get('text')}" for m in recent
    )
    prompt = (
        f"{rider_ctx}\n\n" if rider_ctx else ""
    ) + (
        f"Conversation so far:\n{transcript}\n\n" if transcript else ""
    ) + (
        f"You have just updated the rider's plan at their request: {applied_note}. "
        "Confirm this change warmly and briefly explain why it helps.\n\n" if applied_note else ""
    ) + f"Rider: {req.message.strip()}\n{req.coach_name}:"

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=cid,
            system_message=coach_chat_system(req.coach_name, req.coach_gender, req.coaching_style),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        reply = (reply or "").strip().strip('"')
        if not reply:
            raise ValueError("empty reply")
    except Exception as e:
        logging.exception("coach_chat failed")
        raise HTTPException(status_code=502, detail=f"Coach chat failed: {e}")

    user_msg = {"id": uuid.uuid4().hex, "role": "user", "text": req.message.strip(), "at": now_iso()}
    coach_msg = {"id": uuid.uuid4().hex, "role": "coach", "text": reply, "at": now_iso()}
    try:
        await udb.coach_chats.update_one(
            {"id": cid},
            {"$push": {"messages": {"$each": [user_msg, coach_msg]}},
             "$set": {"coach_name": req.coach_name}},
            upsert=True,
        )
    except Exception:
        logging.warning("coach chat persist failed")

    return {"reply": reply, "user_message": user_msg, "coach_message": coach_msg,
            "plan_updated": plan_updated, "plan_change": applied_note}


@router.get("/coach/weekly-note")
async def coach_weekly_note(coach_name: str = "Alberto", coach_gender: str = "male", refresh: bool = False):
    """The coach's short spoken recap of the rider's week + one focus for next
    week. Cached per ISO-week and coach so it's stable and cheap to revisit."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    now = datetime.now(timezone.utc)
    wk = now.strftime("%G-W%V")
    ckey = f"note_{coach_name.lower()}"
    cache = await udb.settings.find_one({"id": "weekly_note"}) or {}
    cached = cache.get(ckey)
    if not refresh and isinstance(cached, dict) and cached.get("week") == wk:
        return {**cached.get("data", {}), "cached": True}

    def _dt(iso):
        try:
            return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None

    rides = await udb.ride_history.find(
        {}, {"_id": 0, "created_at": 1, "tss": 1, "duration_sec": 1, "distance_km": 1, "workout": 1}).to_list(length=2000)
    wk_start = now - timedelta(days=7)
    prev_start = now - timedelta(days=14)

    def _bucket(lo, hi):
        tss = secs = dist = rides_n = 0.0
        names = []
        for r in rides:
            t = _dt(r.get("created_at"))
            if not t or not (lo <= t < hi):
                continue
            rides_n += 1
            tss += float(r.get("tss") or 0)
            secs += float(r.get("duration_sec") or 0)
            dist += float(r.get("distance_km") or 0)
            if r.get("workout"):
                names.append(r["workout"])
        return {"tss": round(tss), "hours": round(secs / 3600.0, 1), "rides": int(rides_n),
                "distance_km": round(dist, 1), "names": names}

    this_wk = _bucket(wk_start, now)
    last_wk = _bucket(prev_start, wk_start)

    rider = await _rider_line()
    workouts_txt = ("; ".join(this_wk["names"][:6]) or "no named workouts")
    prompt = (
        f"{rider}\n"
        f"This is the rider's WEEKLY recap. This week: {this_wk['rides']} rides, {this_wk['tss']} TSS, "
        f"{this_wk['hours']} h, {this_wk['distance_km']} km (sessions: {workouts_txt}). "
        f"Last week for comparison: {last_wk['rides']} rides, {last_wk['tss']} TSS, {last_wk['hours']} h.\n"
        "Write a short spoken weekly recap for the rider. Reply with ONLY valid minified JSON (no markdown, no code fences) "
        'of the shape {"note": string, "focus": string}. '
        "\"note\": 2 warm sentences recapping the week (praise the effort, reference the numbers or the trend vs last week). "
        "\"focus\": ONE short, concrete focus for next week (a single actionable sentence). "
        f"Speak as {coach_name}, first person, no emojis, no quotation marks inside the strings."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{coach_name.lower()}-weekly-note",
            system_message=coach_system(coach_name, coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        raw = (reply or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
        s, e = raw.find("{"), raw.rfind("}")
        data_json = json.loads(raw[s:e + 1]) if s >= 0 and e > s else {}
        note = str(data_json.get("note", "")).strip().strip('"')
        focus = str(data_json.get("focus", "")).strip().strip('"')
        if not note:
            raise ValueError("empty note")
        data = {"note": note, "focus": focus, "has_activity": this_wk["rides"] > 0}
        try:
            await udb.settings.update_one(
                {"id": "weekly_note"}, {"$set": {ckey: {"week": wk, "data": data}}}, upsert=True)
        except Exception:
            logging.warning("weekly note cache write failed")
        return {**data, "cached": False}
    except Exception as e:
        logging.exception("coach_weekly_note failed")
        raise HTTPException(status_code=502, detail=f"Weekly note generation failed: {e}")


async def _refresh_adaptation_after_ride(req: "CoachDebriefRequest", plan_id: str = ""):
    """Regenerate and cache the coach's plan-adaptation note after a completed
    ride, so the Training Plan reflects the latest session. Best-effort."""
    try:
        plan_id = await _plan_id_or_active(plan_id)
        if not plan_id:
            return
        plan = await udb.training_plans.find_one({"id": plan_id}) or {}
        # Feed interval execution into the adaptive-targets engine first so the
        # coach's note can reference any target nudges it just made.
        _bias, nudges = await _update_adaptive_targets(plan_id, req.intervals)
        recent_ride = {
            "workout": req.workout,
            "route": req.route,
            "duration_min": req.duration_sec // 60,
            "avg_power": req.avg_power,
            "tss": req.tss,
            "compliance": req.compliance,
            "interval_compliance": req.interval_compliance,
            "target_nudges": nudges,
        }
        # Adaptive plan easing: if this ride's compliance was low, gently ease the
        # rider's next upcoming week. Applies to any STRUCTURED plan (has weeks[]),
        # driven by plan metadata rather than a hardcoded id. Once per week.
        try:
            plan_def = await plans_admin.get_plan_def(plan_id)
            structured = bool(plan_def and plan_def.get("weeks"))
            if structured and 0 < req.compliance < 70:
                state = await udb.plan_state.find_one({"id": plan_id}) or {}
                cur = int(state.get("current_week", 1))
                target = cur + 1
                eased = set(state.get("eased_weeks", []))
                last_week = plan_def.get("duration_weeks") or len(plan_def.get("weeks", []))
                if target <= last_week and target not in eased:
                    ops, summary = companion_plan.auto_ease_ops(plan_def, target)
                    applied = await _apply_companion_ops(
                        plan_id, ops, "adaptive",
                        f"Low compliance ({req.compliance}%) — easing week {target}",
                    )
                    if applied:
                        eased.add(target)
                        await udb.plan_state.update_one(
                            {"id": plan_id}, {"$set": {"eased_weeks": list(eased)}}, upsert=True,
                        )
                        recent_ride["plan_adjustment"] = summary
        except Exception:
            logging.warning("adaptive plan easing failed")
        text = await _generate_adaptation(plan, req.coach_name, req.coach_gender, recent_ride)
        cache_key = f"adaptation_ai_{req.coach_name.lower()}"
        await udb.training_plans.update_one(
            {"id": plan_id},
            {"$set": {cache_key: text, f"{cache_key}_at": now_iso()}},
            upsert=True,
        )
        trigger = f"After your {req.workout} ride" if req.workout else "After your last ride"
        await _record_adaptation(plan_id, req.coach_name, text, trigger)
        # Regenerate the DETAILED reasoning cache too, so the "why" modal shows
        # fresh, ride-specific reasoning without the rider tapping refresh.
        try:
            detail_plan = plan
            if plan_id in ("couch-to-road", "ride-stronger", "ride-beyond"):
                try:
                    computed = await get_plan(id=plan_id)
                    if isinstance(computed, dict):
                        detail_plan = {**plan, **computed}
                except Exception:
                    pass
            detail = await _generate_adaptation_detail(detail_plan, req.coach_name, req.coach_gender)
            dkey = f"adaptation_detail_{req.coach_name.lower()}"
            await udb.training_plans.update_one(
                {"id": plan_id},
                {"$set": {dkey: detail, f"{dkey}_at": now_iso()}},
                upsert=True,
            )
        except Exception:
            logging.warning("post-ride adaptation detail refresh failed")
    except Exception:
        logging.warning("post-ride adaptation refresh failed")


async def _record_adaptation(plan_id: str, coach_name: str, text: str, trigger: str):
    """Append a coach adaptation note to the plan's history (newest first, capped
    at 20). Best-effort so it never blocks the main flow."""
    try:
        entry = {
            "id": uuid.uuid4().hex,
            "coach": coach_name,
            "text": text,
            "trigger": trigger,
            "at": now_iso(),
        }
        await udb.training_plans.update_one(
            {"id": plan_id},
            {"$push": {"adaptation_history": {"$each": [entry], "$position": 0, "$slice": 20}}},
            upsert=True,
        )
    except Exception:
        logging.warning("adaptation history write failed")


# ----------------------- Adaptive zone targets engine -----------------------
# Zones we allow to auto-nudge (recovery Z1 is left alone). A rider who
# repeatedly overshoots a zone gets a slightly harder target next time; one who
# fades gets an achievable target. Nudges are small, gradual and capped.
# NUDGE_* / _aggregate_ride_zones / _update_adaptive_targets moved to services.plan_engine


# /plan/targets moved to routes/plan.py





async def _generate_adaptation(plan: dict, coach_name: str, coach_gender: str, recent_ride: Optional[dict] = None) -> str:
    """Generate the coach's plan-adaptation insight via the LLM. When a recent
    ride is supplied, the note reacts to that just-completed session."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("Coaching model not configured")

    prog = plan.get("progress", {})
    goals_txt = ", ".join(
        f"{g.get('title')} ({'done' if g.get('status') == 'complete' else 'in progress'})"
        for g in plan.get("goals", [])
    ) or "n/a"
    phase = plan.get("phase", {})
    ride_txt = ""
    if recent_ride:
        ride_txt = (
            f"\nThey just finished a ride: {recent_ride.get('workout')} on "
            f"{recent_ride.get('route') or 'the trainer'}, {recent_ride.get('duration_min')} min, "
            f"avg power {recent_ride.get('avg_power')} W, TSS {recent_ride.get('tss')}, "
            f"plan compliance {recent_ride.get('compliance')}%"
        )
        ic = recent_ride.get("interval_compliance")
        if ic:
            ride_txt += f", interval target accuracy {ic}%"
        ride_txt += ". Factor this session into your note."
        nudges = recent_ride.get("target_nudges") or []
        if nudges:
            ride_txt += (
                " Based on how they executed their intervals you have automatically "
                + "; ".join(nudges)
                + ". Mention this target adjustment naturally in your note."
            )
        adjust = recent_ride.get("plan_adjustment")
        if adjust:
            ride_txt += (
                f" You have also automatically {adjust} to keep them progressing "
                "comfortably. Reassure them about this easing in your note."
            )
    prompt = (
        f"The rider is on the '{plan.get('title')}' plan: {plan.get('description')}\n"
        f"Current phase: {phase.get('name')} ({phase.get('weeks')}). "
        f"Week {plan.get('current_week')} of {plan.get('duration_weeks')}.\n"
        f"Progress so far: {prog.get('workouts')} workouts, {prog.get('time')} ridden, "
        f"{prog.get('tss')} TSS, fitness CTL {prog.get('ctl')}, fatigue ATL {prog.get('atl')}, "
        f"form TSB {prog.get('tsb')}. Goals: {goals_txt}.{ride_txt}\n"
        "As the rider's coach, write a short, warm adaptation note (2 to 3 sentences) explaining "
        "how you are adjusting their upcoming training based on this progress. Be specific about "
        "training zones and volume. First person, no lists, no emojis, no quotation marks. "
        "Reply with the note only, no preamble, greeting or heading."
    )

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=key,
        session_id=f"{coach_name.lower()}-adaptation",
        system_message=coach_system(coach_name, coach_gender),
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=prompt))
    text = (reply or "").strip().strip('"')
    if not text:
        raise ValueError("empty adaptation")
    return text


@router.post("/coach/adaptation")
async def coach_adaptation(req: AdaptationRequest):
    """Generate the coach's plan-adaptation insight, based on the rider's plan and
    progress. Cached per plan+coach so it only regenerates when refresh=True."""
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Resolve the rider's real active plan (never the legacy build-and-climb default).
    req.plan_id = await _plan_id_or_active(req.plan_id)
    if not req.plan_id:
        raise HTTPException(status_code=400, detail="No active training plan to adapt")
    plan = await udb.training_plans.find_one({"id": req.plan_id}) or {}

    cache_key = f"adaptation_ai_{req.coach_name.lower()}"
    if not req.refresh and plan.get(cache_key):
        return {"adaptation": plan[cache_key], "cached": True}

    try:
        text = await _generate_adaptation(plan, req.coach_name, req.coach_gender)
        try:
            await udb.training_plans.update_one(
                {"id": req.plan_id},
                {"$set": {cache_key: text, f"{cache_key}_at": now_iso()}},
            )
            await _record_adaptation(req.plan_id, req.coach_name, text, "Manual refresh")
        except Exception:
            logging.warning("adaptation cache write failed")
        return {"adaptation": text, "cached": False}
    except Exception as e:
        logging.exception("coach_adaptation failed")
        raise HTTPException(status_code=502, detail=f"Adaptation generation failed: {e}")


async def _generate_adaptation_detail(plan: dict, coach_name: str, coach_gender: str) -> dict:
    """Ask the LLM to explain HOW the current adaptation was derived, returning a
    structured breakdown (summary + reasoning factors + concrete adjustments)."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("Coaching model not configured")

    prog = plan.get("progress", {})
    phase = plan.get("phase", {})
    goals_txt = ", ".join(
        f"{g.get('title')} ({'achieved' if g.get('status') == 'complete' else 'in progress'})"
        for g in plan.get("goals", [])
    ) or "n/a"
    # Recent ride execution (grounds the reasoning in real sessions).
    rides_txt = "none logged yet"
    try:
        recent = await udb.ride_history.find().sort("created_at", -1).to_list(length=4)
        parts = []
        for r in recent:
            parts.append(
                f"{r.get('workout') or r.get('route') or 'Ride'} — {round((r.get('duration_sec') or 0)/60)} min, "
                f"{r.get('avg_power') or '—'} W avg, {r.get('tss') or 0} TSS"
            )
        if parts:
            rides_txt = "; ".join(parts)
    except Exception:
        pass
    # Per-zone execution bias (auto-tuned targets) if present.
    zbias = plan.get("zone_bias") or {}
    zbias_txt = ", ".join(f"{z} {'+' if v > 0 else ''}{v}%" for z, v in zbias.items() if v) or "no per-zone changes"

    prompt = (
        f"Rider plan: '{plan.get('title')}'. Current phase: {phase.get('name')} ({phase.get('weeks')}), "
        f"week {plan.get('current_week')} of {plan.get('duration_weeks')}.\n"
        f"Progress: {prog.get('workouts')} workouts, {prog.get('time')} ridden, {prog.get('tss')} TSS, "
        f"fitness CTL {prog.get('ctl')}, fatigue ATL {prog.get('atl')}, form TSB {prog.get('tsb')}.\n"
        f"Goals: {goals_txt}.\n"
        f"Recent sessions: {rides_txt}.\n"
        f"Automatic per-zone target changes: {zbias_txt}.\n\n"
        "As the rider's coach, explain HOW you arrived at their current plan adaptation. "
        "Reply with ONLY valid minified JSON (no markdown, no code fences) of the shape: "
        '{"summary": string, "factors": [{"label": string, "detail": string}], "adjustments": [string]}. '
        "Give 3-4 factors — each grounds the decision in something concrete (a completed workout or streak, "
        "progress or lack of progress in a zone, fatigue/form, an achieved or lagging goal). "
        "Give 2-3 adjustments describing the concrete changes made to upcoming training (zones, volume, recovery). "
        "Warm, first person, specific, no emojis."
    )

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=key,
        session_id=f"{coach_name.lower()}-adaptation-detail",
        system_message=coach_system(coach_name, coach_gender),
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=prompt))
    raw = (reply or "").strip()
    # Strip any accidental code fences and isolate the JSON object.
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{"):] if "{" in raw else raw
    start, end = raw.find("{"), raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    data = json.loads(raw)
    return {
        "summary": str(data.get("summary", "")).strip(),
        "factors": [
            {"label": str(f.get("label", "")).strip(), "detail": str(f.get("detail", "")).strip()}
            for f in (data.get("factors") or []) if isinstance(f, dict)
        ][:4],
        "adjustments": [str(a).strip() for a in (data.get("adjustments") or [])][:3],
    }


@router.post("/coach/adaptation/detail")
async def coach_adaptation_detail(req: AdaptationRequest):
    """Detailed, AI-generated breakdown of HOW the coach derived the current plan
    adaptation (reasoning factors + concrete adjustments). Cached per plan+coach."""
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    req.plan_id = await _plan_id_or_active(req.plan_id)
    if not req.plan_id:
        raise HTTPException(status_code=400, detail="No active training plan to adapt")
    plan = await udb.training_plans.find_one({"id": req.plan_id}) or {}
    # Ground structured plans in their COMPUTED phase/progress (the training_plans
    # doc alone is sparse for couch-to-road / ride-stronger / ride-beyond).
    if req.plan_id in ("couch-to-road", "ride-stronger", "ride-beyond"):
        try:
            computed = await get_plan(id=req.plan_id)
            if isinstance(computed, dict):
                plan = {**plan, **computed}
        except Exception:
            pass
    cache_key = f"adaptation_detail_{req.coach_name.lower()}"
    if not req.refresh and plan.get(cache_key):
        return {"detail": plan[cache_key], "cached": True}
    try:
        detail = await _generate_adaptation_detail(plan, req.coach_name, req.coach_gender)
        try:
            await udb.training_plans.update_one(
                {"id": req.plan_id}, {"$set": {cache_key: detail, f"{cache_key}_at": now_iso()}}
            )
        except Exception:
            logging.warning("adaptation detail cache write failed")
        return {"detail": detail, "cached": False}
    except Exception as e:
        logging.exception("coach_adaptation_detail failed")
        raise HTTPException(status_code=502, detail=f"Adaptation detail failed: {e}")


# /plan/adaptations, /plan/goals, /plan/progress moved to routes/plan.py

