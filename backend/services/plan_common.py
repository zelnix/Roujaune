"""Shared plan-resolution helpers used by the plan engine (server.py) and the
benchmark/coach domain routers. Kept in services/ to avoid a circular import.
"""
import logging
from typing import Optional

import auth
from auth import udb
from services.rider_common import _rider_doc

# The structured, week-by-week plans driven by the generalized plan engine.
STRUCTURED_PLAN_IDS = {"couch-to-road", "ride-stronger", "ride-beyond"}
_RIDE_PREFIX = {"couch-to-road": "ctr-ride-", "ride-stronger": "rs-ride-", "ride-beyond": "rb-ride-"}


async def _active_plan_id() -> str:
    """The plan the current rider is on. An explicit `assigned_plan_id` (on the
    rider profile, or failing that the user account) wins, then we infer from the
    rider's real training state. If none of those exist the rider simply has NO
    plan yet — we return "" and NEVER fall back to a demo plan."""
    try:
        rider = await _rider_doc()
        pid = (rider.get("assigned_plan_id") or "").strip()
        if pid:
            return pid
        try:
            u = await auth._db.users.find_one({"user_id": auth.current_user_id()}) or {}
            upid = (u.get("assigned_plan_id") or "").strip()
            if upid:
                return upid
        except Exception:
            pass
        try:
            st = await udb.plan_state.find_one(
                {"id": {"$in": list(STRUCTURED_PLAN_IDS)}},
                sort=[("updated_at", -1)],
            )
            if st and st.get("id"):
                return st["id"]
        except Exception:
            pass
    except Exception:
        logging.exception("_active_plan_id failed")
    return ""


async def _plan_id_or_active(plan_id: Optional[str]) -> str:
    """Resolve the plan id to operate on. The client historically passes the
    legacy "build-and-climb" default; treat that (and empty) as 'use the rider's
    real active plan' so we never fabricate the demo plan."""
    if plan_id and plan_id not in ("build-and-climb", "none", ""):
        return plan_id
    return await _active_plan_id()
