"""Iteration 46 - Benchmark Workouts (Parts 1-5) backend endpoints.

Endpoints under test:
 - GET  /api/benchmark/profile
 - GET  /api/benchmark/results
 - POST /api/benchmark/sessions
 - GET  /api/benchmark/sessions/{sid}
 - PATCH /api/benchmark/sessions/{sid}

All endpoints require Bearer auth. Uses Green Lantern demo account.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = line.strip().split("=", 1)[1].strip('"').rstrip("/")

EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"

PROFILE_KEYS = [
    "ftp", "ftpWkg", "fiveMinPower", "oneMinPower", "sprintPower",
    "aerobicEfficiency", "preferredCadence", "recoveryResponse", "lastBenchmarkDate",
]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "no token"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Auth gating -----------------------------------------------------------
class TestBenchmarkAuthGating:
    def test_profile_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/benchmark/profile", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_results_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/benchmark/results", timeout=15)
        assert r.status_code in (401, 403)

    def test_sessions_post_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/benchmark/sessions", json={"testId": "ramp"}, timeout=15)
        assert r.status_code in (401, 403)


# --- Profile / results (empty state) ---------------------------------------
class TestBenchmarkProfileAndResults:
    @pytest.fixture(autouse=True)
    def _clear_prior_benchmark_profile(self):
        """Green Lantern has accumulated real benchmark_profile data across
        years of test runs, so the 'empty state' this class asserts on needs
        a scoped, TEMPORARY reset — snapshot + restore, never a permanent
        delete, since other test files (iter60/61/64/65) depend on this
        rider's real FTP/benchmark history staying intact."""
        from pymongo import MongoClient
        db = MongoClient("mongodb://localhost:27017")["test_database"]
        snapshot = db.benchmark_profile.find_one({"user_id": "user_greenlantern"})
        db.benchmark_profile.delete_many({"user_id": "user_greenlantern"})
        yield
        if snapshot:
            snapshot.pop("_id", None)
            db.benchmark_profile.update_one(
                {"user_id": "user_greenlantern"}, {"$set": snapshot}, upsert=True)

    def test_profile_returns_all_nine_keys(self, api):
        r = api.get(f"{BASE_URL}/api/benchmark/profile", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in PROFILE_KEYS:
            assert k in body, f"missing key {k}"
        # Empty state: never 0, must be null/None (so UI can render "Not yet tested")
        for k in PROFILE_KEYS:
            assert body[k] is None, f"{k}={body[k]!r} should be None on empty state"

    def test_results_returns_results_list(self, api):
        r = api.get(f"{BASE_URL}/api/benchmark/results", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "results" in body
        assert isinstance(body["results"], list)


# --- Sessions: create / fetch / patch --------------------------------------
class TestBenchmarkSessions:
    def test_create_session_returns_id_and_startedAt(self, api):
        payload = {
            "testId": "ramp",
            "readinessAnswers": {
                "well": "yes", "symptoms": "no", "illness": "no", "hard_workout": "no",
                "sleep": "no", "fuelled": "yes", "setup": "yes",
            },
            "readiness": {"status": "ready", "message": "ok", "respondedAt": "2026-01-01T00:00:00Z"},
        }
        r = api.post(f"{BASE_URL}/api/benchmark/sessions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s.get("id"), "id missing"
        assert s.get("startedAt"), "startedAt missing"
        assert s.get("testId") == "ramp"
        assert s.get("status") == "in_progress"
        assert s.get("readinessAnswers", {}).get("well") == "yes"
        assert s.get("readiness", {}).get("status") == "ready"
        assert "user_id" not in s and "_id" not in s
        pytest.session_id = s["id"]

    def test_get_session_by_id(self, api):
        sid = getattr(pytest, "session_id", None)
        assert sid, "prior create must succeed"
        r = api.get(f"{BASE_URL}/api/benchmark/sessions/{sid}", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["id"] == sid
        assert s["testId"] == "ramp"
        assert "user_id" not in s and "_id" not in s

    def test_patch_session_updates(self, api):
        sid = getattr(pytest, "session_id", None)
        assert sid
        r = api.patch(f"{BASE_URL}/api/benchmark/sessions/{sid}", json={"status": "aborted"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "aborted"
        # GET verification
        r2 = api.get(f"{BASE_URL}/api/benchmark/sessions/{sid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "aborted"

    def test_create_session_rejects_missing_testId(self, api):
        r = api.post(f"{BASE_URL}/api/benchmark/sessions", json={}, timeout=15)
        assert r.status_code == 400

    def test_get_unknown_session_404(self, api):
        r = api.get(f"{BASE_URL}/api/benchmark/sessions/does-not-exist", timeout=15)
        assert r.status_code == 404

    def test_patch_unknown_session_404(self, api):
        r = api.patch(f"{BASE_URL}/api/benchmark/sessions/does-not-exist", json={"status": "x"}, timeout=15)
        assert r.status_code == 404

    def test_do_not_start_outcome_persists(self, api):
        payload = {
            "testId": "ramp",
            "readinessAnswers": {
                "well": "yes", "symptoms": "yes", "illness": "no", "hard_workout": "no",
                "sleep": "no", "fuelled": "yes", "setup": "yes",
            },
            "readiness": {"status": "do_not_start", "message": "stop", "respondedAt": "2026-01-01T00:00:00Z"},
        }
        r = api.post(f"{BASE_URL}/api/benchmark/sessions", json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["readiness"]["status"] == "do_not_start"


# --- User scoping ----------------------------------------------------------
class TestBenchmarkUserScoping:
    def test_other_user_cannot_read_session(self, api):
        sid = getattr(pytest, "session_id", None)
        assert sid, "requires prior session"
        # Create ephemeral second account
        import uuid
        tmp_email = f"tmp_bench_{uuid.uuid4().hex[:10]}@roujaune.app"
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        reg = s2.post(f"{BASE_URL}/api/auth/register", json={
            "email": tmp_email, "password": "TmpPass123!", "name": "Tmp Bench",
        }, timeout=20)
        assert reg.status_code == 200, reg.text
        token2 = reg.json()["token"]
        s2.headers.update({"Authorization": f"Bearer {token2}"})
        try:
            r = s2.get(f"{BASE_URL}/api/benchmark/sessions/{sid}", timeout=15)
            assert r.status_code == 404, "session must not leak to other user"
            # Also profile should be empty for new user
            pr = s2.get(f"{BASE_URL}/api/benchmark/profile", timeout=15)
            assert pr.status_code == 200
            body = pr.json()
            for k in PROFILE_KEYS:
                assert body[k] is None
            # Results list empty
            rr = s2.get(f"{BASE_URL}/api/benchmark/results", timeout=15)
            assert rr.status_code == 200
            assert rr.json()["results"] == []
        finally:
            s2.delete(f"{BASE_URL}/api/account", timeout=15)
