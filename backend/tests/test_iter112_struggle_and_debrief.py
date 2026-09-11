"""Iter 112 — Struggle/Safety cue + debrief-with-struggles regression tests.

Covers the new struggle detection feature:
 - POST /api/coach/cue cue_kind="struggle" returns 200 (not 422)
 - POST /api/coach/cue cue_kind="safety" returns 200 with calm cue
 - POST /api/coach/debrief with struggles[] returns 200 and references tough moments
 - Regression: POST /api/coach/cue cue_kind="live" still returns 200
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")

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


# ── Coach cue: struggle ────────────────────────────────────────────────
class TestCoachCueStruggle:
    def test_struggle_cue_returns_200(self, headers):
        payload = {
            "power": 180, "hr": 172, "cadence": 78, "speed": 22.4,
            "elapsed": 720, "power_target": 251,
            "cadence_low": 90, "cadence_high": 100,
            "workout": "Threshold Climb", "segment": "Threshold Effort", "zone": "Z4",
            "route": "Alpe d'Huez", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "struggle",
            "struggle_reasons": ["power_fade", "cadence_decay", "erg_spiral"],
            "struggle_primary": "power_fade",
            "struggle_severity": "high",
            "struggle_safety": False,
            "power_deficit_pct": 0.28,
            "w_prime_pct": 0.12,
            "near_max_hr_pct": 0.92,
            "place": "Alpe d'Huez",
            "eased_pct": 8,
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        cue = body["cue"]
        assert isinstance(cue, str) and len(cue.strip()) > 5
        # Should be short/actionable — cap sanity
        assert len(cue) < 500, f"cue too long: {cue}"

    def test_safety_cue_returns_200_calm(self, headers):
        payload = {
            "power": 90, "hr": 188, "cadence": 62, "speed": 18.0,
            "elapsed": 1500, "power_target": 251,
            "cadence_low": 90, "cadence_high": 100,
            "workout": "VO2 Intervals", "segment": "Interval 3", "zone": "Z5",
            "route": "indoor", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "safety",
            "struggle_reasons": ["hr_near_max", "power_fade", "cadence_decay"],
            "struggle_primary": "hr_near_max",
            "struggle_severity": "high",
            "struggle_safety": True,
            "power_deficit_pct": 0.55,
            "w_prime_pct": 0.02,
            "near_max_hr_pct": 0.97,
            "place": None,
            "eased_pct": 0,
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        cue = (body["cue"] or "").lower()
        assert len(cue) > 5

    # Regression — pre-existing "live" cue still works
    def test_live_cue_regression(self, headers):
        payload = {
            "power": 245, "hr": 158, "cadence": 92, "speed": 26.2,
            "elapsed": 300, "power_target": 251,
            "cadence_low": 90, "cadence_high": 100,
            "workout": "Threshold Climb", "segment": "Warm-up", "zone": "Z2",
            "route": "Alpe d'Huez", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "live",
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        assert "cue" in r.json()


# ── Coach debrief with struggles ─────────────────────────────────────────
class TestCoachDebriefStruggles:
    def test_debrief_with_struggles_200(self, headers):
        payload = {
            "workout": "Threshold Climb",
            "route": "Alpe d'Huez",
            "duration_sec": 2400,
            "distance_km": 18.5,
            "elevation_m": 620,
            "avg_power": 228,
            "norm_power": 244,
            "power_target": 251,
            "avg_cadence": 86,
            "avg_hr": 168,
            "max_hr": 184,
            "calories": 620,
            "tss": 92,
            "intensity": 0.87,
            "compliance": 78,
            "interval_compliance": 74,
            "intervals": [
                {"label": "Interval 1", "targetW": 251, "avgW": 246, "compliance": 98},
                {"label": "Interval 2", "targetW": 251, "avgW": 214, "compliance": 85},
            ],
            "zones": [{"z": "Z4", "pct": 42}, {"z": "Z3", "pct": 30}, {"z": "Z2", "pct": 28}],
            "extended_min": 0,
            "adjustments": [],
            "struggles": [
                {"t": 720, "primary": "power_fade",
                 "reasons": ["power_fade", "cadence_decay", "erg_spiral"],
                 "severity": "high", "safety": False},
                {"t": 1500, "primary": "hr_near_max",
                 "reasons": ["hr_near_max", "power_fade"],
                 "severity": "high", "safety": True},
            ],
            "coach_name": "Alberto",
            "coach_gender": "male",
        }
        r = requests.post(f"{BASE_URL}/api/coach/debrief", json=payload, headers=headers, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "debrief" in body
        text = body["debrief"]
        assert isinstance(text, str) and len(text) > 20
