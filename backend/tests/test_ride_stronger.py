"""Iter 29 — Ride Stronger Phase 3 expansion (12 weeks / 3 phases / 36 rides) +
regression on Couch-to-Road.

Runs as Green Lantern (Bearer auth). Order matters: we assign 'ride-stronger',
verify structured response with duration_weeks=12 and all three phases, then
reset back to 'couch-to-road' so the demo user is left on the beginner plan.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://scenic-trainer.preview.emergentagent.com",
).rstrip("/")
EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in login response: {r.text}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- 1. GET /api/plans (ride-stronger week_count/duration_weeks == 12) ----------
class TestPlansCatalog:
    def test_ride_stronger_is_twelve_weeks(self, api):
        r = api.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200, r.text
        payload = r.json()
        plans = payload.get("plans") if isinstance(payload, dict) else payload
        assert isinstance(plans, list) and len(plans) >= 3, f"expected >=3 plans, got: {payload}"
        by_id = {p.get("id"): p for p in plans}
        assert "ride-stronger" in by_id, f"missing ride-stronger id in {list(by_id.keys())}"
        rs = by_id["ride-stronger"]
        assert rs.get("type") == "structured", f"type mismatch: {rs.get('type')}"
        wk = rs.get("week_count") or rs.get("duration_weeks")
        assert wk == 12, f"expected ride-stronger week_count/duration_weeks==12, got {wk} — full={rs}"
        # Regression: couch-to-road still listed
        assert "couch-to-road" in by_id


# ---------- 2. Assign ride-stronger -> GET /api/plan (12 weeks, three phases) ----------
class TestAssignRideStrongerPhase3:
    def test_assign_and_fetch_three_phase_plan(self, api):
        r = api.post(
            f"{BASE_URL}/api/rider/plan",
            json={"plan_id": "ride-stronger", "reset_progress": True},
        )
        assert r.status_code == 200, r.text

        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()

        # id + duration
        assert data.get("id") == "ride-stronger", f"id mismatch: {data.get('id')}"
        assert data.get("duration_weeks") == 12, f"duration_weeks: {data.get('duration_weeks')}"

        # current_week == 1 (after reset)
        cw = data.get("current_week") or (data.get("progress") or {}).get("current_week")
        assert cw == 1, f"current_week != 1: {cw}"

        # progress.weeks "1 / 12"
        progress = data.get("progress") or {}
        weeks_label = str(progress.get("weeks") or "")
        assert weeks_label.replace(" ", "") == "1/12", f"progress.weeks: {weeks_label!r}"

        # phases: all three should be present, phase 1 active
        phases = data.get("phases") or []
        assert isinstance(phases, list) and len(phases) == 3, f"expected 3 phases, got {phases}"
        p1 = next((p for p in phases if p.get("number") == 1), None)
        p2 = next((p for p in phases if p.get("number") == 2), None)
        p3 = next((p for p in phases if p.get("number") == 3), None)
        assert p1 and p2 and p3, f"missing phase 1/2/3 in {phases}"
        assert "foundation and control" in (p1.get("name") or "").lower(), f"phase1 name: {p1}"
        assert "strength and sustainable power" in (p2.get("name") or "").lower(), f"phase2 name: {p2}"
        assert "goal ready" in (p3.get("name") or "").lower(), f"phase3 name: {p3}"
        assert p1.get("active") is True, f"phase1 should be active: {p1}"
        assert p2.get("active") is False, f"phase2 should NOT be active while on week 1: {p2}"
        assert p3.get("active") is False, f"phase3 should NOT be active while on week 1: {p3}"

        # Week 1 workouts still resolve (rs-ride-1..3)
        workouts = data.get("workouts") or []
        assert len(workouts) >= 3, f"expected 3 rides in week 1, got {len(workouts)}"
        ids = {(w.get("id") or w.get("workout_id")) for w in workouts}
        for wid in ("rs-ride-1", "rs-ride-2", "rs-ride-3"):
            assert wid in ids, f"missing {wid} — got {ids}"


# ---------- 3. Regression: reassign couch-to-road (leaves state clean) ----------
class TestCouchToRoadRegression:
    def test_reassign_and_fetch(self, api):
        r = api.post(
            f"{BASE_URL}/api/rider/plan",
            json={"plan_id": "couch-to-road", "reset_progress": True},
        )
        assert r.status_code == 200, r.text

        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("id") == "couch-to-road", f"id mismatch: {data.get('id')}"
        assert data.get("duration_weeks") == 16, f"duration_weeks: {data.get('duration_weeks')}"

        workouts = data.get("workouts") or []
        assert len(workouts) >= 3, f"expected 3 rides, got {len(workouts)}"
        blob = str(data)
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"missing {wid} after regression reassign"
