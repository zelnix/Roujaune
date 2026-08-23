"""Iter 77 — Bidirectional Health Sync (Apple Health / Health Connect).

Backend-only regression + confirmation:
  - GET /api/connections lists BOTH device_native providers (apple_health,
    health_connect) with kind='device_native', requires_native_build=true.
  - POST /api/connections/native/apple_health/link is idempotent and returns
    connection_status='connected', connected=true.
  - POST /api/connections/native/health_connect/import ingests cycling
    workouts and they appear in /api/connections/activities and /api/activities.
  - POST /api/connections/native/health_connect/pushed returns {ok, pushed}.
  - Unknown non-native provider on /api/connections/native/<x>/link -> 404.
  - REGRESSION: /api/connections still lists cloud OAuth providers garmin +
    google_fit with their existing status; OAuth authorize endpoint still works.

Cleanup: deletes imported test rides via DELETE
/api/connections/health_connect/data and disconnects both native accounts so
greenlantern's data stays pristine.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://scenic-trainer.preview.emergentagent.com",
).rstrip("/")

RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"


# ---- auth --------------------------------------------------------------- #
@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def H(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


# ---- module-scoped cleanup: run AFTER all tests ------------------------- #
@pytest.fixture(scope="module", autouse=True)
def _cleanup(H):
    yield
    # Delete any imported health-connect rides + disconnect both native accts.
    try:
        requests.delete(f"{BASE_URL}/api/connections/health_connect/data",
                        headers=H, timeout=15)
    except Exception as e:
        print(f"[cleanup] hc delete data failed: {e}")
    try:
        requests.delete(f"{BASE_URL}/api/connections/apple_health/data",
                        headers=H, timeout=15)
    except Exception as e:
        print(f"[cleanup] ah delete data failed: {e}")
    try:
        requests.post(f"{BASE_URL}/api/connections/apple_health/disconnect",
                      headers=H, timeout=15)
    except Exception as e:
        print(f"[cleanup] ah disconnect failed: {e}")
    try:
        requests.post(f"{BASE_URL}/api/connections/health_connect/disconnect",
                      headers=H, timeout=15)
    except Exception as e:
        print(f"[cleanup] hc disconnect failed: {e}")


# =========================================================================
# 1) GET /api/connections lists both native providers + cloud regressions
# =========================================================================
class TestConnectionsListing:
    def test_list_includes_native_providers(self, H):
        r = requests.get(f"{BASE_URL}/api/connections", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        providers = body.get("providers")
        assert isinstance(providers, list) and providers, f"no providers: {body}"
        by_id = {p["id"]: p for p in providers}

        # Apple Health
        assert "apple_health" in by_id, f"apple_health missing: {list(by_id)}"
        ah = by_id["apple_health"]
        assert ah.get("kind") == "device_native", ah
        assert ah.get("requires_native_build") is True, ah

        # Health Connect
        assert "health_connect" in by_id, f"health_connect missing: {list(by_id)}"
        hc = by_id["health_connect"]
        assert hc.get("kind") == "device_native", hc
        assert hc.get("requires_native_build") is True, hc

    def test_list_regression_cloud_providers_present(self, H):
        r = requests.get(f"{BASE_URL}/api/connections", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        by_id = {p["id"]: p for p in r.json()["providers"]}

        # Cloud OAuth providers must still be listed.
        assert "garmin" in by_id, f"garmin missing: {list(by_id)}"
        assert by_id["garmin"].get("kind") == "cloud_oauth", by_id["garmin"]
        # not connected -> status is either not_configured or disconnected
        assert by_id["garmin"].get("connection_status") in (
            "not_configured", "disconnected", "connected", "syncing", "setup"
        ), by_id["garmin"]

        assert "google_fit" in by_id, f"google_fit missing: {list(by_id)}"
        assert by_id["google_fit"].get("kind") == "cloud_oauth", by_id["google_fit"]

    def test_oauth_authorize_unaffected_for_cloud(self, H):
        """Cloud OAuth authorize endpoint must still respond (not_configured is OK)."""
        r = requests.post(
            f"{BASE_URL}/api/connections/garmin/authorize",
            headers=H,
            json={"redirect_uri": "https://example.com/cb"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Either returns setup_required=True (creds not set in preview) or an
        # authorize_url. Either is a valid healthy response.
        assert (
            body.get("setup_required") is True
            or "authorize_url" in body
        ), body


# =========================================================================
# 2) Native link — idempotent, connection_status='connected'
# =========================================================================
class TestNativeLink:
    def test_link_apple_health_first_call(self, H):
        r = requests.post(
            f"{BASE_URL}/api/connections/native/apple_health/link",
            headers=H,
            json={"permissions": ["read", "write"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("connection_status") == "connected", j
        assert j.get("connected") is True, j
        assert j.get("kind") == "device_native", j
        assert j.get("requires_native_build") is True, j
        # permissions echoed back
        assert set(j.get("permissions") or []) >= {"read", "write"}, j

    def test_link_apple_health_idempotent(self, H):
        # Second call with same payload must still return connected.
        r = requests.post(
            f"{BASE_URL}/api/connections/native/apple_health/link",
            headers=H,
            json={"permissions": ["read", "write"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("connection_status") == "connected", j
        assert j.get("connected") is True, j
        # Verify via /api/connections that apple_health is now connected
        c = requests.get(f"{BASE_URL}/api/connections", headers=H, timeout=15).json()
        by_id = {p["id"]: p for p in c["providers"]}
        assert by_id["apple_health"].get("connected") is True, by_id["apple_health"]

    def test_link_unknown_native_provider_returns_404(self, H):
        # Strava is a real cloud provider but must 404 on the /native/ path
        r = requests.post(
            f"{BASE_URL}/api/connections/native/strava/link",
            headers=H,
            json={"permissions": ["read"]},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


# =========================================================================
# 3) Health Connect: import -> activities visible; pushed -> {ok,pushed}
# =========================================================================
_HC_WORKOUT = {
    "id": "hc-iter77-1",
    "startDate": "2026-06-01T08:00:00Z",
    "endDate": "2026-06-01T09:00:00Z",
    "distanceMeters": 25000,
    "calories": 600,
    "title": "Cycling",
}


class TestHealthConnectImport:
    def test_link_health_connect(self, H):
        # Ensure hc is linked before importing.
        r = requests.post(
            f"{BASE_URL}/api/connections/native/health_connect/link",
            headers=H,
            json={"permissions": ["read", "write"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("connected") is True

    def test_import_returns_imported_count(self, H):
        r = requests.post(
            f"{BASE_URL}/api/connections/native/health_connect/import",
            headers=H,
            json={"workouts": [_HC_WORKOUT]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # first-time import should count >=1; on rerun it will be an update.
        total = int(j.get("imported", 0)) + int(j.get("updated", 0))
        assert total >= 1, f"nothing imported/updated: {j}"
        assert j.get("status") == "connected", j

    def test_imported_ride_appears_in_connections_activities(self, H):
        r = requests.get(f"{BASE_URL}/api/connections/activities", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        acts = r.json()
        assert isinstance(acts, list) and acts, "no imported activities returned"
        hc_ride = next(
            (a for a in acts
             if a.get("provider") == "health_connect"
             and (a.get("external_activity_id") or "").endswith("hc-iter77-1")),
            None,
        )
        assert hc_ride is not None, f"hc-iter77-1 missing. sample={acts[:2]}"
        # Sanity: normalized fields
        assert hc_ride.get("distance_metres") in (25000, 25000.0), hc_ride
        assert hc_ride.get("elapsed_seconds") == 3600, hc_ride
        assert hc_ride.get("indoor_outdoor") == "outdoor", hc_ride
        # calories mapped
        assert hc_ride.get("calories") in (600, 600.0), hc_ride

    def test_imported_ride_visible_in_activities_history(self, H):
        r = requests.get(f"{BASE_URL}/api/activities", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        payload = r.json()
        # /api/activities returns {"activities": [...]}
        acts = payload.get("activities") if isinstance(payload, dict) else payload
        assert isinstance(acts, list) and acts, f"empty activities: {payload}"
        hc_hist = [
            a for a in acts
            if (a.get("source") == "health_connect") or (a.get("provider") == "health_connect")
        ]
        assert hc_hist, f"no health_connect entry in /api/activities. sample={acts[:2]}"
        # Should be an outdoor imported ride.
        row = hc_hist[0]
        assert row.get("imported") is True or (row.get("id", "").startswith("import-")), row

    def test_pushed_endpoint_returns_ok(self, H):
        r = requests.post(
            f"{BASE_URL}/api/connections/native/health_connect/pushed",
            headers=H,
            json={"count": 1},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True, j
        assert j.get("pushed") == 1, j

    def test_pushed_endpoint_updates_last_success(self, H):
        # After pushed(), connection_status should remain 'connected' and
        # last_successful_sync_at should be set.
        r = requests.get(f"{BASE_URL}/api/connections", headers=H, timeout=15).json()
        by_id = {p["id"]: p for p in r["providers"]}
        hc = by_id["health_connect"]
        assert hc.get("connection_status") == "connected", hc
        assert hc.get("last_successful_sync_at"), hc


# =========================================================================
# 4) 404 for unknown native provider on import + pushed paths too
# =========================================================================
class TestNativeUnknownPaths:
    def test_import_unknown_native_provider_404(self, H):
        r = requests.post(
            f"{BASE_URL}/api/connections/native/strava/import",
            headers=H,
            json={"workouts": []},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_pushed_unknown_native_provider_404(self, H):
        r = requests.post(
            f"{BASE_URL}/api/connections/native/garmin/pushed",
            headers=H,
            json={"count": 3},
            timeout=15,
        )
        assert r.status_code == 404, r.text
