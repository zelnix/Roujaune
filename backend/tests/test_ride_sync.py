"""Backend tests for OUTDOOR RIDE SYNCING (Phase 1) — reusable provider
connections + sandbox import pipeline.

Covers:
 - GET /api/connections (provider registry, encryption flag, imported count)
 - POST /api/connections/sandbox/import (idempotent dedup, classification, mirroring)
 - GET /api/connections/activities (indoor_outdoor/ride_type/nullability)
 - GET /api/rider/season (indoor/outdoor breakdown, totals)
 - DELETE /api/connections/sandbox/data (removes mirrors too)
 - PATCH /api/connections/garmin/settings (no-account no-error)
 - POST /api/connections/garmin/authorize (setup_required)
 - POST /api/connections/garmin/callback (400 when not configured)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend env explicitly
    from pathlib import Path
    env = (Path(__file__).parent.parent.parent / "frontend" / ".env").read_text()
    for line in env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api():
    """A fresh throwaway rider so outdoor-ride counts start at an exact zero —
    reusing a long-lived shared fixture account (Green Lantern/demo) would make
    the exact-4-rides assertions flaky since those accounts accumulate real
    history across many test runs."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"tmp_ridesync_{uuid.uuid4().hex[:8]}@roujaune.app"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "pw12345678", "name": "Tmp RideSync"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "no token from register"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _clean_sandbox(api):
    """Ensure no leftover sandbox rides before/after this module."""
    api.delete(f"{API}/connections/sandbox/data", timeout=20)
    yield
    api.delete(f"{API}/connections/sandbox/data", timeout=20)


VALID_RIDE_TYPES = {
    "outdoor_climbing", "outdoor_recovery", "outdoor_tempo", "outdoor_intervals",
    "outdoor_endurance", "outdoor_event", "outdoor_recreational",
    "unknown_outdoor_ride",
}


# ------------------------- provider listing -------------------------
class TestConnectionsList:
    def test_list_connections_shape(self, api):
        r = api.get(f"{API}/connections", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "providers" in d and "encryption_ready" in d and "imported_activities" in d
        assert isinstance(d["providers"], list)
        ids = {p["id"] for p in d["providers"]}
        assert {"garmin", "apple_health", "health_connect", "strava"}.issubset(ids)

    def test_encryption_ready(self, api):
        d = api.get(f"{API}/connections", timeout=20).json()
        assert d["encryption_ready"] is True, "ENCRYPTION_KEY must be configured"

    def test_provider_statuses(self, api):
        d = api.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert by["apple_health"]["connection_status"] == "requires_build"
        assert by["health_connect"]["connection_status"] == "requires_build"
        # Strava now has real OAuth credentials configured (see test_iter104).
        assert by["strava"]["configured"] is True
        assert by["strava"]["connected"] is False


# ------------------------- sandbox import + dedup -------------------------
class TestSandboxImport:
    def test_import_creates_four(self, api):
        r = api.post(f"{API}/connections/sandbox/import?count=4", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("sandbox") is True
        assert d.get("imported") == 4, d
        assert d.get("updated") == 0
        assert d.get("duplicates") == 0

    def test_import_idempotent(self, api):
        r = api.post(f"{API}/connections/sandbox/import?count=4", timeout=30)
        d = r.json()
        assert r.status_code == 200
        assert d.get("imported") == 0, d
        assert d.get("updated") == 4, d
        assert d.get("duplicates") == 0

    def test_imported_count_reflected(self, api):
        d = api.get(f"{API}/connections", timeout=20).json()
        assert d["imported_activities"] >= 4


# ------------------------- activities normalization -------------------------
class TestImportedActivities:
    def test_activities_shape(self, api):
        r = api.get(f"{API}/connections/activities", timeout=20)
        assert r.status_code == 200
        acts = r.json()
        assert isinstance(acts, list)
        assert len(acts) >= 4
        for a in acts:
            assert a.get("indoor_outdoor") == "outdoor", a
            assert a.get("ride_type") in VALID_RIDE_TYPES, a.get("ride_type")
            # optional fields nullable, never zero when missing (spot-check keys)
            for k in ("average_power", "average_heart_rate", "distance_metres",
                      "elevation_gain_metres"):
                v = a.get(k)
                # sandbox data provides these; ensure non-null and > 0
                assert v is None or v > 0, f"{k} should be None or positive, got {v}"


# ------------------------- rider season aggregation -------------------------
class TestRiderSeason:
    def test_season_outdoor_breakdown(self, api):
        r = api.get(f"{API}/rider/season", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "outdoor" in d and "indoor" in d
        o = d["outdoor"]
        assert o["rides"] == 4, d
        assert o["distance_km"] > 0
        assert o["elevation_m"] > 0
        assert o["hours"] > 0
        # top-level totals include imported outdoor rides
        assert d["rides"] >= 4
        assert d["distance_km"] >= o["distance_km"]


# ------------------------- delete pipeline -------------------------
class TestSandboxDelete:
    def test_delete_removes_activities_and_mirrors(self, api):
        r = api.delete(f"{API}/connections/sandbox/data", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("deleted_activities") == 4

        # activities gone
        acts = api.get(f"{API}/connections/activities", timeout=20).json()
        assert all(a.get("provider") != "sandbox" for a in acts)

        # season outdoor cleared
        season = api.get(f"{API}/rider/season", timeout=20).json()
        assert season["outdoor"]["rides"] == 0, season


# ------------------------- garmin (not configured) -------------------------
class TestGarminNotConfigured:
    def test_authorize_setup_required(self, api):
        r = api.post(f"{API}/connections/garmin/authorize",
                     json={"redirect_uri": "https://example.com/cb"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("setup_required") is True
        assert d.get("message")

    def test_callback_not_configured_400(self, api):
        r = api.post(f"{API}/connections/garmin/callback",
                     json={"code": "x", "state": "y"}, timeout=20)
        assert r.status_code == 400, r.text

    def test_settings_patch_no_account_no_error(self, api):
        r = api.patch(f"{API}/connections/garmin/settings",
                      json={"disable_route_import": True, "disable_auto_sync": True},
                      timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # returns an account view; without a real account these still surface defaults
        assert d.get("id") == "garmin"
        assert d.get("connection_status") == "not_configured"
