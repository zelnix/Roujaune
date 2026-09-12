"""Iter 117 -- Priority 2: Critical Power / W' Balance predictive intervention.

Covers the new optional CoachCueRequest fields (preemptive, time_to_depletion_sec)
added to the struggle/safety cue prompt builder in routes/coach.py:
 - POST /api/coach/cue with cue_kind="struggle", struggle_reasons=["w_prime_low"],
   preemptive=true, time_to_depletion_sec=45 -> 200 with valid text cue
   (exercises the new predictive-W' instruction branch).
 - POST /api/coach/cue WITHOUT the two new optional fields (older payload shape)
   -> still 200 (backward compatibility / safe defaults).
 - Sanity: rider settings (Max HR, Age) save + persist correctly, since these now
   also feed the W' age-adjustment on the frontend.
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


class TestPredictiveWPrimeCue:
    def test_preemptive_struggle_cue_returns_200(self, headers):
        """New predictive-W' branch: preemptive=True + time_to_depletion_sec set."""
        payload = {
            "power": 310, "hr": 178, "cadence": 88, "speed": 28.0,
            "elapsed": 1800, "power_target": 300,
            "cadence_low": 90, "cadence_high": 100,
            "workout": "Threshold Climb", "segment": "Interval 3", "zone": "Z5",
            "route": "Alpe d'Huez", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "struggle",
            "struggle_reasons": ["w_prime_low"],
            "struggle_primary": "w_prime_low",
            "struggle_severity": "high",
            "struggle_safety": False,
            "power_deficit_pct": 0,
            "w_prime_pct": 0.12,
            "near_max_hr_pct": 0.9,
            "place": "Alpe d'Huez",
            "eased_pct": 12,
            "preemptive": True,
            "time_to_depletion_sec": 45,
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        cue = body["cue"]
        assert isinstance(cue, str) and len(cue.strip()) > 5
        assert len(cue) < 500

    def test_struggle_cue_without_new_fields_still_200(self, headers):
        """Backward compatibility: omit preemptive & time_to_depletion_sec entirely
        (older client payload shape) -- must still return 200 with safe defaults."""
        payload = {
            "power": 260, "hr": 165, "cadence": 85, "speed": 24.0,
            "elapsed": 900, "power_target": 251,
            "cadence_low": 90, "cadence_high": 100,
            "workout": "Threshold Climb", "segment": "Interval 1", "zone": "Z4",
            "route": "Alpe d'Huez", "seated": False,
            "coach_name": "Alberto", "coach_gender": "male",
            "cue_kind": "struggle",
            "struggle_reasons": ["w_prime_low"],
            "struggle_primary": "w_prime_low",
            "struggle_severity": "mild",
            "struggle_safety": False,
            "power_deficit_pct": 0.05,
            "w_prime_pct": 0.13,
            "near_max_hr_pct": 0.85,
            "place": None,
            "eased_pct": 8,
            # NOTE: no "preemptive" / "time_to_depletion_sec" keys at all
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "cue" in body
        assert isinstance(body["cue"], str) and len(body["cue"].strip()) > 5

    def test_minimal_live_cue_no_new_fields_regression(self, headers):
        """Bare-minimum payload with only required-ish base fields (no struggle
        context at all) still works -- confirms defaults don't break simple cues."""
        payload = {
            "power": 245, "hr": 150, "cadence": 92, "elapsed": 300,
            "cue_kind": "live",
        }
        r = requests.post(f"{BASE_URL}/api/coach/cue", json=payload, headers=headers, timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        assert "cue" in r.json()


class TestRiderSettingsMaxHrAge:
    """Max HR (POST /api/activities/ftp) and Age (PUT /api/rider/profile) feed
    the W' age-adjustment -- sanity-check both persist correctly."""

    def test_age_persists_via_rider_profile(self, headers):
        get_r = requests.get(f"{BASE_URL}/api/rider/profile", headers=headers, timeout=30)
        assert get_r.status_code == 200, f"{get_r.status_code} {get_r.text[:200]}"
        original_age = get_r.json().get("age")

        upd_r = requests.put(f"{BASE_URL}/api/rider/profile", json={"age": 57}, headers=headers, timeout=30)
        assert upd_r.status_code == 200, f"{upd_r.status_code} {upd_r.text[:300]}"

        verify_r = requests.get(f"{BASE_URL}/api/rider/profile", headers=headers, timeout=30)
        assert verify_r.status_code == 200
        assert verify_r.json().get("age") == 57, f"age not persisted: {verify_r.json().get('age')}"

        # Restore original value.
        requests.put(f"{BASE_URL}/api/rider/profile", json={"age": original_age}, headers=headers, timeout=30)

    def test_max_hr_persists_via_activities_ftp(self, headers):
        get_r = requests.get(f"{BASE_URL}/api/activities/ftp", headers=headers, timeout=30)
        assert get_r.status_code == 200, f"{get_r.status_code} {get_r.text[:200]}"
        original = get_r.json()

        upd_r = requests.post(f"{BASE_URL}/api/activities/ftp", json={"max_hr": 172}, headers=headers, timeout=30)
        assert upd_r.status_code == 200, f"{upd_r.status_code} {upd_r.text[:300]}"
        assert upd_r.json().get("max_hr") == 172

        verify_r = requests.get(f"{BASE_URL}/api/activities/ftp", headers=headers, timeout=30)
        assert verify_r.status_code == 200
        assert verify_r.json().get("max_hr") == 172, f"max_hr not persisted: {verify_r.json()}"

        # Restore original value.
        requests.post(f"{BASE_URL}/api/activities/ftp",
                      json={"max_hr": original.get("max_hr")}, headers=headers, timeout=30)
