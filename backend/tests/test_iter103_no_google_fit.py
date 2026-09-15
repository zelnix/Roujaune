"""ITER 103: verify the `google_fit` cloud provider has been retired.

- GET /api/connections must include `health_connect` and `apple_health`
  (both kind=device_native) and MUST NOT list any provider whose id is
  `google_fit` or whose name is 'Google Fit'.
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


class TestGoogleFitRetired:
    def test_connections_endpoint_ok(self, auth_session):
        r = auth_session.get(f"{API}/connections", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "providers" in d
        assert isinstance(d["providers"], list)

    def test_no_google_fit_id_or_name(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        ids = [p.get("id") for p in d["providers"]]
        names = [p.get("name") for p in d["providers"]]
        assert "google_fit" not in ids, f"google_fit still registered: {ids}"
        assert "Google Fit" not in names, f"'Google Fit' still listed: {names}"

    def test_health_connect_present_and_native(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert "health_connect" in by, f"missing health_connect: {list(by)}"
        hc = by["health_connect"]
        assert hc["kind"] == "device_native"
        assert hc["requires_native_build"] is True
        assert hc["connection_status"] == "requires_build"
        assert hc["connected"] is False
        # Renamed to "Google Health (Health Connect)" in iteration 104 for
        # clarity — see test_iter104_strava_and_health_rename.py.
        assert hc["name"] == "Google Health (Health Connect)"

    def test_apple_health_present_and_native(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        by = {p["id"]: p for p in d["providers"]}
        assert "apple_health" in by, f"missing apple_health: {list(by)}"
        ap = by["apple_health"]
        assert ap["kind"] == "device_native"
        assert ap["requires_native_build"] is True
        assert ap["connection_status"] == "requires_build"
        assert ap["name"] == "Apple Health"

    def test_response_shape(self, auth_session):
        d = auth_session.get(f"{API}/connections", timeout=20).json()
        assert "encryption_ready" in d
        assert "imported_activities" in d
        assert isinstance(d["imported_activities"], int)
