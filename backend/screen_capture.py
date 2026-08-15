"""
Automated Store Screen-Capture + Store-Listing system (admin-only).

Drives the ROUJAUNE Expo *web* build with headless Chromium (Playwright), logs
in as the dedicated demo rider, traverses the key screens, captures raw
screenshots, frames them on a branded App-Store canvas (Pillow), generates App
Store listing copy (Emergent LLM), stores everything in MongoDB and exposes a
downloadable ZIP — all behind the existing HWG admin auth.

Self-contained router (`capture_router`) registered by server.py. Data model:
  • screen_captures  {id, key, title, caption, w, h, raw_base64, framed_base64,
                      thumb_base64, created_at, job_id}
  • app_meta         {key:"store_listing", title, subtitle, description,
                      keywords, promotional_text, updated_at}
  • capture_jobs     {_id:"current", job_id, status, total, done, error,
                      started_at, finished_at, screens:[{key,state,error}]}
"""
from __future__ import annotations

import asyncio
import base64
import datetime
import io
import json
import logging
import os
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path
from typing import Optional

# Playwright's default browser cache (/pw-browsers) is reset to the base image on
# every backend restart, wiping the Chromium build this Playwright version needs.
# Point at a path under /app (which persists) and set this BEFORE Playwright loads.
PW_BROWSERS_DIR = "/app/backend/.pw-browsers"
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = PW_BROWSERS_DIR

from fastapi import APIRouter, Body, Depends, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from starlette.responses import Response, StreamingResponse

import auth

logger = logging.getLogger("screen_capture")

_db = None
_LOCK = asyncio.Lock()          # only one capture job at a time
_JOB_DOC_ID = "current"

# Demo rider whose data we screenshot (never a real customer).
DEMO_EMAIL = os.environ.get("CAPTURE_DEMO_EMAIL", "demo@roujaune.app")
DEMO_PASSWORD = os.environ.get("CAPTURE_DEMO_PASSWORD", "demo9900")

FRONTEND_ENV = Path("/app/frontend/.env")
WORDMARK_PATH = Path("/app/frontend/assets/images/wordmark_t.png")

# Brand palette.
BG_TOP = (14, 16, 15)
BG_BOTTOM = (6, 7, 7)
YELLOW = (255, 194, 10)
CREAM = (243, 241, 234)
MUTED = (154, 155, 152)

# App-Store landscape canvas (iPad 4:3-ish, high-res).
CANVAS_W, CANVAS_H = 2048, 1536

# Tablet-landscape capture viewport (app is landscape-first).
VIEW_W, VIEW_H = 1280, 800

# Screens traversed, in listing order. Each renders for the onboarded demo rider.
SCREENS = [
    {"key": "home", "path": "/", "title": "Home", "caption": "Your training, at a glance"},
    {"key": "plan", "path": "/plan", "title": "Training Plan", "caption": "A coached plan that adapts to you"},
    {"key": "workouts", "path": "/workouts", "title": "Workouts", "caption": "A workout for every goal"},
    {"key": "workout_list", "path": "/workout-list", "title": "Workout Library", "caption": "Structured sessions, ready to ride"},
    {"key": "scenic", "path": "/scenic-destinations", "title": "Scenic Rides", "caption": "Ride the world's most beautiful roads"},
    {"key": "progress", "path": "/progress", "title": "Your Progress", "caption": "Watch your fitness climb"},
    {"key": "fitness", "path": "/fitness", "title": "Fitness", "caption": "Know exactly where you stand"},
    {"key": "calendar", "path": "/calendar", "title": "Calendar", "caption": "Plan your week around your life"},
    {"key": "profile", "path": "/profile", "title": "Profile", "caption": "Your rider identity"},
    {"key": "wellness", "path": "/wellness", "title": "Wellness", "caption": "Train hard, recover smart"},
    {"key": "climbs", "path": "/climbs", "title": "Climbs", "caption": "Every climb you've conquered"},
    {"key": "compare", "path": "/compare", "title": "Compare Rides", "caption": "Compare any two rides side by side"},
    {"key": "community", "path": "/community", "title": "Community", "caption": "Ride with the ROUJAUNE community"},
    {"key": "milestones", "path": "/milestones", "title": "Milestones", "caption": "Unlock every milestone"},
    {"key": "activities", "path": "/activities", "title": "Ride History", "caption": "Your complete ride history"},
    {"key": "connections", "path": "/connections", "title": "Connections", "caption": "Connect your trainer and sensors"},
    {"key": "routes", "path": "/routes", "title": "Routes", "caption": "Discover new routes to ride"},
    {"key": "settings", "path": "/settings", "title": "Settings", "caption": "Make ROUJAUNE yours"},
    {"key": "upgrade", "path": "/upgrade", "title": "Premium", "caption": "Unlock ROUJAUNE Premium"},
    {"key": "rider_customise", "path": "/rider-customise", "title": "Customise Rider", "caption": "Customise your rider"},
    {"key": "wheel_calibration", "path": "/wheel-calibration", "title": "Calibration", "caption": "Dial in your setup"},
    {"key": "help", "path": "/help", "title": "Help", "caption": "Help whenever you need it"},
]
_SCREEN_BY_KEY = {s["key"]: s for s in SCREENS}


# --------------------------------------------------------------------------- #
#  Setup                                                                       #
# --------------------------------------------------------------------------- #
def init(db) -> None:
    global _db
    _db = db


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _capture_base_url() -> str:
    """Public origin of the running Expo web app. Read from frontend/.env
    (EXPO_PUBLIC_BACKEND_URL) so it always tracks the current preview URL."""
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")
    if not url and FRONTEND_ENV.exists():
        for line in FRONTEND_ENV.read_text().splitlines():
            if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    return url.rstrip("/")


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        ["/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]
        if bold else
        ["/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
    )
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


# --------------------------------------------------------------------------- #
#  Pillow framing                                                              #
# --------------------------------------------------------------------------- #
def _gradient_bg(w: int, h: int) -> Image.Image:
    base = Image.new("RGB", (w, h), BG_TOP)
    top = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        top.putpixel((0, y), tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    base.paste(top.resize((w, h)), (0, 0))
    return base


def _rounded_mask(w: int, h: int, radius: int) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return mask


def _text_centered(draw: ImageDraw.ImageDraw, cx: int, y: int, text: str,
                    font: ImageFont.FreeTypeFont, fill) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text((cx - (bbox[2] - bbox[0]) // 2, y), text, font=font, fill=fill)


def frame_shot(raw_png: bytes, caption: str) -> Image.Image:
    """Compose one raw viewport screenshot onto a branded App-Store canvas:
    caption headline (top), device-framed screenshot (center), wordmark (bottom)."""
    canvas = _gradient_bg(CANVAS_W, CANVAS_H)
    draw = ImageDraw.Draw(canvas)
    cx = CANVAS_W // 2

    # Accent hairline under the headline.
    head_font = _font(76, bold=True)
    _text_centered(draw, cx, 96, caption, head_font, CREAM)
    draw.line([(cx - 120, 210), (cx + 120, 210)], fill=YELLOW, width=6)

    shot = Image.open(io.BytesIO(raw_png)).convert("RGB")
    # Fit the screenshot into the central area, preserving aspect ratio.
    area_top, area_bottom = 300, CANVAS_H - 210
    max_w, max_h = int(CANVAS_W * 0.82), area_bottom - area_top
    scale = min(max_w / shot.width, max_h / shot.height)
    sw, sh = int(shot.width * scale), int(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)

    radius = 34
    pad = 16  # bezel thickness
    frame_w, frame_h = sw + pad * 2, sh + pad * 2
    fx = cx - frame_w // 2
    fy = area_top + (max_h - frame_h) // 2

    # Soft drop shadow.
    from PIL import ImageFilter
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([fx + 14, fy + 22, fx + frame_w + 14, fy + frame_h + 22],
                            radius=radius + pad, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
    draw = ImageDraw.Draw(canvas)

    # Bezel (dark rounded rect + yellow border).
    draw.rounded_rectangle([fx, fy, fx + frame_w, fy + frame_h], radius=radius + pad,
                           fill=(20, 22, 21))
    draw.rounded_rectangle([fx, fy, fx + frame_w, fy + frame_h], radius=radius + pad,
                           outline=YELLOW, width=4)

    # Rounded screenshot inside the bezel.
    rounded = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    rounded.paste(shot, (0, 0))
    rounded.putalpha(_rounded_mask(sw, sh, radius))
    canvas.paste(rounded, (fx + pad, fy + pad), rounded)

    # Wordmark bottom-center.
    if WORDMARK_PATH.exists():
        try:
            wm = Image.open(WORDMARK_PATH).convert("RGBA")
            tw = 360
            wm = wm.resize((tw, int(wm.height * tw / wm.width)), Image.LANCZOS)
            canvas.paste(wm, (cx - tw // 2, CANVAS_H - 150), wm)
        except Exception:
            _text_centered(draw, cx, CANVAS_H - 150, "ROUJAUNE", _font(56, bold=True), CREAM)
    else:
        _text_centered(draw, cx, CANVAS_H - 150, "ROUJAUNE", _font(56, bold=True), CREAM)

    return canvas


def _png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


# --------------------------------------------------------------------------- #
#  Job status helpers                                                          #
# --------------------------------------------------------------------------- #
async def _init_job(job_id: str, keys: list[str]) -> None:
    await _db.capture_jobs.update_one(
        {"_id": _JOB_DOC_ID},
        {"$set": {
            "job_id": job_id, "status": "running", "total": len(keys), "done": 0,
            "error": None, "started_at": _now(), "finished_at": None,
            "screens": [{"key": k, "state": "pending", "error": None} for k in keys],
        }},
        upsert=True,
    )


async def _mark_screen(job_id: str, key: str, state: str, error: Optional[str] = None) -> None:
    doc = await _db.capture_jobs.find_one({"_id": _JOB_DOC_ID})
    if not doc or doc.get("job_id") != job_id:
        return
    screens = doc.get("screens", [])
    for s in screens:
        if s["key"] == key:
            s["state"] = state
            s["error"] = error
    done = sum(1 for s in screens if s["state"] in ("done", "error", "skipped"))
    await _db.capture_jobs.update_one({"_id": _JOB_DOC_ID}, {"$set": {"screens": screens, "done": done}})


async def _finish_job(job_id: str, error: Optional[str] = None) -> None:
    await _db.capture_jobs.update_one(
        {"_id": _JOB_DOC_ID, "job_id": job_id},
        {"$set": {"status": "error" if error else "done", "error": error, "finished_at": _now()}},
    )


# --------------------------------------------------------------------------- #
#  Playwright capture engine                                                   #
# --------------------------------------------------------------------------- #
def _ensure_chromium() -> None:
    """Chromium lives in a persistent /app path but can still be absent on a
    fresh clone/fork. Install it on demand so captures always self-heal."""
    try:
        base = Path(PW_BROWSERS_DIR)
        has_shell = base.exists() and any(base.glob("chromium_headless_shell-*/chrome-linux/headless_shell"))
        has_full = base.exists() and any(base.glob("chromium-*/chrome-linux/chrome"))
        if has_shell or has_full:
            return
    except Exception:
        pass
    logger.info("chromium missing — installing into %s", PW_BROWSERS_DIR)
    env = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": PW_BROWSERS_DIR}
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"],
                   env=env, check=False, capture_output=True, timeout=300)


async def _login(page, base_url: str) -> None:
    await page.goto(base_url, wait_until="domcontentloaded")
    # Wait for the login screen (choose step) to paint.
    await page.wait_for_selector('[data-testid="email-btn"]', timeout=45000)
    await page.click('[data-testid="email-btn"]')
    await page.wait_for_selector('[data-testid="email-input"]', timeout=15000)
    await page.fill('[data-testid="email-input"]', DEMO_EMAIL)
    await page.fill('[data-testid="password-input"]', DEMO_PASSWORD)
    await page.click('[data-testid="submit-btn"]')
    # Login succeeds when the auth screen is gone (token stored, AuthGate routes on).
    await page.wait_for_selector('[data-testid="email-btn"]', state="detached", timeout=45000)
    await page.wait_for_timeout(3500)


async def _capture_screen(page, base_url: str, screen: dict) -> bytes:
    await page.goto(f"{base_url}{screen['path']}", wait_until="domcontentloaded")
    # Wait until #root actually has painted content, then settle for charts/images.
    try:
        await page.wait_for_function(
            "() => { const r = document.getElementById('root'); return r && r.innerText && r.innerText.trim().length > 20; }",
            timeout=30000,
        )
    except Exception:
        pass
    await page.wait_for_timeout(3800)
    return await page.screenshot(type="png", full_page=False)


async def _run_capture(job_id: str, keys: list[str]) -> None:
    from playwright.async_api import async_playwright

    base_url = _capture_base_url()
    if not base_url:
        await _finish_job(job_id, "EXPO_PUBLIC_BACKEND_URL not configured")
        return

    _ensure_chromium()

    captured = 0
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = await browser.new_context(
                viewport={"width": VIEW_W, "height": VIEW_H},
                device_scale_factor=2,
            )
            page = await context.new_page()
            try:
                await _login(page, base_url)
            except Exception as exc:
                await browser.close()
                await _finish_job(job_id, f"Login failed: {type(exc).__name__}: {str(exc)[:180]}")
                return

            for key in keys:
                screen = _SCREEN_BY_KEY[key]
                await _mark_screen(job_id, key, "running")
                try:
                    raw = await _capture_screen(page, base_url, screen)
                    img = Image.open(io.BytesIO(raw)).convert("RGB")
                    framed = frame_shot(raw, screen["caption"])
                    thumb = framed.copy()
                    thumb.thumbnail((520, 520), Image.LANCZOS)
                    await _db.screen_captures.update_one(
                        {"key": key},
                        {"$set": {
                            "id": key, "key": key, "title": screen["title"],
                            "caption": screen["caption"], "path": screen["path"],
                            "w": img.width, "h": img.height,
                            "raw_base64": base64.b64encode(raw).decode(),
                            "framed_base64": _png_b64(framed),
                            "thumb_base64": _png_b64(thumb),
                            "created_at": _now(), "job_id": job_id,
                        }},
                        upsert=True,
                    )
                    captured += 1
                    await _mark_screen(job_id, key, "done")
                except Exception as exc:  # noqa: BLE001
                    logger.warning("capture %s failed: %s", key, exc)
                    await _mark_screen(job_id, key, "error", f"{type(exc).__name__}: {str(exc)[:160]}")

            await browser.close()
    except Exception as exc:  # noqa: BLE001
        await _finish_job(job_id, f"{type(exc).__name__}: {str(exc)[:180]}")
        return

    # Refresh store-listing copy once we have shots (best-effort).
    try:
        await _generate_store_copy()
    except Exception as exc:  # noqa: BLE001
        logger.warning("store copy generation failed: %s", exc)

    await _finish_job(job_id, None if captured else "No screens captured")


# --------------------------------------------------------------------------- #
#  LLM store-listing copy                                                      #
# --------------------------------------------------------------------------- #
_APP_BRIEF = (
    "ROUJAUNE is a premium indoor-cycling coaching app. Key features: AI cycling "
    "coach (Alberto/Adriana) that adapts your training plan and talks you through "
    "every ride; structured multi-week plans (From Couch to Road, Ride Stronger, "
    "Ride Beyond) with per-interval power targets; immersive Scenic Rides over "
    "first-person video of legendary climbs (Alpe d'Huez, Mont Ventoux, Stelvio); "
    "live power/heart-rate/cadence telemetry from Bluetooth smart trainers and "
    "sensors; detailed ride analysis, fitness trend (CTL/ATL/TSB), streaks, "
    "milestones and shareable achievements. Tablet-first, cinematic dark design "
    "with French/Italian cycling heritage. By Harmony Wellness Group."
)


def _extract_json(text: str) -> dict:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t.strip("`")
        if t.lstrip().startswith("json"):
            t = t.lstrip()[4:]
    start, end = t.find("{"), t.rfind("}")
    if start >= 0 and end > start:
        t = t[start:end + 1]
    return json.loads(t)


async def _generate_store_copy() -> dict:
    """Generate App Store listing copy via the Emergent LLM key. Falls back to a
    curated static listing if the model is unavailable."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    copy: Optional[dict] = None
    if key:
        prompt = (
            f"{_APP_BRIEF}\n\n"
            "Write App Store / Google Play listing copy for this app. Respond with "
            "STRICT JSON only, no prose, with exactly these keys:\n"
            '{"title": string (<=30 chars, includes the app name), '
            '"subtitle": string (<=30 chars), '
            '"promotional_text": string (<=170 chars), '
            '"description": string (compelling, 3-5 short paragraphs, use line breaks, no markdown), '
            '"keywords": string (comma-separated, <=100 chars total)}'
        )
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=key,
                session_id="store-listing-copy",
                system_message="You are an expert App Store optimisation (ASO) copywriter for premium fitness apps.",
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=prompt))
            copy = _extract_json(reply)
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM store copy failed: %s", exc)
            copy = None

    if not copy:
        copy = {
            "title": "ROUJAUNE: Cycling Coach",
            "subtitle": "Ride stronger, coached daily",
            "promotional_text": "Your AI cycling coach, adaptive training plans and immersive rides up the world's most legendary climbs.",
            "description": (
                "ROUJAUNE turns every indoor ride into a coached session.\n\n"
                "Your AI coach adapts your plan and talks you through every interval, "
                "matching power targets to your fitness. Choose a structured multi-week "
                "plan and build from your first ride to your biggest goal.\n\n"
                "Escape the pain cave with immersive Scenic Rides — first-person video up "
                "Alpe d'Huez, Mont Ventoux and Passo dello Stelvio, synced to your effort.\n\n"
                "Connect a Bluetooth smart trainer for live power, heart rate and cadence, "
                "then review detailed ride analysis, your fitness trend, streaks and "
                "milestones.\n\nTrain hard. Recover smart. Ride beyond."
            ),
            "keywords": "cycling,indoor cycling,bike trainer,coach,training plan,ftp,power,zwift,peloton,fitness",
        }

    fields = {k: (copy.get(k) or "") for k in
              ("title", "subtitle", "promotional_text", "description", "keywords")}
    await _db.app_meta.update_one(
        {"key": "store_listing"},
        {"$set": {"key": "store_listing", **fields, "updated_at": _now()}},
        upsert=True,
    )
    return fields


async def _get_store_copy() -> dict:
    doc = await _db.app_meta.find_one({"key": "store_listing"}, {"_id": 0})
    if not doc:
        return await _generate_store_copy()
    return doc


# --------------------------------------------------------------------------- #
#  Router                                                                       #
# --------------------------------------------------------------------------- #
capture_router = APIRouter(prefix="/api/admin/screen-captures", tags=["admin-capture"],
                           dependencies=[Depends(auth.require_admin)])


class RefreshReq(BaseModel):
    screens: Optional[list[str]] = None   # subset of screen keys; None = all


@capture_router.get("/screens")
async def list_available_screens():
    """Static catalogue of the screens the engine can capture."""
    return {"screens": [{"key": s["key"], "title": s["title"], "path": s["path"],
                         "caption": s["caption"]} for s in SCREENS]}


@capture_router.post("/refresh")
async def refresh(body: RefreshReq = Body(default=RefreshReq())):
    """Kick off a background capture job (login → traverse → frame → copy)."""
    cur = await _db.capture_jobs.find_one({"_id": _JOB_DOC_ID})
    if cur and cur.get("status") == "running":
        raise HTTPException(status_code=409, detail="A capture job is already running")
    keys = body.screens or [s["key"] for s in SCREENS]
    keys = [k for k in keys if k in _SCREEN_BY_KEY]
    if not keys:
        raise HTTPException(status_code=422, detail="No valid screen keys")
    job_id = uuid.uuid4().hex[:12]
    await _init_job(job_id, keys)

    async def _worker():
        async with _LOCK:
            try:
                await _run_capture(job_id, keys)
            except Exception as exc:  # noqa: BLE001
                await _finish_job(job_id, f"{type(exc).__name__}: {str(exc)[:180]}")

    asyncio.create_task(_worker())
    return {"job_id": job_id, "status": "running", "screens": keys}


@capture_router.get("/status")
async def status():
    doc = await _db.capture_jobs.find_one({"_id": _JOB_DOC_ID}, {"_id": 0})
    if not doc:
        return {"status": "idle", "total": 0, "done": 0, "screens": []}
    return doc


@capture_router.get("")
async def list_captures():
    """Lightweight list: metadata + thumbnails only (no heavy raw/framed)."""
    docs = await _db.screen_captures.find(
        {}, {"_id": 0, "raw_base64": 0, "framed_base64": 0}
    ).to_list(200)
    order = {s["key"]: i for i, s in enumerate(SCREENS)}
    docs.sort(key=lambda d: order.get(d.get("key"), 999))
    return {"items": docs, "count": len(docs)}


@capture_router.get("/export")
async def export_zip():
    """Bundle every capture (raw + framed) plus the store listing into a ZIP."""
    docs = await _db.screen_captures.find({}, {"_id": 0}).to_list(200)
    if not docs:
        raise HTTPException(status_code=404, detail="No captures yet — run a refresh first")
    order = {s["key"]: i for i, s in enumerate(SCREENS)}
    docs.sort(key=lambda d: order.get(d.get("key"), 999))
    copy = await _get_store_copy()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, d in enumerate(docs, 1):
            k = d.get("key", f"screen{i}")
            if d.get("raw_base64"):
                zf.writestr(f"raw/{i:02d}_{k}.png", base64.b64decode(d["raw_base64"]))
            if d.get("framed_base64"):
                zf.writestr(f"framed/{i:02d}_{k}.png", base64.b64decode(d["framed_base64"]))
        listing = (
            f"TITLE\n{copy.get('title','')}\n\n"
            f"SUBTITLE\n{copy.get('subtitle','')}\n\n"
            f"PROMOTIONAL TEXT\n{copy.get('promotional_text','')}\n\n"
            f"KEYWORDS\n{copy.get('keywords','')}\n\n"
            f"DESCRIPTION\n{copy.get('description','')}\n"
        )
        zf.writestr("store-listing.txt", listing)
        zf.writestr("store-listing.json", json.dumps(copy, indent=2))
    buf.seek(0)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M")
    return StreamingResponse(
        buf, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="roujaune-store-{stamp}.zip"'},
    )


@capture_router.get("/store-listing")
async def get_store_listing():
    return await _get_store_copy()


class StoreCopyPatch(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    promotional_text: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None


@capture_router.put("/store-listing")
async def update_store_listing(body: StoreCopyPatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = _now()
    await _db.app_meta.update_one(
        {"key": "store_listing"}, {"$set": {"key": "store_listing", **updates}}, upsert=True)
    return await _get_store_copy()


@capture_router.post("/store-listing/generate")
async def regenerate_store_listing():
    """Regenerate the App Store copy from scratch via the LLM."""
    return await _generate_store_copy()


@capture_router.get("/{key}")
async def get_capture(key: str, variant: str = "framed"):
    """Return a single capture image as PNG. variant = framed | raw | thumb."""
    field = {"framed": "framed_base64", "raw": "raw_base64", "thumb": "thumb_base64"}.get(variant)
    if not field:
        raise HTTPException(status_code=422, detail="variant must be framed | raw | thumb")
    doc = await _db.screen_captures.find_one({"key": key}, {"_id": 0, field: 1})
    if not doc or not doc.get(field):
        raise HTTPException(status_code=404, detail="Capture not found")
    return Response(content=base64.b64decode(doc[field]), media_type="image/png")
