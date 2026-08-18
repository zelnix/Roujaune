"""Emergent Managed Object Storage client.

The Expo app never talks to storage directly (the storage API needs
EMERGENT_LLM_KEY, which must stay server-side). Every upload/download goes
through our own FastAPI routes, which use these helpers.

`requests` is synchronous — always call these via run_in_threadpool from async
routes so the event loop is never blocked.
"""
import os

import requests

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "roujaune"

_storage_key: str | None = None  # module-level; init once, reuse globally


def init_storage() -> str:
    """Call ONCE at startup. Idempotent — returns a reusable storage_key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset_key() -> None:
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload (overwrites silently if path exists). Returns {"path","size","etag"}."""
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        # Stale storage_key — reset and re-init once, then retry.
        _reset_key()
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    """Download. Returns (content_bytes, content_type). Missing object → 500 (no clean 404)."""
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        _reset_key()
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
