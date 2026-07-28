"""Rider workout catalog — read + copy-on-assign + personal edits."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

import auth
from db import db
from models import WorkoutEdit
from services.catalog import resolve_catalog, resolve_workout, _CATALOG_EDITABLE

router = APIRouter()


@router.get("/catalog")
async def get_catalog():
    """The current rider's effective catalog (global overlaid by their copies)."""
    return {"items": await resolve_catalog(auth.current_user_id())}


@router.get("/catalog/{workout_id}")
async def get_catalog_item(workout_id: str):
    w = await resolve_workout(auth.current_user_id(), workout_id)
    if not w:
        raise HTTPException(status_code=404, detail="Workout not found")
    return w


@router.post("/catalog/{workout_id}/assign")
async def assign_catalog_workout(workout_id: str):
    """Copy-on-assign: give the current rider their own editable copy of a workout."""
    uid = auth.current_user_id()
    src = await resolve_workout(uid, workout_id)
    if not src:
        raise HTTPException(status_code=404, detail="Workout not found")
    doc = {k: v for k, v in src.items() if k not in ("seeded_at",)}
    doc["id"] = workout_id
    doc.setdefault("origin_id", workout_id)
    doc["assigned_at"] = datetime.now(timezone.utc).isoformat()
    await db.rider_workouts.update_one(
        {"user_id": uid, "id": workout_id}, {"$set": {**doc, "user_id": uid}}, upsert=True)
    doc.pop("user_id", None)
    return {"assigned": workout_id, "workout": doc}


@router.put("/catalog/{workout_id}")
async def edit_my_workout(workout_id: str, body: WorkoutEdit):
    """Edit the rider's own copy (auto-forks from global on first edit)."""
    uid = auth.current_user_id()
    existing = await db.rider_workouts.find_one({"user_id": uid, "id": workout_id}, {"_id": 0, "user_id": 0})
    if not existing:
        src = await resolve_workout(uid, workout_id)
        if not src:
            raise HTTPException(status_code=404, detail="Workout not found")
        existing = {**{k: v for k, v in src.items() if k != "seeded_at"}, "origin_id": workout_id}
    for k, v in (body.patch or {}).items():
        if k in _CATALOG_EDITABLE:
            existing[k] = v
    existing["id"] = workout_id
    existing["edited_at"] = datetime.now(timezone.utc).isoformat()
    await db.rider_workouts.update_one(
        {"user_id": uid, "id": workout_id}, {"$set": {**existing, "user_id": uid}}, upsert=True)
    existing.pop("user_id", None)
    return {"workout": existing}


@router.delete("/catalog/{workout_id}/reset")
async def reset_my_workout(workout_id: str):
    """Discard the rider's copy and revert to the global workout."""
    uid = auth.current_user_id()
    res = await db.rider_workouts.delete_one({"user_id": uid, "id": workout_id})
    return {"reset": workout_id, "reverted": res.deleted_count > 0}
