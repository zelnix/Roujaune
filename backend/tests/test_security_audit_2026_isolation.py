"""Permanent regression tests for SEC-001 / SEC-002 (2026-09 security audit).

SEC-001: `plan_templates`, `plan_skips`, `plan_undo`, `coach_pending_confirm`,
and `notification_reads` were missing from auth.py's `USER_SCOPED` set, so the
`udb` proxy silently returned the RAW, unscoped collection for them — any
authenticated rider could read every other rider's saved plan templates
(`GET /api/coach/plan-templates` did `find({})`) and collide with another
rider's notification/skip/undo/pending-confirm state (fixed doc ids with no
owner filter). Fixed by adding them to USER_SCOPED.

SEC-002: `routes/ride_photos.py` imported the RAW `db` module directly
(`from db import db as udb`) instead of the scoped `auth.udb` proxy, so its
`ride_history` lookups by `ride_id` had no owner check — any authenticated
rider who learned another rider's `ride_id` could list/attach/delete photos
on that ride. Fixed by importing `auth.udb` instead.

These tests must keep passing on every future change — a regression here is a
cross-user privacy/tamper bug, not a cosmetic issue.
"""
import os
import secrets

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _register(prefix: str):
    email = f"{prefix}+{secrets.token_hex(4)}@roujaune.app"
    r = requests.post(
        f"{BASE}/api/auth/register",
        json={"email": email, "password": "isolate9900", "name": prefix},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user"]["user_id"]


@pytest.fixture(scope="module")
def rider_a():
    tok, uid = _register("secaudit-a")
    yield {"token": tok, "user_id": uid}
    try:
        requests.delete(f"{BASE}/api/auth/me", headers=_hdr(tok), timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def rider_b():
    tok, uid = _register("secaudit-b")
    yield {"token": tok, "user_id": uid}
    try:
        requests.delete(f"{BASE}/api/auth/me", headers=_hdr(tok), timeout=15)
    except Exception:
        pass


# ── SEC-001: plan_templates ─────────────────────────────────────────────────
class TestPlanTemplateIsolation:
    """A saves a plan template; B must never see it in their own list, and
    B "deleting" A's template id must be a no-op (proves the delete filter is
    scoped, not just the list filter)."""

    def test_full_roundtrip(self, rider_a, rider_b):
        plan = {"title": "SecAudit Isolation Plan", "weeks_count": 2, "days_per_week": 3,
                "weeks": [{"days": [{"title": "Easy Spin"}]}]}
        r = requests.post(f"{BASE}/api/coach/plan-templates", headers=_hdr(rider_a["token"]),
                           json={"plan": plan}, timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        # A sees their own template.
        r = requests.get(f"{BASE}/api/coach/plan-templates", headers=_hdr(rider_a["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert tid in {t["id"] for t in r.json()["templates"]}, "rider A should see their own saved template"

        # B must NOT see A's template — this is the core BOLA regression check.
        r = requests.get(f"{BASE}/api/coach/plan-templates", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        b_ids = {t["id"] for t in r.json()["templates"]}
        assert tid not in b_ids, "SEC-001 REGRESSION: rider B can see rider A's private plan template"

        # B attempting to delete A's template id must be a scoped no-op.
        r = requests.delete(f"{BASE}/api/coach/plan-templates/{tid}", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200, r.text  # endpoint always replies ok, even for a no-op

        # A's template must still exist afterwards — proves B's delete did not touch it.
        r = requests.get(f"{BASE}/api/coach/plan-templates", headers=_hdr(rider_a["token"]), timeout=15)
        assert tid in {t["id"] for t in r.json()["templates"]}, \
            "SEC-001 REGRESSION: rider B's delete removed rider A's plan template"

        # A can clean up their own template.
        r = requests.delete(f"{BASE}/api/coach/plan-templates/{tid}", headers=_hdr(rider_a["token"]), timeout=15)
        assert r.status_code == 200


# ── SEC-001: notification_reads ──────────────────────────────────────────────
class TestNotificationReadStateIsolation:
    def test_read_state_not_shared(self, rider_a, rider_b):
        key = f"secaudit-key-{secrets.token_hex(3)}"
        r = requests.post(f"{BASE}/api/notifications/read", headers=_hdr(rider_a["token"]),
                           json={"key": key}, timeout=15)
        assert r.status_code == 200

        r = requests.get(f"{BASE}/api/notifications/read-state", headers=_hdr(rider_a["token"]), timeout=15)
        assert key in r.json().get("readKeys", []), "rider A should see their own read key"

        r = requests.get(f"{BASE}/api/notifications/read-state", headers=_hdr(rider_b["token"]), timeout=15)
        assert key not in r.json().get("readKeys", []), \
            "SEC-001 REGRESSION: rider B sees rider A's notification read-state"


# ── SEC-002: ride photo endpoints ────────────────────────────────────────────
class TestRidePhotoIsolation:
    """Rider A owns a ride; rider B (who somehow learns the ride_id) must not
    be able to list, attach, or remove photos on A's ride."""

    async def _seed_ride(self, uid: str) -> str:
        import uuid as _uuid
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mongo[os.environ.get("DB_NAME", "test_database")]
        rid = _uuid.uuid4().hex
        await db["ride_history"].insert_one({
            "id": rid, "user_id": uid, "workout": "SecAudit Ride",
            "photos": [{"id": "seed-photo-1", "path": f"roujaune/uploads/{uid}/seed-photo-1.jpg", "created_at": "2026-01-01T00:00:00Z"}],
        })
        mongo.close()
        return rid

    @pytest.mark.asyncio
    async def test_ride_photo_endpoints_scoped_to_owner(self, rider_a, rider_b):
        ride_id = await self._seed_ride(rider_a["user_id"])

        # Owner (A) sees the seeded photo.
        r = requests.get(f"{BASE}/api/rides/{ride_id}/photos", headers=_hdr(rider_a["token"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()["photos"]) == 1, "rider A should see their own ride's photo"

        # B (not the owner) must NOT see A's ride photos — must come back empty, never A's data.
        r = requests.get(f"{BASE}/api/rides/{ride_id}/photos", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["photos"] == [], "SEC-002 REGRESSION: rider B can list rider A's ride photos"

        # B attempting to delete a photo on A's ride must be a scoped no-op.
        r = requests.delete(f"{BASE}/api/rides/{ride_id}/photos/seed-photo-1",
                            headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200  # endpoint always replies ok, even for a no-op

        # A's photo must still be there afterwards.
        r = requests.get(f"{BASE}/api/rides/{ride_id}/photos", headers=_hdr(rider_a["token"]), timeout=15)
        assert len(r.json()["photos"]) == 1, \
            "SEC-002 REGRESSION: rider B's delete removed rider A's ride photo"

        # B attempting to upload a photo onto A's ride must 404 (ride not found under B's scope).
        files = {"file": ("t.jpg", b"\xff\xd8\xff\xe0fake", "image/jpeg")}
        r = requests.post(f"{BASE}/api/rides/{ride_id}/photos", headers={"Authorization": f"Bearer {rider_b['token']}"},
                           files=files, timeout=15)
        assert r.status_code == 404, \
            f"SEC-002 REGRESSION: rider B could attach a photo to rider A's ride (got {r.status_code})"
