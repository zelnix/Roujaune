"""Coach routes for ROUJAUNE — live in-workout cue, extend-advice decision,
post-ride debrief, conversational coach chat (with rider+plan context) and the
plan-adaptation summary/detail generators. LLM personas come from
services.coach_llm; all plan math from services.plan_engine (one-way dependency).
"""
import os  # noqa: F401
import json
import re
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
from services.coach_llm import coach_system, coach_chat_system, STYLE_TONE, coach_line, extract_json_object  # noqa: F401
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
from routes.plan import (  # noqa: E402
    get_plan, WELLNESS_DATA, _reset_plan_start, _parse_ymd, _next_free_day,
    _move_session, _rest_day, _next_planned_ride,
    _set_ftp, _add_goal, _set_weekly_days, _pause_plan, _resume_plan,
)


# ── Coach voice (Gemini TTS) ────────────────────────────────────────────────
# Natural spoken coach summaries. Alberto (male) and Adriana (female) both speak
# English with a warm, light Spanish accent to match their personas. Audio is
# generated server-side with the rider-provided Gemini key and cached by a hash
# of (coach, text) so replays are instant and don't re-bill.
import io as _io
import wave as _wave
import hashlib as _hashlib
from fastapi import Query  # noqa: E402
from fastapi.responses import Response  # noqa: E402

_GEMINI_TTS_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
_COACH_VOICES = {
    "alberto": {"voice": "Charon", "desc": "a warm, confident male cycling coach with a light Spanish accent"},
    "adriana": {"voice": "Aoede", "desc": "a warm, encouraging female cycling coach with a light Spanish accent"},
}
_tts_cache: Dict[str, bytes] = {}


def _pcm_to_wav(pcm: bytes) -> bytes:
    """Gemini returns 24kHz mono signed 16-bit PCM; wrap it in a WAV container."""
    out = _io.BytesIO()
    with _wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(pcm)
    return out.getvalue()


def _gemini_tts_sync(text: str, voice: str, desc: str) -> bytes:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    prompt = (
        f"Read the following as {desc}. Keep it natural, upbeat and clear, "
        f"with gentle pauses between sentences:\n\n{text}"
    )
    result = client.models.generate_content(
        model=_GEMINI_TTS_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        ),
    )
    for cand in (result.candidates or []):
        for part in (cand.content.parts or []):
            if part.inline_data and part.inline_data.data:
                data = part.inline_data.data
                return _pcm_to_wav(data if isinstance(data, bytes) else bytes(data))
    raise ValueError("Gemini returned no audio")


@router.get("/coach/speak")
async def coach_speak(text: str = Query(..., max_length=6000), coach_id: str = Query("alberto")):
    """Stream a natural spoken version of a coach note as WAV (Gemini TTS)."""
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="Voice model not configured")
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    cfg = _COACH_VOICES.get(coach_id, _COACH_VOICES["alberto"])
    key = _hashlib.sha256(f"{_GEMINI_TTS_MODEL}|{cfg['voice']}|{text}".encode()).hexdigest()
    wav = _tts_cache.get(key)
    if wav is None:
        try:
            wav = await asyncio.to_thread(_gemini_tts_sync, text, cfg["voice"], cfg["desc"])
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("server").warning("Coach TTS failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Voice generation failed")
        if len(_tts_cache) > 200:
            _tts_cache.clear()
        _tts_cache[key] = wav
    return Response(content=wav, media_type="audio/wav",
                    headers={"Cache-Control": "private, max-age=86400"})



@router.post("/coach/cue")
async def coach_cue(req: CoachCueRequest):
    """Generate a live, in-persona coaching cue from the rider's telemetry."""
    key = os.environ.get("GEMINI_API_KEY")
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
    elif req.cue_kind in ("struggle", "safety"):
        _RLABEL = {
            "cadence_decay": "their cadence is dropping well below target",
            "hr_decoupling": "their heart rate is drifting up while power fades (aerobic decoupling)",
            "hr_near_max": "their heart rate is pinned near maximum",
            "power_fade": f"their power has faded roughly {round(req.power_deficit_pct * 100)}% below the {req.power_target} W target",
            "power_variability": "their pedal stroke has turned choppy and uneven",
            "w_prime_low": "their anaerobic reserve (W-prime) is almost empty",
            "erg_spiral": "the smart trainer's ERG resistance has bogged them down — power and cadence collapsing together (mechanical failure)",
            "systemic_fatigue": "their heart rate has been drifting up for a long stretch while their power output holds steady — a sign of heat, dehydration or deep fatigue, not a hard effort",
            "pedal_asymmetry": "their pedal stroke has gone one-sided, a sign of muscular fatigue",
        }
        signs = "; ".join(_RLABEL.get(r, r) for r in (req.struggle_reasons or [])) or "they are clearly straining"
        where = f" on the climb into {req.place}" if req.place else ""
        if req.cue_kind == "safety" or req.struggle_safety:
            instruction = (
                f"SAFETY FIRST: the rider is struggling dangerously — {signs}. "
                "You are easing them into active recovery now. In one short, CALM, grounding sentence, "
                "tell them to sit up, ease off and just spin easy to bring the heart rate down — reassure them this is the right call, no heroics."
            )
        else:
            urgency = "with real urgency and belief" if req.struggle_severity == "high" else "warmly and encouragingly"
            eased = (
                f" You have quietly dropped their target about {req.eased_pct}% to help them hold on — do not dwell on it."
                if req.eased_pct else ""
            )
            if req.preemptive and "w_prime_low" in (req.struggle_reasons or []):
                ttd = f" (about {round(req.time_to_depletion_sec)}s at this pace)" if req.time_to_depletion_sec else ""
                instruction = (
                    f"PREDICTIVE CALL{where}: their anaerobic reserve (W-prime) is nearly empty, and at the current pace "
                    f"it will hit zero BEFORE this interval ends{ttd} — you are acting now, before they blow up, not after. "
                    f"In one short, confident, {urgency} sentence, tell them you're easing the target slightly right now "
                    "so they can hold something respectable to the end of the interval instead of collapsing mid-way." + eased
                )
            elif "systemic_fatigue" in (req.struggle_reasons or []):
                instruction = (
                    f"HYDRATION / HEAT CALL{where}: their heart rate has been climbing steadily for the last several "
                    "minutes while their power output has held steady — this is heat, dehydration or deep-fatigue drift, "
                    "not a hard effort they can just push through. In one short, calm, caring sentence, remind them to "
                    "sip water right now, and mention you've capped their target a touch to protect the rest of the session." + eased
                )
            else:
                instruction = (
                    f"The rider is STARTING TO STRUGGLE{where}: {signs}. "
                    f"Give ONE short, specific, actionable cue {urgency} to help them dig in and hold form right now "
                    "(e.g. lift the cadence, relax the shoulders, breathe, smooth the stroke)." + eased
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
        from services.gemini_shim import LlmChat, UserMessage
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

    key = os.environ.get("GEMINI_API_KEY")
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
            from services.gemini_shim import LlmChat, UserMessage
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
    key = os.environ.get("GEMINI_API_KEY")
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

    # Track repeated power-fade struggles across rides so the coach can offer a
    # one-tap FTP re-test when the target keeps proving too hard to hold.
    try:
        await _update_ftp_watch(req.ride_id, req.struggles)
    except Exception:
        logging.warning("ftp watch update failed")

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
    struggle_txt = ""
    if req.struggles:
        _RL = {
            "cadence_decay": "cadence dropping", "hr_decoupling": "HR decoupling",
            "hr_near_max": "HR near max", "power_fade": "power fading",
            "power_variability": "choppy power", "w_prime_low": "anaerobic tank empty",
            "erg_spiral": "ERG spiral", "pedal_asymmetry": "one-sided stroke",
            "systemic_fatigue": "HR drift while power held (hydration/heat)",
        }
        n = len(req.struggles)
        had_safety = any(s.get("safety") for s in req.struggles)
        causes = []
        for s in req.struggles[:4]:
            mins = (s.get("t") or 0) // 60
            prim = _RL.get(s.get("primary"), s.get("primary") or "strain")
            causes.append(f"~{mins} min in ({prim})")
        struggle_txt = (
            f"\nThe live coach flagged {n} tough moment(s) where the rider started to struggle: "
            + "; ".join(causes) + ". "
            + ("One tripped a SAFETY ease into active recovery. " if had_safety else "")
            + "Acknowledge these moments with empathy, note how they pushed through, and if the fades were repeated "
            "gently suggest whether an FTP re-test or a touch more recovery would help."
        )
    prompt = (
        f"{await _rider_line()}\n"
        f"The rider just finished: {req.workout} on {req.route or 'the trainer'}.\n"
        f"Duration {mins} min, {req.distance_km} km, {req.elevation_m} m climbing.\n"
        f"Avg power {req.avg_power} W (normalised {req.norm_power} W, target {req.power_target} W), "
        f"avg cadence {req.avg_cadence} rpm, avg HR {req.avg_hr} bpm (max {req.max_hr}).\n"
        f"TSS {req.tss}, intensity {req.intensity}, calories {req.calories}, "
        f"plan compliance {req.compliance}%. Time in zones: {zones_txt}.{intervals_txt}{struggle_txt}{extended_txt}{adjust_txt}\n"
        "Give a warm, personal post-ride debrief: 2 to 3 short sentences. "
        "Praise what went well, reference how well they held their interval power targets "
        "(call out a specific strong or weak segment if notable), and end with "
        f"one concrete tip for next time. Speak as {req.coach_name}, first person, no lists, no emojis."
    )

    try:
        from services.gemini_shim import LlmChat, UserMessage
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


# ----------------------- Auto FTP re-test suggestion ------------------------
# The live struggle detector flags "power fade" moments (rider can't hold the
# target). When the same fade pattern repeats across consecutive rides, the
# rider's FTP is probably set too high — so the coach proactively offers a
# one-tap FTP re-test. We keep a short rolling per-ride log in a settings doc.
_FADE_KINDS = {"power_fade", "w_prime_low", "erg_spiral"}
_FTP_WATCH_ID = "ftp_watch"
_FADE_STREAK_THRESHOLD = 2  # this many consecutive fade-heavy rides -> suggest
_RETEST_RECENT_DAYS = 21    # don't nag if a re-test is already scheduled/recent


def _ride_had_repeated_fade(struggles: List[Dict[str, Any]]) -> bool:
    """A ride 'faded' if the coach caught 2+ power-fade struggle moments."""
    n = 0
    for s in struggles or []:
        prim = s.get("primary")
        reasons = s.get("reasons") or []
        if (prim in _FADE_KINDS) or any(r in _FADE_KINDS for r in reasons):
            n += 1
    return n >= 2


def _fade_streak(rides: List[Dict[str, Any]]) -> int:
    """Trailing count of consecutive fade-heavy rides (newest first)."""
    streak = 0
    for r in sorted(rides, key=lambda x: str(x.get("at", "")), reverse=True):
        if r.get("fade"):
            streak += 1
        else:
            break
    return streak


async def _update_ftp_watch(ride_id: Optional[str], struggles: List[Dict[str, Any]]):
    """Record this ride's fade verdict in the rolling watch (idempotent per ride)."""
    doc = await udb.settings.find_one({"id": _FTP_WATCH_ID}) or {}
    rides = [r for r in (doc.get("rides") or []) if r.get("ride_id") != ride_id]
    rides.append({
        "ride_id": ride_id or uuid.uuid4().hex,
        "at": now_iso(),
        "fade": _ride_had_repeated_fade(struggles),
    })
    rides = sorted(rides, key=lambda x: str(x.get("at", "")))[-6:]
    await udb.settings.update_one(
        {"id": _FTP_WATCH_ID}, {"$set": {"rides": rides}}, upsert=True)


async def _ftp_retest_scheduled_recently() -> bool:
    """True if an FTP test is already on the calendar (upcoming) or was booked
    very recently — so we don't keep nagging."""
    try:
        sched = await udb.scheduled_workouts.find(
            {"title": {"$regex": "FTP Test", "$options": "i"}}).to_list(50)
    except Exception:
        return False
    today = datetime.now(timezone.utc).date()
    for w in sched:
        try:
            d = date.fromisoformat(str(w.get("date"))[:10])
        except Exception:
            continue
        if (d - today).days >= 0 or (today - d).days <= _RETEST_RECENT_DAYS:
            if w.get("status") not in ("skipped", "cancelled"):
                return True
    return False


@router.get("/coach/ftp-suggestion")
async def coach_ftp_suggestion(coach_name: str = "Alberto"):
    """Whether the coach should offer an FTP re-test right now, from the rolling
    power-fade watch. Used by the ride summary to show a one-tap prompt."""
    doc = await udb.settings.find_one({"id": _FTP_WATCH_ID}) or {}
    rides = doc.get("rides") or []
    streak = _fade_streak(rides)
    already = await _ftp_retest_scheduled_recently()
    suggest = streak >= _FADE_STREAK_THRESHOLD and not already
    reason = ""
    if suggest:
        reason = (
            f"You've faded off your power target in {streak} rides in a row — "
            "your FTP may be set a touch high. A quick 20-minute re-test will re-baseline "
            "every zone so your sessions land right."
        )
    return {"suggest": suggest, "streak": streak, "already_scheduled": already, "reason": reason}


@router.post("/coach/ftp-retest")
async def coach_ftp_retest(body: dict):
    """One-tap: schedule an FTP re-test (defaults to tomorrow) and clear the
    power-fade watch so the coach stops prompting until it re-emerges."""
    coach_name = body.get("coach_name", "Alberto")
    today = datetime.now(timezone.utc).date()
    when = None
    if body.get("date"):
        try:
            when = date.fromisoformat(str(body["date"])[:10])
        except Exception:
            when = None
    if not when:
        when = today + timedelta(days=1)
    await udb.scheduled_workouts.insert_one({
        "id": uuid.uuid4().hex, "type": "cycling", "workout_id": "", "title": "FTP Test (20 min)",
        "duration": "1h 00m", "tss": "", "zone": "Z4", "color": "red",
        "date": when.isoformat(), "status": "scheduled", "created_by": coach_name,
    })
    # Reset the watch so we don't re-prompt for this pattern.
    await udb.settings.update_one({"id": _FTP_WATCH_ID}, {"$set": {"rides": []}}, upsert=True)
    note = (
        f"scheduled an FTP re-test for {when.isoformat()} (a focused 20-minute effort). "
        "Warm up well, then ride it steady-hard — I'll re-baseline your zones from the result."
    )
    try:
        _pid = await _active_plan_id()
        if _pid:
            await _record_adaptation(_pid, coach_name, f"I {note}", "FTP re-test")
    except Exception:
        logging.warning("ftp-retest adaptation record failed")
    return {"ok": True, "date": when.isoformat(), "note": note}



# ----------------------- Coach: conversational chat -----------------------
def _chat_id(coach_name: str) -> str:
    return f"chat-{coach_name.lower()}"


_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _parse_natural_date(msg: str):
    """Best-effort date from a chat phrase: today/tomorrow, a weekday name, or an
    explicit date like '15 June' / 'June 15' / '2026-06-15'."""
    from datetime import datetime, timezone, timedelta
    m = (msg or "").lower()
    today = datetime.now(timezone.utc).date()
    if "today" in m:
        return today
    if "tomorrow" in m:
        return today + timedelta(days=1)
    _NUMW = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}
    nd = re.search(r"\b(in\s+)?(\d+|a|an|one|two|three|four|five|six|seven)\s+day", m)
    if nd:
        g = nd.group(2)
        n = int(g) if g.isdigit() else _NUMW.get(g, 1)
        return today + timedelta(days=n)
    if "next week" in m:
        return today + timedelta(days=7)
    for i, wd in enumerate(_WEEKDAYS):
        if wd in m:
            ahead = (i - today.weekday()) % 7
            return today + timedelta(days=ahead or 7)  # the upcoming one
    try:
        from dateutil import parser as _dp
        d = _dp.parse(m, fuzzy=True, default=datetime(today.year, today.month, today.day))
        return d.date()
    except Exception:
        return None


_START_RE = re.compile(
    r"\b(start\s*date|restart|re-?start"
    r"|reset (my|the )?(plan|start|schedule|training)"
    r"|(start|begin|kick\s*off|push|move|shift|change|adjust|set)\s+(my|the)?\s*(\w+\s+){0,2}(plan|schedule|training)"
    r"|(start|begin|kick\s*off)\w*\s+(this|next|on|from|the)?\s*(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b"
)
_MISSED_RE = re.compile(r"\b(missed|couldn'?t (ride|do)|skip(ped)?|reschedul|move (my|the|that) (ride|workout|session))\b")

# Single-session coach actions the rider can ask for in plain language.
_SESSION_MOVE_RE = re.compile(r"\b(move|push|shift|bump)\b[^.?!]*\b(workout|ride|session|training)\b")
_REST_RE = re.compile(
    r"\b(rest day"
    r"|cancel (my |today'?s? |the |this )*(workout|ride|session|training)"
    r"|skip (my |today'?s? |the |this )*(workout|ride|session|training)"
    r"|make (it|today|this|tomorrow) (a )?rest"
    r"|change (it|today|this) (in)?to (a )?rest"
    r"|turn (it|today|this) (in)?to (a )?rest)\b"
)
_SCHEDULE_RE = re.compile(r"\b(add|schedule|put in|slot in|plan)\b[^.?!]*\b(workout|ride|session|recovery|endurance|threshold|intervals?|tempo|climb)\b")
_UNDO_RE = re.compile(r"\b(undo|revert|undo that|undo the (change|reschedule|move)|put it back|never ?mind that)\b")


def _parse_target_date(msg: str):
    """Parse the DESTINATION date from a phrase, preferring text after
    to/until/onto/on/for so 'move today's ride to Friday' picks Friday, not today."""
    parts = re.split(r"\b(?:to|until|onto|on|for)\b", msg or "", flags=re.I)
    if len(parts) > 1:
        d = _parse_natural_date(parts[-1])
        if d:
            return d
    return _parse_natural_date(msg)


# FTP, goals, weekly volume, pause/resume and coaching-style intents.
_FTP_RE = re.compile(r"\bftp\b|\bthreshold power\b|\bftp test\b")
_GOAL_RE = re.compile(r"\b(add (a |another )?goal|new goal|set (a )?goal|my goal is|goal:|i want to be able to|i'?d like to be able to)\b")
_DAYS_RE = re.compile(r"\b(\d)\s*days?\s*(a|per|each)\s*week\b|\b(make it|do|train|ride)\s+(\d)\s+days?\b")
_PAUSE_RE = re.compile(r"\b(pause|freeze|put (my|the) plan on hold|take a (break|week off)|hold (my|the) plan)\b")
_RESUME_RE = re.compile(r"\b(resume|unpause|un-?pause|pick (it|the plan|things) back up|continue (my|the) plan|start again after)\b")
_STYLE_RE = re.compile(r"\b(tougher|harder|stricter|push me harder|be tough|gentler|easier on me|softer|calmer|more relaxed|less intense|keep it simple|minimal|no.?nonsense)\b")
_STYLE_MAP = [
    ("performance", ("tougher", "harder", "stricter", "push me", "be tough", "no-nonsense", "nononsense")),
    ("calm", ("gentler", "easier on me", "softer", "calmer", "more relaxed", "less intense")),
    ("essential", ("keep it simple", "minimal")),
]


def _map_style(m: str):
    for style, keys in _STYLE_MAP:
        if any(k in m for k in keys):
            return style
    return None




# ----------------------- Rider domain moved to routes/rider.py --------------
# (_rider_doc / _rider_line / _cal_status now imported from services.rider_common)


# ---- Benchmark domain moved to routes/benchmark.py ----






# ---- Personal Records (Best Time / avg power per scenic route + segments) ----




# ----------------------- Personal records moved to routes/rider.py ----------


# Plan/calendar/progress routes moved to routes/plan.py

async def _computed_plan(plan_id: str = "") -> dict:
    """Resolve the FULLY COMPUTED plan (title, phase, progress, goals, workouts,
    zone_bias, ...) for whichever plan is active — structured (Couch to Road /
    Ride Stronger / Ride Beyond), a coach-created custom AI plan, or a legacy
    admin-authored plan. The raw `training_plans` document alone is sparse for
    structured/custom plans (phase/progress/goals/workouts are derived at read
    time via get_plan(), not stored) — any code that hands plan facts to the
    LLM must resolve through this helper instead of querying the collection
    directly, or the coach ends up "seeing" a blank plan. Best-effort: falls
    back to the raw doc (or {}) if the computed lookup fails for any reason."""
    pid = plan_id or await _active_plan_id()
    raw = {}
    try:
        if pid and pid != "none":
            raw = await udb.training_plans.find_one({"id": pid}) or {}
    except Exception:
        pass
    try:
        computed = await get_plan()
        if isinstance(computed, dict) and computed:
            return {**raw, **computed}
    except Exception:
        logging.warning("computed plan resolve failed for %s", pid)
    return raw


async def _build_rider_context(plan_id: str = "") -> str:
    """Assemble a compact, factual snapshot of the rider (latest rides, current
    plan phase/progress/schedule, readiness, level) so the coach can reference
    real numbers in chat. Best-effort — returns whatever is available, never
    raises."""
    lines: List[str] = []
    rl = await _rider_line()
    if rl:
        lines.append(rl)
    try:
        rider = await _rider_doc()
        cap = str(rider.get("capability") or "").strip()
        if cap:
            lines.append(f"Rider's self-rated level: {cap}.")
        loc = ", ".join(p for p in [rider.get("city"), rider.get("region"), rider.get("country")] if p)
        if loc:
            lines.append(f"Location: {loc}.")
    except Exception:
        logging.warning("rider context: capability lookup failed")

    # FTP + performance benchmark profile (power curve, aerobic efficiency,
    # cadence preference, recovery response) — real per-rider biometrics from
    # their FTP test / benchmark history, not just demographics.
    try:
        settings_doc = await udb.settings.find_one({"id": "me"}) or {}
        uid = auth.current_user_id()
        bp = (await udb.benchmark_profile.find_one({"user_id": uid})) or {} if uid else {}
        ftp = settings_doc.get("ftp") or bp.get("ftp")
        if ftp:
            wkg = bp.get("ftpWkg")
            lines.append(f"FTP: {ftp} W{f' ({wkg} W/kg)' if wkg else ''}{' (auto-estimated)' if settings_doc.get('ftpAuto') else ''}.")
        perf_bits = []
        for key, label, unit in (
            ("fiveMinPower", "5-min power", "W"), ("oneMinPower", "1-min power", "W"),
            ("sprintPower", "sprint power", "W"), ("aerobicEfficiency", "aerobic efficiency", ""),
            ("preferredCadence", "preferred cadence", "rpm"), ("recoveryResponse", "recovery response", ""),
        ):
            v = bp.get(key)
            if v:
                perf_bits.append(f"{label} {v}{unit}")
        if perf_bits:
            lines.append("Benchmark profile: " + ", ".join(perf_bits) + ".")
    except Exception:
        logging.warning("rider context: ftp/benchmark lookup failed")

    # Target event / race goal the rider is training towards, if one is set.
    try:
        ev = await udb.settings.find_one({"id": "event"}) or {}
        if ev.get("event_name") or ev.get("event_date"):
            days_out = ""
            if ev.get("event_date"):
                try:
                    d = (date.fromisoformat(str(ev["event_date"])[:10]) - datetime.now(timezone.utc).date()).days
                    days_out = f", {d} days away" if d >= 0 else ""
                except Exception:
                    pass
            lines.append(f"Target event: {ev.get('event_name') or 'unnamed event'} on {ev.get('event_date') or 'TBD'}{days_out}.")
    except Exception:
        logging.warning("rider context: event lookup failed")

    # All-time season totals (rides, distance, elevation, hours, current streak)
    # so the coach has the big-picture view, not just this plan's progress.
    try:
        all_rides = await udb.ride_history.find().to_list(length=5000)
        if all_rides:
            dist = sum((r.get("distance_km") or 0) for r in all_rides)
            elev = sum((r.get("elevation_m") or 0) for r in all_rides)
            secs = sum((r.get("duration_sec") or 0) for r in all_rides)
            ride_days = {str(r.get("created_at"))[:10] for r in all_rides if r.get("created_at")}
            streak = 0
            dcur = date.today()
            while dcur.isoformat() in ride_days:
                streak += 1
                dcur -= timedelta(days=1)
            lines.append(
                f"Season totals: {len(all_rides)} rides, {round(dist)} km, {int(elev)} m climbed, "
                f"{round(secs / 3600, 1)} h, current streak {streak} day(s)."
            )
    except Exception:
        logging.warning("rider context: season totals lookup failed")

    plan: dict = {}
    try:
        plan_id = await _plan_id_or_active(plan_id)
        plan = await _computed_plan(plan_id)
        phase = plan.get("phase", {}) or {}
        prog = plan.get("progress", {}) or {}
        goals = [g.get("title") for g in (plan.get("goals") or []) if g.get("status") != "complete"]
        if plan.get("title"):
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
        # This week's remaining schedule (from the same computed workouts list
        # the Calendar/Plan screens render), so the coach can reference what's
        # actually coming up rather than only aggregate stats.
        upcoming = [w for w in (plan.get("workouts") or []) if isinstance(w, dict) and not w.get("completed")][:5]
        if upcoming:
            parts = [f"{w.get('date_label') or w.get('footer') or ''} {w.get('title')} ({w.get('zone') or ''} {w.get('duration') or ''})".strip() for w in upcoming]
            lines.append("Upcoming scheduled sessions: " + "; ".join(p for p in parts if p) + ".")
        zbias = plan.get("zone_bias") or {}
        zbias_txt = ", ".join(f"{z} {'+' if v > 0 else ''}{v}%" for z, v in zbias.items() if v)
        if zbias_txt:
            lines.append("Auto-tuned zone targets based on recent execution: " + zbias_txt + ".")
        # The coach's OWN past plan-adaptation decisions (taper-apply, low-
        # compliance auto-ease, FTP updates, start-date resets, etc.) are
        # recorded in adaptation_history but happen silently — they are NOT
        # chat messages, so without this the coach has zero memory of having
        # made them in a NEW conversation (e.g. rider asks "why does this
        # week feel easier?" right after a silent auto-ease). Surface the
        # most recent ones so the coach can reference its own prior reasoning.
        hist = plan.get("adaptation_history") or []
        if hist:
            bits = [f"{h.get('text')} ({(h.get('at') or '')[:10]})" for h in hist[:2] if h.get("text")]
            if bits:
                lines.append("Coach's own recent adaptation notes on this plan: " + "; ".join(bits) + ".")
    except Exception:
        logging.warning("rider context: plan lookup failed")

    try:
        rides = await udb.ride_history.find().sort("created_at", -1).to_list(length=4)
        if rides:
            r0 = rides[0]
            mins = (r0.get("duration_sec") or 0) // 60
            lines.append(
                f"Last ride: {r0.get('workout')} on {r0.get('route') or 'the trainer'}, "
                f"{mins} min, {r0.get('distance_km')} km, avg power {r0.get('avg_power')} W, TSS {r0.get('tss')}."
            )
            if len(rides) > 1:
                more = [
                    f"{r.get('workout') or 'Ride'} ({round((r.get('duration_sec') or 0) / 60)} min, {r.get('tss') or 0} TSS)"
                    for r in rides[1:4]
                ]
                lines.append("Recent rides before that: " + "; ".join(more) + ".")
    except Exception:
        logging.warning("rider context: ride lookup failed")

    try:
        checkin_doc = await udb.daily_checkins.find_one({"id": "latest"})
        if checkin_doc:
            factors = checkin_doc.get("mainFactors") or []
            c = checkin_doc.get("checkin") or {}
            bits = [f"sleep quality {c.get('sleep_quality')}/10" if c.get("sleep_quality") is not None else None,
                    f"HRV {c.get('hrv')}" if c.get("hrv") is not None else None,
                    f"resting HR {c.get('resting_hr')}" if c.get("resting_hr") is not None else None,
                    f"stress {c.get('stress')}/10" if c.get("stress") is not None else None,
                    f"soreness {c.get('soreness')}/10" if c.get("soreness") is not None else None]
            bits = [b for b in bits if b]
            lines.append(
                f"Today's readiness (from the rider's own check-in): {checkin_doc.get('score')}% "
                f"({checkin_doc.get('status')}){'; ' + ', '.join(bits) if bits else ''}"
                f"{'; ' + '; '.join(factors[:2]) if factors else ''}."
            )
            if checkin_doc.get("illness") or checkin_doc.get("injury"):
                lines.append("The rider flagged " + ", ".join(f for f, v in (("illness", checkin_doc.get("illness")), ("injury", checkin_doc.get("injury"))) if v) + " in today's check-in — be extra cautious about pushing intensity.")
        else:
            # No real check-in logged yet today — fall back to the demo
            # wellness snapshot so the coach still has something to reference.
            rd = WELLNESS_DATA.get("readiness", {})
            vit = {v.get("key"): v for v in WELLNESS_DATA.get("vitals", [])}
            sleep = vit.get("sleep", {}).get("value")
            hrv = vit.get("hrv", {}).get("value")
            stress = vit.get("stress", {}).get("value")
            lines.append(
                f"Readiness (demo data — rider hasn't logged a check-in yet): {rd.get('score')}% ({rd.get('status')}); "
                f"sleep {sleep}, HRV {hrv}, stress {stress}."
            )
    except Exception:
        logging.warning("rider context: readiness lookup failed")

    try:
        recent_reasons = []
        skips = await udb.plan_skips.find({"action": "skipped", "reason": {"$nin": ["", None]}}).sort("created_at", -1).to_list(3)
        recent_reasons += [s["reason"] for s in skips]
        adhoc = await udb.scheduled_workouts.find({"status": "skipped", "skip_reason": {"$nin": ["", None]}}).sort("date", -1).to_list(3)
        recent_reasons += [s["skip_reason"] for s in adhoc]
        if recent_reasons:
            lines.append("Reasons the rider recently gave for skipping a session: " + "; ".join(recent_reasons[:3]) + ".")
    except Exception:
        logging.warning("rider context: skip-reason lookup failed")

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
    key = os.environ.get("GEMINI_API_KEY")
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
    can_undo = False
    clarify = ""
    style_override = None
    confirm_prompt = ""

    _ml = (req.message or "").lower()

    # ---- Big-change confirmation gate --------------------------------------
    # Re-anchoring the whole plan or a sizeable FTP jump gets asked to confirm
    # first; small day-to-day tweaks (rest a day, move one session, add a
    # workout) still auto-apply exactly as before.
    _AFFIRM_RE = re.compile(r"^\s*(yes|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|go ahead|do it|please do|sounds good|correct|that'?s right)\b", re.I)
    _DENY_RE = re.compile(r"^\s*(no|nope|nah|don'?t|do not|cancel|never\s*mind|nevermind|stop|actually no|leave it)\b", re.I)
    pending = await udb.coach_pending_confirm.find_one({"id": cid})
    if pending:
        await udb.coach_pending_confirm.delete_one({"id": cid})
        if _AFFIRM_RE.search(_ml):
            try:
                if pending["action"] == "reset_start":
                    plan_id = pending["payload"]["plan_id"]
                    d = datetime.strptime(pending["payload"]["new_start"], "%Y-%m-%d").date()
                    res = await _reset_plan_start(plan_id, d)
                    plan_updated, can_undo, applied_note = True, True, res["note"]
                    await _record_adaptation(plan_id, req.coach_name, res["note"], "Start date reset")
                elif pending["action"] == "set_ftp":
                    res = await _set_ftp(pending["payload"]["value"])
                    plan_updated, applied_note = True, res["note"]
                    await _record_adaptation(await _active_plan_id() or "none", req.coach_name, f"I {res['note']}", "FTP updated")
            except Exception:
                logging.exception("chat pending-confirm apply failed")
                confirm_prompt = "Something went wrong applying that change — let the rider know kindly and offer to try again."
        elif _DENY_RE.search(_ml):
            confirm_prompt = (f"The rider decided NOT to go ahead with the change you'd proposed "
                               f"({pending.get('note')}). Acknowledge warmly in one short sentence — don't apply anything.")
        # else: an unrelated new message — silently drop the stale proposal and fall through to normal parsing below.

    # Reset the plan start date from chat ("restart my plan Monday", "reset the
    # start date to 15 June"). Shifts the whole plan; honours a hard event date.
    if not plan_updated and not confirm_prompt and _START_RE.search(_ml):
        d = _parse_natural_date(req.message)
        if d:
            try:
                plan_id = await _active_plan_id()
                if plan_id and plan_id != "none":
                    note = f"re-anchor your whole plan to start {d.isoformat()}"
                    await udb.coach_pending_confirm.update_one(
                        {"id": cid},
                        {"$set": {"id": cid, "action": "reset_start",
                                  "payload": {"plan_id": plan_id, "new_start": d.isoformat()}, "note": note,
                                  "created_at": now_iso()}},
                        upsert=True,
                    )
                    confirm_prompt = (f"The rider asked to {note}. This shifts every future session — before doing it, "
                                       "ask them to confirm with a quick yes/no in one short friendly sentence. Do NOT say it's done yet.")
            except Exception:
                logging.exception("chat start-date reset failed")

    # Cancel / rest-day a session ("cancel today's ride", "make today a rest day").
    if not plan_updated and not confirm_prompt and _REST_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            if plan_id and plan_id != "none":
                today = datetime.now(timezone.utc).date()
                if "tomorrow" in _ml:
                    tgt = today + timedelta(days=1)
                elif "next" in _ml:
                    tgt = await _next_planned_ride(plan_id, today) or today
                elif "today" in _ml or " it " in f" {_ml} ":
                    tgt = today
                else:
                    tgt = _parse_natural_date(req.message) or await _next_planned_ride(plan_id, today) or today
                label = "cancel" if "cancel" in _ml or "skip" in _ml else "rest"
                res = await _rest_day(plan_id, tgt, label)
                if res.get("ok"):
                    plan_updated = True
                    can_undo = res.get("can_undo", True)
                    applied_note = res["note"]
                    await _record_adaptation(plan_id, req.coach_name, res["note"], "Rest day")
                else:
                    clarify = res.get("note") or "Ask the rider which day they mean."
        except Exception:
            logging.exception("chat rest-day failed")

    # Move a planned session to another day ("move my next workout to tomorrow").
    if not plan_updated and not confirm_prompt and _SESSION_MOVE_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            if plan_id and plan_id != "none":
                today = datetime.now(timezone.utc).date()
                src = today if "today" in _ml else await _next_planned_ride(plan_id, today)
                dst = _parse_target_date(req.message)
                if src and dst and dst != src:
                    res = await _move_session(plan_id, src, dst)
                    if res.get("ok"):
                        plan_updated = True
                        can_undo = res.get("can_undo", True)
                        applied_note = res["note"]
                        await _record_adaptation(plan_id, req.coach_name, res["note"], "Session moved")
                    else:
                        clarify = res.get("note") or ""
                elif src and not dst:
                    clarify = "The rider wants to move a session but didn't give a clear day — ask which day to move it to."
        except Exception:
            logging.exception("chat session-move failed")

    # Schedule a workout on a day ("add a recovery ride Thursday").
    if not plan_updated and not confirm_prompt and _SCHEDULE_RE.search(_ml) and "goal" not in _ml:
        try:
            plan_id = await _active_plan_id()
            today = datetime.now(timezone.utc).date()
            when = _parse_natural_date(req.message)
            if not when:
                clarify = "The rider wants to add a workout but didn't say which day — ask which day to schedule it."
            else:
                kind = ("recovery" if "recovery" in _ml else "endurance" if "endurance" in _ml
                        else "threshold" if "threshold" in _ml else "intervals" if "interval" in _ml
                        else "tempo" if "tempo" in _ml else "climb" if "climb" in _ml else "endurance")
                titles = {"recovery": ("Recovery Spin", "30 min", "Z1"), "endurance": ("Endurance Ride", "1h 00m", "Z2"),
                          "threshold": ("Threshold Effort", "1h 00m", "Z4"), "intervals": ("VO2 Intervals", "50 min", "Z5"),
                          "tempo": ("Tempo Ride", "1h 00m", "Z3"), "climb": ("Climbing Repeats", "1h 10m", "Z4")}
                nm, dur, zone = titles[kind]
                await udb.scheduled_workouts.insert_one({
                    "id": uuid.uuid4().hex, "type": "cycling", "workout_id": "", "title": nm,
                    "duration": dur, "tss": "", "zone": zone, "color": "blue",
                    "date": when.isoformat(), "status": "scheduled", "created_by": req.coach_name,
                })
                plan_updated = True
                applied_note = f"added a {nm} to {when.isoformat()}"
                await _record_adaptation(plan_id or "none", req.coach_name, f"I {applied_note}.", "Workout scheduled")
        except Exception:
            logging.exception("chat schedule-workout failed")

    # Undo the last plan change ("undo that").
    if not plan_updated and not confirm_prompt and _UNDO_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            snap = await udb.plan_undo.find_one({"id": plan_id})
            if snap:
                from routes.plan import undo_reschedule
                from models import StartDateRequest
                res = await undo_reschedule(StartDateRequest(start_date="", plan_id=""))
                plan_updated = True
                applied_note = res.get("note") or "reverted your last plan change"
            else:
                clarify = "There's no recent plan change to undo — let the rider know kindly."
        except Exception:
            logging.exception("chat undo failed")

    # Set FTP or schedule an FTP re-test.
    if not plan_updated and not clarify and not confirm_prompt and _FTP_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            num = re.search(r"(\d{2,3})", _ml)
            wants_test = any(k in _ml for k in ("test", "re-test", "retest", "re test"))
            if num and not wants_test and any(k in _ml for k in ("set", "change", "update", "is ", "to ", "my ftp", "=")):
                new_v = int(num.group(1))
                cur_settings = await udb.settings.find_one({"id": "app"}) or {}
                old_v = int(cur_settings.get("ftp") or 0)
                big_jump = (old_v <= 0) or (abs(new_v - old_v) / old_v >= 0.08)
                if big_jump:
                    note = f"change your FTP from {old_v or 'unset'} to {new_v} W (your zones recalculate around it)"
                    await udb.coach_pending_confirm.update_one(
                        {"id": cid},
                        {"$set": {"id": cid, "action": "set_ftp", "payload": {"value": new_v}, "note": note,
                                  "created_at": now_iso()}},
                        upsert=True,
                    )
                    confirm_prompt = (f"The rider asked to {note}. That's a meaningful jump — before doing it, "
                                       "ask them to confirm with a quick yes/no in one short friendly sentence. Do NOT say it's done yet.")
                else:
                    res = await _set_ftp(new_v)
                    if res.get("ok"):
                        plan_updated = True
                        applied_note = res["note"]
                        await _record_adaptation(plan_id or "none", req.coach_name, f"I {res['note']}", "FTP updated")
            elif wants_test:
                today = datetime.now(timezone.utc).date()
                when = _parse_natural_date(req.message) or (today + timedelta(days=1))
                await udb.scheduled_workouts.insert_one({
                    "id": uuid.uuid4().hex, "type": "cycling", "workout_id": "", "title": "FTP Test (20 min)",
                    "duration": "1h 00m", "tss": "", "zone": "Z4", "color": "red",
                    "date": when.isoformat(), "status": "scheduled", "created_by": req.coach_name,
                })
                plan_updated = True
                applied_note = f"scheduled an FTP re-test for {when.isoformat()} (20-min effort). Warm up well and go steady-hard."
                await _record_adaptation(plan_id or "none", req.coach_name, f"I {applied_note}", "FTP re-test")
            else:
                clarify = "The rider mentioned FTP but didn't give a number or ask for a test — ask if they want to set a value or schedule a re-test."
        except Exception:
            logging.exception("chat ftp intent failed")

    # Set weekly training days ("make it 4 days a week").
    if not plan_updated and not clarify and not confirm_prompt and _DAYS_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            mm = _DAYS_RE.search(_ml)
            n = mm.group(1) or mm.group(4)
            if plan_id and plan_id != "none" and n:
                res = await _set_weekly_days(plan_id, int(n))
                if res.get("ok"):
                    plan_updated = True
                    applied_note = res["note"]
                    await _record_adaptation(plan_id, req.coach_name, f"I {res['note']}", "Weekly volume")
        except Exception:
            logging.exception("chat weekly-days intent failed")

    # Add a training goal.
    if not plan_updated and not clarify and not confirm_prompt and _GOAL_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            m = re.split(r"\b(goal is|goal:|be able to|add (?:a |another )?goal(?:\s+of|\s+to)?|new goal(?:\s+of|\s+to)?)\b", req.message, maxsplit=1, flags=re.I)
            goal_txt = m[-1].strip(" :.-\u2013") if len(m) > 1 else ""
            if plan_id and plan_id != "none" and len(goal_txt) >= 3:
                res = await _add_goal(plan_id, goal_txt)
                if res.get("ok"):
                    plan_updated = True
                    applied_note = res["note"]
                    await _record_adaptation(plan_id, req.coach_name, f"I {res['note']}", "Goal added")
            else:
                clarify = "The rider wants to set a goal but it's unclear — ask them to state the goal in a few words."
        except Exception:
            logging.exception("chat goal intent failed")

    # Pause / resume the whole plan.
    if not plan_updated and not clarify and not confirm_prompt and _PAUSE_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            wm = re.search(r"(\d+)\s*week", _ml)
            weeks = int(wm.group(1)) if wm else 1
            if plan_id and plan_id != "none":
                res = await _pause_plan(plan_id, weeks)
                if res.get("ok"):
                    plan_updated = True
                    can_undo = res.get("can_undo", True)
                    applied_note = res["note"]
                    await _record_adaptation(plan_id, req.coach_name, f"I {res['note']}", "Plan paused")
                else:
                    clarify = res.get("note") or ""
        except Exception:
            logging.exception("chat pause intent failed")

    if not plan_updated and not clarify and not confirm_prompt and _RESUME_RE.search(_ml):
        try:
            plan_id = await _active_plan_id()
            if plan_id and plan_id != "none":
                res = await _resume_plan(plan_id)
                if res.get("ok"):
                    plan_updated = True
                    can_undo = res.get("can_undo", True)
                    applied_note = res["note"]
                    await _record_adaptation(plan_id, req.coach_name, f"I {res['note']}", "Plan resumed")
                else:
                    clarify = res.get("note") or ""
        except Exception:
            logging.exception("chat resume intent failed")

    # Switch coaching tone ("be tougher on me", "keep it gentler").
    if not plan_updated and not clarify and not confirm_prompt and _STYLE_RE.search(_ml):
        st = _map_style(_ml)
        if st:
            style_override = st
            plan_updated = True
            labels = {"performance": "tougher, performance-focused", "calm": "gentler and calmer", "essential": "simple and minimal", "balanced": "balanced"}
            applied_note = f"switched my coaching tone to {labels.get(st, st)} from now on."



    # Missed workout: skip or reschedule the most recent missed session.
    if not plan_updated and not clarify and not confirm_prompt and _MISSED_RE.search(_ml):
        try:
            today = datetime.now(timezone.utc).date()
            sched = await udb.scheduled_workouts.find().to_list(500)
            missed = sorted(
                [w for w in sched if str(w.get("date", "")) < today.isoformat()
                 and w.get("status") not in ("completed", "skipped", "rescheduled")],
                key=lambda w: str(w.get("date", "")), reverse=True,
            )
            if missed:
                entry = missed[0]
                if "skip" in _ml:
                    await udb.scheduled_workouts.update_one({"id": entry["id"]}, {"$set": {"status": "skipped"}})
                    applied_note = f"marked your missed '{entry.get('title') or 'ride'}' as skipped — no make-up, the plan continues"
                else:
                    d2 = _parse_natural_date(req.message)
                    new_date = d2.isoformat() if d2 else _next_free_day(sched, today)
                    await udb.scheduled_workouts.update_one(
                        {"id": entry["id"]},
                        {"$set": {"date": new_date, "status": "scheduled", "rescheduled_from": entry.get("date")}},
                    )
                    applied_note = f"rescheduled your missed '{entry.get('title') or 'ride'}' to {new_date} and shifted the plan to suit"
                plan_updated = True
                _pid = await _active_plan_id()
                if _pid:
                    await _record_adaptation(_pid, req.coach_name, f"At your request, I {applied_note}.", "Missed workout")
        except Exception:
            logging.exception("chat missed-resolve failed")

    # Companion plan editing: if the rider asks for a plan change, turn it into
    # safe structured edits and apply them so the coach can confirm in-reply.
    # `edit_intent_unfulfilled` tracks the case that caused a real bug: the
    # rider's message reads like a plan-edit request, has_plan_edit_intent()
    # matched, but nothing was actually applied (no structured "weeks" plan,
    # or the extractor couldn't map it to a concrete op) — WITHOUT this flag,
    # the LLM reply below had zero signal that no edit happened and would
    # cheerfully confirm a change that never touched the rider's plan.
    edit_intent_unfulfilled = False
    if not plan_updated and not clarify and not confirm_prompt and companion_plan.has_plan_edit_intent(req.message):
        edit_intent_unfulfilled = True
        try:
            plan_id = await _active_plan_id()
            # Read the RIDER'S OWN snapshot (never the shared admin template) —
            # this is both what the rider actually sees and what the edit below
            # will be applied to, so the LLM's ops target real current state.
            plan_def = await _rider_plan_def(plan_id)
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
                    edit_intent_unfulfilled = False
                    applied_note = summary or ("; ".join(applied))
                    await _record_adaptation(
                        plan_id, req.coach_name,
                        f"At your request, I {applied_note}.", "At your request",
                    )
        except Exception:
            logging.exception("chat plan-edit failed")

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
    ) + (
        f"IMPORTANT: {confirm_prompt}\n\n" if (confirm_prompt and not applied_note) else ""
    ) + (
        f"IMPORTANT: {clarify} Do not claim anything was changed — ask one short, friendly question.\n\n"
        if (clarify and not applied_note and not confirm_prompt) else ""
    ) + (
        "IMPORTANT: The rider is asking for a plan change, but NO change was actually made to "
        "their plan this turn (their current plan can't be edited this way right now, or the "
        "request wasn't specific enough to safely apply). Do NOT say or imply that you changed, "
        "shortened, adjusted, or updated their plan — that would be false. Instead, be honest and "
        "warm: acknowledge what they're asking for, and either ask one short clarifying question "
        "(e.g. which specific ride/day), or explain you can't directly edit this plan yet and "
        "suggest a simple workaround they can do themselves.\n\n"
        if (edit_intent_unfulfilled and not applied_note and not confirm_prompt and not clarify) else ""
    ) + f"Rider: {req.message.strip()}\n{req.coach_name}:"

    try:
        from services.gemini_shim import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=cid,
            system_message=coach_chat_system(req.coach_name, req.coach_gender, style_override or req.coaching_style),
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
            "plan_updated": plan_updated, "plan_change": applied_note, "can_undo": can_undo,
            "awaiting_confirm": bool(confirm_prompt and not applied_note),
            "coaching_style": style_override}


@router.get("/coach/weekly-note")
async def coach_weekly_note(coach_name: str = "Alberto", coach_gender: str = "male", refresh: bool = False):
    """The coach's short spoken recap of the rider's week + one focus for next
    week. Cached per ISO-week and coach so it's stable and cheap to revisit."""
    key = os.environ.get("GEMINI_API_KEY")
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

    # Pull the longer-term adaptation signal (EF/decoupling/HRR/W'/TSB — the
    # metrics engine already computes) so the recap can speak to *trends*, not
    # just this week's raw volume, when that's the more useful story.
    adapt_txt = ""
    highlight: Optional[dict] = None
    try:
        from routes.analysis import adaptation as _adaptation_fn
        adapt = await _adaptation_fn(weeks=8)
    except Exception:
        adapt = {}
    if adapt.get("has_data"):
        callouts = adapt.get("callouts") or []
        load = adapt.get("load") or {}
        confirm_items = (adapt.get("coach_actions") or {}).get("confirm") or []
        parts = []
        if callouts:
            parts.append("Longer-term trend (last 8 weeks): " + " ".join(c["text"] for c in callouts[:2]))
            highlight = {"kind": callouts[0]["kind"], "good": callouts[0]["good"]}
        if load.get("ctl") is not None:
            parts.append(
                f"Current Fitness (CTL) {load.get('ctl')}, Form (TSB) {load.get('tsb')} "
                f"({load.get('form_state')}), 7-day ramp {load.get('ramp_rate')}/wk."
            )
        if confirm_items:
            parts.append("Also worth a gentle mention (don't decide for them, just flag it): " + confirm_items[0]["text"])
        if parts:
            adapt_txt = (
                "\n" + " ".join(parts) + " Use whichever of this longer-term trend or the weekly volume numbers "
                "makes for the most specific, useful note and focus — you don't need to mention everything."
            )

    rider = await _rider_line()
    workouts_txt = ("; ".join(this_wk["names"][:6]) or "no named workouts")
    prompt = (
        f"{rider}\n"
        f"This is the rider's WEEKLY recap. This week: {this_wk['rides']} rides, {this_wk['tss']} TSS, "
        f"{this_wk['hours']} h, {this_wk['distance_km']} km (sessions: {workouts_txt}). "
        f"Last week for comparison: {last_wk['rides']} rides, {last_wk['tss']} TSS, {last_wk['hours']} h.{adapt_txt}\n"
        "Write a short spoken weekly recap for the rider. Reply with ONLY valid minified JSON (no markdown, no code fences) "
        'of the shape {"note": string, "focus": string}. '
        "\"note\": 2 warm sentences recapping the week (praise the effort, reference whichever is more meaningful — this "
        "week's numbers vs last week, or the longer-term trend if it's the more useful story). "
        "\"focus\": ONE short, concrete focus for next week (a single actionable sentence), informed by the same signals. "
        f"Speak as {coach_name}, first person, no emojis, no quotation marks inside the strings."
    )

    try:
        from services.gemini_shim import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{coach_name.lower()}-weekly-note",
            system_message=coach_system(coach_name, coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        raw = (reply or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
        data_json = extract_json_object(raw)
        note = str(data_json.get("note", "")).strip().strip('"')
        focus = str(data_json.get("focus", "")).strip().strip('"')
        if not note:
            raise ValueError("empty note")
        data = {"note": note, "focus": focus, "has_activity": this_wk["rides"] > 0, "highlight": highlight}
        try:
            await udb.settings.update_one(
                {"id": "weekly_note"}, {"$set": {ckey: {"week": wk, "data": data}}}, upsert=True)
        except Exception:
            logging.warning("weekly note cache write failed")
        return {**data, "cached": False}
    except Exception as e:
        logging.exception("coach_weekly_note failed")
        raise HTTPException(status_code=502, detail=f"Weekly note generation failed: {e}")


@router.get("/coach/taper-note")
async def coach_taper_note(coach_name: str = "Alberto", coach_gender: str = "male", refresh: bool = False):
    """When the rider's projected Form won't be fresh for their event, the coach
    suggests how to ease the final week to arrive sharp. Reads the saved event +
    the rider's current fitness/form. Cached per event+coach."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Pull the projected form-target from the analysis route (same math).
    from routes.analysis import form_target as _form_target
    ft = await _form_target()
    if not ft.get("has_event") or ft.get("past"):
        return {"has_event": False}
    if ft.get("fresh"):
        return {"has_event": True, "fresh": True, "days_out": ft.get("days_out")}

    ckey = f"taper_{coach_name.lower()}"
    stamp = f"{ft.get('event_date')}|{ft.get('projected_form')}"
    cache = await udb.settings.find_one({"id": "taper_note"}) or {}
    cached = cache.get(ckey)
    if not refresh and isinstance(cached, dict) and cached.get("stamp") == stamp:
        return {**cached.get("data", {}), "cached": True}

    rider = await _rider_line()
    prompt = (
        f"{rider}\n"
        f"The rider is targeting '{ft.get('event_name') or 'their event'}' in {ft.get('days_out')} days. "
        f"Right now their fitness (CTL) is {ft.get('current_fitness')} and form (TSB) is {ft.get('current_form')}. "
        f"If they keep their recent training rhythm, their projected form on event morning is {ft.get('projected_form')} "
        f"(a rider wants roughly +5 to +15 to feel fresh). This is not fresh enough.\n"
        "As their coach, suggest how to TAPER the final week so they arrive sharp. Reply with ONLY valid minified JSON "
        '(no markdown) of the shape {"note": string, "actions": [string, string, string]}. '
        "\"note\": 2 warm sentences explaining the taper plan and why it lifts their form. "
        "\"actions\": 2-3 short, concrete steps for the final 7-10 days (e.g. cut volume ~40%, keep some intensity short and sharp, add rest days). "
        f"Speak as {coach_name}, first person, no emojis, no quotation marks inside strings."
    )
    try:
        from services.gemini_shim import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{coach_name.lower()}-taper",
            system_message=coach_system(coach_name, coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        raw = (reply or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
        dj = extract_json_object(raw)
        note = str(dj.get("note", "")).strip().strip('"')
        actions = [str(a).strip() for a in (dj.get("actions") or []) if str(a).strip()][:3]
        if not note:
            raise ValueError("empty taper note")
        data = {"has_event": True, "fresh": False, "days_out": ft.get("days_out"),
                "projected_form": ft.get("projected_form"), "note": note, "actions": actions}
        try:
            await udb.settings.update_one(
                {"id": "taper_note"}, {"$set": {ckey: {"stamp": stamp, "data": data}}}, upsert=True)
        except Exception:
            logging.warning("taper note cache write failed")
        return {**data, "cached": False}
    except Exception as e:
        logging.exception("coach_taper_note failed")
        raise HTTPException(status_code=502, detail=f"Taper note generation failed: {e}")


@router.get("/coach/milestone-note")
async def coach_milestone_note(coach_name: str = "Alberto", coach_gender: str = "male", refresh: bool = False):
    """A short spoken congratulations from the coach when the rider just crossed a
    big lifetime milestone. Cached per milestone+coach."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    from routes.analysis import milestones as _ms
    ms = await _ms()
    rec = ms.get("recent")
    if not rec:
        return {"has_milestone": False}

    ckey = f"note_{coach_name.lower()}"
    stamp = f"{rec['kind']}-{rec['value']}"
    cache = await udb.settings.find_one({"id": "milestone_note"}) or {}
    cached = cache.get(ckey)
    if not refresh and isinstance(cached, dict) and cached.get("stamp") == stamp:
        return {**cached.get("data", {}), "cached": True}

    rider = await _rider_line()
    prompt = (
        f"{rider}\n"
        f"The rider just hit a big lifetime milestone: {rec['label']} ({rec['blurb']}). "
        "Congratulate them warmly. Reply with ONLY valid minified JSON (no markdown) of the shape "
        '{"note": string}. "note": 2 upbeat sentences celebrating this milestone and encouraging the next one. '
        f"Speak as {coach_name}, first person, no emojis, no quotation marks inside the string."
    )
    try:
        from services.gemini_shim import LlmChat, UserMessage
        chat = LlmChat(api_key=key, session_id=f"{coach_name.lower()}-milestone",
                       system_message=coach_system(coach_name, coach_gender)).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        raw = (reply or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
        dj = extract_json_object(raw)
        note = str(dj.get("note", "")).strip().strip('"')
        if not note:
            raise ValueError("empty milestone note")
        data = {"has_milestone": True, "label": rec["label"], "note": note}
        try:
            await udb.settings.update_one({"id": "milestone_note"}, {"$set": {ckey: {"stamp": stamp, "data": data}}}, upsert=True)
        except Exception:
            logging.warning("milestone note cache write failed")
        return {**data, "cached": False}
    except Exception as e:
        logging.exception("coach_milestone_note failed")
        raise HTTPException(status_code=502, detail=f"Milestone note generation failed: {e}")


@router.post("/coach/taper-apply")
async def coach_taper_apply(body: dict):
    """Apply the coach's taper by easing the plan week that leads into the event.
    Reuses the same auto-ease engine the adaptive plan uses. Idempotent per week."""
    plan_id = await _active_plan_id()
    if not plan_id:
        return {"applied": False, "reason": "no_plan"}
    # RIDER'S OWN snapshot — never the shared admin template — so the "is
    # there anything left to ease" check matches what the rider actually has.
    plan_def = await _rider_plan_def(plan_id)
    if not (plan_def and plan_def.get("weeks")):
        return {"applied": False, "reason": "unstructured"}

    ev = await udb.settings.find_one({"id": "event"}) or {}
    ed = ev.get("event_date")
    days_out = None
    if ed:
        try:
            days_out = (date.fromisoformat(str(ed)[:10]) - datetime.now(timezone.utc).date()).days
        except Exception:
            days_out = None

    state = await udb.plan_state.find_one({"id": plan_id}) or {}
    cur = int(state.get("current_week", 1))
    last_week = plan_def.get("duration_weeks") or len(plan_def.get("weeks", []))
    weeks_out = max(1, (days_out + 6) // 7) if (days_out and days_out > 0) else 1
    target = max(cur, min(last_week, cur + weeks_out - 1))

    eased = set(state.get("eased_weeks", []))
    if target in eased:
        return {"applied": True, "week": target, "already": True,
                "summary": f"Week {target} is already eased for your taper."}

    ops, summary = companion_plan.auto_ease_ops(plan_def, target)
    applied = await _apply_companion_ops(
        plan_id, ops, "taper", f"Taper for {ev.get('event_name') or 'your event'} — easing week {target}")
    if not applied:
        return {"applied": False, "reason": "no_change", "week": target}
    eased.add(target)
    await udb.plan_state.update_one({"id": plan_id}, {"$set": {"eased_weeks": list(eased)}}, upsert=True)
    coach_name = body.get("coach_name", "Alberto")
    await _record_adaptation(
        plan_id, coach_name,
        f"I've eased week {target} to taper you for {ev.get('event_name') or 'your event'} so you arrive with fresh legs.",
        "Taper applied")
    return {"applied": True, "week": target, "summary": summary}


async def _refresh_adaptation_after_ride(req: "CoachDebriefRequest", plan_id: str = ""):
    """Regenerate and cache the coach's plan-adaptation note after a completed
    ride, so the Training Plan reflects the latest session. Best-effort."""
    try:
        plan_id = await _plan_id_or_active(plan_id)
        if not plan_id:
            return
        plan = await _computed_plan(plan_id)
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
            # RIDER'S OWN snapshot — never the shared admin template.
            plan_def = await _rider_plan_def(plan_id)
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
        # `plan` is already the fully computed plan (see _computed_plan above),
        # so it works uniformly for structured, custom, and legacy plans.
        try:
            detail = await _generate_adaptation_detail(plan, req.coach_name, req.coach_gender)
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
    key = os.environ.get("GEMINI_API_KEY")
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

    from services.gemini_shim import LlmChat, UserMessage
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
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Resolve the rider's real active plan (never the legacy build-and-climb default).
    req.plan_id = await _plan_id_or_active(req.plan_id)
    if not req.plan_id:
        raise HTTPException(status_code=400, detail="No active training plan to adapt")
    plan = await _computed_plan(req.plan_id)
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
    key = os.environ.get("GEMINI_API_KEY")
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

    from services.gemini_shim import LlmChat, UserMessage
    chat = LlmChat(
        api_key=key,
        session_id=f"{coach_name.lower()}-adaptation-detail",
        system_message=coach_system(coach_name, coach_gender),
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=prompt))
    raw = (reply or "").strip()
    data = extract_json_object(raw)
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
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    req.plan_id = await _plan_id_or_active(req.plan_id)
    if not req.plan_id:
        raise HTTPException(status_code=400, detail="No active training plan to adapt")
    plan = await _computed_plan(req.plan_id)
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



# ===================== Coach-created custom training plans =====================
# The coach (LLM) designs a brand-new multi-week plan from the rider's goal,
# weeks and days/week (grounded in their real level/data). The rider reviews a
# preview, then Accepts to make it their active plan — which automatically
# populates the Training Plan screen and the Calendar via the structured engine.

_DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_SUPP_META = {
    "strength": {"duration": "20 min"}, "mobility": {"duration": "15 min"},
    "recovery": {"duration": "10 min"}, "balance": {"duration": "15 min"},
}


def _norm_kind(k: str) -> str:
    k = (k or "").strip().lower()
    if k in ("cycling", "ride", "bike"):
        return "cycling"
    if k in ("strength", "fb50", "gym"):
        return "strength"
    if k in ("mobility", "stretch", "yoga"):
        return "mobility"
    if k in ("recovery", "wellness"):
        return "recovery"
    if k in ("balance",):
        return "balance"
    return "rest"


def _normalize_created_plan(raw: dict, weeks: int, days_per_week: int) -> dict:
    """Coerce the LLM's plan JSON into a safe, complete preview structure:
    exactly `weeks` weeks × 7 named days, with cycling/strength/rest kinds."""
    title = str(raw.get("title") or "Your Custom Plan").strip()[:60]
    description = str(raw.get("description") or "").strip()[:400]
    goals = []
    for g in (raw.get("goals") or [])[:4]:
        if isinstance(g, dict) and g.get("title"):
            goals.append({"id": uuid.uuid4().hex[:8], "title": str(g["title"]).strip()[:60],
                          "description": str(g.get("description", "")).strip()[:120], "status": "incomplete"})
    out_weeks = []
    raw_weeks = raw.get("weeks") or []
    for wi in range(weeks):
        rw = raw_weeks[wi] if wi < len(raw_weeks) and isinstance(raw_weeks[wi], dict) else {}
        focus = str(rw.get("focus") or f"Week {wi + 1}").strip()[:80]
        rdays = rw.get("days") or []
        days = []
        for di in range(7):
            rd = rdays[di] if di < len(rdays) and isinstance(rdays[di], dict) else {}
            kind = _norm_kind(rd.get("kind"))
            dur_min = rd.get("duration_min")
            try:
                dur_min = int(dur_min)
            except Exception:
                dur_min = 0
            day = {"day_name": _DAY_NAMES[di], "kind": kind,
                   "title": str(rd.get("title") or "").strip()[:50]}
            if kind == "cycling":
                if dur_min <= 0:
                    dur_min = 60
                tss = rd.get("tss")
                try:
                    tss = int(tss)
                except Exception:
                    tss = round(dur_min * 1.0)
                day["title"] = day["title"] or "Ride"
                day["zone"] = str(rd.get("zone") or "Z2").strip()[:4]
                day["duration"] = _fmt_dur(dur_min)
                day["duration_min"] = dur_min
                day["tss"] = max(0, tss)
            elif kind == "rest":
                day["title"] = day["title"] or "Rest Day"
            else:
                day["title"] = day["title"] or {"strength": "Strength", "mobility": "Mobility Flow",
                                                 "recovery": "Recovery Session", "balance": "Balance Work"}[kind]
                day["duration"] = _SUPP_META.get(kind, {}).get("duration", "15 min")
            days.append(day)
        out_weeks.append({"focus": focus, "days": days})
    return {"title": title, "description": description, "goals": goals,
            "weeks_count": weeks, "days_per_week": days_per_week, "weeks": out_weeks}


@router.post("/coach/create-plan")
async def coach_create_plan(body: dict):
    """Ask the coach (LLM) to design a brand-new custom training plan. Returns a
    PREVIEW only — nothing is persisted until the rider accepts."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    coach_name = str(body.get("coach_name") or "Alberto")
    coach_gender = str(body.get("coach_gender") or "male")
    goal = str(body.get("goal") or "get fitter and ride stronger").strip()[:200]
    event_date = str(body.get("event_date") or "").strip()[:10] or None
    try:
        weeks = max(2, min(16, int(body.get("weeks") or 8)))
    except Exception:
        weeks = 8
    try:
        days_per_week = max(2, min(6, int(body.get("days_per_week") or 4)))
    except Exception:
        days_per_week = 4

    rider = await _rider_line()
    event_line = ""
    if event_date:
        event_line = (f"The rider is training for an event/race on {event_date}. Build the plan to PEAK for that date — "
                      "make the final week a lighter taper week so they arrive fresh and strong on the day. ")
    prompt = (
        f"{rider}\n"
        f"Design a personalised {weeks}-week cycling training plan for this rider. "
        f"Their goal: \"{goal}\". They can train about {days_per_week} days per week. "
        f"{event_line}\n"
        "Each week has exactly 7 days (Mon-Sun). Include per week: "
        f"{days_per_week} CYCLING days (progressive, varied — endurance/tempo/threshold/vo2/recovery as appropriate), "
        "1-2 STRENGTH or MOBILITY days (short home sessions), and REST days for the remainder. "
        "Progress the load sensibly week to week and include a lighter/recovery week roughly every 4th week.\n"
        "Reply with ONLY valid minified JSON (no markdown, no code fences) of the shape: "
        '{"title": string, "description": string, "goals": [{"title": string, "description": string}], '
        '"weeks": [{"focus": string, "days": [{"day": "Mon", "kind": "cycling|strength|mobility|recovery|rest", '
        '"title": string, "zone": "Z2", "duration_min": number, "tss": number}]}]}. '
        "For non-cycling days omit zone/tss. Keep titles short (<= 4 words). "
        f"'title' names the plan for the goal. 'description' is 1-2 sentences. Give exactly {weeks} weeks."
    )
    try:
        from services.gemini_shim import LlmChat, UserMessage
        chat = LlmChat(api_key=key, session_id=f"{coach_name.lower()}-create-plan",
                       system_message=coach_system(coach_name, coach_gender)).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        rawtxt = (reply or "").strip()
        if rawtxt.startswith("```"):
            rawtxt = rawtxt.strip("`")
        data = extract_json_object(rawtxt)
        plan = _normalize_created_plan(data, weeks, days_per_week)
        plan["created_by"] = coach_name
        if event_date:
            plan["event_date"] = event_date
        return {"plan": plan}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("coach_create_plan failed")
        raise HTTPException(status_code=502, detail=f"Plan generation failed: {e}")


def _build_custom_definition(plan: dict, plan_id: str, coach_name: str) -> dict:
    """Convert an accepted preview plan into the structured `definition` the plan
    engine renders (weeks[].days[] with dated weeks starting next Monday)."""
    weeks_in = plan.get("weeks") or []
    n_weeks = len(weeks_in)
    today = date.today()
    dow = today.weekday()
    default_start = today if dow == 0 else today + timedelta(days=7 - dow)
    # If the rider is peaking for an event, back-schedule so the final week
    # lands on the event's week; otherwise start the coming Monday.
    next_mon = default_start
    ev = None
    event_iso = plan.get("event_date")
    if event_iso:
        try:
            ev = date.fromisoformat(str(event_iso)[:10])
            ev_monday = ev - timedelta(days=ev.weekday())
            aligned = ev_monday - timedelta(days=7 * (n_weeks - 1))
            next_mon = aligned if aligned >= default_start else default_start
        except Exception:
            ev = None
    def_weeks = []
    for wi, wk in enumerate(weeks_in):
        wnum = wi + 1
        wk_start = next_mon + timedelta(days=7 * wi)
        phase_num = (wi // 4) + 1
        days = []
        for di, d in enumerate(wk.get("days", [])):
            kind = d.get("kind", "rest")
            day = {"day_name": _DAY_NAMES[di % 7], "kind": kind, "title": d.get("title", "")}
            if kind == "cycling":
                day["workout_id"] = f"{plan_id}-ride-w{wnum}-d{di}"
                day["zone"] = d.get("zone", "Z2")
                day["duration"] = d.get("duration", "1h 00m")
                day["tss"] = int(d.get("tss") or 0)
            elif kind != "rest":
                day["duration"] = d.get("duration", "15 min")
            days.append(day)
        def_weeks.append({
            "number": wnum, "title": wk.get("focus", f"Week {wnum}"),
            "objective": wk.get("focus", ""), "start_date": wk_start.isoformat(),
            "phase": phase_num, "phase_name": f"Block {phase_num}",
            "phase_weeks": f"Weeks {(phase_num - 1) * 4 + 1}\u2013{min(n_weeks, phase_num * 4)}",
            "days": days,
        })
    phases = []
    for pn in range(1, (n_weeks - 1) // 4 + 2):
        a = (pn - 1) * 4 + 1
        b = min(n_weeks, pn * 4)
        phases.append({"number": pn, "name": f"Block {pn}", "objective": "",
                       "weeks_label": f"Weeks {a}\u2013{b}"})
    return {
        "id": plan_id, "title": plan.get("title", "Custom Plan"),
        "description": plan.get("description", ""),
        "duration_weeks": n_weeks, "average_days_per_week": plan.get("days_per_week", 4),
        "duration_label": f"{n_weeks} Weeks",
        "average_label": f"{plan.get('days_per_week', 4)} Days/Week",
        "level": "Custom", "created_by": coach_name,
        "goals": plan.get("goals", []), "phases": phases, "weeks": def_weeks,
        "event_date": ev.isoformat() if ev else None,
        "custom": True,
    }


@router.post("/coach/create-plan/accept")
async def coach_accept_plan(body: dict):
    """Persist an accepted coach-created plan as the rider's active plan. This
    makes it show on the Training Plan screen and fills the Calendar (structured)."""
    plan = body.get("plan") or {}
    if not plan.get("weeks"):
        raise HTTPException(status_code=400, detail="No plan to accept")
    coach_name = str(body.get("coach_name") or plan.get("created_by") or "Alberto")
    plan_id = f"custom-{uuid.uuid4().hex[:10]}"
    definition = _build_custom_definition(plan, plan_id, coach_name)

    # Store the rider's own plan definition + set it active, reset progress.
    await udb.training_plans.update_one(
        {"id": plan_id},
        {"$set": {"id": plan_id, "definition": definition, "goals": definition["goals"],
                  "created_by": coach_name, "custom": True, "snapshot_at": now_iso()}},
        upsert=True,
    )
    await udb.plan_state.update_one(
        {"id": plan_id}, {"$set": {"current_week": 1, "updated_at": now_iso()}}, upsert=True)
    await udb.rider_profile.update_one(
        {"id": "me"}, {"$set": {"id": "me", "assigned_plan_id": plan_id}}, upsert=True)
    try:
        await auth._db.users.update_one(
            {"user_id": auth.current_user_id()},
            {"$set": {"onboarded": True, "assigned_plan_id": plan_id}})
    except Exception:
        logging.warning("accept plan: user assignment update failed")

    # Seed the coach's first adaptation note for the new plan.
    try:
        await _record_adaptation(
            plan_id, coach_name,
            f"I've built your {definition['duration_weeks']}-week plan around your goal. "
            "We'll adapt it as you ride — let's get started.", "Plan created")
    except Exception:
        pass
    return {"ok": True, "plan_id": plan_id, "title": definition["title"]}


# ===================== Swap a session (easier / harder / change focus) =========
import re as _re

_SWAP_MODE = {
    "easier": "Make this session EASIER — lower intensity and/or shorter, an active-recovery or endurance feel.",
    "harder": "Make this session HARDER — more intensity and/or longer, a bigger training stimulus.",
    "focus": "Change the FOCUS of this session to something different but complementary (e.g. climbing/tempo/vo2/recovery), similar overall load.",
}


def _parse_wid(wid: str):
    """Extract (week, day_index) from a custom workout_id like custom-xxx-ride-w3-d2."""
    m = _re.search(r"-ride-w(\d+)-d(\d+)$", str(wid or ""))
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


@router.post("/coach/swap-session")
async def coach_swap_session(body: dict):
    """Ask the coach for an alternative cycling session (easier/harder/change
    focus). If a custom plan_id + week + day_index are given, persist the swap.
    If `override` (explicit session) is supplied, set it directly (used by Undo)."""
    day = body.get("day") or {}
    mode = str(body.get("mode") or "easier").lower()
    if mode not in _SWAP_MODE:
        mode = "easier"
    coach_name = str(body.get("coach_name") or "Alberto")
    coach_gender = str(body.get("coach_gender") or "male")
    goal = str(body.get("goal") or "").strip()[:160]
    focus_hint = str(body.get("focus_hint") or "").strip()[:80]
    plan_id = body.get("plan_id")
    week = body.get("week")
    day_index = body.get("day_index")
    override = body.get("override") or None

    if override and (override.get("title") or override.get("zone") or override.get("duration_min")):
        # Explicit set (e.g. Undo restoring the original session) — no LLM.
        data = {"title": override.get("title"), "zone": override.get("zone"),
                "duration_min": override.get("duration_min"), "tss": override.get("tss")}
    else:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="Coaching model not configured")
        cur = (f"Current session: title=\"{day.get('title', 'Ride')}\", zone={day.get('zone', 'Z2')}, "
               f"duration_min={day.get('duration_min') or day.get('duration') or 60}, tss={day.get('tss') or 0}.")
        prompt = (
            f"You are adjusting ONE cycling training session in a rider's plan. {cur}\n"
            f"{_SWAP_MODE[mode]} "
            + (f"Rider hint for the new focus: \"{focus_hint}\". " if (mode == 'focus' and focus_hint) else "")
            + (f"Rider's overall goal: \"{goal}\". " if goal else "")
            + "Reply with ONLY minified JSON: {\"title\": string (<=4 words), \"zone\": \"Z1\"-\"Z5\", "
              "\"duration_min\": number, \"tss\": number}. Keep it realistic and coherent with the rider's level."
        )
        try:
            from services.gemini_shim import LlmChat, UserMessage
            chat = LlmChat(api_key=key, session_id=f"{coach_name.lower()}-swap",
                           system_message=coach_system(coach_name, coach_gender)).with_model("anthropic", "claude-sonnet-4-6")
            reply = (await chat.send_message(UserMessage(text=prompt))) or ""
            reply = reply.strip().strip("`")
            data = extract_json_object(reply)
        except Exception as e:
            logging.exception("swap-session llm failed")
            raise HTTPException(status_code=502, detail=f"Swap failed: {e}")

    try:
        dur_min = max(15, min(360, int(data.get("duration_min") or 60)))
    except Exception:
        dur_min = 60
    try:
        tss = max(0, int(data.get("tss") or round(dur_min * 1.0)))
    except Exception:
        tss = round(dur_min * 1.0)
    new_day = {
        "day_name": day.get("day_name"), "kind": "cycling",
        "title": str(data.get("title") or "Ride").strip()[:50] or "Ride",
        "zone": str(data.get("zone") or "Z2").strip()[:4],
        "duration": _fmt_dur(dur_min), "duration_min": dur_min, "tss": tss,
    }

    # Persist into the custom plan definition when targeting an active plan.
    if plan_id and str(plan_id).startswith("custom-"):
        w, di = (week, day_index)
        if w is None or di is None:
            w, di = _parse_wid(day.get("workout_id"))
        if w is not None and di is not None:
            doc = await udb.training_plans.find_one({"id": plan_id})
            definition = (doc or {}).get("definition") or {}
            wks = definition.get("weeks") or []
            wi = int(w) - 1
            if 0 <= wi < len(wks) and 0 <= int(di) < len(wks[wi].get("days", [])):
                d0 = wks[wi]["days"][int(di)]
                d0.update({"title": new_day["title"], "zone": new_day["zone"],
                           "duration": new_day["duration"], "tss": new_day["tss"], "kind": "cycling"})
                new_day["workout_id"] = d0.get("workout_id")
                await udb.training_plans.update_one(
                    {"id": plan_id}, {"$set": {"definition": definition, "snapshot_at": now_iso()}})
                try:
                    await _record_adaptation(
                        plan_id, coach_name,
                        f"Swapped your {day.get('day_name', '')} ride to '{new_day['title']}' "
                        f"({new_day['zone']} · {new_day['duration']}).", "Session swapped")
                except Exception:
                    pass
    return {"day": new_day}


# ===================== Plan templates ==========================================
@router.post("/coach/plan-templates")
async def save_plan_template(body: dict):
    plan = body.get("plan") or {}
    if not plan.get("weeks"):
        raise HTTPException(status_code=400, detail="No plan to save")
    tid = f"tpl-{uuid.uuid4().hex[:10]}"
    doc = {
        "id": tid, "title": str(plan.get("title") or "My Plan")[:60],
        "weeks_count": plan.get("weeks_count") or len(plan.get("weeks", [])),
        "days_per_week": plan.get("days_per_week"),
        "plan": plan, "saved_at": now_iso(),
    }
    await udb.plan_templates.update_one({"id": tid}, {"$set": doc}, upsert=True)
    return {"ok": True, "id": tid, "title": doc["title"]}


@router.get("/coach/plan-templates")
async def list_plan_templates():
    cur = udb.plan_templates.find({}, {"_id": 0}).sort("saved_at", -1)
    items = await cur.to_list(length=50)
    return {"templates": items}


@router.delete("/coach/plan-templates/{tid}")
async def delete_plan_template(tid: str):
    await udb.plan_templates.delete_one({"id": tid})
    return {"ok": True}


@router.post("/coach/plan-templates/{tid}/rename")
async def rename_plan_template(tid: str, body: dict):
    title = str(body.get("title") or "").strip()[:60]
    if not title:
        raise HTTPException(status_code=400, detail="Title required")
    doc = await udb.plan_templates.find_one({"id": tid})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    plan = doc.get("plan") or {}
    plan["title"] = title
    await udb.plan_templates.update_one({"id": tid}, {"$set": {"title": title, "plan": plan}})
    return {"ok": True, "id": tid, "title": title}
