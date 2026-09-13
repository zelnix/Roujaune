"""Iteration 126: verify gemini_shim.py retry-wrapper fix doesn't break coach
endpoints. Covers /api/coach/cue, /api/coach/debrief, /api/coach/extend-advice,
/api/coach/chat end-to-end against the real Gemini backend (demo rider)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    resp = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": DEMO_EMAIL, "password": DEMO_PASSWORD,
    })
    if resp.status_code != 200:
        pytest.skip(f"login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        pytest.skip("no token in login response")
    api_client.headers.update({"Authorization": f"Bearer {token}"})
    return token


class TestBackendHealth:
    def test_backend_up(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/plan")
        assert r.status_code in (200, 401)


class TestCoachCue:
    def test_coach_cue_success(self, api_client, auth_token):
        payload = {
            "coach_name": "Alberto", "coach_gender": "male",
            "workout": "Endurance Ride", "route": "indoor", "elapsed": 300,
            "segment": "Warm-up", "zone": "Z2", "power": 180, "power_target": 190,
            "cadence": 88, "cadence_low": 80, "cadence_high": 95,
            "hr": 130, "speed": 28.5, "cue_kind": "generic", "seated": False,
        }
        t0 = time.time()
        r = api_client.post(f"{BASE_URL}/api/coach/cue", json=payload)
        dur = time.time() - t0
        assert r.status_code == 200, f"coach/cue failed: {r.status_code} {r.text}"
        data = r.json()
        assert "cue" in data
        assert isinstance(data["cue"], str) and len(data["cue"]) > 0
        print(f"coach/cue latency: {dur:.2f}s")
        assert dur < 40, "cue took too long, retry loop may be excessive"


class TestCoachExtendAdvice:
    def test_extend_advice_success(self, api_client, auth_token):
        payload = {
            "coach_name": "Alberto", "coach_gender": "male",
            "workout": "Endurance Ride", "type_id": "endurance", "elapsed": 1800,
            "power": 180, "hr": 140, "cadence": 88, "wearable_on": True,
        }
        r = api_client.post(f"{BASE_URL}/api/coach/extend-advice", json=payload)
        assert r.status_code == 200, f"extend-advice failed: {r.status_code} {r.text}"
        data = r.json()
        assert "advice" in data and len(data["advice"]) > 0
        assert data.get("recommend") in ("extend", "finish")


class TestCoachDebrief:
    def test_debrief_success(self, api_client, auth_token):
        payload = {
            "coach_name": "Alberto", "coach_gender": "male",
            "workout": "Endurance Ride", "route": "indoor",
            "duration_sec": 1800, "distance_km": 15.0, "elevation_m": 50,
            "avg_power": 180, "norm_power": 190, "power_target": 190,
            "avg_cadence": 88, "avg_hr": 140, "max_hr": 160,
            "tss": 45, "intensity": 0.8, "calories": 500, "compliance": 92,
            "zones": [], "ride_id": "",
        }
        r = api_client.post(f"{BASE_URL}/api/coach/debrief", json=payload)
        assert r.status_code == 200, f"debrief failed: {r.status_code} {r.text}"
        data = r.json()
        assert "debrief" in data and len(data["debrief"]) > 0


class TestCoachChat:
    def test_chat_success(self, api_client, auth_token):
        payload = {
            "coach_name": "Alberto", "coach_gender": "male",
            "message": "How is my training going?", "coaching_style": "balanced",
        }
        r = api_client.post(f"{BASE_URL}/api/coach/chat", json=payload)
        assert r.status_code == 200, f"chat failed: {r.status_code} {r.text}"
        data = r.json()
        assert "reply" in data and len(data["reply"]) > 0
