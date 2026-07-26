"""
Emergent-managed push notifications (SuprSend relay).

Provides:
  - POST /api/register-push  — relays a device token registration upstream.
  - send_push()              — server-side trigger helper (event-driven pushes).
  - Benchmark-week reminder loop — a lightweight background task that sends a
    "day before" and "morning of" reminder for each scheduled benchmark test.

The EMERGENT_PUSH_KEY is a placeholder in dev and is replaced by the deployer at
build time, so all upstream calls are wrapped so a missing/invalid key never
blocks the primary operation.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

router = APIRouter(prefix="/api")

_db = None


def init(db):
    """Store the shared Mongo handle so the reminder loop can read benchmark weeks."""
    global _db
    _db = db


# --------------------------------------------------------------------------- #
#  Registration + trigger relay                                               #
# --------------------------------------------------------------------------- #
class RegisterPushBody(BaseModel):
    user_id: str
    platform: str   # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: list[str], data: dict, idempotency_key: str | None = None) -> None:
    """Trigger a push to one or more user IDs. Recipients are resolved to device
    tokens internally by the relay (we never store tokens ourselves)."""
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


# --------------------------------------------------------------------------- #
#  Benchmark-week reminder scheduler                                          #
# --------------------------------------------------------------------------- #
_REMINDER_INTERVAL_SEC = 3 * 60 * 60  # re-check every 3 hours


async def _run_benchmark_reminders_once() -> None:
    """Scan all active benchmark weeks and send day-before / day-of reminders
    for each scheduled test day, marking each so it is sent at most once."""
    if _db is None:
        return
    today = datetime.now(timezone.utc).date()
    cursor = _db.benchmark_week.find({"active": True})
    weeks = await cursor.to_list(length=5000)
    for wk in weeks:
        uid = wk.get("user_id")
        if not uid:
            continue
        days = wk.get("days") or []
        changed = False
        for day in days:
            if day.get("kind") != "test" or day.get("status") != "scheduled":
                continue
            try:
                day_date = date.fromisoformat(str(day.get("date")))
            except (ValueError, TypeError):
                continue
            label = day.get("label") or "your benchmark test"
            delta = (day_date - today).days

            if delta == 1 and not day.get("remindedDayBefore"):
                try:
                    await send_push(
                        recipients=[uid],
                        data={
                            "title": "Benchmark test tomorrow",
                            "message": f"{label} is scheduled for tomorrow. Rest up and fuel well tonight.",
                            "action_url": "/benchmark",
                        },
                        idempotency_key=f"bmweek-{uid}-{day_date.isoformat()}-before",
                    )
                    day["remindedDayBefore"] = True
                    changed = True
                except Exception as e:
                    logger.warning(f"benchmark day-before push failed (non-blocking): {e}")

            if delta == 0 and not day.get("remindedDayOf"):
                try:
                    await send_push(
                        recipients=[uid],
                        data={
                            "title": "Benchmark test today",
                            "message": f"Today is {label}. Warm up thoroughly and give it your best effort.",
                            "action_url": "/benchmark",
                        },
                        idempotency_key=f"bmweek-{uid}-{day_date.isoformat()}-of",
                    )
                    day["remindedDayOf"] = True
                    changed = True
                except Exception as e:
                    logger.warning(f"benchmark day-of push failed (non-blocking): {e}")

        if changed:
            try:
                await _db.benchmark_week.update_one(
                    {"user_id": uid, "id": wk.get("id", "current")},
                    {"$set": {"days": days}},
                )
            except Exception as e:
                logger.warning(f"benchmark reminder flag write failed: {e}")


async def reminder_loop() -> None:
    """Background loop: fire benchmark reminders shortly after boot, then every
    few hours. Never crashes the app — all errors are logged and swallowed."""
    await asyncio.sleep(30)  # let the app finish booting
    while True:
        try:
            await _run_benchmark_reminders_once()
        except Exception:
            logger.exception("benchmark reminder loop iteration failed")
        await asyncio.sleep(_REMINDER_INTERVAL_SEC)
