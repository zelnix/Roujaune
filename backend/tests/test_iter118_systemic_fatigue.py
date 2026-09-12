"""Iter 118 — Priority 3 (Systemic Fatigue) coach/cue contract regression tests.

Covers the new systemic_fatigue struggle reason / hydration instruction branch:
 - POST /api/coach/cue cue_kind="struggle", struggle_reasons=["systemic_fatigue"] -> 200,
   returns a valid cue (exercises the new hydration/heat instruction branch).
 - POST /api/coach/cue cue_kind="struggle", struggle_reasons=["power_fade"] (no systemic_fatigue)
   -> 200, still returns a cue via the old generic struggle branch (unchanged).
 - Regression: existing test_iter112_struggle_and_debrief.py contract (struggle/safety/live/debrief)
   still passes unmodified (re-run separately).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

RIDER_EMAIL = "demo@roujaune.app"
RIDER_PW = "demo9900"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PW}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.json()}"
    return tok


@pytest.fixture()
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestSystemicFatigueCue:
    def test_systemic_fatigue_cue_returns_200_hydration_cue(self, headers):
        payload = {
            "power": 198, "hr": 156, "cadence": 88, "speed": 24.0,
            "elapsed": 1020, "power_target": 200,
            "cadence_low": 85, "cadence_high": 95,
            "workout": "Endurance Ride", "segment": "Steady State", "zone": "Z2",
            "route": "indoor", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "struggle",
            "struggle_reasons": ["systemic_fatigue"],
            "struggle_primary": "systemic_fatigue",
            "struggle_severity": "high",
            "struggle_safety": False,
            "power_deficit_pct": 0.0,
            "w_prime_pct": 0.7,
            "near_max_hr_pct": 0.85,
            "place": None,
            "eased_pct": 10,
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        cue = body["cue"]
        assert isinstance(cue, str) and len(cue.strip()) > 5
        assert len(cue) < 500, f"cue too long: {cue}"
        # Should NOT read like a "push harder" cue — heuristic lexical check for
        # aggressive push language that shouldn't appear in a hydration cue.
        low = cue.lower()
        for banned in ("dig in", "push harder", "dig deep"):
            assert banned not in low, f"hydration cue reads like a push-harder cue: {cue}"

    def test_power_fade_without_systemic_fatigue_still_generic_struggle_cue(self, headers):
        payload = {
            "power": 180, "hr": 165, "cadence": 82, "speed": 21.0,
            "elapsed": 900, "power_target": 220,
            "cadence_low": 85, "cadence_high": 95,
            "workout": "Threshold Climb", "segment": "Threshold Effort", "zone": "Z4",
            "route": "Alpe d'Huez", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "struggle",
            "struggle_reasons": ["power_fade"],
            "struggle_primary": "power_fade",
            "struggle_severity": "mild",
            "struggle_safety": False,
            "power_deficit_pct": 0.18,
            "w_prime_pct": 0.6,
            "near_max_hr_pct": 0.8,
            "place": "Alpe d'Huez",
            "eased_pct": 8,
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        cue = body["cue"]
        assert isinstance(cue, str) and len(cue.strip()) > 5
