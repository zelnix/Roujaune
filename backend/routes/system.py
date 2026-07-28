"""Preview report downloads + basic status/health endpoints.

Mounted under /api by server.py. Kept dependency-light (only `db` for the
status template collection).
"""
import os
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from db import db
from models import StatusCheck, StatusCheckCreate

router = APIRouter()

# Allow-list of downloadable review PDFs (prevents path traversal). Served public
# in preview so they can be opened directly from the browser.
_REPORTS = {
    "ux-audit": "/app/Roujaune_UX_Audit_Report.pdf",
    "architecture-security": "/app/Roujaune_Architecture_Security_Review.pdf",
}


@router.get("/reports")
async def list_reports():
    return {"reports": [{"id": k, "download": f"/api/reports/{k}"} for k in _REPORTS]}


@router.get("/reports/{name}")
async def download_report(name: str):
    path = _REPORTS.get(name)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="application/pdf", filename=os.path.basename(path))


@router.get("/")
async def root():
    return {"message": "ROUJAUNE telemetry API"}


@router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(**input.dict())
    await db.status_checks.insert_one(obj.dict())
    return obj


@router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**r) for r in rows]
