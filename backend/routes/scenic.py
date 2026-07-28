"""Scenic Cycling — rider-facing POV YouTube ride catalog.

Scenic rides are a DISTINCT experience from the training Virtual Routes
(which are gradient/ERG-driven with a composited 2.5D rider). The scenic
catalog is fully admin-managed through the Harmony Wellness Group console and
persisted in the `scenic_routes` collection — it never reuses the training
`VIRTUAL_ROUTES` data.

Surfaces
--------
Public (rider app):
  GET  /api/scenic/routes           — published scenic routes (rider feed)
  GET  /api/scenic/routes/{id}      — a single published scenic route
  GET  /api/scenic/last             — rider's most recent scenic ride

Admin (HWG console, gated by require_admin, mutations audited):
  GET    /api/admin/scenic-routes
  GET    /api/admin/scenic-routes/{id}
  POST   /api/admin/scenic-routes
  PUT    /api/admin/scenic-routes/{id}
  DELETE /api/admin/scenic-routes/{id}
  POST   /api/admin/scenic-routes/{id}/publish
  POST   /api/admin/scenic-routes/{id}/archive
"""
from __future__ import annotations

import datetime
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
from auth import udb
from db import db

# Public rider-facing router (mounted under /api by server.py).
router = APIRouter()

# Admin console router (fully gated + audited).
admin_router = APIRouter(prefix="/api/admin", tags=["admin-scenic"],
                         dependencies=[Depends(auth.require_admin)])


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def _audit(action: str, target: str, meta: Optional[dict] = None) -> None:
    """Best-effort admin audit — never blocks the mutation."""
    try:
        actor = auth._current_user.get() or {}
        await db.admin_audit.insert_one({
            "actor": actor.get("user_id"),
            "actor_email": actor.get("email"),
            "action": action,
            "target": target,
            "meta": meta or {},
            "at": _now(),
        })
    except Exception:
        pass


_YT_RE = re.compile(r"(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{11})")


def _yt_id(value: Optional[str]) -> Optional[str]:
    """Accept a raw 11-char video id OR any common YouTube URL and normalise
    to the bare video id."""
    if not value:
        return None
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    m = _YT_RE.search(value)
    return m.group(1) if m else None


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "scenic-route"


def _thumb(doc: dict) -> Optional[str]:
    if doc.get("thumbnail_url"):
        return doc["thumbnail_url"]
    yid = doc.get("youtube_id")
    return f"https://img.youtube.com/vi/{yid}/hqdefault.jpg" if yid else None


def _public(doc: dict) -> dict:
    """Rider-facing projection of a scenic route. Includes the richer route
    metadata (waypoints/highlights, terrain, difficulty, country) so the ride
    picker — and the future live-riding HUD — can show meaningful detail."""
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "place": doc.get("place") or "",
        "country": doc.get("country") or "",
        "region": doc.get("region") or "",
        "youtube_id": doc.get("youtube_id"),
        "duration_min": doc.get("duration_min"),
        "distance_km": doc.get("distance_km"),
        "elevation_m": doc.get("elevation_m"),
        "tag": doc.get("tag") or "Scenic",
        "terrain": doc.get("terrain") or "",
        "difficulty": doc.get("difficulty") or "",
        "surface": doc.get("surface") or "",
        "highlights": doc.get("highlights") or [],
        "thumbnail": _thumb(doc),
        "description": doc.get("description") or "",
    }


# --------------------------------------------------------------------------- #
#  Public (rider app)                                                         #
# --------------------------------------------------------------------------- #
@router.get("/scenic/routes")
async def list_scenic_routes():
    """Published scenic routes for the rider Scenic Cycling experience,
    ordered by `sort` then creation time. Empty until an admin publishes some
    (we never fabricate scenic routes)."""
    cur = db.scenic_routes.find({"status": "published"}, {"_id": 0}).sort(
        [("sort", 1), ("created_at", 1)])
    docs = await cur.to_list(500)
    return {"routes": [_public(d) for d in docs]}


@router.get("/scenic/routes/{route_id}")
async def get_scenic_route(route_id: str):
    doc = await db.scenic_routes.find_one({"id": route_id, "status": "published"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    return _public(doc)


@router.get("/scenic/last")
async def scenic_last_ride():
    """Most recent scenic ride for the 'Continue your journey' rail. Scenic
    rides are logged with workout_id 'scenic-<routeId>' — kept separate from
    training virtual rides ('virtual-<routeId>'). Returns {available:false}
    when the rider has not ridden a scenic route yet (never fabricated)."""
    doc = await udb.ride_history.find_one(
        {"workout_id": {"$regex": "^scenic-"}},
        sort=[("created_at", -1)],
    )
    if not doc:
        return {"available": False}
    route = doc.get("route") or {}
    rid = (doc.get("workout_id") or "").replace("scenic-", "", 1) or route.get("id")
    return {
        "available": True,
        "routeId": rid,
        "name": route.get("name") or (doc.get("workout") or "").replace("Scenic Ride · ", ""),
        "place": route.get("place"),
        "distance_km": doc.get("distance_km"),
        "duration_sec": doc.get("duration_sec"),
        "at": doc.get("created_at"),
    }


# --------------------------------------------------------------------------- #
#  Favourites (rider-scoped Saved Destinations)                               #
# --------------------------------------------------------------------------- #
@router.get("/scenic/favourites")
async def list_favourites():
    """The rider's saved scenic destinations (full published routes, newest
    saved first). Ids of unpublished/deleted routes are silently skipped."""
    favs = await udb.scenic_favourites.find({}, {"_id": 0}).sort("at", -1).to_list(500)
    ids = [f["route_id"] for f in favs]
    order = {rid: i for i, rid in enumerate(ids)}
    docs = await db.scenic_routes.find(
        {"id": {"$in": ids}, "status": "published"}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: order.get(d.get("id"), 9999))
    return {"ids": ids, "routes": [_public(d) for d in docs]}


@router.post("/scenic/favourites/{route_id}")
async def add_favourite(route_id: str):
    route = await db.scenic_routes.find_one({"id": route_id}, {"_id": 0, "id": 1})
    if not route:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    await udb.scenic_favourites.update_one(
        {"route_id": route_id}, {"$set": {"route_id": route_id, "at": _now()}}, upsert=True)
    return {"saved": route_id}


@router.delete("/scenic/favourites/{route_id}")
async def remove_favourite(route_id: str):
    await udb.scenic_favourites.delete_one({"route_id": route_id})
    return {"removed": route_id}


# --------------------------------------------------------------------------- #
#  Admin (HWG console)                                                        #
# --------------------------------------------------------------------------- #
class ScenicRouteIn(BaseModel):
    id: Optional[str] = None
    name: str
    place: Optional[str] = ""
    country: Optional[str] = ""
    region: Optional[str] = ""
    youtube_id: str            # raw id OR any YouTube URL (normalised on save)
    duration_min: Optional[int] = None
    distance_km: Optional[float] = None
    elevation_m: Optional[int] = None
    tag: Optional[str] = "Scenic"
    terrain: Optional[str] = ""
    difficulty: Optional[str] = ""
    surface: Optional[str] = ""
    highlights: Optional[list] = None    # ordered waypoints/points of interest
    thumbnail_url: Optional[str] = None
    description: Optional[str] = ""
    status: Optional[str] = "draft"   # draft | published
    sort: Optional[int] = 0


class ScenicRoutePatch(BaseModel):
    name: Optional[str] = None
    place: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    youtube_id: Optional[str] = None
    duration_min: Optional[int] = None
    distance_km: Optional[float] = None
    elevation_m: Optional[int] = None
    tag: Optional[str] = None
    terrain: Optional[str] = None
    difficulty: Optional[str] = None
    surface: Optional[str] = None
    highlights: Optional[list] = None
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    sort: Optional[int] = None


def _validate_status(status: Optional[str]) -> str:
    if status not in (None, "draft", "published"):
        raise HTTPException(status_code=422, detail="status must be draft|published")
    return status or "draft"


@admin_router.get("/scenic-routes")
async def admin_list_scenic(status: Optional[str] = None):
    """All scenic routes (draft + published) for the console, newest first.
    Optional ?status=draft|published filter."""
    filt: dict = {}
    if status:
        filt["status"] = _validate_status(status)
    cur = db.scenic_routes.find(filt, {"_id": 0}).sort([("sort", 1), ("created_at", -1)])
    items = await cur.to_list(1000)
    return {"items": items, "total": len(items)}


@admin_router.get("/scenic-routes/{route_id}")
async def admin_get_scenic(route_id: str):
    doc = await db.scenic_routes.find_one({"id": route_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    return doc


@admin_router.post("/scenic-routes")
async def admin_create_scenic(body: ScenicRouteIn):
    yid = _yt_id(body.youtube_id)
    if not yid:
        raise HTTPException(status_code=422, detail="youtube_id must be a valid YouTube id or URL")
    status = _validate_status(body.status)
    rid = (body.id or "").strip() or _slugify(body.name)
    if await db.scenic_routes.find_one({"id": rid}):
        raise HTTPException(status_code=409, detail="Scenic route id already exists")
    doc = {
        "id": rid,
        "name": body.name.strip(),
        "place": (body.place or "").strip(),
        "country": (body.country or "").strip(),
        "region": (body.region or "").strip(),
        "youtube_id": yid,
        "duration_min": body.duration_min,
        "distance_km": body.distance_km,
        "elevation_m": body.elevation_m,
        "tag": (body.tag or "Scenic").strip(),
        "terrain": (body.terrain or "").strip(),
        "difficulty": (body.difficulty or "").strip(),
        "surface": (body.surface or "").strip(),
        "highlights": body.highlights or [],
        "thumbnail_url": (body.thumbnail_url or None),
        "description": (body.description or "").strip(),
        "status": status,
        "sort": int(body.sort or 0),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.scenic_routes.insert_one(dict(doc))
    await _audit("scenic.create", rid, {"status": status})
    return {"item": doc}


@admin_router.put("/scenic-routes/{route_id}")
async def admin_update_scenic(route_id: str, body: ScenicRoutePatch):
    existing = await db.scenic_routes.find_one({"id": route_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    updates: dict = {}
    data = body.dict(exclude_unset=True)
    if "youtube_id" in data:
        yid = _yt_id(data["youtube_id"])
        if not yid:
            raise HTTPException(status_code=422, detail="youtube_id must be a valid YouTube id or URL")
        updates["youtube_id"] = yid
    if "status" in data:
        updates["status"] = _validate_status(data["status"])
    for k in ("name", "place", "country", "region", "duration_min", "distance_km", "elevation_m",
              "tag", "terrain", "difficulty", "surface", "highlights",
              "thumbnail_url", "description", "sort"):
        if k in data:
            updates[k] = data[k]
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = _now()
    await db.scenic_routes.update_one({"id": route_id}, {"$set": updates})
    await _audit("scenic.update", route_id, {"fields": sorted(updates.keys())})
    doc = await db.scenic_routes.find_one({"id": route_id}, {"_id": 0})
    return {"item": doc}


@admin_router.delete("/scenic-routes/{route_id}")
async def admin_delete_scenic(route_id: str):
    res = await db.scenic_routes.delete_one({"id": route_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    await _audit("scenic.delete", route_id, {})
    return {"deleted": route_id}


async def _set_status(route_id: str, status: str) -> dict:
    res = await db.scenic_routes.update_one(
        {"id": route_id}, {"$set": {"status": status, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    await _audit(f"scenic.{status}", route_id, {"status": status})
    return {"id": route_id, "status": status}


@admin_router.post("/scenic-routes/{route_id}/publish")
async def admin_publish_scenic(route_id: str):
    return await _set_status(route_id, "published")


@admin_router.post("/scenic-routes/{route_id}/archive")
async def admin_archive_scenic(route_id: str):
    return await _set_status(route_id, "draft")


# --------------------------------------------------------------------------- #
#  Seed — idempotent sample POV catalog (only when the collection is empty)   #
#  so the rider app + console are demonstrable before the client supplies      #
#  their own YouTube routes. Admins can edit/delete these freely.              #
# --------------------------------------------------------------------------- #
_SEED = [
    {"id": "dutch-countryside", "name": "Dutch Countryside Cruise", "place": "Netherlands",
     "region": "Countryside",
     "youtube_id": "q0jLGrwk1MQ", "duration_min": 60, "distance_km": 24, "elevation_m": 60,
     "tag": "Flat & Peaceful", "sort": 0,
     "description": "Glide past open polders, canals and windmills on quiet Dutch lanes."},
    {"id": "german-country-roads", "name": "German Country Roads", "place": "Bavaria, Germany",
     "region": "Countryside",
     "youtube_id": "d6ib9yH3cTE", "duration_min": 30, "distance_km": 12, "elevation_m": 140,
     "tag": "Rolling Hills", "sort": 1,
     "description": "A gentle roll through peaceful German farmland — natural sounds, no music."},
    {"id": "lake-achensee", "name": "Lake Achensee", "place": "Tyrol, Austria",
     "region": "Lakes",
     "youtube_id": "Pzx9hk1UT1Y", "duration_min": 80, "distance_km": 32, "elevation_m": 320,
     "tag": "Alpine Lakeside", "sort": 2,
     "description": "Turquoise alpine water and mountain air on a relaxed lakeside loop."},
    {"id": "carolina-greenway", "name": "Carolina Greenway", "place": "Greenville, USA",
     "region": "Countryside",
     "youtube_id": "ppP-wVHVhyk", "duration_min": 45, "distance_km": 18, "elevation_m": 110,
     "tag": "Riverside Trail", "sort": 3,
     "description": "A tranquil riverside greenway with dappled shade and easy miles."},
]


async def seed_scenic_routes() -> None:
    """Insert the sample scenic catalog once, only if empty."""
    try:
        if await db.scenic_routes.count_documents({}) > 0:
            return
        now = _now()
        docs = [{**s, "thumbnail_url": None, "status": "published",
                 "created_at": now, "updated_at": now} for s in _SEED]
        await db.scenic_routes.insert_many(docs)
    except Exception:
        pass
