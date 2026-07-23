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
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
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
    r = api.get(f"{BASE_URL}/api/connections", timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "services" in j and isinstance(j["services"], list)
    names = {s.get("name") for s in j["services"]}
    for expected in [
        "Strava",
        "Garmin Connect",
        "Apple Health",
        "Google Fit",
        "Samsung Health",
        "Harmony Wellness",
    ]:
        assert expected in names, f"expected service {expected!r}, got {names}"
    assert "TrainingPeaks" not in names, f"TrainingPeaks should be removed, got {names}"


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
