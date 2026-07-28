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
    await db.oauth_pending.update_one({"state": state}, {"$set": {
        "state": state, "verifier": verifier, "provider": provider_id,
        "redirect_uri": redirect_uri, "created_at": now_iso()}}, upsert=True)
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
    for k in ("disable_route_import", "disable_auto_sync"):
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


@router.post("/connections/sandbox/import")
async def sandbox_import(count: int = 3):
    """TEST-ONLY: run the import pipeline with demo outdoor rides (no live provider)."""
    ftp = await _rider_ftp()
    acts = [dict(a) for a in generate_sandbox_activities(count)]
    summary = await activity_sync.ingest_activities(db, auth.current_user_id(), acts, ftp)
    return {"sandbox": True, **summary}
