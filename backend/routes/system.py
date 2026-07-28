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


ROUTES_DATA = {
    "featured": {"id": "XlwjMjyU410", "name": "Alpe d'Huez", "place": "France", "distance": "13.8 km", "elevation": "1,120 m", "grade": "8.1%", "tag": "Legendary Climb", "difficulty": "Hard"},
    "categories": ["All", "Climbs", "Flat", "Rolling", "Gravel"],
    "routes": [
        {"id": "r1", "name": "Alpe d'Huez", "place": "France", "distance": "13.8 km", "elevation": "1,120 m", "tag": "Climb", "difficulty": "Hard", "color": "rouge"},
        {"id": "r2", "name": "Stelvio Pass", "place": "Italy", "distance": "24.3 km", "elevation": "1,808 m", "tag": "Climb", "difficulty": "Extreme", "color": "rouge"},
        {"id": "r3", "name": "Mont Ventoux", "place": "France", "distance": "21.5 km", "elevation": "1,610 m", "tag": "Climb", "difficulty": "Hard", "color": "orange"},
        {"id": "r4", "name": "Tuscan Rollers", "place": "Italy", "distance": "48.0 km", "elevation": "620 m", "tag": "Rolling", "difficulty": "Moderate", "color": "amber"},
        {"id": "r5", "name": "Loire Valley", "place": "France", "distance": "62.0 km", "elevation": "240 m", "tag": "Flat", "difficulty": "Easy", "color": "green"},
        {"id": "r6", "name": "Girona Gravel", "place": "Spain", "distance": "38.5 km", "elevation": "540 m", "tag": "Gravel", "difficulty": "Moderate", "color": "amber"},
    ],
}

COMMUNITY_DATA = {
    "challenges": [
        {"id": "c1", "title": "May Climbing Challenge", "sub": "Climb 5,000 m this month", "progress": 68, "reward": "Climber Badge", "color": "rouge"},
        {"id": "c2", "title": "Consistency Streak", "sub": "Ride 5 days a week", "progress": 80, "reward": "Iron Legs", "color": "yellow"},
        {"id": "c3", "title": "Gran Fondo Prep", "sub": "Complete the 4-week block", "progress": 45, "reward": "Fondo Ready", "color": "green"},
    ],
    "leaderboard": [
        {"rank": 1, "name": "Marco B.", "points": 1840, "you": False},
        {"rank": 2, "name": "Sofia R.", "points": 1720, "you": False},
        {"rank": 3, "name": "You", "points": 1685, "you": True},
        {"rank": 4, "name": "Liam O.", "points": 1590, "you": False},
        {"rank": 5, "name": "Emma T.", "points": 1510, "you": False},
    ],
    "feed": [
        {"id": "p1", "name": "Sofia R.", "action": "completed", "title": "Stelvio Pass", "when": "12m ago", "kudos": 24, "color": "rouge"},
        {"id": "p2", "name": "Marco B.", "action": "set a PR on", "title": "20-min Power", "when": "1h ago", "kudos": 41, "color": "yellow"},
        {"id": "p3", "name": "Liam O.", "action": "finished", "title": "Long Ride Endurance", "when": "3h ago", "kudos": 18, "color": "green"},
    ],
}


@router.get("/routes")
async def get_routes():
    return ROUTES_DATA


@router.get("/community")
async def get_community():
    return COMMUNITY_DATA


@router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(**input.dict())
    await db.status_checks.insert_one(obj.dict())
    return obj


@router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**r) for r in rows]
