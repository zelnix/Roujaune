"""ITER 104: (A) Health Connect provider renamed to 'Google Health (Health Connect)';
(B) Strava cloud OAuth provider registered but not_configured (creds unset).

Contract asserted on GET /api/connections (auth demo token) and POST
/api/connections/strava/authorize.
"""
import os
import pytest
import requests
from pathlib import Path


def _base_url() -> str:
    u = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not u:
        env = (Path(__file__).parent.parent.parent / "frontend" / ".env").read_text()
        for line in env.splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                u = line.split("=", 1)[1].strip()
                break
    return (u or "").rstrip("/")


BASE = _base_url()
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login",
               json={"email": "demo@roujaune.app", "password": "demo9900"},
               timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, r.text
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


class TestConnectionsProviders:
    def test_connections_ok(self, auth_session):
        r = auth_session.get(f"{API}/connections", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("providers"), list) and d["providers"]

    def test_no_google_fit(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        ids = [p.get("id") for p in d["providers"]]
        assert "google_fit" not in ids, ids

    def test_apple_health_present(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert "apple_health" in by, list(by)
        assert by["apple_health"]["kind"] == "device_native"

    def test_health_connect_renamed(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert "health_connect" in by, list(by)
        hc = by["health_connect"]
        assert hc["name"] == "Google Health (Health Connect)", hc
        assert hc["kind"] == "device_native"
        assert hc["requires_native_build"] is True
        assert hc["connection_status"] == "requires_build"

    def test_strava_registered_not_configured(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert "strava" in by, list(by)
        st = by["strava"]
        assert st["name"] == "Strava"
        assert st["kind"] == "cloud_oauth"
        assert st["configured"] is False
        assert st["connection_status"] == "not_configured"
        assert st["connected"] is False


class TestStravaAuthorize:
    def test_authorize_setup_required(self, auth_session):
        r = auth_session.post(
            f"{API}/connections/strava/authorize",
            json={"redirect_uri": "roujaune://oauth/strava"},
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("setup_required") is True, body
        # Should NOT expose an authorize_url when unconfigured
        assert "authorize_url" not in body or not body.get("authorize_url")
