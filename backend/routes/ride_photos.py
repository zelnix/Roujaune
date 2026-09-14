"""Per-ride photo gallery.

Riders attach photos to a ride; files go to Emergent Object Storage and their
paths are recorded on the ride's `ride_history` document. Reads are proxied
through this backend (storage has no public URLs). The app fetches images with
a `?token=` query param so web <img> tags — which cannot send an Authorization
header — still authenticate (see AuthMiddleware).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

import auth
import storage
from core import now_iso
from auth import udb

router = APIRouter()

_ALLOWED_IMAGE = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic", "image/heif": "heic",
}
_MAX_BYTES = 12 * 1024 * 1024  # 12 MB cap
_MAX_PER_RIDE = 12


def _prefix(user_id: str) -> str:
    return f"{storage.APP_NAME}/uploads/{user_id}/"


@router.post("/rides/{ride_id}/photos")
async def add_ride_photo(ride_id: str, file: UploadFile = File(...), user: dict = Depends(auth.require_user)):
    """Upload one photo and attach it to a ride."""
    ext = _ALLOWED_IMAGE.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 12 MB)")
    ride = await udb.ride_history.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if len(ride.get("photos") or []) >= _MAX_PER_RIDE:
        raise HTTPException(status_code=409, detail=f"Up to {_MAX_PER_RIDE} photos per ride")
    path = f"{_prefix(user['user_id'])}{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(storage.put_object, path, data, file.content_type)
    except Exception as exc:  # noqa: BLE001
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 402:
            raise HTTPException(status_code=402, detail="Storage quota exceeded")
        raise HTTPException(status_code=502, detail="Upload failed")
    photo = {"id": uuid.uuid4().hex, "path": path, "created_at": now_iso()}
    await udb.ride_history.update_one({"id": ride_id}, {"$push": {"photos": photo}})
    return {"ok": True, "photo": {"id": photo["id"], "path": path}}


@router.get("/rides/{ride_id}/photos")
async def list_ride_photos(ride_id: str, user: dict = Depends(auth.require_user)):
    """List a ride's photos as ids + relative fetch paths."""
    ride = await udb.ride_history.find_one({"id": ride_id}, {"_id": 0, "photos": 1})
    photos = (ride or {}).get("photos") or []
    return {"photos": [{"id": p["id"], "path": p["path"]} for p in photos]}


@router.delete("/rides/{ride_id}/photos/{photo_id}")
async def delete_ride_photo(ride_id: str, photo_id: str, user: dict = Depends(auth.require_user)):
    """Remove a photo reference from a ride (storage has no delete API)."""
    await udb.ride_history.update_one({"id": ride_id}, {"$pull": {"photos": {"id": photo_id}}})
    return {"ok": True}


@router.get("/rides/photo/{path:path}")
async def get_ride_photo(path: str, user: dict = Depends(auth.require_user)):
    """Proxy an image from object storage. A rider can only read files under
    their own upload prefix."""
    if not path.startswith(_prefix(user["user_id"])):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        content, ctype = await run_in_threadpool(storage.get_object, path)
    except Exception:  # noqa: BLE001  (missing object → storage 500)
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})
