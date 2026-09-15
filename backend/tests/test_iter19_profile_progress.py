"""Iteration 19 backend tests.

Coverage:
- GET /api/rider/season with days=0/7/30/90/365 → returns keys, zeros expected
- GET /api/rider/achievements → returns {achievements: []} when history empty
- GET /api/connections → services contract (Strava, Garmin, Apple, Google Fit,
  Samsung, Harmony Wellness). Must NOT include TrainingPeaks.
- GET /api/rider/profile → has city/region/country
- PUT /api/rider/profile → persists updates
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api():
    """Fresh throwaway rider — the zero-state assertions below (season/
    achievements) need a guaranteed-empty ride_history, which a long-lived
    shared fixture account can no longer offer after years of accumulated
    test runs."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"tmp_iter19_{uuid.uuid4().hex[:8]}@roujaune.app"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "pw12345678", "name": "Tmp Iter19"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "no token from register"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------------- rider/season ----------------
@pytest.mark.parametrize("days", [0, 7, 30, 90, 365])
def test_rider_season_windows(api, days):
    r = api.get(f"{BASE_URL}/api/rider/season", params={"days": days}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("rides", "distance_km", "elevation_m", "hours", "streak"):
        assert k in j, f"missing {k} for days={days}"
    # ride_history was intentionally reset -> zeros
    assert j["rides"] == 0
    assert j["distance_km"] == 0
    assert j["elevation_m"] == 0
    assert j["hours"] == 0
    assert j["streak"] == 0


# ---------------- rider/achievements ----------------
def test_rider_achievements_empty(api):
    r = api.get(f"{BASE_URL}/api/rider/achievements", timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "achievements" in j
    assert isinstance(j["achievements"], list)
    assert j["achievements"] == []  # empty ride_history -> empty


# ---------------- connections ----------------
def test_connections_services_contract(api):
    """/api/connections was consolidated: Apple Health + Health Connect
    (native, build-only), Strava (cloud OAuth, configured) and Garmin
    Connect (cloud OAuth, not yet configured — needs real
    GARMIN_CLIENT_ID/SECRET) are the current providers. Google Fit, Samsung
    Health and Harmony Wellness were speculative entries that were removed
    (Health Connect now covers Android on-device health data)."""
    r = api.get(f"{BASE_URL}/api/connections", timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "providers" in j and isinstance(j["providers"], list)
    names = {p.get("name") for p in j["providers"]}
    for expected in ["Apple Health", "Google Health (Health Connect)", "Strava", "Garmin Connect"]:
        assert expected in names, f"expected provider {expected!r}, got {names}"
    for removed in ["TrainingPeaks", "Google Fit", "Samsung Health", "Harmony Wellness"]:
        assert removed not in names, f"{removed} should be removed, got {names}"


# ---------------- rider/profile ----------------
def test_rider_profile_get_has_location_keys(api):
    r = api.get(f"{BASE_URL}/api/rider/profile", timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("name", "weight_kg", "age", "gender", "city", "region", "country"):
        assert k in j, f"missing {k}"


def test_rider_profile_put_persists(api):
    payload = {
        "name": "TEST_ Rider",
        "weight_kg": 74,
        "age": 41,
        "gender": "male",
        "city": "Melbourne",
        "region": "Victoria",
        "country": "Australia",
    }
    r = api.put(f"{BASE_URL}/api/rider/profile", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["city"] == "Melbourne"
    assert j["region"] == "Victoria"
    assert j["country"] == "Australia"
    # Read back to be sure
    g = api.get(f"{BASE_URL}/api/rider/profile", timeout=10).json()
    assert g["city"] == "Melbourne"
    assert g["region"] == "Victoria"
    assert g["country"] == "Australia"
