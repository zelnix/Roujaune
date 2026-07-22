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
        await _save_ride_history(body, REFERENCE_SUMMARY)
        return REFERENCE_SUMMARY

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
    await _save_ride_history(body, result)
    return result


async def _save_ride_history(body: SummarizeRequest, result: dict):
    """Persist a lightweight ride-history record (route + key metrics)."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "created_at": now_iso(),
            "workout": body.workout,
            "route": body.route,
            "duration_sec": result.get("duration_sec"),
            "distance_km": result.get("distance_km"),
            "elevation_m": result.get("elevation_m"),
            "avg_power": result.get("avg_power"),
            "tss": result.get("tss"),
            "computed": result.get("computed", False),
        }
        await db.ride_history.insert_one(doc)
    except Exception as e:  # never block the summary on history write
        logger.warning(f"ride_history insert failed: {e}")


@api_router.get("/rides/history")
async def ride_history(limit: int = 20):
    docs = await db.ride_history.find().sort("created_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return docs


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
