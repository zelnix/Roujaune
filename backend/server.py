from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query, Body, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import re
import copy
import asyncio
import random
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from readiness import compute_readiness
from rider_level import compute_rider_level
import plans_admin
import companion_plan
import auth
import push
import admin_routes
from auth import udb


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
auth.init(db)

# Outdoor ride syncing (imported AFTER load_dotenv so provider/env config resolves)
import providers as _providers_pkg  # noqa: E402  (bootstraps the provider registry)
from providers.base import PROVIDERS, get_provider  # noqa: E402
from providers.sandbox import generate_sandbox_activities  # noqa: E402
import crypto_util  # noqa: E402
import activity_sync  # noqa: E402


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ----------------------- Report downloads (preview convenience) -----------------------
from fastapi.responses import FileResponse

# Allow-list of downloadable review PDFs (prevents path traversal). Served public
# in preview so they can be opened directly from the browser.
_REPORTS = {
    "ux-audit": "/app/Roujaune_UX_Audit_Report.pdf",
    "architecture-security": "/app/Roujaune_Architecture_Security_Review.pdf",
}


@api_router.get("/reports")
async def list_reports():
    return {"reports": [{"id": k, "download": f"/api/reports/{k}"} for k in _REPORTS]}


@api_router.get("/reports/{name}")
async def download_report(name: str):
    path = _REPORTS.get(name)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="application/pdf", filename=os.path.basename(path))


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
    await udb.workout_sessions.insert_one(session.dict())
    return session


@api_router.get("/workouts/{session_id}", response_model=WorkoutSession)
async def get_workout(session_id: str):
    doc = await udb.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc.pop("_id", None)
    return WorkoutSession(**doc)


@api_router.get("/workouts", response_model=List[WorkoutSession])
async def list_workouts():
    rows = await udb.workout_sessions.find().sort("started_at", -1).to_list(50)
    for r in rows:
        r.pop("_id", None)
    return [WorkoutSession(**r) for r in rows]


@api_router.post("/workouts/{session_id}/end", response_model=WorkoutSession)
async def end_workout(session_id: str, summary: WorkoutSummary):
    doc = await udb.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    await udb.workout_sessions.update_one(
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
    workout_id: Optional[str] = None
    route: Optional[Dict[str, Any]] = None   # {id,name,place,distance,elevation,tag}
    elapsed: int = 0          # seconds of the ride
    ftp: int = 287            # rider FTP (watts)
    weight: float = 78        # kg
    manual: Optional[Dict[str, Any]] = None  # user-entered metrics when no telemetry
    samples: List[TelemetrySample] = Field(default_factory=list)
    est_calories: int = 0     # live in-ride kcal estimate (used when no telemetry)


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

    When the rider enters data manually (no trainer/wearable telemetry) we build
    the summary from those values instead of a demo dataset."""
    if body.manual:
        result = _manual_summary(body)
        rid = await _save_ride_history(body, result)
        return {**result, "id": rid}
    powers = [s.power for s in body.samples if s.power is not None]
    if len(body.samples) < 30 or not powers:
        ref = dict(REFERENCE_SUMMARY)
        # Carry the live in-ride kcal estimate so a no-telemetry (time-based) ride's
        # saved calories match exactly what the rider saw during the session.
        if body.est_calories > 0:
            ref["calories"] = body.est_calories
        rid = await _save_ride_history(body, ref)
        return {**ref, "id": rid}

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


def _manual_summary(body: SummarizeRequest) -> dict:
    """Build a ride summary from user-entered metrics. TSS is derived from power
    when supplied, otherwise estimated from perceived effort (RPE) + duration."""
    m = body.manual or {}
    ftp = max(1, body.ftp)

    def _num(key, cast=int, default=0):
        try:
            v = m.get(key)
            return cast(v) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    dur = _num("duration_sec", int, 0) or int(body.elapsed or 0)
    avg_power = _num("avg_power", int, 0)
    distance = round(_num("distance_km", float, 0.0), 1)
    elev = _num("elevation_m", int, 0)
    avg_hr = _num("avg_hr", int, 0)
    avg_cad = _num("avg_cadence", int, 0)
    rpe = _num("rpe", float, 0.0)

    if avg_power and dur:
        intensity = round(avg_power / ftp, 2)
        tss = round((dur * avg_power * intensity) / (ftp * 3600) * 100)
        calories = round(avg_power * dur / 1000.0 * 0.9)
    elif rpe and dur:
        if_map = {1: 0.40, 2: 0.50, 3: 0.60, 4: 0.68, 5: 0.75, 6: 0.82, 7: 0.88, 8: 0.94, 9: 1.0, 10: 1.05}
        intensity = if_map.get(int(round(rpe)), 0.60)
        tss = round((dur / 3600.0) * intensity * intensity * 100)
        calories = body.est_calories if body.est_calories > 0 else round((dur / 60.0) * (6 + rpe))
    else:
        intensity = 0.0
        tss = 0
        calories = body.est_calories if body.est_calories > 0 else 0

    return {
        "computed": True,
        "manual": True,
        "duration_sec": dur,
        "distance_km": distance,
        "elevation_m": elev,
        "avg_power": avg_power,
        "norm_power": avg_power,
        "avg_cadence": avg_cad,
        "avg_hr": avg_hr,
        "max_hr": avg_hr,
        "calories": calories,
        "tss": tss,
        "intensity": intensity,
        "power_curve": [],
        "power_target": avg_power,
        "power_max_axis": max(400, avg_power + 50),
        "hr_curve": [],
        "hr_max_axis": 180,
        "zones": [],
        "compliance": {"overall": 0, "power": 0, "cadence": 0, "zone4_min": 0, "completed": 100},
    }



async def _save_ride_history(body: SummarizeRequest, result: dict) -> Optional[str]:
    """Persist a lightweight ride-history record (route + key metrics).

    Returns the new record id so the debrief can later be cached against it."""
    try:
        rid = str(uuid.uuid4())
        doc = {
            "id": rid,
            "created_at": now_iso(),
            "workout": body.workout,
            "workout_id": body.workout_id,
            "route": body.route,
            "duration_sec": result.get("duration_sec"),
            "distance_km": result.get("distance_km"),
            "elevation_m": result.get("elevation_m"),
            "avg_power": result.get("avg_power"),
            "tss": result.get("tss"),
            "calories": result.get("calories", 0),
            "computed": result.get("computed", False),
            "debrief": None,
        }
        await udb.ride_history.insert_one(doc)
        return rid
    except Exception as e:  # never block the summary on history write
        logger.warning(f"ride_history insert failed: {e}")
        return None


@api_router.get("/rides/history")
async def ride_history(limit: int = 20):
    docs = await udb.ride_history.find().sort("created_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return docs


@api_router.get("/stats/energy")
async def energy_rollup():
    """Roll up ride calories into today's + this-week's energy totals and a
    day-streak, for the home dashboard."""
    from datetime import date, timedelta
    rides = await udb.ride_history.find().sort("created_at", -1).to_list(length=5000)
    today = date.today()
    monday = today - timedelta(days=today.weekday())  # start of ISO week
    monday_str = monday.isoformat()
    today_str = today.isoformat()

    per_day: Dict[str, int] = {}
    week_kcal = 0
    today_kcal = 0
    week_rides = 0
    for r in rides:
        day = str(r.get("created_at") or "")[:10]
        if not day:
            continue
        kcal = int(r.get("calories") or 0)
        per_day[day] = per_day.get(day, 0) + kcal
        if day == today_str:
            today_kcal += kcal
        if day >= monday_str:
            week_kcal += kcal
            week_rides += 1

    # Streak: consecutive days (ending today, or yesterday if nothing yet today)
    # that have at least one ride.
    ride_days = {str(r.get("created_at") or "")[:10] for r in rides if r.get("created_at")}
    streak = 0
    cursor = today
    if today_str not in ride_days:
        cursor = today - timedelta(days=1)
    while cursor.isoformat() in ride_days:
        streak += 1
        cursor = cursor - timedelta(days=1)

    return {
        "today_kcal": today_kcal,
        "week_kcal": week_kcal,
        "week_rides": week_rides,
        "streak_days": streak,
    }


# ----------------------- Outdoor ride syncing (connections) -----------------------
async def _rider_ftp() -> int:
    try:
        s = await udb.settings.find_one({"id": "app"})
        if s and s.get("ftp"):
            return int(s["ftp"])
    except Exception:
        pass
    return 200


async def _account_view(provider_id: str, acc: Optional[dict]) -> dict:
    p = get_provider(provider_id)
    meta = dict(p.meta) if p else {"id": provider_id, "name": provider_id, "kind": "unknown", "requires_native_build": False, "icon": "link-outline"}
    configured = bool(p and p.is_configured())
    if not acc:
        status = "not_configured" if (meta.get("kind") == "cloud_oauth" and not configured) else (
            "requires_build" if meta.get("requires_native_build") else "disconnected")
        return {**meta, "configured": configured, "connection_status": status,
                "connected": False, "last_successful_sync_at": None, "last_sync_attempt_at": None,
                "provider_account_id": None, "permissions": [], "disable_route_import": False,
                "disable_auto_sync": False}
    return {**meta, "configured": configured,
            "connection_status": acc.get("connection_status", "connected"),
            "connected": acc.get("connection_status") in ("connected", "syncing"),
            "last_successful_sync_at": acc.get("last_successful_sync_at"),
            "last_sync_attempt_at": acc.get("last_sync_attempt_at"),
            "provider_account_id": acc.get("provider_account_id"),
            "permissions": acc.get("permissions", []),
            "disable_route_import": acc.get("disable_route_import", False),
            "disable_auto_sync": acc.get("disable_auto_sync", False),
            "last_error": acc.get("last_error")}


@api_router.get("/connections")
async def list_connections():
    """All supported providers with the rider's connection + sync status."""
    accounts = {a["provider"]: a for a in await udb.connected_accounts.find({"user_id": auth.current_user_id()}).to_list(length=50)}
    out = []
    for pid in PROVIDERS:
        out.append(await _account_view(pid, accounts.get(pid)))
    imported = await udb.cycling_activities.count_documents({"user_id": auth.current_user_id()})
    return {"providers": out, "encryption_ready": crypto_util.encryption_ready(), "imported_activities": imported}


@api_router.post("/connections/{provider_id}/authorize")
async def connection_authorize(provider_id: str, body: dict):
    """Return the provider OAuth authorize URL. PKCE is backend-mediated: we
    generate + store the code_verifier keyed by state, so the client only needs
    to open the URL and hand back the returned code."""
    import secrets, hashlib, base64
    p = get_provider(provider_id)
    if not p:
        raise HTTPException(404, "Unknown provider")
    if not p.is_configured():
        return {"setup_required": True, "message": f"{p.meta['name']} credentials are not configured yet."}
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = str(uuid.uuid4())
    redirect_uri = body.get("redirect_uri", "")
    await db.oauth_pending.update_one({"state": state}, {"$set": {
        "state": state, "verifier": verifier, "provider": provider_id,
        "redirect_uri": redirect_uri, "created_at": now_iso()}}, upsert=True)
    url = await p.build_authorize_url(state, challenge, redirect_uri)
    return {"authorize_url": url, "state": state}


@api_router.post("/connections/{provider_id}/callback")
async def connection_callback(provider_id: str, body: dict):
    """Exchange the OAuth code, store encrypted tokens, and run the initial import."""
    p = get_provider(provider_id)
    if not p:
        raise HTTPException(404, "Unknown provider")
    if not p.is_configured():
        raise HTTPException(400, "Provider not configured")
    if not crypto_util.encryption_ready():
        raise HTTPException(500, "Token encryption not configured (ENCRYPTION_KEY missing)")
    pend = await db.oauth_pending.find_one({"state": body.get("state")})
    verifier = (pend or {}).get("verifier") or body.get("code_verifier", "")
    redirect_uri = (pend or {}).get("redirect_uri") or body.get("redirect_uri", "")
    try:
        tok = await p.exchange_code(body.get("code", ""), verifier, redirect_uri)
    except Exception as e:
        logging.warning(f"oauth exchange failed: {e}")
        raise HTTPException(400, "Authorisation failed")
    if pend:
        await db.oauth_pending.delete_one({"state": body["state"]})
    expiry = int(datetime.now(timezone.utc).timestamp()) + int(tok.get("expires_in", 3600))
    acc = {
        "id": str(uuid.uuid4()), "user_id": auth.current_user_id(), "provider": provider_id,
        "provider_account_id": tok.get("provider_account_id"),
        "access_token_encrypted": crypto_util.encrypt_token(tok.get("access_token")),
        "refresh_token_encrypted": crypto_util.encrypt_token(tok.get("refresh_token")),
        "token_expiry": expiry, "permissions": tok.get("permissions", []),
        "connection_status": "connected", "sync_cursor": None,
        "disable_route_import": False, "disable_auto_sync": False,
        "created_at": now_iso(), "updated_at": now_iso(),
        "last_successful_sync_at": None, "last_sync_attempt_at": None,
    }
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id}, {"$set": acc}, upsert=True)
    result = await _run_sync(provider_id, initial=True)
    return {"connected": True, "sync": result}


async def _run_sync(provider_id: str, initial: bool = False) -> dict:
    """Incremental (or initial historical) sync for a connected provider."""
    p = get_provider(provider_id)
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    if not p or not acc:
        raise HTTPException(400, "Not connected")
    await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "syncing", "last_sync_attempt_at": now_iso()}})
    now = int(datetime.now(timezone.utc).timestamp())
    since = acc.get("sync_cursor") or (now - 86400 * (90 if initial else 30))
    access = crypto_util.decrypt_token(acc.get("access_token_encrypted"))
    # refresh if expired
    if acc.get("token_expiry") and acc["token_expiry"] < now + 60 and acc.get("refresh_token_encrypted"):
        try:
            rt = crypto_util.decrypt_token(acc["refresh_token_encrypted"])
            newtok = await p.refresh(rt)
            access = newtok["access_token"]
            await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
                "access_token_encrypted": crypto_util.encrypt_token(newtok["access_token"]),
                "refresh_token_encrypted": crypto_util.encrypt_token(newtok.get("refresh_token")),
                "token_expiry": now + int(newtok.get("expires_in", 3600))}})
        except Exception as e:
            logging.warning(f"token refresh failed: {e}")
            await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "reauth_required", "last_error": "Reauthorisation required"}})
            return {"status": "reauth_required"}
    # fetch with simple retry/backoff
    ftp = await _rider_ftp()
    activities, err = [], None
    for attempt in range(3):
        try:
            activities = await p.fetch_activities(access, since, now)
            err = None
            break
        except Exception as e:
            err = str(e)
            await asyncio.sleep(0.5 * (2 ** attempt))
    if err is not None:
        await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "sync_failed", "last_error": err[:200]}})
        return {"status": "sync_failed", "error": err[:200]}
    summary = await activity_sync.ingest_activities(
        db, auth.current_user_id(), [dict(a) for a in activities], ftp, disable_route=acc.get("disable_route_import", False))
    await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
        "connection_status": "connected", "sync_cursor": now,
        "last_successful_sync_at": now_iso(), "last_error": None}})
    return {"status": "connected", **summary}


@api_router.post("/connections/{provider_id}/sync")
async def connection_sync(provider_id: str):
    return await _run_sync(provider_id, initial=False)


@api_router.post("/connections/{provider_id}/disconnect")
async def connection_disconnect(provider_id: str):
    await udb.connected_accounts.delete_one({"user_id": auth.current_user_id(), "provider": provider_id})
    return {"disconnected": True}


@api_router.delete("/connections/{provider_id}/data")
async def connection_delete_data(provider_id: str):
    return await activity_sync.delete_imported(db, auth.current_user_id(), provider_id)


@api_router.patch("/connections/{provider_id}/settings")
async def connection_settings(provider_id: str, body: dict):
    patch = {}
    for k in ("disable_route_import", "disable_auto_sync"):
        if k in body:
            patch[k] = bool(body[k])
    if patch:
        patch["updated_at"] = now_iso()
        await udb.connected_accounts.update_one({"user_id": auth.current_user_id(), "provider": provider_id}, {"$set": patch})
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    return await _account_view(provider_id, acc)


@api_router.get("/connections/activities")
async def imported_activities(limit: int = 50):
    docs = await udb.cycling_activities.find({"user_id": auth.current_user_id()}).sort("started_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
        d.pop("route_data", None)  # keep the list response lightweight
    return docs


@api_router.post("/connections/sandbox/import")
async def sandbox_import(count: int = 3):
    """TEST-ONLY: run the import pipeline with demo outdoor rides (no live provider)."""
    ftp = await _rider_ftp()
    acts = [dict(a) for a in generate_sandbox_activities(count)]
    summary = await activity_sync.ingest_activities(db, auth.current_user_id(), acts, ftp)
    return {"sandbox": True, **summary}


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


STYLE_TONE = {
    "balanced": "Balance encouragement with practical, performance-minded advice.",
    "performance": "Lean into performance: be direct, data-driven and results-focused, while staying supportive and never shaming.",
    "calm": "Be especially calm, warm and reassuring. Reduce pressure and support the rider's wellbeing.",
    "essential": "Be concise and to the point. Keep answers brief and actionable.",
}


def coach_chat_system(name: str = "Alberto", gender: str = "male", style: str = "balanced") -> str:
    """System prompt for the conversational coach chat (Alberto/Adriana Intelligence)."""
    pronoun = "he/him" if gender == "male" else "she/her"
    tone = STYLE_TONE.get(style, STYLE_TONE["balanced"])
    return (
        f"You are {name}, a former professional cyclist who won multiple Grand Tours and now the "
        f"rider's personal cycling coach in the Roujaune app (part of Harmony Wellness Group). "
        f"You are a professor of cycling coaching, a team director and a sports psychologist. Your pronouns are {pronoun}.\n"
        "You are having a warm, one-to-one chat with your rider. Speak in first person, human and encouraging, never robotic.\n"
        "You can help with: training plans and periodisation, individual workouts and pacing, climbing and "
        "tactics, smart-trainer and ERG guidance, route choices, post-ride analysis, recovery and nutrition basics, "
        "motivation and race psychology, FB50 (Fit Beyond 50) cyclist strength, mobility, balance, posture, core, "
        "glute activation and pre/post-ride mobility, and My Peaceful Companion wellbeing (Calm Start, Peaceful Pause, "
        "breathing, readiness check-ins, reflection). When you suggest an FB50 exercise, briefly explain why it helps their cycling.\n"
        f"{tone}\n"
        "Rules: reply in 2 to 4 short sentences (a little more only if the rider asks for detail). Plain conversational "
        "text only. No markdown, no bullet lists, no headings, no emojis, no quotation marks. Never say you are an AI, a "
        "model or a bot; you are the rider's coach. For pain, injury or medical concerns, gently suggest seeing a professional."
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
    segment: Optional[str] = None
    zone: Optional[str] = None
    route: Optional[str] = None
    seated: bool = False
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    cue_kind: str = "live"  # live | intro | next_preview | extend_advice
    next_segment: Optional[str] = None
    next_zone: Optional[str] = None
    next_target: Optional[int] = None


@api_router.post("/coach/cue")
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


class ExtendAdviceRequest(BaseModel):
    power: int = 0
    hr: int = 0
    cadence: int = 0
    elapsed: int = 0            # seconds ridden
    workout: str = "Threshold Climb"
    type_id: str = "endurance"  # workout type: endurance/tempo/threshold/vo2max/sprints/climbing/recovery/restday/fb50
    route: Optional[str] = None
    wearable_on: bool = False
    coach_name: str = "Alberto"
    coach_gender: str = "male"


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


@api_router.post("/coach/extend-advice")
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
    interval_compliance: int = 0
    intervals: List[Dict[str, Any]] = Field(default_factory=list)
    zones: List[Dict[str, Any]] = Field(default_factory=list)
    extended_min: int = 0
    adjustments: List[str] = Field(default_factory=list)
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


# ----------------------- Rider profile (feeds coach intelligence) -----------
RIDER_DEFAULT = {"id": "me", "name": "Rider One", "weight_kg": 78.0, "age": 42, "gender": "male", "city": "", "region": "", "country": "", "capability": "intermediate"}


class RiderProfileUpdate(BaseModel):
    name: Optional[str] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    capability: Optional[str] = None


async def _rider_doc() -> dict:
    doc = await udb.rider_profile.find_one({"id": "me"})
    if not doc:
        doc = dict(RIDER_DEFAULT)
        await udb.rider_profile.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.setdefault("capability", "intermediate")
    return doc


async def _rider_line() -> str:
    """One-line rider physical profile for coach prompts (best-effort)."""
    try:
        d = await _rider_doc()
        g = str(d.get("gender") or "").strip()
        gtxt = f", {g}" if g and g.lower() != "unspecified" else ""
        return (
            f"Rider: {d.get('name', 'Rider')}, {d.get('age')} years old, "
            f"{d.get('weight_kg')} kg{gtxt}. Tailor effort, power-to-weight, recovery and tone accordingly."
        )
    except Exception:
        return ""


@api_router.get("/rider/profile")
async def get_rider_profile():
    return await _rider_doc()


# ---- Rider appearance (identity + bike + clothing) — decoupled from training ----
APPEARANCE_DEFAULT = {"id": "me", "riderType": "younger_male", "bikeType": "road", "clothingStyle": "get_fit"}


class AppearanceUpdate(BaseModel):
    riderType: Optional[str] = None
    bikeType: Optional[str] = None
    clothingStyle: Optional[str] = None


@api_router.get("/rider/appearance")
async def get_rider_appearance():
    doc = await udb.rider_appearance.find_one({"id": "me"})
    if not doc:
        doc = dict(APPEARANCE_DEFAULT)
        await udb.rider_appearance.insert_one(dict(doc))
    doc.pop("_id", None)
    for k, v in APPEARANCE_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


@api_router.put("/rider/appearance")
async def update_rider_appearance(req: AppearanceUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_appearance.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.rider_appearance.find_one({"id": "me"})
    doc.pop("_id", None)
    for k, v in APPEARANCE_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


# ---- Rider preferences (coach persona + coaching style) — persisted per user
#      so the chosen companion coach stays consistent across every session/device.
PREFS_DEFAULT = {"id": "me", "coach_id": "alberto", "coach_style": "balanced", "voice_guidance": "full", "speech_rate": 0.95}


class PrefsUpdate(BaseModel):
    coach_id: Optional[str] = None
    coach_style: Optional[str] = None
    voice_guidance: Optional[str] = None
    speech_rate: Optional[float] = None


@api_router.get("/rider/prefs")
async def get_rider_prefs():
    doc = await udb.rider_prefs.find_one({"id": "me"})
    if not doc:
        doc = dict(PREFS_DEFAULT)
        await udb.rider_prefs.insert_one(dict(doc))
    doc.pop("_id", None)
    for k, v in PREFS_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


# ---- Rider settings (live-workout + home location) — persisted per user so
#      every preference is consistent across sessions and devices.
SETTINGS_DEFAULT = {
    "id": "me", "hasTrainer": False, "hasWearable": False, "demoMode": False,
    "hudEnabled": True, "ftp": 287, "ftpAuto": True, "seatedMode": False,
    "wheelCircumference": 2105,
    "homeCity": "South Perth, Australia", "homeLat": -31.9833, "homeLon": 115.8586,
}


@api_router.get("/rider/settings")
async def get_rider_settings():
    doc = await udb.settings.find_one({"id": "me"})
    if not doc:
        return {}
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@api_router.put("/rider/settings")
async def update_rider_settings(payload: Dict[str, Any] = Body(...)):
    # Merge whatever preference keys the client sends (id/user_id are protected).
    upd = {k: v for k, v in (payload or {}).items() if k not in ("id", "user_id", "_id")}
    await udb.settings.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.settings.find_one({"id": "me"})
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


# ---- Generic per-user key/value preference store — mirrors the client's local
#      AsyncStorage keys (per-coach voice, favourite routes, etc.) so EVERY
#      preference is persisted server-side and follows the rider across devices.
@api_router.get("/rider/kv")
async def get_rider_kv():
    doc = await udb.kv_prefs.find_one({"id": "me"}) or {}
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.pop("id", None)
    return doc


@api_router.put("/rider/kv")
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


@api_router.put("/rider/prefs")
async def update_rider_prefs(req: PrefsUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_prefs.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    doc = await udb.rider_prefs.find_one({"id": "me"})
    doc.pop("_id", None)
    for k, v in PREFS_DEFAULT.items():
        doc.setdefault(k, v)
    return doc


# ---- Benchmark Workouts: sessions, results & headline profile ----
#      Sessions capture the readiness/setup flow; results (accepted) feed the
#      rider's headline benchmark profile. Scoped per user.
@api_router.get("/benchmark/profile")
async def get_benchmark_profile():
    doc = await udb.benchmark_profile.find_one({"user_id": auth.current_user_id()}) or {}
    keys = ["ftp", "ftpWkg", "fiveMinPower", "oneMinPower", "sprintPower",
            "aerobicEfficiency", "preferredCadence", "recoveryResponse", "lastBenchmarkDate"]
    return {k: doc.get(k) for k in keys}


@api_router.get("/benchmark/results")
async def get_benchmark_results():
    docs = await udb.benchmark_results.find(
        {"user_id": auth.current_user_id()}
    ).sort("createdAt", -1).to_list(length=200)
    for d in docs:
        d.pop("_id", None)
        d.pop("user_id", None)
    return {"results": docs}


@api_router.post("/benchmark/sessions")
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


@api_router.get("/benchmark/sessions/{sid}")
async def get_benchmark_session(sid: str):
    doc = await udb.benchmark_sessions.find_one({"id": sid, "user_id": auth.current_user_id()})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


@api_router.patch("/benchmark/sessions/{sid}")
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


@api_router.post("/benchmark/results")
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


@api_router.post("/benchmark/results/{rid}/decision")
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


@api_router.get("/benchmark/zones")
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


async def _coach_line(coach_name: str, coach_gender: str, prompt: str) -> Optional[str]:
    """Best-effort one-sentence, in-persona explanation. Returns None on failure."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"{coach_name.lower()}-plan-gate",
            system_message=coach_system(coach_name, coach_gender),
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=prompt))
        line = (reply or "").strip().strip('"').split("\n")[0]
        return line or None
    except Exception:
        logging.exception("coach_line failed")
        return None


@api_router.get("/benchmark/plan-gate")
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
    illness = bool(checkin.get("illness") or checkin.get("injury") or checkin.get("returning"))
    equip_changed = bool(checkin.get("equipmentChanged"))
    low_conf = bool(last_ftp and (last_ftp.get("confidence") or 0) < 50)

    reasons: List[str] = []
    if level.lower() == "beginner":
        status = "submaximal"
        reasons.append("beginner plan — a lighter assessment or your existing data is enough")
    else:
        if not ftp:
            status = "required"; reasons.append("no valid FTP benchmark on record yet")
        elif illness:
            status = "required"; reasons.append("recent illness, injury or return to training")
        elif equip_changed:
            status = "required"; reasons.append("your equipment has changed")
        elif last_days is None:
            status = "required"; reasons.append("benchmark date unknown")
        elif last_days > 2 * FTP_RETEST_DAYS:
            status = "required"; reasons.append(f"last benchmark was {last_days} days ago")
        elif last_days > FTP_RETEST_DAYS:
            status = "recommended"; reasons.append(f"last benchmark was {last_days} days ago")
        elif low_conf:
            status = "recommended"; reasons.append("your previous FTP result had low confidence")
        else:
            status = "approved"; reasons.append("recent benchmark with good confidence and consistent training")

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
        "requiresBenchmark": status in ("required", "recommended"),
        "hasPower": rec["hasPower"],
        "lastBenchmarkDate": profile.get("lastBenchmarkDate"),
    }


# ---- WP-E: Training Plan review (proposed changes require explicit approval) ----
def _next_monday_iso() -> str:
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    return (today + timedelta(days=(7 - today.weekday()) % 7 or 7)).isoformat()


@api_router.get("/benchmark/plan-review")
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


@api_router.post("/benchmark/plan-review/apply")
async def benchmark_plan_review_apply():
    uid = auth.current_user_id()
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    new_ftp = int(profile.get("ftp") or 0)
    if not new_ftp:
        raise HTTPException(status_code=400, detail="No benchmark FTP to apply")
    await udb.settings.update_one({"user_id": uid}, {"$set": {"ftp": new_ftp}}, upsert=True)
    await udb.benchmark_profile.update_one({"user_id": uid}, {"$set": {"planReviewDismissedFor": new_ftp}})
    return {"applied": True, "ftp": new_ftp}


@api_router.post("/benchmark/plan-review/dismiss")
async def benchmark_plan_review_dismiss():
    uid = auth.current_user_id()
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    new_ftp = int(profile.get("ftp") or 0)
    await udb.benchmark_profile.update_one({"user_id": uid}, {"$set": {"planReviewDismissedFor": new_ftp}}, upsert=True)
    return {"dismissed": True}


# ---- WP-E: Benchmark progress trends (personal history over time) ----
@api_router.get("/benchmark/trends")
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


@api_router.get("/benchmark/week")
async def get_benchmark_week():
    doc = await udb.benchmark_week.find_one({"user_id": auth.current_user_id(), "id": "current"})
    if not doc:
        return {"active": False, "days": []}
    doc.pop("_id", None); doc.pop("user_id", None)
    return doc


@api_router.post("/benchmark/week/start")
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


@api_router.patch("/benchmark/week/day/{index}")
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


@api_router.post("/benchmark/week/cancel")
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


@api_router.get("/benchmark/recommendation")
async def get_benchmark_recommendation():
    return await _benchmark_recommendation()





# ---- Personal Records (Best Time / avg power per scenic route + segments) ----
class SegmentSplit(BaseModel):
    label: str
    km: float = 0
    time_sec: int = 0


class PRSubmit(BaseModel):
    route_id: str
    route_name: Optional[str] = None
    time_sec: int = 0            # total route completion time (seconds)
    avg_power: int = 0           # average power over the ride (W)
    completed: bool = True       # only score the route time PR when the route finished
    splits: List[SegmentSplit] = Field(default_factory=list)


def _clean_pr(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.setdefault("segments", {})
    return doc


@api_router.get("/rider/prs")
async def list_rider_prs():
    """All of the rider's route personal records (for the Profile / picker)."""
    docs = await udb.rider_prs.find().to_list(length=200)
    return {"prs": [_clean_pr(d) for d in docs]}


@api_router.get("/rider/prs/{route_id}")
async def get_rider_pr(route_id: str):
    doc = await udb.rider_prs.find_one({"id": route_id})
    return _clean_pr(doc) if doc else {"id": route_id, "segments": {}}


@api_router.post("/rider/prs")
async def submit_rider_pr(body: PRSubmit):
    """Compare a just-finished ride against the rider's stored records for this
    scenic route (fastest time = primary PR, highest avg power = secondary badge)
    plus per-segment split times. Updates any beaten records and returns which
    records were set so the app can celebrate them."""
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

    # Route completion time — primary PR (only when the route actually finished).
    if body.completed and body.time_sec > 0:
        if doc.get("best_time_sec") is None or body.time_sec < doc["best_time_sec"]:
            doc["best_time_sec"] = body.time_sec
            doc["best_time_at"] = now
            route_time_pr = not first_time  # first completion isn't a "beaten" record

    # Highest average power — secondary badge.
    if body.avg_power > 0:
        if doc.get("best_avg_power") is None or body.avg_power > doc["best_avg_power"]:
            was = doc.get("best_avg_power")
            doc["best_avg_power"] = body.avg_power
            doc["best_avg_power_at"] = now
            route_power_pr = was is not None

    # Per-segment split times.
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


class AssignPlanRequest(BaseModel):
    plan_id: str
    reset_progress: bool = False

@api_router.get("/rider/plan")
async def get_rider_plan():
    """The plan the current rider is assigned to (resolved) + all selectable plans."""
    active = await _active_plan_id()
    plans = await plans_admin.list_plans()
    return {"active_plan_id": active, "plans": plans}


@api_router.post("/rider/plan")
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


class OnboardingReq(BaseModel):
    experience_years: float = 0
    weekly_rides: int = 0
    longest_ride_min: int = 0
    confident_60min: bool = False
    self_rating: str = "new"        # new | some | confident
    goal: str | None = None


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


@api_router.post("/onboarding/recommend")
async def onboarding_recommend(req: OnboardingReq):
    """Classify the rider's level from onboarding answers and recommend the default
    plan for that level. The rider can accept it, pick another, or ride free."""
    level = _classify_level(req)
    recommended = await _plan_for_level(level)
    plans = await plans_admin.list_plans()
    return {"level": level, "recommended": recommended, "plans": plans, "allow_free": True}


@api_router.put("/rider/profile")
async def update_rider_profile(req: RiderProfileUpdate):
    upd = {k: v for k, v in req.dict().items() if v is not None}
    await udb.rider_profile.update_one({"id": "me"}, {"$set": {**upd, "id": "me"}}, upsert=True)
    return await _rider_doc()


def _http_get_json(url: str):
    import urllib.request
    with urllib.request.urlopen(url, timeout=6) as r:
        return json.loads(r.read().decode())


@api_router.get("/weather")
async def get_weather(city: str = "", region: str = "", country: str = ""):
    """Current temperature for the rider's location via Open-Meteo (keyless)."""
    query = ", ".join([p for p in [city, region, country] if p]).strip()
    if not query:
        return {"available": False}
    try:
        import urllib.parse
        geo = await asyncio.to_thread(
            _http_get_json,
            f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(city or query)}&count=1&language=en&format=json",
        )
        res = (geo.get("results") or [None])[0]
        if not res:
            return {"available": False}
        lat, lon = res["latitude"], res["longitude"]
        place = res.get("name", city)
        wx = await asyncio.to_thread(
            _http_get_json,
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature",
        )
        cur = wx.get("current", {})
        return {
            "available": True,
            "temp_c": round(cur.get("temperature_2m", 0)),
            "feels_c": round(cur.get("apparent_temperature", cur.get("temperature_2m", 0))),
            "place": place,
        }
    except Exception:
        logging.warning("weather lookup failed")
        return {"available": False}


@api_router.get("/rider/season")
async def get_rider_season(days: int = 0):
    """Aggregate the rider's real logged sessions for the Profile screen.
    Optional `days` limits to rides within the last N days (0 = all-time)."""
    from datetime import date, timedelta, datetime, timezone
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


@api_router.get("/progress/summary")
async def progress_summary():
    """Rich progress rollup for the Today 'Progress' card: completed sessions by
    type, FTP progress, benchmark/test progress, and total distance + duration."""
    uid = auth.current_user_id()
    rides = await udb.ride_history.find().to_list(length=5000)
    ride_count = len(rides)
    total_km = round(sum((r.get("distance_km") or 0) for r in rides), 1)
    total_secs = int(sum((r.get("duration_sec") or 0) for r in rides))

    supp = await udb.supplementary_log.find().to_list(length=5000)
    strength_count = sum(1 for s in supp if s.get("kind") == "strength")
    recovery_mobility_count = sum(1 for s in supp if s.get("kind") in ("recovery", "mobility", "balance"))

    # FTP progress: current training FTP + change vs earliest accepted FTP benchmark
    settings = await udb.settings.find_one({"user_id": uid}) or {}
    profile = await udb.benchmark_profile.find_one({"user_id": uid}) or {}
    cur_ftp = int(settings.get("ftp") or profile.get("ftp") or 0)
    accepted = await udb.benchmark_results.find(
        {"user_id": uid, "decision": "accepted"}).sort("createdAt", 1).to_list(length=200)
    ftp_series = [int((r.get("primaryMetric") or {}).get("value") or 0)
                  for r in accepted if (r.get("primaryMetric") or {}).get("key") == "ftp"]
    ftp_delta = (ftp_series[-1] - ftp_series[0]) if len(ftp_series) >= 2 else 0
    ftp_wkg = profile.get("ftpWkg")

    # Test/benchmark progress
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



class SupplementaryLog(BaseModel):
    kind: str = "strength"   # strength | mobility | recovery | balance
    title: str = "Supplementary session"
    date: Optional[str] = None


@api_router.post("/rider/supplementary/complete")
async def complete_supplementary(body: SupplementaryLog):
    """Toggle a completed non-cycling session (strength/mobility/recovery/balance)
    for a given date so the home 'Supplementary Training' actual and the calendar
    both reflect it. Posting the same date+kind again un-marks it."""
    existing = await udb.supplementary_log.find_one({"date": body.date, "kind": body.kind}) if body.date else None
    if existing:
        await udb.supplementary_log.delete_one({"_id": existing["_id"]})
        return {"ok": True, "completed": False}
    doc = {"id": str(uuid.uuid4()), "created_at": now_iso(), "kind": body.kind, "title": body.title, "date": body.date}
    await udb.supplementary_log.insert_one(doc)
    return {"ok": True, "completed": True}


@api_router.get("/rider/achievements")
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
    from datetime import date, timedelta
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


async def _enrich_activity(payload: dict) -> dict:
    """Fill training load from real ride history when the client did not supply
    it (so readiness reflects recent Roujaune activity)."""
    from datetime import timedelta
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
    return out


@api_router.post("/rider/readiness")
async def rider_readiness(payload: dict):
    """Compute the rider's 0–100 readiness score (see readiness.py)."""
    enriched = await _enrich_activity(payload or {})
    return compute_readiness(enriched)


@api_router.post("/rider/level")
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


def _cal_status(score: int) -> str:
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Steady"
    if score >= 40:
        return "Easy day"
    return "Rest"


@api_router.post("/rider/checkin")
async def rider_checkin(payload: dict):
    """Store today's daily check-in and return the computed readiness score."""
    from datetime import date
    payload = payload or {}
    enriched = await _enrich_activity(payload)
    result = compute_readiness(enriched)
    d = payload.get("date") or date.today().isoformat()
    checkin = payload.get("checkin") or {}
    doc = {
        "score": result.get("readinessScore", 0),
        "status": result.get("status"),
        "band": result.get("status"),
        "mainFactors": result.get("mainFactors", []),
        "confidence": result.get("confidence"),
        "safetyOverride": result.get("safetyOverride", False),
        "metrics": _checkin_metrics(checkin),
        "checkin": checkin,
        "date": d,
        "at": now_iso(),
    }
    try:
        await udb.daily_checkins.update_one({"id": "latest"}, {"$set": {**doc, "id": "latest"}}, upsert=True)
        await udb.daily_checkins.update_one({"id": d}, {"$set": {**doc, "id": d}}, upsert=True)
    except Exception:
        logging.warning("checkin persist failed")
    return {**result, "date": d}


@api_router.get("/rider/readiness/today")
async def rider_readiness_today():
    """Return the latest stored daily check-in readiness (or unavailable)."""
    doc = await udb.daily_checkins.find_one({"id": "latest"})
    if not doc:
        return {"available": False}
    doc.pop("_id", None)
    return {"available": True, **doc}




async def _build_rider_context(plan_id: str = "build-and-climb") -> str:
    """Assemble a compact, factual snapshot of the rider (latest ride, current
    plan phase/progress, readiness) so the coach can reference real numbers in
    chat. Best-effort — returns whatever is available, never raises."""
    lines: List[str] = []
    rl = await _rider_line()
    if rl:
        lines.append(rl)
    try:
        plan = await udb.training_plans.find_one({"id": plan_id})
        if not plan:
            plan = dict(BUILD_AND_CLIMB)
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


class CoachChatRequest(BaseModel):
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    coaching_style: str = "balanced"
    message: str


@api_router.get("/coach/chat/history")
async def coach_chat_history(coach_name: str = "Alberto"):
    """Return the rider's saved conversation with the given coach (per-coach thread)."""
    doc = await udb.coach_chats.find_one({"id": _chat_id(coach_name)})
    return {"messages": (doc or {}).get("messages", [])}


@api_router.delete("/coach/chat/history")
async def clear_coach_chat_history(coach_name: str = "Alberto"):
    await udb.coach_chats.update_one(
        {"id": _chat_id(coach_name)}, {"$set": {"messages": []}}, upsert=True
    )
    return {"ok": True}


@api_router.post("/coach/chat")
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


async def _refresh_adaptation_after_ride(req: "CoachDebriefRequest", plan_id: str = "build-and-climb"):
    """Regenerate and cache the coach's plan-adaptation note after a completed
    ride, so the Training Plan reflects the latest session. Best-effort."""
    try:
        plan = await udb.training_plans.find_one({"id": plan_id})
        if not plan:
            plan = dict(BUILD_AND_CLIMB)
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


@api_router.get("/plan/targets")
async def get_plan_targets(plan_id: str = "build-and-climb"):
    """Current adaptive per-zone target bias (fraction, e.g. Z4: 0.04 → +4%) plus
    the recent execution ratios that produced it. The live HUD applies the bias
    on top of FTP × zone%; the Plan screen visualises both."""
    plan = await udb.training_plans.find_one({"id": plan_id}) or {}
    return {
        "zone_bias": plan.get("zone_bias") or {},
        "zone_exec": plan.get("zone_exec") or {},
        "zones": NUDGE_ZONES,
    }


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
        self.base_target = 251.0  # target watts driven by the chosen workout's segment
        self.power = 251.0
        self.cadence = 88.0
        self.hr = 162.0
        self.speed = 26.4
        self.gradient = 7.8
        # Real BLE sensor overrides (set via {type:'sensor'} messages).
        self.sensor_power = None
        self.sensor_cadence = None
        self.sensor_hr = None
        self.sensor_speed = None
        self.sensor_expires = 0.0
        self.sensor_fresh = False

    def is_dropped(self, t: float) -> bool:
        return t < self.dropout_until

    def step(self, dt: float):
        if self.paused:
            return
        target_power = self.base_target * (self.erg / 100.0)
        self.power = max(0.0, target_power + random.uniform(-8, 8))
        self.cadence = max(0.0, 88.0 + random.uniform(-4, 4))
        target_hr = 118 + (self.power - 150) * 0.34
        self.hr += (target_hr - self.hr) * 0.15 + random.uniform(-1.5, 1.5)
        self.hr = max(90.0, min(185.0, self.hr))
        # Real sensor data (BLE) overrides simulated values while it is fresh.
        if self.sensor_fresh:
            if self.sensor_power is not None:
                self.power = float(self.sensor_power)
            if self.sensor_cadence is not None:
                self.cadence = float(self.sensor_cadence)
            if self.sensor_hr is not None:
                self.hr = float(self.sensor_hr)
        # simplified physics: speed rises with power, falls with gradient
        self.speed = max(0.0, 12 + (self.power - 180) / 14 - self.gradient * 0.4 + random.uniform(-0.4, 0.4))
        # A dedicated speed / wheel sensor overrides the estimated speed.
        if self.sensor_fresh and self.sensor_speed is not None:
            self.speed = float(self.sensor_speed)
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
            "source": "sensor" if self.sensor_fresh else "trainer",  # measured, not estimated
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
                elif t == "target":
                    sim.base_target = max(0.0, float(msg.get("watts", sim.base_target)))
                elif t == "init":
                    if "elapsed" in msg:
                        sim.elapsed = float(msg.get("elapsed", sim.elapsed))
                    if "distance" in msg:
                        sim.distance = float(msg.get("distance", sim.distance))
                    if "watts" in msg:
                        sim.base_target = max(0.0, float(msg.get("watts", sim.base_target)))
                elif t == "pause":
                    sim.paused = True
                elif t == "resume":
                    sim.paused = False
                elif t == "dropout":
                    # emulate a signal loss for a few seconds
                    sim.dropout_until = loop.time() + float(msg.get("seconds", 4))
                elif t == "sensor":
                    # real BLE readings pushed from the device
                    if msg.get("power") is not None:
                        sim.sensor_power = max(0.0, float(msg.get("power")))
                    if msg.get("cadence") is not None:
                        sim.sensor_cadence = max(0.0, float(msg.get("cadence")))
                    if msg.get("hr") is not None:
                        sim.sensor_hr = max(0.0, float(msg.get("hr")))
                    if msg.get("speed") is not None:
                        sim.sensor_speed = max(0.0, float(msg.get("speed")))
                    sim.sensor_expires = loop.time() + 4.0
        except WebSocketDisconnect:
            pass

    recv_task = asyncio.create_task(receiver())
    dt = 0.2
    try:
        while True:
            t = loop.time()
            sim.sensor_fresh = t < sim.sensor_expires
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


# Registry of structured plans driven by the generalized plan engine below.
def _struct_ctx(plan_id: str):
    """Return (plan_doc, weeks_map, planned_tss, ride_prefix) for a structured plan."""
    if plan_id == "ride-stronger":
        return RS_PLAN, RS_WEEKS, _RS_PLANNED_TSS, "rs-ride-"
    if plan_id == "ride-beyond":
        return RB_PLAN, RB_WEEKS, _RB_PLANNED_TSS, "rb-ride-"
    return CTR_PLAN, CTR_WEEKS, _CTR_PLANNED_TSS, "ctr-ride-"


STRUCTURED_PLAN_IDS = {"couch-to-road", "ride-stronger", "ride-beyond"}
_RIDE_PREFIX = {"couch-to-road": "ctr-ride-", "ride-stronger": "rs-ride-", "ride-beyond": "rb-ride-"}


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


async def _active_plan_id() -> str:
    """The plan the current rider is on. An explicit `assigned_plan_id` on the rider
    wins; otherwise Green Lantern → couch-to-road, everyone else → build-and-climb."""
    try:
        rider = await _rider_doc()
        pid = (rider.get("assigned_plan_id") or "").strip()
        if pid:
            return pid
        if (rider.get("name") or "").strip().lower() == "green lantern":
            return "couch-to-road"
    except Exception:
        pass
    return "build-and-climb"


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
            entry["wellness"] = {"type": "wellness", "title": day["title"], "brand": "My Peaceful Companion",
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
        "recovery": {"icon": "leaf-outline",     "color": "#55C850", "subtitle": "My Peaceful Companion"},
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


@api_router.get("/plan")
async def get_plan(id: str = "build-and-climb"):
    """Return the rider's current training plan (seeded into Mongo on first read).
    Green Lantern is on the beginner 'From Couch to Road' plan; every other rider
    stays on 'Build & Climb'."""
    try:
        rider = await _rider_doc()
        active = await _active_plan_id()
        if active == "none":
            return {"id": "none", "title": "Free Riding", "label": "FREE RIDING", "free": True,
                    "description": "You're riding without a structured plan. Jump into any ride whenever you like.",
                    "workouts": [], "goals": [], "progress_pct": 0}
        if active in STRUCTURED_PLAN_IDS or id in STRUCTURED_PLAN_IDS:
            spid = active if active in STRUCTURED_PLAN_IDS else id
            pdoc, weeks_map, planned, prefix = await _struct_ctx_for_rider(spid)
            cur, ride_map, supp = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id=spid, ride_prefix=prefix)
            prog = await _ctr_progress(ride_map, ride_prefix=prefix, planned_tss=planned)
            done = _plan_done(weeks_map, cur, int(pdoc.get("duration_weeks") or 16), ride_map, supp)
            return await _with_adaptation_meta(_ctr_plan_response(cur, ride_map, prog, weeks=weeks_map, plan_doc=pdoc, plan_id=spid, plan_complete=done, supp_dates=supp), spid)
        doc = await udb.training_plans.find_one({"id": id})
        base = await _rider_plan_def(id)
        if not base:
            base = dict(BUILD_AND_CLIMB)
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


@api_router.post("/coach/adaptation")
async def coach_adaptation(req: AdaptationRequest):
    """Generate the coach's plan-adaptation insight, based on the rider's plan and
    progress. Cached per plan+coach so it only regenerates when refresh=True."""
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")

    # Load the plan (seed if needed) so the insight is grounded in real data.
    plan = await udb.training_plans.find_one({"id": req.plan_id})
    if not plan:
        await udb.training_plans.update_one({"id": req.plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
        plan = dict(BUILD_AND_CLIMB)

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


@api_router.post("/coach/adaptation/detail")
async def coach_adaptation_detail(req: AdaptationRequest):
    """Detailed, AI-generated breakdown of HOW the coach derived the current plan
    adaptation (reasoning factors + concrete adjustments). Cached per plan+coach."""
    if not os.environ.get("EMERGENT_LLM_KEY"):
        raise HTTPException(status_code=503, detail="Coaching model not configured")
    plan = await udb.training_plans.find_one({"id": req.plan_id})
    if not plan:
        await udb.training_plans.update_one({"id": req.plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
        plan = dict(BUILD_AND_CLIMB)
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


@api_router.get("/plan/adaptations")
async def get_plan_adaptations(plan_id: str = "build-and-climb", coach_name: Optional[str] = None):
    """Return the coach's adaptation history (newest first). Seeds a first entry
    from the plan's current cached/static adaptation if the history is empty."""
    plan = await udb.training_plans.find_one({"id": plan_id})
    if not plan:
        await udb.training_plans.update_one({"id": plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
        plan = dict(BUILD_AND_CLIMB)

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


class PlanGoal(BaseModel):
    id: str
    title: str
    description: str = ""
    status: str = "incomplete"


class GoalsUpdateRequest(BaseModel):
    plan_id: str = "build-and-climb"
    goals: List[PlanGoal]


@api_router.put("/plan/goals")
async def update_plan_goals(req: GoalsUpdateRequest):
    """Persist the rider's edited plan goals and return the updated plan."""
    plan = await udb.training_plans.find_one({"id": req.plan_id})
    if not plan:
        await udb.training_plans.update_one({"id": req.plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)

    goals = [g.dict() for g in req.goals]
    await udb.training_plans.update_one(
        {"id": req.plan_id},
        {"$set": {"goals": goals, "goals_updated_at": now_iso()}},
    )
    doc = await udb.training_plans.find_one({"id": req.plan_id})
    doc.pop("_id", None)
    return doc


@api_router.get("/plan/progress")
async def get_plan_progress(plan_id: str = "build-and-climb"):
    """Detailed plan progress for the "View Progress" modal: headline metrics,
    fitness trend series and a per-week completion breakdown."""
    plan = await udb.training_plans.find_one({"id": plan_id})
    if not plan:
        await udb.training_plans.update_one({"id": plan_id}, {"$set": BUILD_AND_CLIMB}, upsert=True)
        plan = dict(BUILD_AND_CLIMB)
    plan.pop("_id", None)

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
        rider = await _rider_doc()
        active = await _active_plan_id()
        if active == "couch-to-road":
            cur, ride_map, supp_dates = await _ctr_state()
            doc = _ctr_calendar_week(CTR_WEEKS[cur], ride_map, supp_dates, _ctr_today())
        elif active == "ride-stronger":
            pdoc, weeks_map, planned, prefix = _struct_ctx("ride-stronger")
            cur, ride_map, supp_dates = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id="ride-stronger", ride_prefix=prefix)
            doc = _ctr_calendar_week(weeks_map[cur], ride_map, supp_dates, _ctr_today())
        elif active == "ride-beyond":
            pdoc, weeks_map, planned, prefix = _struct_ctx("ride-beyond")
            cur, ride_map, supp_dates = await _ctr_state(weeks=weeks_map, duration_weeks=pdoc.get("duration_weeks"), plan_id="ride-beyond", ride_prefix=prefix)
            doc = _ctr_calendar_week(weeks_map[cur], ride_map, supp_dates, _ctr_today())
        else:
            doc = await udb.calendar_weeks.find_one({"start_date": start})
            if not doc or doc.get("seed_version") != CALENDAR_WEEK["seed_version"]:
                await udb.calendar_weeks.update_one({"start_date": start}, {"$set": CALENDAR_WEEK}, upsert=True)
                doc = dict(CALENDAR_WEEK)
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
        return CALENDAR_WEEK


# ----------------------- Workout favorites & scheduling -----------------------
class FavToggleRequest(BaseModel):
    workout_id: str


@api_router.get("/workout-favorites")
async def get_workout_favorites():
    doc = await udb.workout_prefs.find_one({"id": "favorites"})
    return {"favorites": (doc or {}).get("ids", [])}


@api_router.post("/workout-favorites/toggle")
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


class ScheduleRequest(BaseModel):
    workout_id: str
    workout_name: str
    duration: str = ""
    tss: str = ""
    zone: str = ""
    color: str = "rouge"
    date: str = "2025-05-13"


@api_router.get("/calendar/scheduled")
async def get_scheduled_workouts():
    docs = await udb.scheduled_workouts.find().to_list(500)
    for d in docs:
        d.pop("_id", None)
    return {"scheduled": docs}


@api_router.post("/calendar/schedule")
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


@api_router.delete("/calendar/scheduled/{entry_id}")
async def delete_scheduled_workout(entry_id: str):
    await udb.scheduled_workouts.delete_one({"id": entry_id})
    return {"ok": True}


class MoveSessionRequest(BaseModel):
    week_start: str = "2025-05-12"
    session_type: str  # cycling | fb50 | wellness
    from_date: str
    to_date: str


@api_router.post("/calendar/move")
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
        {"id": "googlefit", "name": "Google Fit", "detail": "Steps, heart points & activity", "connected": False, "icon": "fitness-outline", "color": "green"},
        {"id": "samsung", "name": "Samsung Health", "detail": "Heart rate, sleep & steps", "connected": False, "icon": "watch-outline", "color": "blue"},
        {"id": "wellness", "name": "Harmony Wellness", "detail": "FB50 & Peaceful Companion", "connected": True, "icon": "flower-outline", "color": "purple"},
    ],
}


@api_router.get("/progress")
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


@api_router.get("/progress/timeline")
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


@api_router.get("/routes")
async def get_routes():
    return ROUTES_DATA


@api_router.get("/wellness")
async def get_wellness():
    return WELLNESS_DATA


@api_router.get("/community")
async def get_community():
    return COMMUNITY_DATA


api_router.include_router(plans_admin.plans_router, dependencies=[Depends(auth.require_admin)])
api_router.include_router(auth.auth_router)
api_router.include_router(auth.admin_auth_router)
app.include_router(api_router)
app.include_router(push.router)
app.include_router(admin_routes.admin_router)
push.init(db)
admin_routes.init(db)

app.add_middleware(auth.AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _seed_plans_on_startup():
    """Move plan DEFINITIONS into MongoDB (non-destructive) and refresh the
    couch-to-road cache from the DB so edits made via plans_admin take effect."""
    plans_admin.init(db, on_change=_on_plan_change)
    try:
        await plans_admin.seed_plans({
            "couch-to-road": {**CTR_PLAN, "type": "structured", "title": CTR_PLAN.get("title", "From Couch to Road")},
            "ride-stronger": {**RS_PLAN, "type": "structured", "title": RS_PLAN.get("title", "Ride Stronger")},
            "ride-beyond": {**RB_PLAN, "type": "structured", "title": RB_PLAN.get("title", "Ride Beyond")},
            "build-and-climb": {**BUILD_AND_CLIMB, "type": "roadmap"},
        })
        await _reload_ctr_from_db()
        # Ride Stronger is a code-owned default: force-refresh its definition from
        # the shipped JSON each boot so new phases/weeks land without a manual edit.
        # (Use the module-loaded RS_PLAN from JSON — do NOT reload from DB first,
        # or a stale DB doc would clobber the fresh definition.)
        await plans_admin._db.plans.update_one(
            {"id": "ride-stronger"},
            {"$set": {**RS_PLAN, "type": "structured", "level": "Intermediate"}},
            upsert=True,
        )
        await _reload_rs_from_db()
        # Ride Beyond (Advanced) is likewise code-owned — force-refresh from the
        # shipped JSON each boot so new phases/weeks land automatically.
        await plans_admin._db.plans.update_one(
            {"id": "ride-beyond"},
            {"$set": {**RB_PLAN, "type": "structured", "level": "Advanced"}},
            upsert=True,
        )
        await _reload_rb_from_db()
        # Tag the shipped plans with their target rider level (idempotent) so the
        # onboarding recommender can match by level.
        await plans_admin._db.plans.update_one({"id": "couch-to-road"}, {"$set": {"level": "Beginner"}})
        await plans_admin._db.plans.update_one({"id": "ride-stronger"}, {"$set": {"level": "Intermediate"}})
        await plans_admin._db.plans.update_one({"id": "ride-beyond"}, {"$set": {"level": "Advanced"}})
        await plans_admin._db.plans.update_one({"id": "build-and-climb"}, {"$unset": {"level": ""}})
        logger.info("Plan definitions seeded/loaded from MongoDB")
    except Exception:
        logging.exception("plan seeding failed")
    try:
        await auth.ensure_indexes()
        seeded = await auth.seed_admins()
        if seeded:
            logger.info(f"Seeded {seeded} admin user(s) from ADMIN_EMAILS")
        if await auth.seed_login_admin():
            logger.info("Seeded password-based console admin from ADMIN_LOGIN_EMAIL")
        migrated = await auth.migrate_singleton("greenlantern@roujaune.app", "rideon9900")
        if migrated:
            logger.info(f"Migrated single-user data to demo account {migrated}")
    except Exception:
        logging.exception("auth init failed")
    # Kick off the benchmark-week push reminder loop (day-before / day-of).
    try:
        asyncio.create_task(push.reminder_loop())
        logger.info("Benchmark reminder loop started")
    except Exception:
        logging.exception("failed to start benchmark reminder loop")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
