"""Personal Records (PR) tracker — /api/rider/prs branch coverage.

Covers:
  a. First completion → first_time=true, route_time=false, route_power=false
  b. Faster later submit → route_time=true
  c. Higher avg_power submit → route_power=true
  d. Faster segment split → adds label to records.segments[]
  e. Slower/weaker submit → all false, stored bests unchanged
  f. completed=false → does NOT set route_time PR, still compares segment splits
  g. GET /api/rider/prs list + GET /api/rider/prs/{route_id} single
  h. User-scoping: PRs are per-user (register second user, verify isolation)
Cleans up: any rider_prs docs created for Green Lantern + any temp users.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"

# Unique per-test route so a rerun doesn't collide with prior state.
ROUTE_ID = f"pr-test-route-{uuid.uuid4().hex[:8]}"
ROUTE_NAME = "PR Test Scenic Route"


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def gl_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": GL_EMAIL, "password": GL_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def temp_user():
    """Register a second temporary user so we can verify per-user PR scoping."""
    email = f"temp_pr_{uuid.uuid4().hex[:8]}@roujaune.app"
    password = "temppass123"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Temp PR"},
        timeout=20,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    yield {"email": email, "password": password, "token": data["token"], "user_id": data["user"]["user_id"]}


@pytest.fixture(scope="module", autouse=True)
def cleanup(gl_token):
    """Ensure GL rider_prs is empty at end + temp users are removed."""
    yield
    # Delete PR doc(s) we created for GL. There's no DELETE endpoint; use MongoDB.
    try:
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = mongo[os.environ.get("DB_NAME", "test_database")]
        loop = asyncio.new_event_loop()
        loop.run_until_complete(db.rider_prs.delete_many({"user_id": "user_greenlantern"}))
        # Also remove any temp users created + their PR docs + sessions.
        loop.run_until_complete(db.rider_prs.delete_many({"user_id": {"$regex": "^user_"}, "id": {"$regex": "^pr-test-route-"}}))
        loop.run_until_complete(db.users.delete_many({"email": {"$regex": "^temp_pr_"}}))
        loop.run_until_complete(db.user_sessions.delete_many({"user_id": {"$regex": "^user_"}, "created_at": {"$exists": True}}))
        mongo.close()
        loop.close()
    except Exception as e:
        print(f"cleanup warning: {e}")


class TestRiderPRs:
    """Branch coverage for /api/rider/prs submit + GETs."""

    def test_a_first_completion(self, gl_token):
        payload = {
            "route_id": ROUTE_ID,
            "route_name": ROUTE_NAME,
            "time_sec": 3600,
            "avg_power": 200,
            "completed": True,
            "splits": [
                {"label": "Checkpoint 1", "km": 5.0, "time_sec": 900},
                {"label": "Checkpoint 2", "km": 10.0, "time_sec": 1900},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        rec = data["records"]
        assert rec["first_time"] is True, f"expected first_time=true, got {rec}"
        assert rec["route_time"] is False, f"first completion must not flag route_time PR: {rec}"
        assert rec["route_power"] is False, f"first submission must not flag route_power PR: {rec}"
        assert rec["segments"] == [], f"first splits are baselines, not beaten records: {rec}"
        assert data["pr"]["best_time_sec"] == 3600
        assert data["pr"]["best_avg_power"] == 200

    def test_b_faster_time_sets_route_time_pr(self, gl_token):
        payload = {
            "route_id": ROUTE_ID,
            "time_sec": 3200,           # faster than 3600
            "avg_power": 180,           # weaker → route_power stays false
            "completed": True,
            "splits": [],
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()["records"]
        assert rec["route_time"] is True, f"faster time should flag route_time PR: {rec}"
        assert rec["route_power"] is False
        assert rec["first_time"] is False
        assert r.json()["pr"]["best_time_sec"] == 3200
        assert r.json()["pr"]["best_avg_power"] == 200  # unchanged

    def test_c_higher_avg_power_sets_route_power_pr(self, gl_token):
        payload = {
            "route_id": ROUTE_ID,
            "time_sec": 4000,           # slower → route_time stays false
            "avg_power": 240,           # higher → route_power true
            "completed": True,
            "splits": [],
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()["records"]
        assert rec["route_power"] is True, f"higher avg_power should flag route_power PR: {rec}"
        assert rec["route_time"] is False
        assert r.json()["pr"]["best_avg_power"] == 240
        assert r.json()["pr"]["best_time_sec"] == 3200  # unchanged

    def test_d_faster_segment_adds_to_segments_prs(self, gl_token):
        payload = {
            "route_id": ROUTE_ID,
            "time_sec": 5000,           # slower — no route_time PR
            "avg_power": 150,           # weaker — no route_power PR
            "completed": True,
            "splits": [
                {"label": "Checkpoint 1", "km": 5.0, "time_sec": 800},   # faster than 900 → PR
                {"label": "Checkpoint 2", "km": 10.0, "time_sec": 2500}, # slower → no PR
            ],
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()["records"]
        assert "Checkpoint 1" in rec["segments"], f"expected Checkpoint 1 in segments PRs: {rec}"
        assert "Checkpoint 2" not in rec["segments"], f"Checkpoint 2 slower should NOT be PR: {rec}"
        assert rec["route_time"] is False
        assert rec["route_power"] is False

    def test_e_slower_weaker_submit_no_pr_no_change(self, gl_token):
        # Snapshot current stored bests
        pre = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20).json()
        payload = {
            "route_id": ROUTE_ID,
            "time_sec": 9999,           # slower
            "avg_power": 100,           # weaker
            "completed": True,
            "splits": [{"label": "Checkpoint 1", "km": 5.0, "time_sec": 950}],  # slower than 800
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()["records"]
        assert rec["route_time"] is False
        assert rec["route_power"] is False
        assert rec["segments"] == []
        assert rec["first_time"] is False
        # Persisted bests unchanged
        post = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20).json()
        assert post["best_time_sec"] == pre["best_time_sec"]
        assert post["best_avg_power"] == pre["best_avg_power"]
        assert post["segments"]["Checkpoint 1"]["best_time_sec"] == pre["segments"]["Checkpoint 1"]["best_time_sec"]

    def test_f_uncompleted_faster_time_no_route_time_but_segments_compared(self, gl_token):
        pre = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20).json()
        payload = {
            "route_id": ROUTE_ID,
            "time_sec": 100,            # would be fastest ever
            "avg_power": 50,
            "completed": False,         # but not completed → no route_time PR
            "splits": [
                # faster than the stored 800 for Checkpoint 1 → still a segment PR
                {"label": "Checkpoint 1", "km": 5.0, "time_sec": 700},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/rider/prs", json=payload, headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()["records"]
        assert rec["route_time"] is False, f"completed=false must NOT set route_time PR: {rec}"
        assert rec["first_time"] is False
        assert "Checkpoint 1" in rec["segments"], "segment PRs still compared when not completed"
        # best_time_sec must remain unchanged (was 3200)
        post = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20).json()
        assert post["best_time_sec"] == pre["best_time_sec"] == 3200
        assert post["segments"]["Checkpoint 1"]["best_time_sec"] == 700

    def test_g_list_and_get_single_pr(self, gl_token):
        r_list = requests.get(f"{BASE_URL}/api/rider/prs", headers=_auth_headers(gl_token), timeout=20)
        assert r_list.status_code == 200
        prs = r_list.json().get("prs", [])
        ids = [p.get("id") for p in prs]
        assert ROUTE_ID in ids, f"created PR route not present in list: {ids}"
        our = next(p for p in prs if p.get("id") == ROUTE_ID)
        assert our.get("route_name") == ROUTE_NAME
        assert our.get("best_time_sec") == 3200
        assert our.get("best_avg_power") == 240
        assert "Checkpoint 1" in our.get("segments", {})

        r_get = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20)
        assert r_get.status_code == 200
        single = r_get.json()
        assert single.get("best_time_sec") == 3200
        assert single.get("best_avg_power") == 240
        assert single.get("segments", {}).get("Checkpoint 1", {}).get("best_time_sec") == 700

    def test_h_pr_get_missing_route_returns_stub(self, gl_token):
        rid = f"nonexistent-{uuid.uuid4().hex[:6]}"
        r = requests.get(f"{BASE_URL}/api/rider/prs/{rid}", headers=_auth_headers(gl_token), timeout=20)
        assert r.status_code == 200
        assert r.json() == {"id": rid, "segments": {}}

    def test_i_user_scoping_isolation(self, gl_token, temp_user):
        # Temp user should see NO PRs initially (they never submitted any).
        r = requests.get(f"{BASE_URL}/api/rider/prs", headers=_auth_headers(temp_user["token"]), timeout=20)
        assert r.status_code == 200
        temp_prs = r.json().get("prs", [])
        gl_ids = {ROUTE_ID}
        leaked = [p for p in temp_prs if p.get("id") in gl_ids]
        assert not leaked, f"GL PR leaked to temp user: {leaked}"

        # And GET-by-id on GL's route returns stub for temp user (not GL's data).
        r_get = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(temp_user["token"]), timeout=20)
        assert r_get.status_code == 200
        j = r_get.json()
        assert j.get("best_time_sec") in (None, 0) or "best_time_sec" not in j, f"leaked best_time_sec: {j}"

        # Temp user submits their own PR on same route_id → should NOT interfere with GL.
        r_sub = requests.post(
            f"{BASE_URL}/api/rider/prs",
            json={"route_id": ROUTE_ID, "route_name": "Temp Route", "time_sec": 1000, "avg_power": 300, "completed": True},
            headers=_auth_headers(temp_user["token"]),
            timeout=20,
        )
        assert r_sub.status_code == 200, r_sub.text
        assert r_sub.json()["records"]["first_time"] is True, "temp user's first submission on this route"

        # GL should still see their own best_time_sec=3200 (unchanged by temp user)
        r_gl = requests.get(f"{BASE_URL}/api/rider/prs/{ROUTE_ID}", headers=_auth_headers(gl_token), timeout=20)
        assert r_gl.status_code == 200
        assert r_gl.json().get("best_time_sec") == 3200, f"temp user overwrote GL: {r_gl.json()}"
        assert r_gl.json().get("best_avg_power") == 240
