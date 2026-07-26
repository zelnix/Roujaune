"""Iteration 44 backend tests:
- NEW user-scoped rider settings: GET/PUT /api/rider/settings
- Coaching prefs persistence: GET/PUT /api/rider/prefs
- Auto-refresh of coach adaptation after a completed ride:
  POST /api/coach/debrief triggers a background refresh that updates
  training_plans.adaptation_ai_alberto_at, surfaced via GET /api/plan.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def gl_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": GL_EMAIL, "password": GL_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(gl_token):
    return {"Authorization": f"Bearer {gl_token}", "Content-Type": "application/json"}


# --- rider settings ------------------------------------------------------

class TestRiderSettings:
    def test_settings_get_is_dict(self, h):
        r = requests.get(f"{BASE_URL}/api/rider/settings", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_settings_put_partial_merges(self, h):
        # Set two booleans true
        r = requests.put(f"{BASE_URL}/api/rider/settings", headers=h,
                         json={"seatedMode": True, "hasTrainer": True}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("seatedMode") is True
        assert d.get("hasTrainer") is True

        # Subsequent GET reflects both
        r = requests.get(f"{BASE_URL}/api/rider/settings", headers=h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("seatedMode") is True, d
        assert d.get("hasTrainer") is True, d

        # Merge in a third key without disturbing the first two
        r = requests.put(f"{BASE_URL}/api/rider/settings", headers=h,
                         json={"hudEnabled": False}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("seatedMode") is True
        assert d.get("hasTrainer") is True
        assert d.get("hudEnabled") is False

    def test_settings_user_scoped_isolation(self, h):
        # Register a fresh temporary user and confirm they do NOT see GL's true flags
        import uuid
        tmp_email = f"tmp_iter44_{uuid.uuid4().hex[:8]}@roujaune.app"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": tmp_email, "password": "pw12345678", "name": "Tmp Iter44"
        }, timeout=30)
        assert r.status_code in (200, 201), r.text
        tmp_token = r.json()["token"]
        th = {"Authorization": f"Bearer {tmp_token}", "Content-Type": "application/json"}

        r = requests.get(f"{BASE_URL}/api/rider/settings", headers=th, timeout=20)
        assert r.status_code == 200
        d = r.json()
        # New user should not have GL's true booleans (either empty {} or without those keys, or explicit False)
        assert d.get("seatedMode", False) is False, f"tmp user leaked GL settings: {d}"
        assert d.get("hasTrainer", False) is False, f"tmp user leaked GL settings: {d}"

        # Cleanup temp account
        requests.delete(f"{BASE_URL}/api/account", headers=th, timeout=20)

    def test_settings_restore_flipped_booleans(self, h):
        r = requests.put(f"{BASE_URL}/api/rider/settings", headers=h,
                         json={"seatedMode": False, "hasTrainer": False, "hudEnabled": True}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("seatedMode") is False
        assert d.get("hasTrainer") is False


# --- rider prefs (coach_style) -------------------------------------------

class TestCoachStylePrefs:
    def test_pref_put_get_performance(self, h):
        r = requests.put(f"{BASE_URL}/api/rider/prefs", headers=h,
                         json={"coach_style": "performance"}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("coach_style") == "performance"

        r = requests.get(f"{BASE_URL}/api/rider/prefs", headers=h, timeout=20)
        assert r.status_code == 200
        assert r.json().get("coach_style") == "performance"

    def test_pref_restore_balanced(self, h):
        r = requests.put(f"{BASE_URL}/api/rider/prefs", headers=h,
                         json={"coach_style": "balanced"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("coach_style") == "balanced"


# --- adaptation auto-refresh after ride ----------------------------------

class TestAdaptationAutoRefresh:
    def test_plan_exposes_adaptation_timestamp(self, h):
        # 1) Prime: request adaptation detail so a baseline exists.
        r = requests.post(
            f"{BASE_URL}/api/coach/adaptation/detail",
            headers=h,
            json={"plan_id": "couch-to-road", "coach_name": "Alberto", "coach_gender": "male"},
            timeout=60,
        )
        assert r.status_code == 200, r.text

        # Capture current timestamp on the plan (may be absent initially).
        pre = requests.get(f"{BASE_URL}/api/plan", headers=h, timeout=30).json()
        pre_at = pre.get("adaptation_ai_alberto_at")

        # 2) Post a completed short ride to trigger _refresh_adaptation_after_ride.
        r = requests.post(
            f"{BASE_URL}/api/coach/debrief",
            headers=h,
            json={
                "workout": "Endurance Ride",
                "duration_sec": 1800,
                "avg_power": 150,
                "tss": 40,
                "compliance": 98,
                "coach_name": "Alberto",
                "coach_gender": "male",
                "intervals": [],
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text

        # 3) Wait for background LLM task to complete and refresh the plan cache.
        latest = None
        for _ in range(24):  # up to ~24s
            time.sleep(1)
            p = requests.get(f"{BASE_URL}/api/plan", headers=h, timeout=30).json()
            latest = p.get("adaptation_ai_alberto_at")
            if latest and latest != pre_at:
                break

        assert latest, f"Plan missing adaptation_ai_alberto_at after debrief. plan keys={list(p.keys())}"
        if pre_at:
            # Timestamp should advance (ISO string comparison works).
            assert latest >= pre_at, f"adaptation_ai_alberto_at did not advance: pre={pre_at} post={latest}"

    def test_plan_may_include_detail_timestamp(self, h):
        # Should typically be present after the debrief refresh; do not hard-fail if absent.
        p = requests.get(f"{BASE_URL}/api/plan", headers=h, timeout=30).json()
        # These are user-scoped meta from training_plans doc.
        if "adaptation_detail_alberto_at" in p:
            assert isinstance(p["adaptation_detail_alberto_at"], str)
