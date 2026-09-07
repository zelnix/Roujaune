"""Third-party ride connections (OAuth link, sync, imported activities).

Self-contained: depends only on shared leaf modules (db, auth, providers,
crypto_util, activity_sync) and its own private helpers.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

import auth
import activity_sync
import crypto_util
from core import now_iso
from db import db
from providers.base import PROVIDERS, get_provider
from providers.sandbox import generate_sandbox_activities

udb = auth.udb
router = APIRouter()


async def _rider_ftp() -> int:
    try:
        s = await udb.settings.find_one({"id": "app"})
        if s and s.get("ftp"):
            return int(s["ftp"])
    except Exception:
        pass
    return 200


async def _account_view(provider_id: str, acc: Optional[dict]) -> dict:
    p = get_provider(provider_id)
    meta = dict(p.meta) if p else {"id": provider_id, "name": provider_id, "kind": "unknown", "requires_native_build": False, "icon": "link-outline"}
    configured = bool(p and p.is_configured())
    if not acc:
        status = "not_configured" if (meta.get("kind") == "cloud_oauth" and not configured) else (
            "requires_build" if meta.get("requires_native_build") else "disconnected")
        return {**meta, "configured": configured, "connection_status": status,
                "connected": False, "last_successful_sync_at": None, "last_sync_attempt_at": None,
                "provider_account_id": None, "permissions": [], "disable_route_import": False,
                "disable_auto_sync": False}
    return {**meta, "configured": configured,
            "connection_status": acc.get("connection_status", "connected"),
            "connected": acc.get("connection_status") in ("connected", "syncing"),
            "last_successful_sync_at": acc.get("last_successful_sync_at"),
            "last_sync_attempt_at": acc.get("last_sync_attempt_at"),
            "provider_account_id": acc.get("provider_account_id"),
            "permissions": acc.get("permissions", []),
            "disable_route_import": acc.get("disable_route_import", False),
            "disable_auto_sync": acc.get("disable_auto_sync", False),
            "strava_auto_push": acc.get("strava_auto_push", True),
            "last_error": acc.get("last_error")}


@router.get("/connections")
async def list_connections():
    """All supported providers with the rider's connection + sync status."""
    accounts = {a["provider"]: a for a in await udb.connected_accounts.find({"user_id": auth.current_user_id()}).to_list(length=50)}
    out = []
    for pid in PROVIDERS:
        out.append(await _account_view(pid, accounts.get(pid)))
    imported = await udb.cycling_activities.count_documents({"user_id": auth.current_user_id()})
    return {"providers": out, "encryption_ready": crypto_util.encryption_ready(), "imported_activities": imported}


@router.post("/connections/{provider_id}/authorize")
async def connection_authorize(provider_id: str, body: dict):
    """Return the provider OAuth authorize URL. PKCE is backend-mediated: we
    generate + store the code_verifier keyed by state, so the client only needs
    to open the URL and hand back the returned code."""
    import secrets, hashlib, base64
    p = get_provider(provider_id)
    if not p:
        raise HTTPException(404, "Unknown provider")
    if not p.is_configured():
        return {"setup_required": True, "message": f"{p.meta['name']} credentials are not configured yet."}
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = str(uuid.uuid4())
    redirect_uri = body.get("redirect_uri", "")
    # For Strava the `redirect_uri` sent to the provider is our HTTPS bounce
    # endpoint (Strava rejects custom app schemes); `app_redirect` is the native
    # deep link the bounce page forwards the code/state to.
    app_redirect = body.get("app_redirect") or redirect_uri
    await db.oauth_pending.update_one({"state": state}, {"$set": {
        "state": state, "verifier": verifier, "provider": provider_id,
        "redirect_uri": redirect_uri, "app_redirect": app_redirect, "created_at": now_iso()}}, upsert=True)
    url = await p.build_authorize_url(state, challenge, redirect_uri)
    return {"authorize_url": url, "state": state}


@router.post("/connections/{provider_id}/callback")
async def connection_callback(provider_id: str, body: dict):
    """Exchange the OAuth code, store encrypted tokens, and run the initial import."""
    p = get_provider(provider_id)
    if not p:
        raise HTTPException(404, "Unknown provider")
    if not p.is_configured():
        raise HTTPException(400, "Provider not configured")
    if not crypto_util.encryption_ready():
        raise HTTPException(500, "Token encryption not configured (ENCRYPTION_KEY missing)")
    pend = await db.oauth_pending.find_one({"state": body.get("state")})
    verifier = (pend or {}).get("verifier") or body.get("code_verifier", "")
    redirect_uri = (pend or {}).get("redirect_uri") or body.get("redirect_uri", "")
    try:
        tok = await p.exchange_code(body.get("code", ""), verifier, redirect_uri)
    except Exception as e:
        logging.warning(f"oauth exchange failed: {e}")
        raise HTTPException(400, "Authorisation failed")
    if pend:
        await db.oauth_pending.delete_one({"state": body["state"]})
    expiry = int(datetime.now(timezone.utc).timestamp()) + int(tok.get("expires_in", 3600))
    acc = {
        "id": str(uuid.uuid4()), "user_id": auth.current_user_id(), "provider": provider_id,
        "provider_account_id": tok.get("provider_account_id"),
        "access_token_encrypted": crypto_util.encrypt_token(tok.get("access_token")),
        "refresh_token_encrypted": crypto_util.encrypt_token(tok.get("refresh_token")),
        "token_expiry": expiry, "permissions": tok.get("permissions", []),
        "connection_status": "connected", "sync_cursor": None,
        "disable_route_import": False, "disable_auto_sync": False,
        "created_at": now_iso(), "updated_at": now_iso(),
        "last_successful_sync_at": None, "last_sync_attempt_at": None,
    }
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id}, {"$set": acc}, upsert=True)
    result = await _run_sync(provider_id, initial=True)
    return {"connected": True, "sync": result}


@router.get("/connections/strava/oauth-return", response_class=HTMLResponse)
async def strava_oauth_return(code: str | None = None, state: str | None = None,
                             scope: str | None = None, error: str | None = None):
    """Public HTTPS callback registered as Strava's Authorization Callback Domain.
    Strava (which rejects custom app schemes) redirects the browser here with the
    one-time code; we bounce it straight into the native app via its deep link so
    expo-web-browser detects completion. No app session exists on this request."""
    import html as _html
    import json as _json
    from urllib.parse import urlencode as _urlencode

    pend = await db.oauth_pending.find_one({"state": state}) if state else None
    app_redirect = (pend or {}).get("app_redirect") or "roujaune://oauth/strava"
    params = {}
    if code:
        params["code"] = code
    if state:
        params["state"] = state
    if scope:
        params["scope"] = scope
    if error:
        params["error"] = error
    native_url = app_redirect + (("?" + _urlencode(params)) if params else "")
    js_url = _json.dumps(native_url)
    safe_link = _html.escape(native_url, quote=True)
    return HTMLResponse(f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Returning to ROUJAUNE</title>
<style>body{{background:#0b0c0c;color:#f4f0e9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}}
a{{color:#f5b301;font-weight:700;text-decoration:none;margin-top:14px;font-size:17px}}</style></head>
<body>
<p>Connecting your Strava account…</p>
<p><a href="{safe_link}">Return to ROUJAUNE</a></p>
<script>window.location.replace({js_url});</script>
</body></html>""")



async def _run_sync(provider_id: str, initial: bool = False) -> dict:
    """Incremental (or initial historical) sync for a connected provider."""
    p = get_provider(provider_id)
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    if not p or not acc:
        raise HTTPException(400, "Not connected")
    await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "syncing", "last_sync_attempt_at": now_iso()}})
    now = int(datetime.now(timezone.utc).timestamp())
    since = acc.get("sync_cursor") or (now - 86400 * (90 if initial else 30))
    access = crypto_util.decrypt_token(acc.get("access_token_encrypted"))
    # refresh if expired
    if acc.get("token_expiry") and acc["token_expiry"] < now + 60 and acc.get("refresh_token_encrypted"):
        try:
            rt = crypto_util.decrypt_token(acc["refresh_token_encrypted"])
            newtok = await p.refresh(rt)
            access = newtok["access_token"]
            await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
                "access_token_encrypted": crypto_util.encrypt_token(newtok["access_token"]),
                "refresh_token_encrypted": crypto_util.encrypt_token(newtok.get("refresh_token")),
                "token_expiry": now + int(newtok.get("expires_in", 3600))}})
        except Exception as e:
            logging.warning(f"token refresh failed: {e}")
            await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "reauth_required", "last_error": "Reauthorisation required"}})
            return {"status": "reauth_required"}
    # fetch with simple retry/backoff
    ftp = await _rider_ftp()
    activities, err = [], None
    for attempt in range(3):
        try:
            activities = await p.fetch_activities(access, since, now)
            err = None
            break
        except Exception as e:
            err = str(e)
            await asyncio.sleep(0.5 * (2 ** attempt))
    if err is not None:
        await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {"connection_status": "sync_failed", "last_error": err[:200]}})
        return {"status": "sync_failed", "error": err[:200]}
    summary = await activity_sync.ingest_activities(
        db, auth.current_user_id(), [dict(a) for a in activities], ftp, disable_route=acc.get("disable_route_import", False))
    await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
        "connection_status": "connected", "sync_cursor": now,
        "last_successful_sync_at": now_iso(), "last_error": None}})
    return {"status": "connected", **summary}


@router.post("/connections/{provider_id}/sync")
async def connection_sync(provider_id: str):
    return await _run_sync(provider_id, initial=False)


@router.post("/connections/{provider_id}/disconnect")
async def connection_disconnect(provider_id: str):
    await udb.connected_accounts.delete_one({"user_id": auth.current_user_id(), "provider": provider_id})
    return {"disconnected": True}


@router.delete("/connections/{provider_id}/data")
async def connection_delete_data(provider_id: str):
    return await activity_sync.delete_imported(db, auth.current_user_id(), provider_id)


@router.patch("/connections/{provider_id}/settings")
async def connection_settings(provider_id: str, body: dict):
    patch = {}
    for k in ("disable_route_import", "disable_auto_sync", "strava_auto_push"):
        if k in body:
            patch[k] = bool(body[k])
    if patch:
        patch["updated_at"] = now_iso()
        await udb.connected_accounts.update_one({"user_id": auth.current_user_id(), "provider": provider_id}, {"$set": patch})
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    return await _account_view(provider_id, acc)


@router.get("/connections/activities")
async def imported_activities(limit: int = 50):
    docs = await udb.cycling_activities.find({"user_id": auth.current_user_id()}).sort("started_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
        d.pop("route_data", None)  # keep the list response lightweight
    return docs


# --- Device-native health sync (Apple Health / Health Connect) ------------
# These providers read & write on-device via native modules (only inside an
# installed iOS/Android build). The device performs the actual HealthKit /
# Health Connect I/O; the backend records the connection status and ingests
# any imported cycling workouts so they flow into history/progress/coaching.
_NATIVE_IDS = {"apple_health", "health_connect"}


def _native_or_404(provider_id: str):
    if provider_id not in _NATIVE_IDS:
        raise HTTPException(404, "Unknown native health provider")


def _native_to_activity(provider_id: str, w: dict) -> dict:
    ext = str(w.get("id") or w.get("startDate") or uuid.uuid4())
    dur = w.get("durationSec")
    if dur is None and w.get("startDate") and w.get("endDate"):
        try:
            s = datetime.fromisoformat(str(w["startDate"]).replace("Z", "+00:00"))
            e = datetime.fromisoformat(str(w["endDate"]).replace("Z", "+00:00"))
            dur = max(0, int((e - s).total_seconds()))
        except Exception:
            dur = None
    return {
        "external_activity_id": f"{provider_id}:{ext}",
        "provider": provider_id,
        "name": w.get("title") or "Cycling",
        "started_at": w.get("startDate"),
        "elapsed_seconds": dur,
        "distance_metres": w.get("distanceMeters"),
        "calories": w.get("calories"),
        "average_heart_rate": w.get("avgHr"),
        "average_power": w.get("avgPower"),
        "indoor_outdoor": w.get("indoorOutdoor") or "outdoor",
        "activity_type": "cycling",
        "device_name": w.get("sourceName"),
    }


@router.post("/connections/native/{provider_id}/link")
async def native_link(provider_id: str, body: dict):
    """Mark a device-native health provider connected after on-device permission
    was granted. Idempotent."""
    _native_or_404(provider_id)
    doc = {
        "id": str(uuid.uuid4()), "provider": provider_id,
        "connection_status": "connected", "kind": "device_native",
        "permissions": body.get("permissions", []),
        "provider_account_id": body.get("account"),
        "disable_route_import": False, "disable_auto_sync": False,
        "created_at": now_iso(), "updated_at": now_iso(),
        "last_sync_attempt_at": None, "last_successful_sync_at": None,
    }
    existing = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    if existing:
        doc.pop("id"); doc.pop("created_at"); doc.pop("last_successful_sync_at")
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id}, {"$set": doc}, upsert=True)
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": provider_id})
    return await _account_view(provider_id, acc)


@router.post("/connections/native/{provider_id}/import")
async def native_import(provider_id: str, body: dict):
    """Ingest cycling workouts the device read from Apple Health / Health Connect."""
    _native_or_404(provider_id)
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id},
        {"$set": {"connection_status": "syncing", "last_sync_attempt_at": now_iso()}})
    workouts = body.get("workouts") or []
    acts = [_native_to_activity(provider_id, w) for w in workouts if isinstance(w, dict)]
    acts = [a for a in acts if a.get("started_at")]
    ftp = await _rider_ftp()
    summary = {"imported": 0, "updated": 0, "duplicates": 0}
    if acts:
        summary = await activity_sync.ingest_activities(db, auth.current_user_id(), acts, ftp)
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id},
        {"$set": {"connection_status": "connected", "last_successful_sync_at": now_iso(), "last_error": None}})
    return {"status": "connected", **summary}


@router.post("/connections/native/{provider_id}/pushed")
async def native_pushed(provider_id: str, body: dict):
    """Record that the device pushed N Roujaune rides into the health platform."""
    _native_or_404(provider_id)
    await udb.connected_accounts.update_one(
        {"user_id": auth.current_user_id(), "provider": provider_id},
        {"$set": {"last_successful_sync_at": now_iso(), "connection_status": "connected", "last_error": None}})
    return {"ok": True, "pushed": int(body.get("count") or 0)}


@router.post("/connections/sandbox/import")
async def sandbox_import(count: int = 3):
    """TEST-ONLY: run the import pipeline with demo outdoor rides (no live provider)."""
    ftp = await _rider_ftp()
    acts = [dict(a) for a in generate_sandbox_activities(count)]
    summary = await activity_sync.ingest_activities(db, auth.current_user_id(), acts, ftp)
    return {"sandbox": True, **summary}


# --- Pushing indoor rides UP to Strava ------------------------------------ #
async def _fresh_access_token(acc: dict) -> str:
    """Return a valid access token for a connected account, refreshing (and
    persisting the rotated token) when it is at/near expiry."""
    access = crypto_util.decrypt_token(acc.get("access_token_encrypted"))
    now = int(datetime.now(timezone.utc).timestamp())
    if acc.get("token_expiry") and acc["token_expiry"] < now + 120 and acc.get("refresh_token_encrypted"):
        p = get_provider(acc["provider"])
        rt = crypto_util.decrypt_token(acc["refresh_token_encrypted"])
        newtok = await p.refresh(rt)
        access = newtok["access_token"]
        await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
            "access_token_encrypted": crypto_util.encrypt_token(newtok["access_token"]),
            "refresh_token_encrypted": crypto_util.encrypt_token(newtok.get("refresh_token")),
            "token_expiry": now + int(newtok.get("expires_in", 21600))}})
    return access


def _ride_to_strava(h: dict, coach_summary: str | None = None) -> dict:
    # Prefer an explicit summary (from the summary screen), else any cached
    # coach debrief stored on the ride (keyed `debrief_<coach>`).
    if not coach_summary:
        for k, v in h.items():
            if k.startswith("debrief_") and isinstance(v, str) and v.strip():
                coach_summary = v.strip()
                break
    return {
        "id": h.get("id"),
        "name": (h.get("workout") or (h.get("route") or {}).get("name") or "Indoor Ride"),
        "started_at": h.get("created_at"),
        "elapsed_seconds": h.get("duration_sec"),
        "distance_metres": round(float(h["distance_km"]) * 1000) if h.get("distance_km") else None,
        "average_power": h.get("avg_power"),
        "average_heart_rate": h.get("avg_hr"),
        "tss": h.get("tss"),
        "calories": h.get("calories"),
        "coach_summary": coach_summary,
    }


async def _do_strava_push(acc: dict, h: dict, coach_summary: str | None = None) -> dict:
    """Upload one ride to Strava (TCX when we have samples, else a summary
    activity) and record the resulting id on the ride. Idempotent per ride."""
    import providers.strava as strava
    ride = _ride_to_strava(h, coach_summary)
    samples = h.get("samples") or []
    access = await _fresh_access_token(acc)
    if samples:
        res = await strava.upload_tcx(access, ride, samples)
    else:
        res = await strava.create_manual_activity(access, ride)
    await udb.ride_history.update_one({"id": h["id"]}, {"$set": {
        "strava_activity_id": res.get("activity_id"),
        "strava_upload_id": res.get("upload_id"),
        "strava_status": res.get("status"),
        "strava_pushed_at": now_iso()}})
    await udb.connected_accounts.update_one({"id": acc["id"]}, {"$set": {
        "last_successful_sync_at": now_iso(), "connection_status": "connected", "last_error": None}})
    return {"ok": True, "already": False, "status": res.get("status"),
            "activity_id": res.get("activity_id"), "with_graph": bool(samples)}


async def auto_push_strava(user_id: str, ride_id: str) -> None:
    """Fire-and-forget auto-upload of a just-saved indoor ride, if the rider
    connected Strava with write access and left auto-push on."""
    try:
        import providers.strava as strava
        acc = await udb.connected_accounts.find_one({"user_id": user_id, "provider": "strava"})
        if not acc or acc.get("strava_auto_push") is False:
            return
        if strava.WRITE_SCOPE not in (acc.get("permissions") or []):
            return
        h = await udb.ride_history.find_one({"id": ride_id})
        if not h or h.get("strava_activity_id"):
            return
        await _do_strava_push(acc, h)
    except Exception as e:
        logging.warning(f"auto strava push failed: {e}")


@router.get("/connections/strava/ride-status")
async def strava_ride_status(ride_id: str):
    """Button state for the summary screen: is Strava connected + writable, and
    has this ride already been pushed?"""
    import providers.strava as strava
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": "strava"})
    h = await udb.ride_history.find_one({"id": ride_id})
    return {
        "connected": bool(acc),
        "can_write": bool(acc and strava.WRITE_SCOPE in (acc.get("permissions") or [])),
        "synced": bool(h and h.get("strava_activity_id")),
        "pending": bool(h and h.get("strava_status") == "processing" and not (h or {}).get("strava_activity_id")),
    }


@router.post("/connections/strava/push")
async def strava_push(body: dict):
    """Manually push one indoor ride to Strava."""
    import providers.strava as strava
    ride_id = body.get("ride_id")
    if not ride_id:
        raise HTTPException(400, "ride_id required")
    acc = await udb.connected_accounts.find_one({"user_id": auth.current_user_id(), "provider": "strava"})
    if not acc:
        raise HTTPException(400, "Strava is not connected")
    if strava.WRITE_SCOPE not in (acc.get("permissions") or []):
        return {"reauth_required": True, "message": "Reconnect Strava and allow uploads to enable this."}
    h = await udb.ride_history.find_one({"id": ride_id})
    if not h:
        raise HTTPException(404, "Ride not found")
    if h.get("strava_activity_id"):
        return {"ok": True, "already": True, "activity_id": h["strava_activity_id"]}
    try:
        return await _do_strava_push(acc, h, body.get("coach_summary"))
    except Exception as e:
        logging.warning(f"strava push failed: {e}")
        raise HTTPException(502, "Strava upload failed — please try again")
