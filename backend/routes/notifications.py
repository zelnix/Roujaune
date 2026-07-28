"""Per-rider notification read-state (persists across launches).

Notifications are computed client-side from live signals; each carries a stable
content-aware `key`. We persist the set of read keys per rider so the bell badge
stays accurate between sessions.
"""
from fastapi import APIRouter

import auth
from core import now_iso

udb = auth.udb
router = APIRouter()


@router.get("/notifications/read-state")
async def get_read_state():
    doc = await udb.notification_reads.find_one({"id": "me"}) or {}
    return {"readKeys": doc.get("readKeys", []), "allReadAt": doc.get("allReadAt")}


@router.post("/notifications/read")
async def mark_read(body: dict):
    key = str(body.get("key", "")).strip()
    if key:
        await udb.notification_reads.update_one(
            {"id": "me"}, {"$set": {"id": "me"}, "$addToSet": {"readKeys": key}}, upsert=True)
    return {"ok": True}


@router.post("/notifications/unread")
async def mark_unread(body: dict):
    key = str(body.get("key", "")).strip()
    if key:
        await udb.notification_reads.update_one(
            {"id": "me"}, {"$pull": {"readKeys": key}}, upsert=True)
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(body: dict):
    keys = [str(k) for k in (body.get("keys") or []) if str(k).strip()]
    await udb.notification_reads.update_one(
        {"id": "me"},
        {"$set": {"id": "me", "allReadAt": now_iso()}, "$addToSet": {"readKeys": {"$each": keys}}},
        upsert=True,
    )
    return {"ok": True, "count": len(keys)}
