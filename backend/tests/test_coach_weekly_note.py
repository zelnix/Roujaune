"""Tests for the enriched Coach's Weekly Note feature.

Covers:
- login for demo@roujaune.app and greenlantern@roujaune.app
- GET /api/coach/weekly-note returns 200, valid JSON shape with optional 'highlight'
- GET /api/coach/weekly-note?refresh=true forces regeneration
- GET /api/analysis/adaptation has_data / callouts inspected to determine whether
  a highlight callout should be expected in the weekly-note response
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

CREDS = [
    ("demo@roujaune.app", "demo9900"),
    ("greenlantern@roujaune.app", "rideon9900"),
]


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _login(api_client, email, password):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        api_client.headers.update({"Authorization": f"Bearer {token}"})
    return data


class TestCoachWeeklyNote:
    @pytest.mark.parametrize("email,password", CREDS)
    def test_weekly_note_returns_valid_shape(self, api_client, email, password):
        _login(api_client, email, password)
        r = api_client.get(f"{BASE_URL}/api/coach/weekly-note", params={"coach_name": "Alberto", "coach_gender": "male"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "note" in data and isinstance(data["note"], str) and data["note"].strip()
        assert "focus" in data
        assert "has_activity" in data
        assert "highlight" in data
        if data["highlight"] is not None:
            assert data["highlight"]["kind"] in ("ef", "decoupling", "hrr", "w_prime")
            assert isinstance(data["highlight"]["good"], bool)

    @pytest.mark.parametrize("email,password", CREDS)
    def test_weekly_note_refresh(self, api_client, email, password):
        _login(api_client, email, password)
        r = api_client.get(f"{BASE_URL}/api/coach/weekly-note", params={"coach_name": "Alberto", "coach_gender": "male", "refresh": "true"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("cached") is False

    @pytest.mark.parametrize("email,password", CREDS)
    def test_adaptation_callouts_inspection(self, api_client, email, password):
        """Inspect adaptation() to see if a callout/highlight should be expected."""
        _login(api_client, email, password)
        r = api_client.get(f"{BASE_URL}/api/analysis/adaptation", params={"weeks": 8})
        assert r.status_code == 200, r.text
        adapt = r.json()
        has_data = adapt.get("has_data")
        callouts = adapt.get("callouts") or []
        print(f"[{email}] adaptation.has_data={has_data} callouts={callouts}")
        # Cross-check with weekly-note highlight
        wr = api_client.get(f"{BASE_URL}/api/coach/weekly-note", params={"coach_name": "Alberto", "coach_gender": "male", "refresh": "true"})
        wdata = wr.json()
        if has_data and callouts:
            assert wdata.get("highlight") is not None, (
                f"adaptation has callouts {callouts} but weekly-note highlight is None for {email}"
            )
            assert wdata["highlight"]["kind"] == callouts[0]["kind"]
        else:
            assert wdata.get("highlight") is None
