"""
Admin API surface for the Harmony Wellness Group console.

All routes are gated by `auth.require_admin` (403 for non-admins, 401 for
anonymous). Mounted at /api/admin/*. Mutations are recorded to `admin_audit`.

Contract reference: /app/memory/roujaune_admin_api_contract.md
"""
from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth

admin_router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(auth.require_admin)])

_db = None


def init(db) -> None:
    global _db
    _db = db


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def _audit(action: str, target: str, meta: Optional[dict] = None) -> None:
    actor = auth.require_user()
    await _db.admin_audit.insert_one({
        "actor": actor.get("user_id"),
        "actor_email": actor.get("email"),
        "action": action,
        "target": target,
        "meta": meta or {},
        "at": _now(),
    })


# --------------------------------------------------------------------------- #
#  Health / metrics                                                           #
# --------------------------------------------------------------------------- #
@admin_router.get("/health")
async def health():
    try:
        await _db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok, "time": _now()}


@admin_router.get("/metrics")
async def metrics():
    return {
        "users": await _db.users.count_documents({}),
        "admins": await _db.users.count_documents({"role": "admin"}),
        "plans": await _db.plans.count_documents({}),
        "benchmark_results": await _db.benchmark_results.count_documents({}),
        "time": _now(),
    }


# --------------------------------------------------------------------------- #
#  Users                                                                      #
# --------------------------------------------------------------------------- #
@admin_router.get("/users")
async def list_users(q: Optional[str] = None, limit: int = 50, skip: int = 0):
    limit = max(1, min(limit, 200))
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]}
    cur = _db.users.find(filt, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(max(0, skip)).limit(limit)
    items = await cur.to_list(limit)
    total = await _db.users.count_documents(filt)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/users/{user_id}")
async def get_user(user_id: str):
    u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    profile = await _db.rider_profile.find_one({"user_id": user_id}, {"_id": 0})
    bench = await _db.benchmark_profile.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": u, "rider_profile": profile, "benchmark_profile": bench}


class UserPatch(BaseModel):
    role: Optional[str] = None
    assigned_plan_id: Optional[str] = None
    suspended: Optional[bool] = None


@admin_router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch):
    updates: dict = {}
    if body.role is not None:
        if body.role not in ("rider", "support", "admin"):
            raise HTTPException(status_code=422, detail="role must be rider|support|admin")
        updates["role"] = body.role
    if body.assigned_plan_id is not None:
        updates["assigned_plan_id"] = body.assigned_plan_id
    if body.suspended is not None:
        updates["suspended"] = body.suspended
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await _db.users.update_one({"user_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await _audit("user.patch", user_id, updates)
    u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": u}


# --------------------------------------------------------------------------- #
#  Audit log                                                                  #
# --------------------------------------------------------------------------- #
@admin_router.get("/audit")
async def audit_log(limit: int = 50, skip: int = 0):
    limit = max(1, min(limit, 200))
    cur = _db.admin_audit.find({}, {"_id": 0}).sort("at", -1).skip(max(0, skip)).limit(limit)
    return {"items": await cur.to_list(limit)}
