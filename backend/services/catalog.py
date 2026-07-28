"""Rider workout catalog: server-managed global catalog (seeded from bundled
JSON) overlaid by each rider's personal editable copies.

Shared by server.py startup (seed_workout_catalog) and routes/catalog.py.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from db import db, ROOT_DIR

# Bundled seed for the global `workout_catalog` collection.
with open(ROOT_DIR / "workout_catalog.json", encoding="utf-8") as _f:
    CATALOG_SEED = json.load(_f)

# Fields a rider may edit on their own copy of a catalog workout.
_CATALOG_EDITABLE = {
    "name", "typeId", "typeName", "color", "icon", "duration", "tss", "if",
    "difficulty", "description", "focus", "zones", "level", "environment", "segmentSpec",
}


async def seed_workout_catalog():
    """Non-destructive seed so live edits made via the console are never
    overwritten on restart."""
    for w in CATALOG_SEED:
        payload = {k: v for k, v in w.items() if k != "id"}
        await db.workout_catalog.update_one(
            {"id": w["id"]},
            {"$setOnInsert": {**payload, "seeded_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )


async def _global_catalog() -> list:
    docs = await db.workout_catalog.find({}, {"_id": 0}).to_list(2000)
    return docs or [dict(w) for w in CATALOG_SEED]


async def resolve_catalog(uid: Optional[str]) -> list:
    """The rider's effective catalog: global overlaid by their personal copies."""
    base = {w["id"]: w for w in await _global_catalog()}
    if uid:
        copies = await db.rider_workouts.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(2000)
        for c in copies:
            base[c["id"]] = c
    return list(base.values())


async def resolve_workout(uid: Optional[str], wid: str) -> Optional[dict]:
    """A single workout, preferring the rider's copy, then global, then bundled."""
    if uid:
        c = await db.rider_workouts.find_one({"user_id": uid, "id": wid}, {"_id": 0, "user_id": 0})
        if c:
            return c
    g = await db.workout_catalog.find_one({"id": wid}, {"_id": 0})
    if g:
        return g
    for w in CATALOG_SEED:
        if w["id"] == wid:
            return dict(w)
    return None
