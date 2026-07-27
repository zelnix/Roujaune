"""Iter 58 — Plan scoping: NO_PLAN casual rider, Green Lantern (couch-to-road),
demo account (Build & Climb). Verifies no Build & Climb fallback + concurrency-
safe get_plan for the real rider."""
import asyncio
import os
from pathlib import Path

import pytest
import requests

# Load public backend URL (frontend/.env is authoritative for preview URL)
_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in _env.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"
NP_EMAIL = "noplan@roujaune.app"
NP_PASSWORD = "noplan9900"


def _login(email, pw):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": pw},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- Auth prereqs ----
@pytest.fixture(scope="module")
def gl_token():
    return _login(GL_EMAIL, GL_PASSWORD)


@pytest.fixture(scope="module")
def demo_token():
    return _login(DEMO_EMAIL, DEMO_PASSWORD)


@pytest.fixture(scope="module")
def np_token():
    return _login(NP_EMAIL, NP_PASSWORD)


# ---- Green Lantern (real plan = From Couch to Road) ----
class TestGreenLanternPlan:
    def test_plan_is_couch_to_road(self, gl_token):
        r = requests.get(f"{BASE_URL}/api/plan", headers=_hdr(gl_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("id") == "couch-to-road", f"Expected couch-to-road, got id={j.get('id')} title={j.get('title')!r}"
        assert "From Couch to Road" in (j.get("title") or ""), f"title={j.get('title')!r}"
        assert "Build & Climb" not in (j.get("title") or "")

    def test_calendar_week_couch_to_road_structured(self, gl_token):
        r = requests.get(
            f"{BASE_URL}/api/calendar/week",
            headers=_hdr(gl_token),
            timeout=15,
            params={"start": "2026-07-27"},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("free") is not True, "GL week must NOT be flagged free"
        days = j.get("days") or []
        assert len(days) == 7, f"expected 7 days got {len(days)}"

    def test_plan_endpoints_grounded_couch_to_road(self, gl_token):
        # /plan/adaptations
        r = requests.get(f"{BASE_URL}/api/plan/adaptations", headers=_hdr(gl_token), timeout=15)
        assert r.status_code == 200, r.text
        # /plan/progress
        r = requests.get(f"{BASE_URL}/api/plan/progress", headers=_hdr(gl_token), timeout=15)
        assert r.status_code == 200, r.text
        prog = r.json()
        # No Build & Climb leakage in progress
        assert "build" not in str(prog).lower() or "build & climb" not in str(prog).lower()
        # /plan/targets
        r = requests.get(f"{BASE_URL}/api/plan/targets", headers=_hdr(gl_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_coach_adaptation_alberto(self, gl_token):
        r = requests.post(
            f"{BASE_URL}/api/coach/adaptation",
            headers=_hdr(gl_token),
            json={"plan_id": "couch-to-road", "coach_name": "Alberto", "coach_gender": "male", "refresh": False},
            timeout=45,
        )
        # 200 or 503 (LLM not configured) both acceptable; MUST NOT be 500
        assert r.status_code in (200, 503), r.text
        if r.status_code == 200:
            j = r.json()
            assert "adaptation" in j

    def test_coach_adaptation_detail(self, gl_token):
        r = requests.post(
            f"{BASE_URL}/api/coach/adaptation/detail",
            headers=_hdr(gl_token),
            json={"plan_id": "couch-to-road", "coach_name": "Alberto", "coach_gender": "male"},
            timeout=45,
        )
        assert r.status_code in (200, 503), r.text

    def test_concurrent_plan_no_duplicate_key_fallback(self, gl_token):
        """Fire 8 concurrent /api/plan requests. All MUST return couch-to-road.
        A DuplicateKeyError fallback would produce Build & Climb title."""
        import concurrent.futures as cf

        def _hit():
            return requests.get(f"{BASE_URL}/api/plan", headers=_hdr(gl_token), timeout=15).json()

        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            results = list(ex.map(lambda _i: _hit(), range(8)))
        titles = [r.get("title") for r in results]
        ids = [r.get("id") for r in results]
        assert all(t and "From Couch to Road" in t for t in titles), f"got titles: {titles}"
        assert all(i == "couch-to-road" for i in ids), f"got ids: {ids}"
        assert not any("Build & Climb" in (t or "") for t in titles)


# ---- Demo account (Build & Climb correct here) ----
class TestDemoAccount:
    def test_plan_is_build_and_climb(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/plan", headers=_hdr(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("id") == "build-and-climb", f"expected build-and-climb, got {j.get('id')}"
        assert "Build & Climb" in (j.get("title") or ""), f"title={j.get('title')!r}"


# ---- No-plan casual rider ----
class TestNoPlanRider:
    def test_plan_is_no_plan(self, np_token):
        r = requests.get(f"{BASE_URL}/api/plan", headers=_hdr(np_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("id") == "none", f"expected id=none, got {j.get('id')} title={j.get('title')!r}"
        assert j.get("no_plan") is True, f"no_plan flag missing/false: {j}"
        assert "No training plan yet" in (j.get("title") or ""), f"title={j.get('title')!r}"
        assert (j.get("workouts") or []) == []
        assert (j.get("goals") or []) == []
        # No leakage
        s = str(j).lower()
        assert "build & climb" not in s
        assert "threshold climb" not in s

    def test_calendar_week_free_open(self, np_token):
        r = requests.get(
            f"{BASE_URL}/api/calendar/week",
            headers=_hdr(np_token),
            timeout=15,
            params={"start": "2026-07-27"},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("free") is True, f"expected free=true, got: {j.get('free')}"
        days = j.get("days") or []
        assert len(days) == 7
        # Ensure no fabricated plan sessions / Threshold Climb text
        s = str(days).lower()
        assert "threshold climb" not in s, f"Found Threshold Climb in no-plan calendar: {s[:400]}"
        assert "build & climb" not in s

    def test_coach_adaptation_400_no_plan(self, np_token):
        r = requests.post(
            f"{BASE_URL}/api/coach/adaptation",
            headers=_hdr(np_token),
            json={"plan_id": "build-and-climb", "coach_name": "Alberto", "coach_gender": "male"},
            timeout=15,
        )
        # Expected: 400 "No active training plan"
        assert r.status_code == 400, f"expected 400 for no-plan rider, got {r.status_code}: {r.text}"
        assert "no active training plan" in (r.text or "").lower(), r.text

    def test_plan_adaptations_empty(self, np_token):
        r = requests.get(f"{BASE_URL}/api/plan/adaptations", headers=_hdr(np_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Should be an empty list/dict for no-plan rider
        if isinstance(j, dict):
            arr = j.get("adaptations") or j.get("items") or []
        else:
            arr = j
        assert not arr or len(arr) == 0, f"expected empty adaptations for no-plan, got: {j}"

    def test_plan_progress_zeros(self, np_token):
        r = requests.get(f"{BASE_URL}/api/plan/progress", headers=_hdr(np_token), timeout=15)
        assert r.status_code == 200, r.text
        s = str(r.json()).lower()
        assert "build & climb" not in s
