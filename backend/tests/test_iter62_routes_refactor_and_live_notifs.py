"""Iteration 62: Backend regression after extracting routes/connections.py + routes/workouts.py,
plus the live-notification supporting signals used by the bell modal.

Uses the external base URL from EXPO_PUBLIC_BACKEND_URL and greenlantern@roujaune.app
credentials. Cleans up any /connections/sandbox/import data at the end so the rider
stays clean.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://roujaune-train.preview.emergentagent.com").rstrip("/")
EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"


# --------- shared fixtures -------------------------------------------------

@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# --------- connections domain (extracted) ---------------------------------

class TestConnectionsDomain:
    def test_list_connections_shape(self, api):
        r = api.get(f"{BASE_URL}/api/connections", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("providers"), list) and len(j["providers"]) >= 1
        assert "encryption_ready" in j and isinstance(j["encryption_ready"], bool)
        assert "imported_activities" in j and isinstance(j["imported_activities"], int)
        # each provider entry has the meta + connection status keys
        p0 = j["providers"][0]
        for k in ("id", "name", "kind", "configured", "connection_status", "connected"):
            assert k in p0, f"missing key {k} in provider entry"

    def test_connections_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/connections", timeout=15)
        assert r.status_code in (401, 403)

    def test_sandbox_import_then_list_then_cleanup(self, api):
        pre = api.get(f"{BASE_URL}/api/connections", timeout=15).json()["imported_activities"]

        r = api.post(f"{BASE_URL}/api/connections/sandbox/import?count=3", timeout=30)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("sandbox") is True
        # ingest_activities returns some summary counts – accept common keys
        assert any(k in j for k in ("inserted", "imported", "count", "added", "created"))

        acts = api.get(f"{BASE_URL}/api/connections/activities", timeout=15)
        assert acts.status_code == 200
        rows = acts.json()
        assert isinstance(rows, list)
        assert len(rows) >= 3
        # sanity: shape of a single row
        r0 = rows[0]
        assert "_id" not in r0
        assert "route_data" not in r0

        post = api.get(f"{BASE_URL}/api/connections", timeout=15).json()["imported_activities"]
        assert post >= pre + 3

        # cleanup — required so greenlantern stays clean
        cl = api.delete(f"{BASE_URL}/api/connections/sandbox/data", timeout=15)
        assert cl.status_code == 200, cl.text[:200]
        after = api.get(f"{BASE_URL}/api/connections", timeout=15).json()["imported_activities"]
        assert after <= pre, f"cleanup did not remove sandbox rides: before={pre} after={after}"


# --------- workouts domain (extracted) ------------------------------------

class TestWorkoutsDomain:
    def test_start_list_end_flow(self, api):
        payload = {"workout": "TEST Threshold Climb", "route": "TEST Route"}
        r = api.post(f"{BASE_URL}/api/workouts/start", json=payload, timeout=15)
        assert r.status_code == 200, r.text[:200]
        sess = r.json()
        assert sess.get("id") and sess.get("status") == "active"
        sid = sess["id"]

        lst = api.get(f"{BASE_URL}/api/workouts", timeout=15)
        assert lst.status_code == 200
        assert any(s.get("id") == sid for s in lst.json())

        # get single
        g = api.get(f"{BASE_URL}/api/workouts/{sid}", timeout=15)
        assert g.status_code == 200 and g.json().get("id") == sid

        # end
        summary = {"elapsed": 600, "avg_power": 180, "avg_hr": 140, "distance": 4.2,
                   "tss": 30, "calories": 120}
        e = api.post(f"{BASE_URL}/api/workouts/{sid}/end", json=summary, timeout=15)
        assert e.status_code == 200, e.text[:200]
        ended = e.json()
        assert ended.get("status") == "ended"
        assert ended.get("summary", {}).get("distance") == 4.2
        assert ended.get("ended_at")

    def test_summarize_manual_and_history(self, api):
        body = {
            "workout": "TEST Manual Entry",
            "route": None,
            "elapsed": 1800,
            "ftp": 250,
            "est_calories": 300,
            "samples": [],
            "manual": {
                "duration_sec": 1800,
                "distance_km": 12.5,
                "elevation_m": 120,
                "avg_power": 190,
                "avg_hr": 140,
                "avg_cadence": 88,
                "rpe": 6,
            },
        }
        r = api.post(f"{BASE_URL}/api/workouts/summarize", json=body, timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("manual") is True
        assert j.get("duration_sec") == 1800
        assert j.get("distance_km") == 12.5
        assert j.get("avg_power") == 190
        assert j.get("tss", -1) >= 0
        assert j.get("id"), "summarize should return a persisted ride id"

        hist = api.get(f"{BASE_URL}/api/rides/history?limit=10", timeout=15)
        assert hist.status_code == 200
        rows = hist.json()
        assert isinstance(rows, list) and any(row.get("id") == j["id"] for row in rows)
        # bulk cleanup not exposed; rely on rider being ephemeral test rider

    def test_stats_energy_shape(self, api):
        r = api.get(f"{BASE_URL}/api/stats/energy", timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("today_kcal", "week_kcal", "week_rides", "streak_days"):
            assert k in j, f"stats/energy missing {k}"
            assert isinstance(j[k], int)


# --------- untouched core regression --------------------------------------

class TestCoreRegression:
    def test_profile(self, api):
        r = api.get(f"{BASE_URL}/api/rider/profile", timeout=15)
        assert r.status_code == 200
        j = r.json()
        # rider/profile is the physical/rider payload — must have core rider fields
        assert j.get("name") == "Green Lantern"
        for k in ("weight_kg", "age"):
            assert k in j, f"profile missing {k}"

    def test_plan(self, api):
        r = api.get(f"{BASE_URL}/api/plan", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("id") == "couch-to-road" or j.get("plan_id") == "couch-to-road" or j.get("no_plan") is False

    def test_plan_gate(self, api):
        r = api.get(f"{BASE_URL}/api/benchmark/plan-gate?plan_id=build-and-climb", timeout=15)
        assert r.status_code == 200
        j = r.json()
        # gate returns some form of allowed/blocked/decision
        assert isinstance(j, dict)
        assert any(k in j for k in ("allowed", "gate", "status", "decision", "required"))

    def test_benchmark_nudge(self, api):
        r = api.get(f"{BASE_URL}/api/benchmark/nudge", timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("required", "status", "planId"):
            assert k in j, f"nudge missing {k}"
        assert isinstance(j["required"], bool)

    def test_checkin_and_adaptations(self, api):
        ci = api.post(f"{BASE_URL}/api/rider/checkin", json={"sleep": 4, "soreness": 2, "stress": 3, "motivation": 4}, timeout=15)
        assert ci.status_code == 200
        ad = api.get(f"{BASE_URL}/api/plan/adaptations", timeout=15)
        assert ad.status_code == 200
        j = ad.json()
        assert "adaptations" in j and isinstance(j["adaptations"], list)

    def test_rider_prs(self, api):
        r = api.get(f"{BASE_URL}/api/rider/prs", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))
