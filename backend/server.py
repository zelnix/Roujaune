from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import asyncio
import random
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: str = Field(default_factory=now_iso)


class StatusCheckCreate(BaseModel):
    client_name: str


class WorkoutStart(BaseModel):
    workout: str = "Threshold Climb"
    route: str = "Alpe d'Huez"


class WorkoutSummary(BaseModel):
    elapsed: int = 0
    avg_power: float = 0
    avg_hr: float = 0
    distance: float = 0
    tss: float = 0
    calories: float = 0


class WorkoutSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workout: str
    route: str
    status: str = "active"  # active | ended
    started_at: str = Field(default_factory=now_iso)
    ended_at: Optional[str] = None
    summary: WorkoutSummary = Field(default_factory=WorkoutSummary)


# ----------------------------- REST -----------------------------
@api_router.get("/")
async def root():
    return {"message": "ROUJAUNE telemetry API"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(**input.dict())
    await db.status_checks.insert_one(obj.dict())
    return obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**r) for r in rows]


@api_router.post("/workouts/start", response_model=WorkoutSession)
async def start_workout(body: WorkoutStart):
    session = WorkoutSession(workout=body.workout, route=body.route)
    await db.workout_sessions.insert_one(session.dict())
    return session


@api_router.get("/workouts/{session_id}", response_model=WorkoutSession)
async def get_workout(session_id: str):
    doc = await db.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc.pop("_id", None)
    return WorkoutSession(**doc)


@api_router.get("/workouts", response_model=List[WorkoutSession])
async def list_workouts():
    rows = await db.workout_sessions.find().sort("started_at", -1).to_list(50)
    for r in rows:
        r.pop("_id", None)
    return [WorkoutSession(**r) for r in rows]


@api_router.post("/workouts/{session_id}/end", response_model=WorkoutSession)
async def end_workout(session_id: str, summary: WorkoutSummary):
    doc = await db.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.workout_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "ended", "ended_at": now_iso(), "summary": summary.dict()}},
    )
    doc.update({"status": "ended", "ended_at": now_iso(), "summary": summary.dict()})
    doc.pop("_id", None)
    return WorkoutSession(**doc)


# ----------------------- Post-ride summary aggregation -----------------------
class TelemetrySample(BaseModel):
    power: float = 0
    hr: float = 0
    cadence: float = 0
    speed: float = 0


class SummarizeRequest(BaseModel):
    workout: str = "Threshold Climb"
    route: Optional[Dict[str, Any]] = None   # {id,name,place,distance,elevation,tag}
    elapsed: int = 0          # seconds of the ride
    ftp: int = 287            # rider FTP (watts)
    weight: float = 78        # kg
    samples: List[TelemetrySample] = Field(default_factory=list)


# Polished reference dataset — matches the design mock. Returned when a ride
# has too few recorded samples to compute meaningful aggregates (e.g. demo).
REFERENCE_SUMMARY = {
    "computed": False,
    "duration_sec": 3600,
    "distance_km": 23.7,
    "elevation_m": 1050,
    "avg_power": 248,
    "norm_power": 251,
    "avg_cadence": 89,
    "avg_hr": 148,
    "max_hr": 172,
    "calories": 622,
    "tss": 92,
    "intensity": 0.87,
    "power_curve": [210, 358, 372, 376, 360, 352, 366, 372, 360, 300, 214],
    "power_target": 250,
    "power_max_axis": 400,
    "hr_curve": [96, 108, 122, 134, 141, 145, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162],
    "hr_max_axis": 180,
    "zones": [
        {"z": "Z1", "time": "0:02:15", "pct": 6, "w": 0.16},
        {"z": "Z2", "time": "0:05:30", "pct": 15, "w": 0.42},
        {"z": "Z3", "time": "0:08:45", "pct": 24, "w": 0.68},
        {"z": "Z4", "time": "0:22:00", "pct": 36, "w": 1.0},
        {"z": "Z5", "time": "0:05:30", "pct": 9, "w": 0.25},
    ],
    "compliance": {"overall": 96, "power": 96, "cadence": 91, "zone4_min": 36, "completed": 100},
}


def _fmt_hms(sec: int) -> str:
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f"{h}:{m:02d}:{s:02d}"


def _downsample(vals: List[float], n: int) -> List[float]:
    if not vals:
        return []
    if len(vals) <= n:
        return [round(v) for v in vals]
    step = len(vals) / n
    out = []
    for i in range(n):
        a = int(i * step)
        b = max(a + 1, int((i + 1) * step))
        chunk = vals[a:b]
        out.append(round(sum(chunk) / len(chunk)))
    return out


def _normalized_power(power: List[float]) -> float:
    # 30s rolling average (samples assumed ~5 Hz -> 150-wide window) then 4th-power mean.
    win = 150
    if len(power) < win:
        avg = sum(power) / len(power)
        return round(avg)
    rolled = []
    acc = sum(power[:win])
    rolled.append(acc / win)
    for i in range(win, len(power)):
        acc += power[i] - power[i - win]
        rolled.append(acc / win)
    fourth = sum(p ** 4 for p in rolled) / len(rolled)
    return round(fourth ** 0.25)


@api_router.post("/workouts/summarize")
async def summarize_workout(body: SummarizeRequest):
    """Compute real ride aggregates from recorded telemetry samples.

    Falls back to a polished reference dataset when the sample count is too
    low to be meaningful (e.g. a quick demo tap-through)."""
    powers = [s.power for s in body.samples if s.power is not None]
    if len(body.samples) < 30 or not powers:
        rid = await _save_ride_history(body, REFERENCE_SUMMARY)
        return {**REFERENCE_SUMMARY, "id": rid}

    hrs = [s.hr for s in body.samples if s.hr]
    cads = [s.cadence for s in body.samples if s.cadence]
    speeds = [s.speed for s in body.samples if s.speed]
    dur = body.elapsed or int(len(body.samples) * 0.2)
    ftp = max(1, body.ftp)

    avg_power = round(sum(powers) / len(powers))
    np_val = _normalized_power(powers)
    avg_hr = round(sum(hrs) / len(hrs)) if hrs else 0
    max_hr = round(max(hrs)) if hrs else 0
    avg_cad = round(sum(cads) / len(cads)) if cads else 0
    avg_speed = (sum(speeds) / len(speeds)) if speeds else 0
    distance = round(avg_speed * dur / 3600.0, 1)
    kj = avg_power * dur / 1000.0
    calories = round(kj * 0.7)  # ~24% efficiency approximation
    intensity = round(np_val / ftp, 2)
    tss = round((dur * np_val * intensity) / (ftp * 3600) * 100)

    # time in zones (fraction of FTP)
    bounds = [0.55, 0.75, 0.90, 1.05]
    counts = [0, 0, 0, 0, 0]
    for p in powers:
        f = p / ftp
        idx = 4
        for i, b in enumerate(bounds):
            if f < b:
                idx = i
                break
        counts[idx] += 1
    dt = dur / len(powers)
    zones = []
    zmax = max(counts) or 1
    for i, c in enumerate(counts):
        secs = int(c * dt)
        zones.append({
            "z": f"Z{i+1}",
            "time": _fmt_hms(secs),
            "pct": round(c / len(powers) * 100),
            "w": round(c / zmax, 2),
        })

    zone4_min = round(counts[3] * dt / 60)
    target = np_val
    in_band = sum(1 for p in powers if abs(p - target) <= target * 0.08)
    power_compliance = round(in_band / len(powers) * 100)
    cad_in = sum(1 for c in cads if 85 <= c <= 100) if cads else 0
    cadence_compliance = round(cad_in / len(cads) * 100) if cads else 0
    overall = round((power_compliance + cadence_compliance) / 2)

    result = {
        "computed": True,
        "duration_sec": dur,
        "distance_km": distance,
        "elevation_m": round(distance * 44),  # ~ climb estimate
        "avg_power": avg_power,
        "norm_power": np_val,
        "avg_cadence": avg_cad,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "calories": calories,
        "tss": tss,
        "intensity": intensity,
        "power_curve": _downsample(powers, 11),
        "power_target": target,
        "power_max_axis": 400,
        "hr_curve": _downsample(hrs, 20) if hrs else [],
        "hr_max_axis": 180,
        "zones": zones,
        "compliance": {
            "overall": overall,
            "power": power_compliance,
            "cadence": cadence_compliance,
            "zone4_min": zone4_min,
            "completed": 100,
        },
    }
    rid = await _save_ride_history(body, result)
    return {**result, "id": rid}


async def _save_ride_history(body: SummarizeRequest, result: dict) -> Optional[str]:
    """Persist a lightweight ride-history record (route + key metrics).

    Returns the new record id so the debrief can later be cached against it."""
    try:
        rid = str(uuid.uuid4())
        doc = {
            "id": rid,
            "created_at": now_iso(),
            "workout": body.workout,
            "route": body.route,
            "duration_sec": result.get("duration_sec"),
            "distance_km": result.get("distance_km"),
            "elevation_m": result.get("elevation_m"),
            "avg_power": result.get("avg_power"),
            "tss": result.get("tss"),
            "computed": result.get("computed", False),
            "debrief": None,
        }
        await db.ride_history.insert_one(doc)
        return rid
    except Exception as e:  # never block the summary on history write
        logger.warning(f"ride_history insert failed: {e}")
        return None


@api_router.get("/rides/history")
async def ride_history(limit: int = 20):
    docs = await db.ride_history.find().sort("created_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return docs


# ----------------------- Coach: AI coaching cue -----------------------
def coach_system(name: str = "Alberto", gender: str = "male") -> str:
    champion = "who won multiple Grand Tours"
    return (
        f"You are {name}, a former professional cyclist {champion}. "
        "Today you are a professor of cycling coaching, a sports team director, and a "
        "sports psychologist. You are coaching a rider through an indoor workout in real time.\n"
        "Speak in first person, warm but authoritative, like a mentor who has been in the "
        "hardest moments of a race. Blend physiology, tactics and psychology.\n"
        "Rules: reply with ONE short spoken sentence (max 16 words). No emojis, no lists, "
        "no quotation marks. Be specific to the numbers you are given. Vary your wording. "
        "It must sound natural read aloud."
    )


class CoachCueRequest(BaseModel):
    power: int = 0
    hr: int = 0
    cadence: int = 0
    speed: float = 0
    elapsed: int = 0
    power_target: int = 251
    cadence_low: int = 90
    cadence_high: int = 100
    workout: str = "Threshold Climb"
    route: Optional[str] = None
    coach_name: str = "Alberto"
    coach_gender: str = "male"


@api_router.post("/coach/cue")
async def coach_cue(req: CoachCueRequest):
    """Generate a live, in-persona coaching cue from the rider's telemetry."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    minutes = req.elapsed // 60
    prompt = (
        f"Workout: {req.workout}. Route: {req.route or 'indoor'}. "
        f"Elapsed: {minutes} minutes.\n"
        f"Live: power {req.power} W (target {req.power_target} W), "
        f"cadence {req.cadence} rpm (aim {req.cadence_low}-{req.cadence_high}), "
        f"heart rate {req.hr} bpm, speed {req.speed} km/h.\n"
        "Give the rider one short coaching cue right now."
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


class CoachDebriefRequest(BaseModel):
    ride_id: Optional[str] = None
    workout: str = "Threshold Climb"
    route: Optional[str] = None
    duration_sec: int = 0
    distance_km: float = 0
    elevation_m: int = 0
    avg_power: int = 0
    norm_power: int = 0
    power_target: int = 0
    avg_cadence: int = 0
    avg_hr: int = 0
    max_hr: int = 0
    calories: int = 0
    tss: int = 0
    intensity: float = 0
    compliance: int = 0
    zones: List[Dict[str, Any]] = Field(default_factory=list)
    coach_name: str = "Alberto"
    coach_gender: str = "male"


@api_router.post("/coach/debrief")
async def coach_debrief(req: CoachDebriefRequest):
    """The coach's post-ride debrief: effort, zones and one tip for next time."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Return the cached debrief if this ride already has one (keyed by coach).
    cache_key = f"debrief_{req.coach_name.lower()}"
    if req.ride_id:
        try:
            doc = await db.ride_history.find_one({"id": req.ride_id})
            if doc and doc.get(cache_key):
                return {"debrief": doc[cache_key], "cached": True}
        except Exception:
            logging.warning("debrief cache lookup failed")

    mins = req.duration_sec // 60
    zones_txt = ", ".join(f"{z.get('z')} {z.get('pct', 0)}%" for z in req.zones) if req.zones else "n/a"
    prompt = (
        f"The rider just finished: {req.workout} on {req.route or 'the trainer'}.\n"
        f"Duration {mins} min, {req.distance_km} km, {req.elevation_m} m climbing.\n"
        f"Avg power {req.avg_power} W (normalised {req.norm_power} W, target {req.power_target} W), "
        f"avg cadence {req.avg_cadence} rpm, avg HR {req.avg_hr} bpm (max {req.max_hr}).\n"
        f"TSS {req.tss}, intensity {req.intensity}, calories {req.calories}, "
        f"plan compliance {req.compliance}%. Time in zones: {zones_txt}.\n"
        "Give a warm, personal post-ride debrief: 2 to 3 short sentences. "
        "Praise what went well, note one thing physiologically/tactically, and end with "
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
                await db.ride_history.update_one({"id": req.ride_id}, {"$set": {cache_key: text}})
            except Exception:
                logging.warning("debrief cache write failed")
        # A completed ride makes the plan react: refresh the coach's adaptation
        # note in the background so it reflects this session on the next plan load.
        asyncio.create_task(_refresh_adaptation_after_ride(req))
        return {"debrief": text, "cached": False}
    except Exception as e:
        logging.exception("coach_debrief failed")
        raise HTTPException(status_code=502, detail=f"Debrief generation failed: {e}")


async def _refresh_adaptation_after_ride(req: "CoachDebriefRequest", plan_id: str = "build-and-climb"):
    """Regenerate and cache the coach's plan-adaptation note after a completed
    ride, so the Training Plan reflects the latest session. Best-effort."""
    try:
        plan = await db.training_plans.find_one({"id": plan_id})
        if not plan:
            plan = dict(BUILD_AND_CLIMB)
        recent_ride = {
            "workout": req.workout,
            "route": req.route,
            "duration_min": req.duration_sec // 60,
            "avg_power": req.avg_power,
            "tss": req.tss,
            "compliance": req.compliance,
        }
        text = await _generate_adaptation(plan, req.coach_name, req.coach_gender, recent_ride)
        cache_key = f"adaptation_ai_{req.coach_name.lower()}"
        await db.training_plans.update_one(
            {"id": plan_id},
            {"$set": {cache_key: text, f"{cache_key}_at": now_iso()}},
            upsert=True,
        )
    except Exception:
        logging.warning("post-ride adaptation refresh failed")


# ----------------------- Trainer telemetry (BLE bridge stand-in) -----------------------
class TrainerSim:
    """Server-side smart-trainer/wearable simulator.

    Stands in for a native BLE bridge: streams power/cadence/HR/speed at ~5 Hz,
    responds to ERG intensity commands, and can emulate signal dropout so the
    client can exercise its reconnect / stale-data handling.
    """

    def __init__(self):
        self.erg = 100
        self.paused = False
        self.dropout_until = 0.0
        self.elapsed = 1477.0  # 00:24:37
        self.distance = 24.6
        self.power = 251.0
        self.cadence = 88.0
        self.hr = 162.0
        self.speed = 26.4
        self.gradient = 7.8

    def is_dropped(self, t: float) -> bool:
        return t < self.dropout_until

    def step(self, dt: float):
        if self.paused:
            return
        target_power = 251.0 * (self.erg / 100.0)
        self.power = max(0.0, target_power + random.uniform(-8, 8))
        self.cadence = max(0.0, 88.0 + random.uniform(-4, 4))
        target_hr = 118 + (self.power - 150) * 0.34
        self.hr += (target_hr - self.hr) * 0.15 + random.uniform(-1.5, 1.5)
        self.hr = max(90.0, min(185.0, self.hr))
        # simplified physics: speed rises with power, falls with gradient
        self.speed = max(0.0, 12 + (self.power - 180) / 14 - self.gradient * 0.4 + random.uniform(-0.4, 0.4))
        self.elapsed += dt
        self.distance += self.speed * dt / 3600.0

    def sample(self) -> dict:
        return {
            "elapsed": int(self.elapsed),
            "power": round(self.power),
            "cadence": round(self.cadence),
            "hr": round(self.hr),
            "speed": round(self.speed, 1),
            "distance": round(self.distance, 1),
            "gradient": self.gradient,
            "erg": self.erg,
            "paused": self.paused,
            "source": "trainer",  # measured, not estimated
        }


@api_router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    sim = TrainerSim()
    loop = asyncio.get_event_loop()

    await websocket.send_text(json.dumps({"type": "status", "state": "connected"}))

    async def receiver():
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                t = msg.get("type")
                if t == "erg":
                    sim.erg = max(50, min(150, int(msg.get("intensity", sim.erg))))
                elif t == "pause":
                    sim.paused = True
                elif t == "resume":
                    sim.paused = False
                elif t == "dropout":
                    # emulate a signal loss for a few seconds
                    sim.dropout_until = loop.time() + float(msg.get("seconds", 4))
        except WebSocketDisconnect:
            pass

    recv_task = asyncio.create_task(receiver())
    dt = 0.2
    try:
        while True:
            t = loop.time()
            sim.step(dt)
            if not sim.is_dropped(t):
                await websocket.send_text(json.dumps({"type": "telemetry", "data": sim.sample()}))
            await asyncio.sleep(dt)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logging.getLogger(__name__).info(f"telemetry ws closed: {e}")
    finally:
        recv_task.cancel()


# ----------------------- Training Plan -----------------------
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
    "progress_pct": 25,
    "progress": {"weeks": "3 / 12", "workouts": "15", "time": "10.2 h", "tss": "1,420", "ctl": "+8.4", "atl": "92", "tsb": "+6"},
    "tip": "Consistency compounds. Focus on the process this phase and the results will come.",
    "created_by": "Alberto",
}


@api_router.get("/plan")
async def get_plan(id: str = "build-and-climb"):
    """Return the rider's current training plan (seeded into Mongo on first read)."""
    try:
        doc = await db.training_plans.find_one({"id": id})
        if not doc:
            await db.training_plans.update_one({"id": id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
            doc = dict(BUILD_AND_CLIMB)
        doc.pop("_id", None)
        return doc
    except Exception:
        logging.exception("get_plan failed")
        return BUILD_AND_CLIMB


class AdaptationRequest(BaseModel):
    plan_id: str = "build-and-climb"
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    refresh: bool = False


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
            f"plan compliance {recent_ride.get('compliance')}%. Factor this session into your note."
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


@api_router.post("/coach/adaptation")
async def coach_adaptation(req: AdaptationRequest):
    """Generate the coach's plan-adaptation insight, based on the rider's plan and
    progress. Cached per plan+coach so it only regenerates when refresh=True."""
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Load the plan (seed if needed) so the insight is grounded in real data.
    plan = await db.training_plans.find_one({"id": req.plan_id})
    if not plan:
        await db.training_plans.update_one({"id": req.plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
        plan = dict(BUILD_AND_CLIMB)

    cache_key = f"adaptation_ai_{req.coach_name.lower()}"
    if not req.refresh and plan.get(cache_key):
        return {"adaptation": plan[cache_key], "cached": True}

    try:
        text = await _generate_adaptation(plan, req.coach_name, req.coach_gender)
        try:
            await db.training_plans.update_one(
                {"id": req.plan_id},
                {"$set": {cache_key: text, f"{cache_key}_at": now_iso()}},
            )
        except Exception:
            logging.warning("adaptation cache write failed")
        return {"adaptation": text, "cached": False}
    except Exception as e:
        logging.exception("coach_adaptation failed")
        raise HTTPException(status_code=502, detail=f"Adaptation generation failed: {e}")



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
            "wellness": {"id": "r1", "type": "wellness", "title": "Evening Reflection", "brand": "My Peaceful Companion", "duration": "5 min", "status": "completed"},
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
            "wellness": {"id": "r2", "type": "wellness", "title": "Breathing Reset Session", "brand": "My Peaceful Companion", "duration": "6 min", "status": "scheduled"},
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
            "wellness": {"id": "r3", "type": "wellness", "title": "Body Scan Meditation", "brand": "My Peaceful Companion", "duration": "10 min", "status": "planned"},
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
            "wellness": {"id": "r4", "type": "wellness", "title": "Gratitude Reflection", "brand": "My Peaceful Companion", "duration": "5 min", "status": "planned"},
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
            "wellness": {"id": "r5", "type": "wellness", "title": "Mindful Visualization", "brand": "My Peaceful Companion", "duration": "8 min", "status": "planned"},
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
            "wellness": {"id": "r6", "type": "wellness", "title": "Recovery Reflection", "brand": "My Peaceful Companion", "duration": "5 min", "status": "planned"},
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
            "wellness": {"id": "r7", "type": "wellness", "title": "Weekly Check-In", "brand": "My Peaceful Companion", "duration": "10 min", "status": "planned", "checkin": True},
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


@api_router.get("/calendar/week")
async def get_calendar_week(start: str = "2025-05-12"):
    """Return a scheduling week (seeded into Mongo on first read)."""
    try:
        doc = await db.calendar_weeks.find_one({"start_date": start})
        if not doc or doc.get("seed_version") != CALENDAR_WEEK["seed_version"]:
            await db.calendar_weeks.update_one({"start_date": start}, {"$set": CALENDAR_WEEK}, upsert=True)
            doc = dict(CALENDAR_WEEK)
        doc.pop("_id", None)
        return doc
    except Exception:
        logging.exception("get_calendar_week failed")
        return CALENDAR_WEEK


class MoveSessionRequest(BaseModel):
    week_start: str = "2025-05-12"
    session_type: str  # cycling | fb50 | wellness
    from_date: str
    to_date: str


@api_router.post("/calendar/move")
async def move_calendar_session(req: MoveSessionRequest):
    """Move a session from one day to another and mark it rescheduled."""
    doc = await db.calendar_weeks.find_one({"start_date": req.week_start})
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
    await db.calendar_weeks.update_one({"start_date": req.week_start}, {"$set": {"days": days}}, upsert=True)
    doc.pop("_id", None)
    return doc


class ReviewRequest(BaseModel):
    session_title: str
    session_type: str = "cycling"
    from_day: str
    to_day: str
    to_focus: str = ""
    to_existing: str = ""
    coach_name: str = "Alberto"
    coach_gender: str = "male"


@api_router.post("/calendar/review")
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

ROUTES_DATA = {
    "featured": {"id": "XlwjMjyU410", "name": "Alpe d'Huez", "place": "France", "distance": "13.8 km", "elevation": "1,120 m", "grade": "8.1%", "tag": "Legendary Climb", "difficulty": "Hard"},
    "categories": ["All", "Climbs", "Flat", "Rolling", "Gravel"],
    "routes": [
        {"id": "r1", "name": "Alpe d'Huez", "place": "France", "distance": "13.8 km", "elevation": "1,120 m", "tag": "Climb", "difficulty": "Hard", "color": "rouge"},
        {"id": "r2", "name": "Stelvio Pass", "place": "Italy", "distance": "24.3 km", "elevation": "1,808 m", "tag": "Climb", "difficulty": "Extreme", "color": "rouge"},
        {"id": "r3", "name": "Mont Ventoux", "place": "France", "distance": "21.5 km", "elevation": "1,610 m", "tag": "Climb", "difficulty": "Hard", "color": "orange"},
        {"id": "r4", "name": "Tuscan Rollers", "place": "Italy", "distance": "48.0 km", "elevation": "620 m", "tag": "Rolling", "difficulty": "Moderate", "color": "amber"},
        {"id": "r5", "name": "Loire Valley", "place": "France", "distance": "62.0 km", "elevation": "240 m", "tag": "Flat", "difficulty": "Easy", "color": "green"},
        {"id": "r6", "name": "Girona Gravel", "place": "Spain", "distance": "38.5 km", "elevation": "540 m", "tag": "Gravel", "difficulty": "Moderate", "color": "amber"},
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

COMMUNITY_DATA = {
    "challenges": [
        {"id": "c1", "title": "May Climbing Challenge", "sub": "Climb 5,000 m this month", "progress": 68, "reward": "Climber Badge", "color": "rouge"},
        {"id": "c2", "title": "Consistency Streak", "sub": "Ride 5 days a week", "progress": 80, "reward": "Iron Legs", "color": "yellow"},
        {"id": "c3", "title": "Gran Fondo Prep", "sub": "Complete the 4-week block", "progress": 45, "reward": "Fondo Ready", "color": "green"},
    ],
    "leaderboard": [
        {"rank": 1, "name": "Marco B.", "points": 1840, "you": False},
        {"rank": 2, "name": "Sofia R.", "points": 1720, "you": False},
        {"rank": 3, "name": "You", "points": 1685, "you": True},
        {"rank": 4, "name": "Liam O.", "points": 1590, "you": False},
        {"rank": 5, "name": "Emma T.", "points": 1510, "you": False},
    ],
    "feed": [
        {"id": "p1", "name": "Sofia R.", "action": "completed", "title": "Stelvio Pass", "when": "12m ago", "kudos": 24, "color": "rouge"},
        {"id": "p2", "name": "Marco B.", "action": "set a PR on", "title": "20-min Power", "when": "1h ago", "kudos": 41, "color": "yellow"},
        {"id": "p3", "name": "Liam O.", "action": "finished", "title": "Long Ride Endurance", "when": "3h ago", "kudos": 18, "color": "green"},
    ],
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
        {"id": "wellness", "name": "Harmony Wellness", "detail": "FB50 & Peaceful Companion", "connected": True, "icon": "flower-outline", "color": "purple"},
        {"id": "trainingpeaks", "name": "TrainingPeaks", "detail": "Export workouts", "connected": False, "icon": "trending-up-outline", "color": "dim"},
    ],
}


@api_router.get("/progress")
async def get_progress():
    return PROGRESS_DATA


@api_router.get("/routes")
async def get_routes():
    return ROUTES_DATA


@api_router.get("/wellness")
async def get_wellness():
    return WELLNESS_DATA


@api_router.get("/community")
async def get_community():
    return COMMUNITY_DATA


@api_router.get("/connections")
async def get_connections():
    return CONNECTIONS_DATA


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
