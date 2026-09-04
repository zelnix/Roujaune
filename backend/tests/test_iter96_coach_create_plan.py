"""Iter 96: coach-created custom training plans.
Tests POST /api/coach/create-plan (preview), POST /api/coach/create-plan/accept
(persist + activate), and verifies GET /api/plan + /api/calendar/week reflect
the new custom-<id> plan with dated weeks starting next Monday.
"""
import os
import time
from datetime import date, datetime, timedelta

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
# Fall back to the frontend/.env-provided URL if EXPO_PUBLIC_BACKEND_URL isn't in the shell env.
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    yield s
    # Cleanup: restore demo rider to build-and-climb.
    try:
        s.post(f"{BASE}/api/rider/plan", json={"plan_id": "build-and-climb"}, timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def preview_plan(client):
    body = {
        "coach_name": "Alberto", "coach_gender": "male",
        "goal": "Ride my first 100 km", "weeks": 4, "days_per_week": 3,
    }
    r = client.post(f"{BASE}/api/coach/create-plan", json=body, timeout=90)
    assert r.status_code == 200, f"create-plan failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "plan" in data
    return data["plan"]


class TestCreatePlanPreview:
    def test_preview_shape(self, preview_plan):
        p = preview_plan
        assert p.get("title") and isinstance(p["title"], str)
        assert isinstance(p.get("description", ""), str)
        assert isinstance(p.get("goals"), list)
        assert p.get("weeks_count") == 4
        assert p.get("days_per_week") == 3
        assert isinstance(p.get("weeks"), list) and len(p["weeks"]) == 4

    def test_preview_weeks_structure(self, preview_plan):
        for wk in preview_plan["weeks"]:
            assert isinstance(wk.get("days"), list) and len(wk["days"]) == 7
            kinds = [d.get("kind") for d in wk["days"]]
            # We asked for 3 cycling days/week + strength + rest days
            cycling_days = [d for d in wk["days"] if d.get("kind") == "cycling"]
            assert len(cycling_days) >= 2, f"expected at least 2 cycling days, got kinds={kinds}"
            for d in cycling_days:
                assert d.get("zone", "").startswith("Z"), f"cycling day missing zone: {d}"
                assert d.get("duration"), f"cycling day missing duration: {d}"
                assert isinstance(d.get("tss"), int)
            rest_days = [d for d in wk["days"] if d.get("kind") == "rest"]
            assert len(rest_days) >= 1
            has_supp = any(d.get("kind") in ("strength", "mobility", "recovery", "balance") for d in wk["days"])
            assert has_supp, f"expected at least one strength/mobility day, got {kinds}"


class TestAcceptPlan:
    def test_accept_persists_activates_and_refreshes(self, client, preview_plan):
        # Accept
        r = client.post(f"{BASE}/api/coach/create-plan/accept",
                        json={"plan": preview_plan, "coach_name": "Alberto"}, timeout=30)
        assert r.status_code == 200, f"accept failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        assert j.get("ok") is True
        pid = j.get("plan_id")
        assert pid and pid.startswith("custom-"), f"unexpected plan_id: {pid}"
        assert j.get("title") == preview_plan["title"]

        # GET /api/plan should return the new custom plan.
        r2 = client.get(f"{BASE}/api/plan", timeout=30)
        assert r2.status_code == 200, r2.text[:300]
        plan = r2.json()
        assert plan.get("id") == pid, f"active plan id mismatch: {plan.get('id')} vs {pid}"
        assert plan.get("title") == preview_plan["title"]
        assert plan.get("current_week") == 1
        wo = plan.get("workouts") or []
        assert isinstance(wo, list) and len(wo) > 0, "expected workouts[] to be populated"

        # GET /api/calendar/week should show week 1 with real dates + cycling/fb50/rest.
        r3 = client.get(f"{BASE}/api/calendar/week", timeout=30)
        assert r3.status_code == 200, r3.text[:300]
        cal = r3.json()
        days = cal.get("days") or cal.get("week") or []
        assert isinstance(days, list) and len(days) == 7, f"calendar week should have 7 days: {cal}"
        # Validate first day date is next Monday (or today if it's Monday).
        first_date_str = days[0].get("date") or days[0].get("iso") or ""
        assert first_date_str, f"missing date on first day: {days[0]}"
        first = date.fromisoformat(first_date_str[:10])
        today = date.today()
        expected_mon = today if today.weekday() == 0 else today + timedelta(days=(7 - today.weekday()) % 7)
        assert first == expected_mon, f"week 1 should start on {expected_mon}, got {first}"

        # Verify a mix of activities in the week (cycling + fb50/strength + rest).
        cycling_count = 0
        fb50_count = 0
        rest_count = 0
        for d in days:
            c = d.get("cycling") or {}
            if c.get("workout_id") and str(c.get("workout_id")).startswith(pid):
                cycling_count += 1
            if c and c.get("status") == "rest":
                rest_count += 1
            if d.get("fb50"):
                fb50_count += 1
        assert cycling_count >= 2, f"expected >=2 cycling days from {pid}, got {cycling_count}"
        assert fb50_count >= 1, f"expected >=1 strength/fb50 day, got {fb50_count}"
        assert rest_count >= 1, f"expected >=1 rest day, got {rest_count}"

    def test_restore_demo_plan(self, client):
        r = client.post(f"{BASE}/api/rider/plan", json={"plan_id": "build-and-climb"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:200]
        rp = client.get(f"{BASE}/api/plan", timeout=15)
        assert rp.status_code == 200
        assert rp.json().get("id") == "build-and-climb", f"restore failed: id={rp.json().get('id')}"
