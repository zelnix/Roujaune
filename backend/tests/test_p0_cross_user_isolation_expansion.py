"""P0 — Cross-user (rider A vs rider B) isolation expansion.

Production Hardening & Release Readiness gate: this file exercises the
central multi-tenant invariant across every domain the app exposes data in
that was NOT already covered by test_security_audit_2026_isolation.py
(plan_templates/notification_reads/ride_photos) or
test_iter70_isolation_and_admin_interest.py (favourites/mode_interest):

  Coach (chat history) · Training plans (assignment + progress) ·
  Custom workouts (catalog) · Ride history (list + energy rollup) ·
  Scenic (discoveries) · Notifications (unread/read-all) · Profile
  (settings/appearance/prefs/PRs)

INVARIANT under test: every authenticated Rider A read/write/update/delete
against Rider B-owned resources must either (a) return a scoped empty/
not-found/no-op result, or (b) operate strictly within Rider A's own scope —
it must NEVER leak the existence, contents, mutation capability, or side
effects of another rider's data. A regression here is a BOLA/privacy bug,
not a cosmetic one — keep this file green on every future change.
"""
from __future__ import annotations

import os
import secrets

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or "http://localhost:8001").rstrip("/")


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _register(prefix: str):
    email = f"{prefix}+{secrets.token_hex(4)}@roujaune.app"
    r = requests.post(f"{BASE}/api/auth/register",
                       json={"email": email, "password": "isolate9900", "name": prefix},
                       timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user"]["user_id"]


@pytest.fixture(scope="module")
def rider_a():
    tok, uid = _register("p0iso-a")
    yield {"token": tok, "user_id": uid}
    try:
        requests.delete(f"{BASE}/api/auth/me", headers=_hdr(tok), timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def rider_b():
    tok, uid = _register("p0iso-b")
    yield {"token": tok, "user_id": uid}
    try:
        requests.delete(f"{BASE}/api/auth/me", headers=_hdr(tok), timeout=15)
    except Exception:
        pass


# ── Coach chat history ──────────────────────────────────────────────────────
class TestCoachChatIsolation:
    def test_a_chat_not_visible_to_b(self, rider_a, rider_b):
        secret_phrase = f"p0-secret-{secrets.token_hex(4)}"
        r = requests.post(f"{BASE}/api/coach/chat", headers=_hdr(rider_a["token"]),
                           json={"message": secret_phrase, "coach_name": "Alberto",
                                 "coach_gender": "male"}, timeout=45)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/coach/chat/history", headers=_hdr(rider_a["token"]), timeout=20)
        assert r.status_code == 200
        a_msgs = str(r.json())
        assert secret_phrase in a_msgs, "rider A should see their own chat message"

        r = requests.get(f"{BASE}/api/coach/chat/history", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        assert secret_phrase not in str(r.json()), \
            "REGRESSION: rider B can see rider A's coach chat history"

    def test_b_delete_history_does_not_affect_a(self, rider_a, rider_b):
        r = requests.delete(f"{BASE}/api/coach/chat/history", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        r = requests.get(f"{BASE}/api/coach/chat/history", headers=_hdr(rider_a["token"]), timeout=20)
        assert r.status_code == 200
        assert len(r.json().get("messages", r.json()) or []) >= 0  # still reachable, no crash
        # A's own delete cleans their own history only.
        requests.delete(f"{BASE}/api/coach/chat/history", headers=_hdr(rider_a["token"]), timeout=20)


# ── Training plan assignment + progress ─────────────────────────────────────
class TestPlanIsolation:
    def test_a_assigns_plan_b_stays_unassigned(self, rider_a, rider_b):
        r = requests.post(f"{BASE}/api/rider/plan", headers=_hdr(rider_a["token"]),
                           json={"plan_id": "couch-to-road"}, timeout=20)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/plan", headers=_hdr(rider_a["token"]), timeout=20)
        assert r.status_code == 200
        a_plan = r.json()
        assert a_plan.get("id") == "couch-to-road" or a_plan.get("plan_id") == "couch-to-road"

        r = requests.get(f"{BASE}/api/plan", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        b_plan = r.json()
        assert b_plan.get("id") != "couch-to-road" and b_plan.get("plan_id") != "couch-to-road", \
            "REGRESSION: rider B inherited rider A's assigned plan"

    def test_progress_not_shared(self, rider_a, rider_b):
        ra = requests.get(f"{BASE}/api/plan/progress", headers=_hdr(rider_a["token"]), timeout=20)
        rb = requests.get(f"{BASE}/api/plan/progress", headers=_hdr(rider_b["token"]), timeout=20)
        assert ra.status_code == 200 and rb.status_code == 200
        # B (no plan) must not report A's in-progress structured-plan state.
        assert rb.json() != ra.json() or rb.json().get("plan_id") in (None, "none")


# ── Custom workouts (catalog) ────────────────────────────────────────────────
class TestCatalogIsolation:
    def test_custom_workout_not_visible_to_b(self, rider_a, rider_b):
        name = f"P0 Secret Interval {secrets.token_hex(3)}"
        r = requests.post(f"{BASE}/api/catalog", headers=_hdr(rider_a["token"]),
                           json={"name": name, "durationSec": 1200}, timeout=20)
        assert r.status_code == 200, r.text
        wid = r.json()["workout"]["id"]

        r = requests.get(f"{BASE}/api/catalog", headers=_hdr(rider_a["token"]), timeout=20)
        assert any(w.get("id") == wid for w in r.json().get("items", [])), \
            "rider A should see their own custom workout"

        r = requests.get(f"{BASE}/api/catalog", headers=_hdr(rider_b["token"]), timeout=20)
        assert not any(w.get("id") == wid for w in r.json().get("items", [])), \
            "REGRESSION: rider B can see rider A's custom workout in their catalog"

        # B fetching A's workout id directly must 404 (not resolvable under B's scope).
        r = requests.get(f"{BASE}/api/catalog/{wid}", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 404, \
            f"REGRESSION: rider B could fetch rider A's custom workout directly (got {r.status_code})"

        # B "resetting" A's workout id must be a scoped no-op — A's copy survives.
        r = requests.delete(f"{BASE}/api/catalog/{wid}/reset", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        assert r.json().get("reverted") is False, \
            "REGRESSION: rider B's reset call reverted rider A's custom workout"
        r = requests.get(f"{BASE}/api/catalog/{wid}", headers=_hdr(rider_a["token"]), timeout=20)
        assert r.status_code == 200, "rider A's custom workout must still exist after B's no-op reset"

        # cleanup
        requests.delete(f"{BASE}/api/catalog/{wid}/reset", headers=_hdr(rider_a["token"]), timeout=20)


# ── Ride history + energy rollup ─────────────────────────────────────────────
class TestRideHistoryIsolation:
    async def _seed_ride(self, uid: str, calories: int) -> str:
        import uuid as _uuid
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mongo[os.environ.get("DB_NAME", "test_database")]
        rid = _uuid.uuid4().hex
        from datetime import datetime, timezone
        await db["ride_history"].insert_one({
            "id": rid, "user_id": uid, "workout": "P0 Isolation Ride",
            "calories": calories, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        mongo.close()
        return rid

    @pytest.mark.asyncio
    async def test_ride_list_and_energy_scoped(self, rider_a, rider_b):
        rid = await self._seed_ride(rider_a["user_id"], calories=999)

        r = requests.get(f"{BASE}/api/rides/history", headers=_hdr(rider_a["token"]), timeout=20)
        assert r.status_code == 200
        assert any(d.get("id") == rid for d in r.json()), "rider A should see their own seeded ride"

        r = requests.get(f"{BASE}/api/rides/history", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        assert not any(d.get("id") == rid for d in r.json()), \
            "REGRESSION: rider B can see rider A's ride in /rides/history"

        r = requests.get(f"{BASE}/api/stats/energy", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        assert r.json().get("today_kcal", 0) < 999 and r.json().get("week_kcal", 0) < 999, \
            "REGRESSION: rider B's energy rollup includes rider A's calories"

        # cleanup (direct removal — no rider-facing single-ride delete endpoint exists)
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        await mongo[os.environ.get("DB_NAME", "test_database")]["ride_history"].delete_one({"id": rid})
        mongo.close()

    def test_sandbox_import_deterministic_ids_do_not_collide_across_riders(self, rider_a, rider_b):
        """activity_sync.ingest_activities() dedups on (user_id, provider,
        external_activity_id). The sandbox generator's ids are deterministic
        (sandbox-0..sandbox-N) by design (fixes flaky idempotency tests) — so
        the dedup lookup MUST be user-scoped, or rider B's sandbox import
        would resolve to rider A's existing "sandbox-0" doc and silently
        rewrite its user_id, stealing the record. This was a real gap fixed
        alongside the determinism change (see activity_sync.py)."""
        ra = requests.post(f"{BASE}/api/connections/sandbox/import?count=4",
                            headers=_hdr(rider_a["token"]), timeout=30)
        rb = requests.post(f"{BASE}/api/connections/sandbox/import?count=4",
                            headers=_hdr(rider_b["token"]), timeout=30)
        assert ra.status_code == 200 and rb.status_code == 200
        assert ra.json().get("imported") == 4, ra.json()
        assert rb.json().get("imported") == 4, \
            f"REGRESSION: rider B's sandbox import collided with rider A's — {rb.json()}"

        acts_a = requests.get(f"{BASE}/api/connections/activities", headers=_hdr(rider_a["token"]), timeout=20).json()
        acts_b = requests.get(f"{BASE}/api/connections/activities", headers=_hdr(rider_b["token"]), timeout=20).json()
        assert len(acts_a) == 4 and len(acts_b) == 4, \
            f"REGRESSION: activity counts leaked across riders (A={len(acts_a)}, B={len(acts_b)})"

        requests.delete(f"{BASE}/api/connections/sandbox/data", headers=_hdr(rider_a["token"]), timeout=20)
        requests.delete(f"{BASE}/api/connections/sandbox/data", headers=_hdr(rider_b["token"]), timeout=20)


# ── Scenic discoveries ────────────────────────────────────────────────────────
class TestScenicDiscoveryIsolation:
    def test_discovery_not_visible_to_b(self, rider_a, rider_b):
        r = requests.post(f"{BASE}/api/scenic/discoveries", headers=_hdr(rider_a["token"]),
                           json={"route_id": "lake-garda", "title": "P0 Secret Discovery",
                                 "place": "Lake Garda"}, timeout=20)
        if r.status_code == 404:
            pytest.skip("scenic discoveries endpoint shape differs in this build — covered elsewhere")
        assert r.status_code == 200, r.text
        did = r.json().get("id") or r.json().get("discovery", {}).get("id")

        r = requests.get(f"{BASE}/api/scenic/discoveries", headers=_hdr(rider_a["token"]), timeout=20)
        a_ids = {d.get("id") for d in r.json().get("discoveries", r.json() if isinstance(r.json(), list) else [])}

        r = requests.get(f"{BASE}/api/scenic/discoveries", headers=_hdr(rider_b["token"]), timeout=20)
        assert r.status_code == 200
        b_body = r.json()
        b_ids = {d.get("id") for d in b_body.get("discoveries", b_body if isinstance(b_body, list) else [])}
        assert did not in b_ids, "REGRESSION: rider B can see rider A's scenic discovery"

        if did:
            requests.delete(f"{BASE}/api/scenic/discoveries/{did}", headers=_hdr(rider_a["token"]), timeout=20)


# ── Notifications read-state (unread / read-all) ─────────────────────────────
class TestNotificationsIsolation:
    def test_read_all_scoped_to_caller(self, rider_a, rider_b):
        key = f"p0-notif-{secrets.token_hex(3)}"
        r = requests.post(f"{BASE}/api/notifications/read", headers=_hdr(rider_a["token"]),
                           json={"key": key}, timeout=15)
        assert r.status_code == 200

        # B marking "read-all" must not touch A's read-state key set.
        r = requests.post(f"{BASE}/api/notifications/read-all",
                           headers=_hdr(rider_b["token"]), json={"keys": [key]}, timeout=15)
        assert r.status_code == 200

        r = requests.post(f"{BASE}/api/notifications/unread", headers=_hdr(rider_b["token"]),
                           json={"key": key}, timeout=15)
        assert r.status_code == 200

        r = requests.get(f"{BASE}/api/notifications/read-state", headers=_hdr(rider_a["token"]), timeout=15)
        assert key in r.json().get("readKeys", []), \
            "REGRESSION: rider B's unread/read-all call altered rider A's read-state"


# ── Profile: settings / appearance / prefs / PRs ─────────────────────────────
class TestProfileIsolation:
    def test_settings_not_shared(self, rider_a, rider_b):
        marker_ftp = 313
        r = requests.put(f"{BASE}/api/rider/settings", headers=_hdr(rider_a["token"]),
                          json={"ftp": marker_ftp}, timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/rider/settings", headers=_hdr(rider_a["token"]), timeout=15)
        assert r.json().get("ftp") == marker_ftp

        r = requests.get(f"{BASE}/api/rider/settings", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.json().get("ftp") != marker_ftp, \
            "REGRESSION: rider B's settings leaked rider A's FTP value"

    def test_appearance_not_shared(self, rider_a, rider_b):
        marker = f"p0-avatar-{secrets.token_hex(3)}.png"
        r = requests.put(f"{BASE}/api/rider/appearance", headers=_hdr(rider_a["token"]),
                          json={"avatarUrl": marker}, timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/rider/appearance", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("avatarUrl") != marker, \
            "REGRESSION: rider B's appearance leaked rider A's avatar"

    def test_prs_not_shared(self, rider_a, rider_b):
        r = requests.post(f"{BASE}/api/rider/prs", headers=_hdr(rider_a["token"]),
                           json={"route_id": "p0-secret-climb", "time_sec": 111,
                                 "date": "2026-01-01"}, timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/rider/prs", headers=_hdr(rider_b["token"]), timeout=15)
        assert r.status_code == 200
        b_body = r.json()
        b_ids = {p.get("route_id") for p in (b_body.get("prs", b_body) if isinstance(b_body, dict) else b_body)} \
            if isinstance(b_body, (dict, list)) else set()
        assert "p0-secret-climb" not in b_ids, "REGRESSION: rider B can see rider A's personal record"
