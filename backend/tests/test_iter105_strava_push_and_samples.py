"""Iter 105 — Push indoor rides UP to Strava (TCX) + per-second sample persistence.

Verified endpoints:
- POST /api/workouts/summarize with >=30 samples -> returns id + persists samples/avg_hr
- GET  /api/rides/history?limit=1 -> newest ride has non-empty samples[] + avg_hr
- GET  /api/connections/strava/ride-status?ride_id=... -> connected/can_write/synced/pending all false
- POST /api/connections/strava/push -> HTTP 400 (Strava not connected) — NOT 500
- PATCH /api/connections/strava/settings {strava_auto_push:false} -> 200
- GET  /api/connections regression: strava, health_connect (Google Health (Health Connect)), apple_health present; no google_fit
"""
import os
import math
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.text[:200]}"
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def new_ride_id(api):
    """Create a ride with >=30 telemetry samples and return its id."""
    n = 60
    samples = []
    for i in range(n):
        # produce plausible varying telemetry
        p = 200 + int(30 * math.sin(i / 5.0))
        hr = 140 + (i % 15)
        cad = 85 + (i % 10)
        spd = 30 + (i % 5)
        samples.append({"power": p, "hr": hr, "cadence": cad, "speed": spd})
    payload = {
        "samples": samples,
        "elapsed": 60,
        "ftp": 220,
        "workout": "TEST_iter105 push",
        "est_calories": 15,
    }
    r = api.post(f"{BASE_URL}/api/workouts/summarize", json=payload, timeout=30)
    assert r.status_code == 200, f"summarize failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "id" in data and data["id"], f"missing id in summary response: {data}"
    ride_id = data["id"]
    yield ride_id
    # Clean up — this test creates a real ride_history row on the shared demo
    # account; leaving it behind inflates lifetime totals for every other
    # test that reads demo's ride history (e.g. test_iter81's milestones
    # zero/two-ride assertions), so always remove it once this module is done.
    from pymongo import MongoClient
    MongoClient("mongodb://localhost:27017")["test_database"].ride_history.delete_one({"id": ride_id})


# ---------------- summarize + persistence ---------------- #

def test_summarize_returns_id_and_avg_hr(new_ride_id):
    assert isinstance(new_ride_id, str) and len(new_ride_id) > 8


def test_ride_history_has_samples_and_avg_hr(api, new_ride_id):
    r = api.get(f"{BASE_URL}/api/rides/history?limit=1", timeout=15)
    assert r.status_code == 200, r.text[:200]
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 1
    row = rows[0]
    assert row.get("id") == new_ride_id, f"newest ride id mismatch: {row.get('id')} vs {new_ride_id}"
    samples = row.get("samples")
    assert isinstance(samples, list) and len(samples) > 0, f"samples empty/missing: {type(samples).__name__} len={len(samples) if isinstance(samples, list) else 'n/a'}"
    # per-second data shape sanity
    assert any(s.get("power") is not None for s in samples), "no power values in samples"
    avg_hr = row.get("avg_hr")
    assert isinstance(avg_hr, (int, float)) and avg_hr > 0, f"avg_hr missing/zero: {avg_hr}"


# ---------------- strava ride-status ---------------- #

def test_strava_ride_status_all_false(api, new_ride_id):
    r = api.get(f"{BASE_URL}/api/connections/strava/ride-status", params={"ride_id": new_ride_id}, timeout=15)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d.get("connected") is False, f"connected should be False: {d}"
    assert d.get("can_write") is False, f"can_write should be False: {d}"
    assert d.get("synced") is False, f"synced should be False: {d}"
    assert d.get("pending") is False, f"pending should be False: {d}"


# ---------------- strava push guard ---------------- #

def test_strava_push_returns_400_when_not_connected(api, new_ride_id):
    r = api.post(f"{BASE_URL}/api/connections/strava/push", json={"ride_id": new_ride_id}, timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
    # must NOT be 500
    assert r.status_code != 500


def test_strava_push_missing_ride_id_400(api):
    r = api.post(f"{BASE_URL}/api/connections/strava/push", json={}, timeout=15)
    assert r.status_code == 400, f"expected 400 for missing ride_id, got {r.status_code}: {r.text[:200]}"


# ---------------- strava settings PATCH ---------------- #

def test_strava_settings_patch_ok(api):
    r = api.patch(f"{BASE_URL}/api/connections/strava/settings", json={"strava_auto_push": False}, timeout=15)
    assert r.status_code == 200, f"settings patch failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    # response is account view; strava provider present
    assert body.get("id") == "strava"


# ---------------- connections regression ---------------- #

def test_connections_lists_expected_providers_and_no_google_fit(api):
    r = api.get(f"{BASE_URL}/api/connections", timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    providers = body.get("providers") or []
    ids = {p.get("id") for p in providers}
    assert "strava" in ids, f"strava missing: {ids}"
    assert "health_connect" in ids, f"health_connect missing: {ids}"
    assert "apple_health" in ids, f"apple_health missing: {ids}"
    assert "google_fit" not in ids, f"google_fit should NOT be present: {ids}"

    by_id = {p["id"]: p for p in providers}
    assert by_id["strava"].get("kind") == "cloud_oauth", by_id["strava"]
    hc = by_id["health_connect"]
    assert hc.get("name") == "Google Health (Health Connect)", hc.get("name")
