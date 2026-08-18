"""In-app "Rate the app + feedback" capture.

Riders submit a star rating (1-5), a message, and an optional screenshot from
the About & Support screen. Screenshots go to Emergent Object Storage; the
storage path (plus rating/message/device meta) is saved to the `feedback`
collection so the team can review submissions from the admin console.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

import auth
import storage
from core import now_iso
from db import db

router = APIRouter()

_ALLOWED_IMAGE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}
_MAX_BYTES = 8 * 1024 * 1024  # 8 MB cap


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    message: str = ""
    screenshot_path: str | None = None
    meta: dict | None = None


@router.post("/feedback/screenshot")
async def upload_feedback_screenshot(file: UploadFile = File(...), user: dict = Depends(auth.require_user)):
    """Upload a feedback screenshot and return its stored path."""
    ext = _ALLOWED_IMAGE.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8 MB)")
    path = f"{storage.APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(storage.put_object, path, data, file.content_type)
    except Exception as exc:  # noqa: BLE001
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 402:
            raise HTTPException(status_code=402, detail="Storage quota exceeded")
        raise HTTPException(status_code=502, detail="Upload failed")
    return {"path": path}


@router.post("/feedback")
async def submit_feedback(body: FeedbackIn, user: dict = Depends(auth.require_user)):
    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "rating": body.rating,
        "message": (body.message or "").strip()[:4000],
        "screenshot_path": body.screenshot_path,
        "meta": body.meta or {},
        "status": "new",
        "created_at": now_iso(),
    }
    await db.feedback.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}


@router.get("/feedback/image/{path:path}")
async def get_feedback_image(path: str, user: dict = Depends(auth.require_admin)):
    """Admin-only screenshot fetch (proxies from object storage)."""
    try:
        content, ctype = await run_in_threadpool(storage.get_object, path)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=content, media_type=ctype)


admin_router = APIRouter(prefix="/api/admin", tags=["admin-feedback"], dependencies=[Depends(auth.require_admin)])


@admin_router.get("/feedback")
async def list_feedback(limit: int = 200):
    rows = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"feedback": rows, "count": len(rows)}
