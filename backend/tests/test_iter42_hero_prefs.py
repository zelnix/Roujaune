"""Iteration 42 backend tests:
- GET /api/plan now returns hero object + per-workout date/date_label/is_today
- GET/PUT /api/rider/prefs is user-scoped & persists
"""
import os
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
def gl_headers(gl_token):
    return {"Authorization": f"Bearer {gl_token}", "Content-Type": "application/json"}


# --- Plan hero + dated workouts -----------------------------------------

class TestPlanHero:
    def test_plan_returns_hero(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert "hero" in p, "plan missing hero"
        h = p["hero"]
        for k in ("week", "phase_number", "phase_name", "week_in_phase", "is_phase_start"):
            assert k in h, f"hero missing {k}"

    def test_hero_values_for_green_lantern(self, gl_headers):
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        h = p["hero"]
        assert h["week"] == 1, h
        assert h["phase_number"] == 1, h
        assert h["phase_name"] == "Get Moving", h
        assert h["week_in_phase"] == 1, h
        assert h["is_phase_start"] is True, h

    def test_workouts_have_dates(self, gl_headers):
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        assert len(p["workouts"]) >= 5, "expected at least 5 workouts"
        for w in p["workouts"]:
            assert "date" in w, w
            assert "date_label" in w, w
            assert "is_today" in w, w

    def test_first_incomplete_is_strength_beginner_cycling(self, gl_headers):
        """Server date (2026-07-26) is BEFORE week-1 start (2026-07-27); Mon
        27 Jul is a strength day. First incomplete workout should be
        'Beginner Cycling Strength' with date_label 'Mon 27 Jul'."""
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        upcoming = [w for w in p["workouts"] if not w.get("completed")]
        assert upcoming, "no incomplete workouts"
        first = upcoming[0]
        assert first["title"] == "Beginner Cycling Strength", first
        assert first["type"] == "strength", first
        assert first["date_label"] == "Mon 27 Jul", first
        assert first["date"] == "2026-07-27", first


# --- Rider prefs ---------------------------------------------------------

class TestRiderPrefs:
    def test_get_default_alberto(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/rider/prefs", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("coach_id", "coach_style", "voice_guidance", "speech_rate"):
            assert k in d, f"prefs missing {k}: {d}"
        # Initial state must be alberto
        assert d["coach_id"] == "alberto", d

    def test_put_changes_coach(self, gl_headers):
        r = requests.put(f"{BASE_URL}/api/rider/prefs", headers=gl_headers,
                         json={"coach_id": "adriana"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["coach_id"] == "adriana"

    def test_get_persists_new_coach(self, gl_headers):
        d = requests.get(f"{BASE_URL}/api/rider/prefs", headers=gl_headers, timeout=30).json()
        assert d["coach_id"] == "adriana", d

    def test_prefs_user_scoped(self, gl_headers):
        """Create a fresh temp user, confirm they see default alberto even after
        Green Lantern has been switched to adriana."""
        import uuid
        tmp_email = f"tmp_iter42_{uuid.uuid4().hex[:8]}@roujaune.app"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": tmp_email, "password": "TempPass123!",
                                  "name": "Iter42 Tmp"}, timeout=30)
        assert reg.status_code == 200, reg.text
        tok = reg.json()["token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        d = requests.get(f"{BASE_URL}/api/rider/prefs", headers=h, timeout=30).json()
        assert d["coach_id"] == "alberto", f"new user should default to alberto, got {d}"
        # Clean up: delete the temp account
        try:
            requests.delete(f"{BASE_URL}/api/account", headers=h, timeout=30)
        except Exception:
            pass

    def test_zzz_restore_alberto(self, gl_headers):
        """Restore Green Lantern to alberto so environment stays pristine."""
        r = requests.put(f"{BASE_URL}/api/rider/prefs", headers=gl_headers,
                         json={"coach_id": "alberto"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["coach_id"] == "alberto"
        d = requests.get(f"{BASE_URL}/api/rider/prefs", headers=gl_headers, timeout=30).json()
        assert d["coach_id"] == "alberto"
