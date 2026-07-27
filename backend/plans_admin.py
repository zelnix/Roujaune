"""
Portable training-plan administration module.

Stores plan DEFINITIONS in the MongoDB `plans` collection and exposes a
self-contained CRUD + structured-editing API. Designed to be lifted, as-is,
into a separate admin project: it only needs a Motor `db` handle and an optional
`on_change(plan_id)` async callback (so a consuming app can refresh any in-memory
cache when a plan is edited).

Mount:  api_router.include_router(plans_admin.plans_router)   # -> /api/plans
Init :  plans_admin.init(db, on_change=...)  then  await plans_admin.seed_plans({...})
"""
from __future__ import annotations

import copy
import datetime
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

plans_router = APIRouter(prefix="/plans", tags=["plans-admin"])

# ---- injected dependencies -------------------------------------------------
_db = None
_on_change = None
_on_audit = None


def init(db, on_change=None, on_audit=None) -> None:
    """Wire the module to a database handle and optional callbacks:
    `on_change(plan_id)` fires after any mutation; `on_audit(action, plan_id, meta)`
    records the mutation to the consuming app's admin audit log."""
    global _db, _on_change, _on_audit
    _db = db
    _on_change = on_change
    _on_audit = on_audit


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def _notify(plan_id: str) -> None:
    if _on_change:
        try:
            await _on_change(plan_id)
        except Exception:
            pass


async def _audit(action: str, plan_id: str, meta: dict | None = None) -> None:
    if _on_audit:
        try:
            await _on_audit(action, plan_id, meta or {})
        except Exception:
            pass


# ---- seeding ---------------------------------------------------------------
async def seed_plans(defaults: dict[str, dict]) -> None:
    """Insert each plan definition only when it is missing (non-destructive), so
    live edits are never overwritten on restart. `defaults` maps id -> definition."""
    for pid, definition in defaults.items():
        existing = await _db.plans.find_one({"id": pid})
        if existing:
            continue
        doc = copy.deepcopy(definition)
        doc["id"] = pid
        doc.setdefault("created_at", _now())
        doc["updated_at"] = _now()
        await _db.plans.insert_one(doc)


# ---- read helpers (used by the consuming app) ------------------------------
async def get_plan_def(plan_id: str) -> Optional[dict]:
    doc = await _db.plans.find_one({"id": plan_id})
    if doc:
        doc.pop("_id", None)
    return doc


def _summary(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "title": doc.get("title"),
        "description": doc.get("description"),
        "type": doc.get("type", "structured" if doc.get("weeks") else "roadmap"),
        "level": doc.get("level"),
        "duration_weeks": doc.get("duration_weeks"),
        "week_count": len(doc.get("weeks", []) or []),
        "updated_at": doc.get("updated_at"),
    }


# ---- request models --------------------------------------------------------
class CreatePlan(BaseModel):
    id: str
    definition: dict = Field(default_factory=dict)


class DayPatch(BaseModel):
    patch: dict = Field(default_factory=dict)


class AdaptOp(BaseModel):
    target: str  # "field" | "week_field" | "day"
    key: Optional[str] = None
    value: Any = None
    week: Optional[int] = None
    day_index: Optional[int] = None
    patch: Optional[dict] = None


class AdaptRequest(BaseModel):
    source: str = "coach"          # "coach" | "user"
    reason: Optional[str] = None
    ops: list[AdaptOp] = Field(default_factory=list)


# ---- helpers to locate a week/day -----------------------------------------
def _find_week(doc: dict, number: int) -> Optional[dict]:
    for w in doc.get("weeks", []) or []:
        if int(w.get("number", -1)) == int(number):
            return w
    return None


async def _persist(doc: dict) -> dict:
    doc["updated_at"] = _now()
    doc.pop("_id", None)
    await _db.plans.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
    await _notify(doc["id"])
    return doc


# ---- endpoints -------------------------------------------------------------
@plans_router.get("")
async def list_plans():
    docs = await _db.plans.find().to_list(200)
    return [_summary({**d, **{"_id": None}}) for d in docs]


@plans_router.get("/{plan_id}")
async def get_plan(plan_id: str):
    doc = await get_plan_def(plan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    return doc


@plans_router.post("")
async def create_plan(req: CreatePlan):
    if await _db.plans.find_one({"id": req.id}):
        raise HTTPException(status_code=409, detail="Plan id already exists")
    doc = copy.deepcopy(req.definition)
    doc["id"] = req.id
    doc.setdefault("title", req.id)
    doc["created_at"] = _now()
    saved = await _persist(doc)
    await _audit("plan.create", req.id, {"title": doc.get("title")})
    return saved


@plans_router.put("/{plan_id}")
async def replace_plan(plan_id: str, definition: dict):
    existing = await _db.plans.find_one({"id": plan_id})
    doc = copy.deepcopy(definition)
    doc["id"] = plan_id
    doc["created_at"] = (existing or {}).get("created_at", _now())
    saved = await _persist(doc)
    await _audit("plan.replace", plan_id, {"existed": bool(existing)})
    return saved


@plans_router.patch("/{plan_id}")
async def patch_plan(plan_id: str, fields: dict):
    doc = await get_plan_def(plan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    fields.pop("id", None)
    doc.update(fields)
    saved = await _persist(doc)
    await _audit("plan.patch", plan_id, {"fields": list(fields.keys())})
    return saved


@plans_router.delete("/{plan_id}")
async def delete_plan(plan_id: str):
    res = await _db.plans.delete_one({"id": plan_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await _notify(plan_id)
    await _audit("plan.delete", plan_id, {})
    return {"deleted": plan_id}


@plans_router.put("/{plan_id}/weeks/{number}")
async def replace_week(plan_id: str, number: int, week: dict):
    doc = await get_plan_def(plan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    weeks = doc.setdefault("weeks", [])
    week["number"] = number
    idx = next((i for i, w in enumerate(weeks) if int(w.get("number", -1)) == number), None)
    if idx is None:
        weeks.append(week)
        weeks.sort(key=lambda w: int(w.get("number", 0)))
    else:
        weeks[idx] = week
    saved = await _persist(doc)
    await _audit("plan.week.replace", plan_id, {"week": number})
    return saved


@plans_router.patch("/{plan_id}/weeks/{number}/days/{day_index}")
async def patch_day(plan_id: str, number: int, day_index: int, body: DayPatch):
    doc = await get_plan_def(plan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    week = _find_week(doc, number)
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    days = week.get("days", [])
    if day_index < 0 or day_index >= len(days):
        raise HTTPException(status_code=404, detail="Day not found")
    days[day_index].update(body.patch or {})
    saved = await _persist(doc)
    await _audit("plan.day.patch", plan_id, {"week": number, "day_index": day_index})
    return saved


@plans_router.post("/{plan_id}/adapt")
async def adapt_plan(plan_id: str, req: AdaptRequest):
    """Apply a batch of structured changes proposed by the coaching companion's
    adaptive intelligence or requested by the rider. Records an edit-history entry."""
    doc = await get_plan_def(plan_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    applied: list[str] = []
    for op in req.ops:
        if op.target == "field" and op.key is not None:
            doc[op.key] = op.value
            applied.append(f"set {op.key}")
        elif op.target == "week_field" and op.week is not None and op.key is not None:
            week = _find_week(doc, op.week)
            if week is not None:
                week[op.key] = op.value
                applied.append(f"week {op.week}: set {op.key}")
        elif op.target == "day" and op.week is not None and op.day_index is not None:
            week = _find_week(doc, op.week)
            if week and 0 <= op.day_index < len(week.get("days", [])):
                week["days"][op.day_index].update(op.patch or {})
                applied.append(f"week {op.week} day {op.day_index}: {', '.join((op.patch or {}).keys())}")
    entry = {
        "id": uuid.uuid4().hex,
        "source": req.source,
        "reason": req.reason,
        "applied": applied,
        "at": _now(),
    }
    history = doc.setdefault("edit_history", [])
    history.insert(0, entry)
    doc["edit_history"] = history[:30]
    await _persist(doc)
    await _audit("plan.adapt", plan_id, {"source": req.source, "applied": applied})
    return {"plan_id": plan_id, "applied": applied, "entry": entry}
