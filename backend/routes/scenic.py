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
import uuid
import asyncio
import httpx
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


def _fallback_pois(doc: dict) -> list[dict]:
    """Derive simple points of interest from the route's highlights so the HUD
    always has real, route-specific content even without the LLM."""
    highs = [h for h in (doc.get("highlights") or []) if h]
    if not highs:
        highs = [doc.get("place") or doc.get("name") or "Scenic viewpoint"]
    n = len(highs)
    tag = (doc.get("tag") or "scenic").lower()
    out = []
    for i, h in enumerate(highs):
        at = round((i + 1) / (n + 1), 3)
        out.append({
            "order": i,
            "at_pct": at,
            "title": h,
            "description": f"A memorable stop along the {tag} route near {doc.get('place') or doc.get('name')}.",
            "narration": f"Coming up: {h}. Take a moment to enjoy the view as you ride past.",
        })
    return out


async def _generate_pois(doc: dict) -> list[dict]:
    """Ask the LLM to invent believable, timestamped points of interest for the
    route from its metadata. Falls back to highlight-derived POIs on any error."""
    import os, json, re as _re
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return _fallback_pois(doc)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys = (
            "You are a knowledgeable cycling travel guide. Given a scenic cycling "
            "route, list the notable points of interest a rider passes, in order. "
            "Return ONLY a JSON array, no prose. Each item: "
            '{"at_pct": <0..1 float of where it appears in the ride>, '
            '"title": <short landmark name>, '
            '"description": <=140 chars factual description>, '
            '"narration": <=220 chars warm first-person line a companion would say>, '
            '"wiki": <exact title of the most relevant REAL English Wikipedia '
            'article for this place (e.g. "Lake Garda", "Bardolino"), or "" if '
            'you are not confident a real article exists>}. '
            "Give 5-7 items spread across the ride."
        )
        prompt = (
            f"Route: {doc.get('name')}\n"
            f"Location: {doc.get('place')}, {doc.get('country')} ({doc.get('region')})\n"
            f"Character: {doc.get('tag')}; terrain {doc.get('terrain')}; surface {doc.get('surface')}\n"
            f"Duration: {doc.get('duration_min')} min; distance {doc.get('distance_km')} km\n"
            f"Known highlights: {', '.join(doc.get('highlights') or []) or 'n/a'}\n"
            f"Notes: {doc.get('description') or ''}"
        )
        chat = LlmChat(api_key=key, session_id=f"scenic-poi-{doc.get('id')}",
                       system_message=sys).with_model("openai", "gpt-5.4")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = raw if isinstance(raw, str) else str(raw)
        m = _re.search(r"\[.*\]", text, _re.DOTALL)
        items = json.loads(m.group(0) if m else text)
        pois = []
        for i, it in enumerate(sorted(items, key=lambda x: float(x.get("at_pct", 0)))):
            pois.append({
                "order": i,
                "at_pct": max(0.02, min(0.98, float(it.get("at_pct", (i + 1) / (len(items) + 1))))),
                "title": str(it.get("title") or "Point of interest")[:80],
                "description": str(it.get("description") or "")[:180],
                "narration": str(it.get("narration") or "")[:260],
                "wiki": str(it.get("wiki") or "")[:120],
            })
        return pois or _fallback_pois(doc)
    except Exception:
        return _fallback_pois(doc)


_WIKI_UA = "ROUJAUNE/1.0 (https://roujaune.app; support@roujaune.app) python-httpx"


_BAD_IMG = re.compile(
    r"(flag_|flag-|coat_of_arms|coat-of-arms|wappen|blason|escudo|bandera|"
    r"location_|locator|_map[._]|map_of|mappa|mapa_|karte|ferrovia|railway_map|"
    r"logo|seal_|emblem|\.svg)",
    re.IGNORECASE,
)


async def _wiki_thumb(client: httpx.AsyncClient, query: str) -> Optional[str]:
    if not query.strip():
        return None
    try:
        r = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query", "generator": "search", "gsrsearch": query,
                "gsrlimit": "4", "prop": "pageimages", "piprop": "thumbnail",
                "pithumbsize": "640", "format": "json", "redirects": "1",
            },
            headers={"User-Agent": _WIKI_UA, "Accept": "application/json"},
        )
        if r.status_code != 200:
            return None
        pages = (r.json().get("query") or {}).get("pages") or {}
        for _, p in sorted(pages.items(), key=lambda kv: kv[1].get("index", 99)):
            thumb = (p.get("thumbnail") or {}).get("source")
            # Skip flags / coats of arms / locator maps / logos — not scenery.
            if thumb and not _BAD_IMG.search(thumb):
                return thumb
    except Exception:
        return None
    return None


async def _wiki_summary_thumb(client: httpx.AsyncClient, title: str) -> Optional[str]:
    """Lead image of a specific Wikipedia article (most relevant when the title
    is a real page). Filters out flags / maps / logos."""
    title = (title or "").strip()
    if not title:
        return None
    try:
        from urllib.parse import quote
        r = await client.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'))}",
            headers={"User-Agent": _WIKI_UA, "Accept": "application/json"},
        )
        if r.status_code != 200:
            return None
        j = r.json()
        for src in ((j.get("thumbnail") or {}).get("source"),
                    (j.get("originalimage") or {}).get("source")):
            if src and not _BAD_IMG.search(src):
                return src
    except Exception:
        return None
    return None


async def _poi_image(client: httpx.AsyncClient, poi: dict, place: str) -> Optional[str]:
    """Find a representative photo for a point of interest. Prefers the exact
    Wikipedia article the LLM named (best relevance), then a keyword search of
    the landmark within its region, then the landmark alone. Returns None when
    nothing suitable is found (the client falls back to the route thumbnail)."""
    title = str(poi.get("title") or "").strip()
    wiki = str(poi.get("wiki") or "").strip()
    if wiki:
        img = await _wiki_summary_thumb(client, wiki)
        if img:
            return img
        img = await _wiki_thumb(client, wiki)
        if img:
            return img
    if not title:
        return None
    img = await _wiki_thumb(client, f"{title} {place}".strip())
    if not img:
        img = await _wiki_thumb(client, title)
    return img


async def _enrich_poi_images(pois: list[dict], doc: dict) -> list[dict]:
    """Attach a landmark photo to each POI (best-effort, in parallel). Falls
    back to no image (the client then uses the route thumbnail)."""
    place = doc.get("place") or doc.get("region") or doc.get("country") or ""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            results = await asyncio.gather(
                *[_poi_image(client, p, place) for p in pois],
                return_exceptions=True,
            )
        for p, img in zip(pois, results):
            p["image"] = img if isinstance(img, str) else None
    except Exception:
        for p in pois:
            p.setdefault("image", None)
    return pois


@router.get("/scenic/routes/{route_id}/pois")
async def scenic_points_of_interest(route_id: str, refresh: bool = False):
    """Points of interest along a scenic route, generated by the LLM from the
    route metadata and cached in `scenic_poi`. Each POI is enriched with a
    landmark photo (Wikipedia). The HUD surfaces the next uncompleted POI as the
    ride progresses."""
    doc = await db.scenic_routes.find_one({"id": route_id, "status": "published"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scenic route not found")
    if not refresh:
        cached = await db.scenic_poi.find_one({"route_id": route_id}, {"_id": 0})
        if cached and cached.get("pois"):
            pois = cached["pois"]
            # Backfill images for older cached POIs without re-running the LLM.
            if any("image" not in p for p in pois):
                pois = await _enrich_poi_images(pois, doc)
                try:
                    await db.scenic_poi.update_one(
                        {"route_id": route_id}, {"$set": {"pois": pois, "at": _now()}})
                except Exception:
                    pass
            return {"route_id": route_id, "pois": pois, "source": cached.get("source", "cache")}
    pois = await _generate_pois(doc)
    pois = await _enrich_poi_images(pois, doc)
    source = "llm" if os_has_key() else "fallback"
    try:
        await db.scenic_poi.update_one(
            {"route_id": route_id},
            {"$set": {"route_id": route_id, "pois": pois, "source": source, "at": _now()}},
            upsert=True,
        )
    except Exception:
        pass
    return {"route_id": route_id, "pois": pois, "source": source}


def os_has_key() -> bool:
    import os
    return bool(os.environ.get("EMERGENT_LLM_KEY"))


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
#  Discoveries (rider-saved points of interest along a scenic ride)           #
# --------------------------------------------------------------------------- #
class DiscoveryIn(BaseModel):
    route_id: str
    route_name: Optional[str] = ""
    place: Optional[str] = ""
    poi_order: Optional[int] = None
    at_pct: Optional[float] = None
    title: str
    description: Optional[str] = ""
    narration: Optional[str] = ""
    photo: Optional[str] = None       # thumbnail / captured frame url


class DiscoveryPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    narration: Optional[str] = None


@router.get("/scenic/discoveries")
async def list_discoveries(route_id: Optional[str] = None):
    """The rider's saved discoveries (all, or for one route), newest first."""
    filt: dict = {}
    if route_id:
        filt["route_id"] = route_id
    docs = await udb.scenic_discoveries.find(filt, {"_id": 0}).sort("at", -1).to_list(2000)
    return {"discoveries": docs}


@router.post("/scenic/discoveries")
async def add_discovery(body: DiscoveryIn):
    """Save a discovery (a POI the rider bookmarked). Idempotent per
    route+poi_order so tapping save twice does not duplicate it."""
    now = _now()
    base_doc = {
        "route_id": body.route_id,
        "route_name": (body.route_name or "").strip(),
        "place": (body.place or "").strip(),
        "poi_order": body.poi_order,
        "at_pct": body.at_pct,
        "title": (body.title or "").strip() or "Discovery",
        "description": (body.description or "").strip(),
        "narration": (body.narration or "").strip(),
        "photo": body.photo or None,
        "at": now,
    }
    if body.poi_order is not None:
        existing = await udb.scenic_discoveries.find_one(
            {"route_id": body.route_id, "poi_order": body.poi_order}, {"_id": 0})
        if existing:
            await udb.scenic_discoveries.update_one(
                {"id": existing["id"]}, {"$set": {k: v for k, v in base_doc.items() if k != "at"}})
            existing.update(base_doc)
            return {"discovery": existing}
    did = str(uuid.uuid4())
    doc = {"id": did, **base_doc}
    await udb.scenic_discoveries.insert_one(dict(doc))
    return {"discovery": doc}


@router.patch("/scenic/discoveries/{discovery_id}")
async def edit_discovery(discovery_id: str, body: DiscoveryPatch):
    updates = {k: (v or "").strip() for k, v in body.dict(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await udb.scenic_discoveries.update_one({"id": discovery_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Discovery not found")
    doc = await udb.scenic_discoveries.find_one({"id": discovery_id}, {"_id": 0})
    return {"discovery": doc}


@router.delete("/scenic/discoveries/{discovery_id}")
async def remove_discovery(discovery_id: str):
    await udb.scenic_discoveries.delete_one({"id": discovery_id})
    return {"removed": discovery_id}


@router.get("/scenic/journeys")
async def scenic_journeys():
    """Completed scenic rides (from ride_history, workout_id 'scenic-*') joined
    with the rider's saved discoveries, newest first — powers the shareable
    'ride recap' under Journeys. Never fabricated: empty until the rider
    completes a scenic ride."""
    rides = await udb.ride_history.find(
        {"workout_id": {"$regex": "^scenic-"}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)

    discs = await udb.scenic_discoveries.find({}, {"_id": 0}).sort("at", -1).to_list(2000)
    by_route: dict = {}
    for d in discs:
        by_route.setdefault(d.get("route_id"), []).append(d)

    covers = await udb.scenic_recap_covers.find({}, {"_id": 0}).to_list(1000)
    cover_by_ride = {c.get("ride_id"): c.get("photo") for c in covers}

    out = []
    for r in rides:
        route = r.get("route") or {}
        rid = (r.get("workout_id") or "").replace("scenic-", "", 1) or route.get("id")
        # Elevation may be stored numerically or as a "320 m" string.
        elev = route.get("elevation_m")
        if elev is None:
            e = route.get("elevation")
            if isinstance(e, str):
                mm = re.search(r"\d+", e)
                elev = int(mm.group()) if mm else None
            elif isinstance(e, (int, float)):
                elev = int(e)
        out.append({
            "id": r.get("id"),
            "routeId": rid,
            "name": route.get("name") or (r.get("workout") or "").replace("Scenic Ride · ", ""),
            "place": route.get("place") or "",
            "country": route.get("country") or "",
            "tag": route.get("tag") or "Scenic",
            "elevation_m": elev,
            "distance_km": r.get("distance_km") or route.get("distance") or None,
            "duration_sec": r.get("duration_sec"),
            "at": r.get("created_at"),
            "thumbnail": (f"https://img.youtube.com/vi/{route.get('youtube_id')}/hqdefault.jpg"
                          if route.get("youtube_id") else None),
            "cover": cover_by_ride.get(r.get("id")),
            "discoveries": by_route.get(rid, []),
        })
    return {"journeys": out}


class RecapCoverIn(BaseModel):
    photo: Optional[str] = None    # a discovery photo URL, or null to reset to default


@router.put("/scenic/journeys/{ride_id}/cover")
async def set_recap_cover(ride_id: str, body: RecapCoverIn):
    """Choose a saved discovery photo as the cover of a ride's shareable recap
    (or reset to the default route thumbnail when photo is null)."""
    if body.photo:
        await udb.scenic_recap_covers.update_one(
            {"ride_id": ride_id},
            {"$set": {"ride_id": ride_id, "photo": body.photo, "at": _now()}},
            upsert=True,
        )
    else:
        await udb.scenic_recap_covers.delete_one({"ride_id": ride_id})
    return {"ride_id": ride_id, "cover": body.photo}


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
