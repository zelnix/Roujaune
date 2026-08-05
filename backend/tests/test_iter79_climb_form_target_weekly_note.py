"""Iter 79 — Climb Leaderboard, Form Target and Coach Weekly Note.

Covers:
  - GET /api/analysis/climb-leaderboard (demo) -> has_data:true with a
    Col de Test cluster (gain ~171, count 2), attempts ranked fastest-first
    with exactly one pr:true and slower one having gap_s ~190 (pr:false).
  - PUT /api/analysis/event {event_date, event_name:'Gran Fondo'}
    followed by GET /api/analysis/event reflects it; GET /api/analysis/form-target
    returns has_event:true with days_out, projected_form (num), state (str),
    fresh (bool), projected_fitness.
  - GET /api/analysis/form-target with no event set -> has_event:false and
    does NOT 500.
  - GET /api/coach/weekly-note?coach_name=Alberto&coach_gender=male on the
    greenlantern account (has ride history) returns a non-empty note + focus +
    has_activity. Second call within the same week returns cached:true.
"""
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://roujaune-train.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"
GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers():
    tok = _login(DEMO_EMAIL, DEMO_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def gl_headers():
    tok = _login(GL_EMAIL, GL_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# =========================================================================
# 1) Climb Leaderboard (demo — has 2 attempts at Col de Test)
# =========================================================================
class TestClimbLeaderboard:
    def test_climb_leaderboard_has_col_de_test(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/climb-leaderboard",
                         headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("has_data") is True, j
        climbs = j.get("climbs") or []
        assert len(climbs) >= 1, j
        c = climbs[0]
        for k in ("id", "name", "gain_m", "length_m", "count", "attempts"):
            assert k in c, f"climb missing {k}: {c}"
        # Col de Test approx ~171m gain, 2 attempts
        assert 130 <= c["gain_m"] <= 220, f"gain_m out of range: {c['gain_m']}"
        assert c["count"] == 2, c
        assert len(c["attempts"]) == 2

    def test_attempts_ranked_and_pr_gap(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/climb-leaderboard",
                         headers=demo_headers, timeout=30)
        j = r.json()
        c = j["climbs"][0]
        atts = c["attempts"]
        # Fastest first
        assert atts[0]["time_s"] <= atts[1]["time_s"], atts
        # Exactly one PR
        prs = [a for a in atts if a.get("pr") is True]
        non_prs = [a for a in atts if a.get("pr") is False]
        assert len(prs) == 1, f"expected 1 PR, got {len(prs)}: {atts}"
        assert len(non_prs) == 1, f"expected 1 non-PR, got {len(non_prs)}"
        # Gap for the slower attempt ~190s
        slow = non_prs[0]
        assert slow.get("gap_s") is not None
        assert 150 <= slow["gap_s"] <= 240, f"gap_s out of range: {slow['gap_s']}"
        # PR itself has gap_s == 0
        assert abs(prs[0].get("gap_s") or 0) < 0.1


# =========================================================================
# 2) Event PUT/GET + Form Target roundtrip
# =========================================================================
class TestEventAndFormTarget:
    def test_put_event_then_get_reflects(self, demo_headers):
        target = (date.today() + timedelta(days=28)).isoformat()
        r = requests.put(
            f"{BASE_URL}/api/analysis/event",
            headers=demo_headers,
            json={"event_date": target, "event_name": "Gran Fondo"},
            timeout=15)
        assert r.status_code == 200, r.text
        r = requests.get(f"{BASE_URL}/api/analysis/event",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert (j.get("event_date") or "")[:10] == target
        assert j.get("event_name") == "Gran Fondo"

    def test_form_target_projects(self, demo_headers):
        # Ensure event is set to today+28
        target = (date.today() + timedelta(days=28)).isoformat()
        requests.put(f"{BASE_URL}/api/analysis/event",
                     headers=demo_headers,
                     json={"event_date": target, "event_name": "Gran Fondo"},
                     timeout=15)
        r = requests.get(f"{BASE_URL}/api/analysis/form-target",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("has_event") is True, j
        for k in ("days_out", "projected_form", "state",
                  "fresh", "projected_fitness"):
            assert k in j, f"form-target missing {k}: {j}"
        assert isinstance(j["days_out"], int)
        # Should match today+28 => 28 days_out (allow tiny drift ~26-29 if midnight boundary)
        assert 26 <= j["days_out"] <= 30, f"days_out={j['days_out']}"
        assert isinstance(j["projected_form"], (int, float))
        assert isinstance(j["projected_fitness"], (int, float))
        assert isinstance(j["state"], str) and j["state"]
        assert isinstance(j["fresh"], bool)

    def test_form_target_no_event_greenlantern(self, gl_headers):
        # Clear any event on greenlantern first, then GET form-target
        r = requests.put(
            f"{BASE_URL}/api/analysis/event",
            headers=gl_headers,
            json={"event_date": None, "event_name": None},
            timeout=15)
        assert r.status_code == 200, r.text
        r = requests.get(f"{BASE_URL}/api/analysis/form-target",
                         headers=gl_headers, timeout=15)
        # MUST NOT 500
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        j = r.json()
        assert j.get("has_event") is False, j


# =========================================================================
# 3) Coach Weekly Note (greenlantern has ride history)
# =========================================================================
class TestCoachWeeklyNote:
    def test_weekly_note_generates(self, gl_headers):
        r = requests.get(
            f"{BASE_URL}/api/coach/weekly-note",
            headers=gl_headers,
            params={"coach_name": "Alberto", "coach_gender": "male",
                    "refresh": "true"},
            timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j.get("note"), str) and j["note"].strip(), j
        assert isinstance(j.get("focus"), str) and j["focus"].strip(), j
        assert "has_activity" in j
        assert isinstance(j["has_activity"], bool)

    def test_weekly_note_cached_second_call(self, gl_headers):
        # First call to seed cache
        r1 = requests.get(
            f"{BASE_URL}/api/coach/weekly-note",
            headers=gl_headers,
            params={"coach_name": "Alberto", "coach_gender": "male"},
            timeout=60)
        assert r1.status_code == 200
        # Second call within the same ISO week -> cached:true
        r2 = requests.get(
            f"{BASE_URL}/api/coach/weekly-note",
            headers=gl_headers,
            params={"coach_name": "Alberto", "coach_gender": "male"},
            timeout=60)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2.get("cached") is True, j2
        # And still returns the same note/focus keys
        assert j2.get("note"), j2
        assert j2.get("focus"), j2
