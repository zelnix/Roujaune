"""Ride ingestion (file upload) + unified ride-analysis endpoints.

Uploaded .fit/.gpx/.tcx files are parsed (`activity_parse`) and fed through the
existing `activity_sync.ingest_activities` pipeline so they dedup + classify +
mirror into `ride_history` exactly like provider-synced rides. Indoor and
outdoor rides share one list for the performance-analysis screen.
"""
from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import auth
import activity_parse
import activity_sync
from db import db

udb = auth.udb
router = APIRouter(prefix="/activities", tags=["activities"])

MAX_BYTES = 15 * 1024 * 1024


async def _ftp() -> int:
    try:
        s = await udb.settings.find_one({"id": "app"})
        if s and s.get("ftp"):
            return int(s["ftp"])
    except Exception:
        pass
    return 200


async def _max_hr() -> Optional[int]:
    try:
        s = await udb.settings.find_one({"id": "app"})
        if s and s.get("max_hr"):
            return int(s["max_hr"])
    except Exception:
        pass
    return None


class UploadIn(BaseModel):
    filename: str
    content_base64: str


@router.post("/upload")
async def upload_activity(body: UploadIn):
    try:
        raw = base64.b64decode(body.content_base64)
    except Exception:
        raise HTTPException(400, "Invalid file encoding")
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 15 MB)")

    ftp = await _ftp()
    try:
        act = activity_parse.parse_activity_file(body.filename, raw, ftp, await _max_hr())
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(400, "Could not parse this ride file")

    summary = await activity_sync.ingest_activities(db, auth.current_user_id(), [act], ftp)
    doc = await db.cycling_activities.find_one(
        {"user_id": auth.current_user_id(), "provider": "upload",
         "external_activity_id": act["external_activity_id"]})
    return {
        "ok": True, "summary": summary,
        "activity_id": (doc or {}).get("canonical_activity_id") or (doc or {}).get("id"),
        "name": act.get("name"), "duration_sec": act.get("elapsed_seconds"),
        "distance_km": round((act.get("distance_metres") or 0) / 1000, 2),
        "tss": act.get("training_load"), "np": act.get("normalised_power"),
        "if": act.get("intensity_factor"),
    }


@router.get("")
async def list_activities(limit: int = 100):
    """Unified indoor + outdoor ride list (from ride_history)."""
    docs = await udb.ride_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    out = []
    for d in docs:
        out.append({
            "id": d.get("id"),
            "created_at": d.get("created_at"),
            "name": d.get("workout") or d.get("route") or "Ride",
            "indoor_outdoor": d.get("indoor_outdoor") or ("outdoor" if d.get("imported") else "indoor"),
            "source": d.get("source") or ("upload" if d.get("imported") else "roujaune"),
            "imported": bool(d.get("imported")),
            "cycling_activity_id": d.get("cycling_activity_id"),
            "ride_type": d.get("ride_type"),
            "duration_sec": d.get("duration_sec"),
            "distance_km": d.get("distance_km"),
            "elevation_m": d.get("elevation_m"),
            "avg_power": d.get("avg_power"),
            "tss": d.get("tss"),
        })
    return {"activities": out}


def _detail_from_cycling(doc: dict, ftp: int) -> dict:
    np = doc.get("normalised_power")
    ifv = round(np / ftp, 3) if (np and ftp) else None
    rd = doc.get("route_data") or {}
    return {
        "id": doc.get("canonical_activity_id") or doc.get("id"),
        "name": doc.get("name") or "Outdoor Ride",
        "indoor_outdoor": doc.get("indoor_outdoor") or "outdoor",
        "source": doc.get("provider"),
        "ride_type": doc.get("ride_type"),
        "started_at": doc.get("started_at"),
        "duration_sec": doc.get("elapsed_seconds"),
        "distance_km": None if doc.get("distance_metres") is None else round(doc["distance_metres"] / 1000, 2),
        "elevation_gain_m": doc.get("elevation_gain_metres"),
        "elevation_loss_m": doc.get("elevation_loss_metres"),
        "avg_power": doc.get("average_power"), "max_power": doc.get("maximum_power"),
        "np": np, "if": ifv, "tss": doc.get("training_load"),
        "avg_hr": doc.get("average_heart_rate"), "max_hr": doc.get("maximum_heart_rate"),
        "avg_cadence": doc.get("average_cadence"), "max_cadence": doc.get("maximum_cadence"),
        "avg_speed": doc.get("average_speed"), "max_speed": doc.get("maximum_speed"),
        "calories": doc.get("calories"),
        "has_gps": rd.get("has_gps", False),
        "has_power": rd.get("has_power", False),
        "has_hr": rd.get("has_hr", False),
        "has_cadence": rd.get("has_cadence", False),
        "samples": rd.get("samples") or [],
        "power_curve": rd.get("power_curve"),
        "time_in_power_zones": rd.get("time_in_power_zones") or doc.get("time_in_power_zones"),
        "time_in_hr_zones": rd.get("time_in_hr_zones") or doc.get("time_in_hr_zones"),
        "ftp_used": rd.get("ftp_used") or ftp,
    }


@router.get("/ftp")
async def get_ftp():
    return {"ftp": await _ftp(), "max_hr": await _max_hr()}


class FtpIn(BaseModel):
    ftp: Optional[int] = None
    max_hr: Optional[int] = None


@router.post("/ftp")
async def set_ftp(body: FtpIn):
    patch = {}
    if body.ftp is not None:
        if body.ftp < 50 or body.ftp > 600:
            raise HTTPException(400, "FTP must be between 50 and 600 W")
        patch["ftp"] = int(body.ftp)
    if body.max_hr is not None:
        patch["max_hr"] = int(body.max_hr)
    if patch:
        await udb.settings.update_one({"id": "app"}, {"$set": patch}, upsert=True)
    return {"ftp": await _ftp(), "max_hr": await _max_hr()}


@router.get("/{activity_id}")
async def activity_detail(activity_id: str):
    ftp = await _ftp()
    uid = auth.current_user_id()
    # Outdoor / uploaded: full cycling activity with samples.
    cid = activity_id[len("import-"):] if activity_id.startswith("import-") else activity_id
    doc = await udb.cycling_activities.find_one({"$or": [{"id": cid}, {"canonical_activity_id": cid}]})
    if doc:
        return _detail_from_cycling(doc, ftp)
    # Indoor / history-only ride (metrics, no GPS samples).
    h = await udb.ride_history.find_one({"id": activity_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Ride not found")
    return {
        "id": h.get("id"), "name": h.get("workout") or "Ride",
        "indoor_outdoor": h.get("indoor_outdoor") or "indoor",
        "source": h.get("source") or "roujaune", "ride_type": h.get("ride_type"),
        "started_at": h.get("created_at"),
        "duration_sec": h.get("duration_sec"), "distance_km": h.get("distance_km"),
        "elevation_gain_m": h.get("elevation_m"), "avg_power": h.get("avg_power"),
        "np": h.get("norm_power"), "tss": h.get("tss"),
        "has_gps": False, "has_power": h.get("avg_power") is not None,
        "has_hr": False, "has_cadence": False,
        "samples": [], "power_curve": None,
        "time_in_power_zones": None, "time_in_hr_zones": None, "ftp_used": ftp,
    }
