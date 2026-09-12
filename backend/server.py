from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query, Body, Depends
from fastapi.concurrency import run_in_threadpool
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

from core import now_iso
from models import *  # noqa: F401,F403  (Pydantic models)
from services.readiness import compute_readiness
from services.benchmark_decision import decide_benchmark, BenchmarkDecisionInput
from services.rider_level import compute_rider_level
from services.catalog import seed_workout_catalog  # noqa: E402
from routes import rider as rider_routes
from routes import benchmark as benchmark_routes
from routes import plan as plan_routes
from routes import coach as coach_routes
from services import plan_engine
from services.plan_engine import (
    BUILD_AND_CLIMB, _reload_ctr_from_db, _reload_rs_from_db, _reload_rb_from_db, _on_plan_change,
)
import plans_admin
import companion_plan
import auth
import push
import admin_routes
import screen_capture
from auth import udb


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (shared handle lives in db.py to avoid import cycles)
from db import client, db, mongo_url  # noqa: E402
auth.init(db)

# Outdoor ride syncing (imported AFTER load_dotenv so provider/env config resolves)
import providers as _providers_pkg  # noqa: E402  (bootstraps the provider registry)
from providers.base import PROVIDERS, get_provider  # noqa: E402
from providers.sandbox import generate_sandbox_activities  # noqa: E402
import crypto_util  # noqa: E402
import activity_sync  # noqa: E402


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------










# ----------------------------- REST -----------------------------
# ----------------------- Coach: AI coaching cue -----------------------
# coach_system / coach_chat_system / STYLE_TONE moved to services.coach_llm




# Coach routes moved to routes/coach.py

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
        self.mode = "live"  # "live" = only real sensor data; "demo" = simulate
        self.dropout_until = 0.0
        self.elapsed = 0.0
        self.distance = 0.0
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
        if self.mode == "demo":
            # Demo mode fabricates a plausible ride so the app can be previewed
            # without any hardware connected.
            target_power = self.base_target * (self.erg / 100.0)
            self.power = max(0.0, target_power + random.uniform(-8, 8))
            self.cadence = max(0.0, 88.0 + random.uniform(-4, 4))
            target_hr = 118 + (self.power - 150) * 0.34
            self.hr += (target_hr - self.hr) * 0.15 + random.uniform(-1.5, 1.5)
            self.hr = max(90.0, min(185.0, self.hr))
            # Speed model calibrated to real road cycling: flat-road speed rises
            # ~ with the cube-root of power (aero-dominated), and is reduced on
            # climbs. Tuned so ~250 W ≈ 35 km/h on the flat (the old linear model
            # under-read by ~40%). gradient is a % grade.
            flat_kmh = 3.6 * (max(0.0, self.power) / 0.27) ** (1.0 / 3.0)
            grade_factor = 1.0 / (1.0 + max(0.0, self.gradient) * 0.11)
            self.speed = max(0.0, flat_kmh * grade_factor + random.uniform(-0.4, 0.4))
        else:
            # LIVE mode: never fabricate. Only real sensor readings count.
            self.power = 0.0
            self.cadence = 0.0
            self.hr = 0.0
            self.speed = 0.0
        # Real sensor data (BLE) overrides while it is fresh (both modes).
        if self.sensor_fresh:
            if self.sensor_power is not None:
                self.power = float(self.sensor_power)
            if self.sensor_cadence is not None:
                self.cadence = float(self.sensor_cadence)
            if self.sensor_hr is not None:
                self.hr = float(self.sensor_hr)
            if self.sensor_speed is not None:
                self.speed = float(self.sensor_speed)
        self.elapsed += dt
        self.distance += self.speed * dt / 3600.0

    def sample(self) -> dict:
        if self.sensor_fresh:
            source = "sensor"          # measured from a real BLE device
        elif self.mode == "demo":
            source = "estimated"       # simulated preview data
        else:
            source = "disconnected"    # live ride, no sensor data yet
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
            "source": source,
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
                elif t == "mode":
                    m = msg.get("mode")
                    if m in ("live", "demo"):
                        sim.mode = m
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
# Plan state (BUILD_AND_CLIMB, CTR/RS/RB) + reloads moved to services.plan_engine


# ── Workout catalog (server-managed; seeded from bundled JSON) ───────────────












# Registry of structured plans driven by the generalized plan engine below.
# Plan helpers (_struct_ctx.._ctr_state) moved to services.plan_engine



# Plan helpers (_ctr_progress.._ctr_calendar_week) moved to services.plan_engine



# _ctr_plan_response / _with_adaptation_meta moved to services.plan_engine



# Returned when the rider has no plan assigned. The client renders a blank
# plan with a prompt (choose a plan, ask the coach to build one, or create
# your own). We NEVER fabricate a demo plan.
# NO_PLAN moved to services.plan_engine



# /plan (get_plan) moved to routes/plan.py

# Coach adaptation summary/detail routes moved to routes/coach.py


@api_router.get("/openapi.json")
async def api_openapi():
    """Expose the OpenAPI schema through the /api ingress so the HWG console can
    import the contract (the root /openapi.json is not reachable via ingress)."""
    return app.openapi()


# --------------------------------------------------------------------------- #
#  Admin audit writer (shared by plan CRUD + admin config mutations)          #
# --------------------------------------------------------------------------- #
async def _admin_audit_write(action: str, target: str, meta: dict | None = None) -> None:
    """Record an admin mutation to `admin_audit`. Best-effort; never blocks."""
    try:
        actor = auth._current_user.get() or {}
        await db.admin_audit.insert_one({
            "actor": actor.get("user_id"),
            "actor_email": actor.get("email"),
            "action": action,
            "target": target,
            "meta": meta or {},
            "at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass


# --------------------------------------------------------------------------- #
#  Admin config surface — benchmark thresholds + coach presentation config    #
#  (HWG contract §5.5 / §5.6). Gated by require_admin, mounted at /api/admin.  #
# --------------------------------------------------------------------------- #
admin_cfg_router = APIRouter(prefix="/api/admin", tags=["admin-config"], dependencies=[Depends(auth.require_admin)])

# Safety policy is FIXED in code and MUST NOT be editable via the console.
COACH_SAFETY_POLICY = (
    "Coaches never override medical safety rules. On any red-flag symptom "
    "(chest pain/discomfort, fainting, severe breathlessness, palpitations, "
    "dizziness, fever/illness, or new/worsening pain) the app halts training and "
    "advises the rider to seek medical guidance, regardless of persona or "
    "presentation configuration."
)
DEFAULT_COACHES = [
    {"id": "alberto", "name": "Alberto", "gender": "male", "voice": "spanish-male", "style": "balanced"},
    {"id": "adriana", "name": "Adriana", "gender": "female", "voice": "spanish-female", "style": "balanced"},
]


@admin_cfg_router.get("/benchmark/config")
async def get_benchmark_config():
    return {"retest_days": dict(benchmark_routes.BM_RETEST_DAYS),
            "ftp_retest_days": benchmark_routes.FTP_RETEST_DAYS,
            "tests": benchmark_routes.BM_ALL_TESTS}




@admin_cfg_router.put("/benchmark/config")
async def put_benchmark_config(body: BenchmarkConfigPatch):
    if body.retest_days:
        for k, v in body.retest_days.items():
            if k in benchmark_routes.BM_RETEST_DAYS and isinstance(v, int) and v > 0:
                benchmark_routes.BM_RETEST_DAYS[k] = v
    if body.ftp_retest_days and body.ftp_retest_days > 0:
        benchmark_routes.FTP_RETEST_DAYS = int(body.ftp_retest_days)
    await db.admin_config.update_one(
        {"_id": "benchmark"},
        {"$set": {"retest_days": dict(benchmark_routes.BM_RETEST_DAYS),
                  "ftp_retest_days": benchmark_routes.FTP_RETEST_DAYS}},
        upsert=True,
    )
    await _admin_audit_write("benchmark.config.update", "benchmark", {"ftp_retest_days": benchmark_routes.FTP_RETEST_DAYS})
    return {"retest_days": dict(benchmark_routes.BM_RETEST_DAYS), "ftp_retest_days": benchmark_routes.FTP_RETEST_DAYS}


# Console-contract aliases: GET/PUT /api/admin/config/benchmarks
@admin_cfg_router.get("/config/benchmarks")
async def get_config_benchmarks():
    return await get_benchmark_config()


@admin_cfg_router.put("/config/benchmarks")
async def put_config_benchmarks(body: BenchmarkConfigPatch):
    return await put_benchmark_config(body)


@admin_cfg_router.get("/coaches")
async def get_coaches_config():
    doc = await db.admin_config.find_one({"_id": "coaches"}, {"_id": 0})
    coaches = (doc or {}).get("coaches", DEFAULT_COACHES)
    return {"coaches": coaches, "safety_policy": COACH_SAFETY_POLICY}




@admin_cfg_router.put("/coaches")
async def put_coaches_config(body: CoachesConfig):
    allowed = {"id", "name", "gender", "voice", "style"}
    cleaned = [{k: c.get(k) for k in allowed if k in c} for c in body.coaches]
    await db.admin_config.update_one({"_id": "coaches"}, {"$set": {"coaches": cleaned}}, upsert=True)
    await _admin_audit_write("coaches.config.update", "coaches", {"count": len(cleaned)})
    return {"coaches": cleaned, "safety_policy": COACH_SAFETY_POLICY}


api_router.include_router(plans_admin.plans_router, dependencies=[Depends(auth.require_admin)])
api_router.include_router(auth.auth_router)
api_router.include_router(auth.admin_auth_router)
# Extracted route modules (restructure into /routes).
from routes import system as system_routes  # noqa: E402
from routes import weather as weather_routes  # noqa: E402
api_router.include_router(system_routes.router)
from routes import connections as connections_routes  # noqa: E402
api_router.include_router(connections_routes.router)
from routes import workouts as workouts_routes  # noqa: E402
api_router.include_router(workouts_routes.router)
from routes import catalog as catalog_routes  # noqa: E402
api_router.include_router(catalog_routes.router)
from routes import notifications as notifications_routes  # noqa: E402
api_router.include_router(notifications_routes.router)
api_router.include_router(weather_routes.router)
api_router.include_router(rider_routes.router)
api_router.include_router(benchmark_routes.router)
api_router.include_router(plan_routes.router)
api_router.include_router(coach_routes.router)
from routes import scenic as scenic_routes  # noqa: E402
api_router.include_router(scenic_routes.router)
from routes import billing as billing_routes  # noqa: E402
api_router.include_router(billing_routes.router)
from routes import activities as activities_routes  # noqa: E402
api_router.include_router(activities_routes.router)
from routes import analysis as analysis_routes  # noqa: E402
api_router.include_router(analysis_routes.router)
from routes import feedback as feedback_routes  # noqa: E402
api_router.include_router(feedback_routes.router)
from routes import ride_photos as ride_photos_routes  # noqa: E402
api_router.include_router(ride_photos_routes.router)
app.include_router(api_router)
app.include_router(feedback_routes.admin_router)
app.include_router(push.router)
app.include_router(admin_routes.admin_router)
app.include_router(screen_capture.capture_router)
app.include_router(admin_cfg_router)
app.include_router(scenic_routes.admin_router)


@app.get("/health")
async def health():
    """Lightweight liveness probe for the deployment platform (200 OK)."""
    return {"status": "ok"}


push.init(db)
admin_routes.init(db, on_plan_change=_on_plan_change)
screen_capture.init(db)

app.add_middleware(auth.AuthMiddleware)
# CORS origins are env-driven (comma-separated CORS_ORIGINS). Defaults to "*" when
# unset so the app keeps working; set CORS_ORIGINS to lock down to the console +
# app origins for production. allow_credentials is disabled with the "*" wildcard
# because browsers reject credentialed wildcard responses.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=("*" not in _cors_origins),
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _seed_plans_on_startup():
    """Move plan DEFINITIONS into MongoDB (non-destructive) and refresh the
    couch-to-road cache from the DB so edits made via plans_admin take effect."""
    plans_admin.init(db, on_change=_on_plan_change, on_audit=_admin_audit_write)
    # Apply any admin-configured benchmark thresholds persisted in admin_config.
    try:
        cfg = await db.admin_config.find_one({"_id": "benchmark"})
        if cfg:
            for k, v in (cfg.get("retest_days") or {}).items():
                if k in benchmark_routes.BM_RETEST_DAYS and isinstance(v, int) and v > 0:
                    benchmark_routes.BM_RETEST_DAYS[k] = v
            if isinstance(cfg.get("ftp_retest_days"), int) and cfg["ftp_retest_days"] > 0:
                benchmark_routes.FTP_RETEST_DAYS = cfg["ftp_retest_days"]
    except Exception:
        pass
    try:
        await plans_admin.seed_plans({
            "couch-to-road": {**plan_engine.CTR_PLAN, "type": "structured", "title": plan_engine.CTR_PLAN.get("title", "From Couch to Road")},
            "ride-stronger": {**plan_engine.RS_PLAN, "type": "structured", "title": plan_engine.RS_PLAN.get("title", "Ride Stronger")},
            "ride-beyond": {**plan_engine.RB_PLAN, "type": "structured", "title": plan_engine.RB_PLAN.get("title", "Ride Beyond")},
            "build-and-climb": {**BUILD_AND_CLIMB, "type": "roadmap"},
        })
        await _reload_ctr_from_db()
        # Ride Stronger is a code-owned default: force-refresh its definition from
        # the shipped JSON each boot so new phases/weeks land without a manual edit.
        # (Use the module-loaded RS_PLAN from JSON — do NOT reload from DB first,
        # or a stale DB doc would clobber the fresh definition.)
        await plans_admin._db.plans.update_one(
            {"id": "ride-stronger"},
            {"$set": {**plan_engine.RS_PLAN, "type": "structured", "level": "Intermediate"}},
            upsert=True,
        )
        await _reload_rs_from_db()
        # Ride Beyond (Advanced) is likewise code-owned — force-refresh from the
        # shipped JSON each boot so new phases/weeks land automatically.
        await plans_admin._db.plans.update_one(
            {"id": "ride-beyond"},
            {"$set": {**plan_engine.RB_PLAN, "type": "structured", "level": "Advanced"}},
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
        await seed_workout_catalog()
        logger.info("Workout catalog seeded/loaded from MongoDB")
    except Exception:
        logging.exception("workout catalog seeding failed")
    try:
        await scenic_routes.seed_scenic_routes()
        logger.info("Scenic routes seeded/loaded from MongoDB")
    except Exception:
        logging.exception("scenic route seeding failed")
    try:
        import seed_prod
        await seed_prod.seed_production_data(db)
    except Exception:
        logging.exception("production content/demo seeding failed")
    try:
        # Runs AFTER seed_prod so routes inserted by the content seed also get
        # their missing distance/elevation filled (backfill is idempotent).
        await scenic_routes.backfill_route_metrics()
        logger.info("Scenic route metrics backfilled")
    except Exception:
        logging.exception("scenic route metrics backfill failed")
    try:
        import storage as _storage
        await run_in_threadpool(_storage.init_storage)
        logger.info("Object storage initialised")
    except Exception:
        logging.exception("object storage init failed (uploads may retry lazily)")
    try:
        # training_plans is a PER-USER collection; a single-field unique index on
        # `id` breaks multi-rider use (two riders can't each have "couch-to-road")
        # and caused DuplicateKeyErrors that fell back to the demo plan. Enforce a
        # compound unique index on (user_id, id) instead.
        info = await db.training_plans.index_information()
        if "id_1" in info:
            await db.training_plans.drop_index("id_1")
        await db.training_plans.create_index([("user_id", 1), ("id", 1)], unique=True, name="user_id_1_id_1")
    except Exception:
        logging.exception("training_plans index migration failed")
    try:
        await auth.ensure_indexes()
        seeded = await auth.seed_admins()
        if seeded:
            logger.info(f"Seeded {seeded} admin user(s) from ADMIN_EMAILS")
        if await auth.seed_login_admin():
            logger.info("Seeded password-based console admin from ADMIN_LOGIN_EMAIL")
    except Exception:
        logging.exception("auth init failed")
    # Kick off the benchmark-week push reminder loop (day-before / day-of).
    try:
        asyncio.create_task(push.reminder_loop())
        logger.info("Benchmark reminder loop started")
    except Exception:
        logging.exception("failed to start benchmark reminder loop")
    # Weekly digest email loop (Resend) — Mondays ~08:00 UTC to opted-in riders.
    try:
        from routes.analysis import weekly_digest_loop
        asyncio.create_task(weekly_digest_loop())
        logger.info("Weekly digest email loop started")
    except Exception:
        logging.exception("failed to start weekly digest loop")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
