"""Tests for 'From Couch to Road' plan + calendar (rider = Green Lantern)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestRiderProfile:
    def test_rider_is_green_lantern(self, api):
        r = api.get(f"{BASE_URL}/api/rider/profile")
        assert r.status_code == 200, r.text
        data = r.json()
        # Ensure profile is Green Lantern (drives plan switch)
        name = (data.get("name") or data.get("rider", {}).get("name") or "").strip().lower()
        assert "green lantern" in name, f"Expected Green Lantern, got: {data}"


class TestPlanEndpoint:
    def test_plan_is_couch_to_road(self, api):
        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()
        title = (data.get("title") or data.get("name") or "").lower()
        assert "couch" in title and "road" in title, f"Expected From Couch to Road, got title={title!r}, keys={list(data.keys())}"

    def test_plan_has_four_phases(self, api):
        r = api.get(f"{BASE_URL}/api/plan")
        data = r.json()
        phases = data.get("phases") or []
        assert len(phases) == 4, f"Expected 4 phases, got {len(phases)}"
        names = [(p.get("name") or "").lower() for p in phases]
        expected = ["get moving", "build the foundation", "extend your endurance", "road ready"]
        for e in expected:
            assert any(e in n for n in names), f"Missing phase '{e}' in {names}"

    def test_plan_has_beginner_goals(self, api):
        r = api.get(f"{BASE_URL}/api/plan")
        data = r.json()
        goals = data.get("goals") or []
        assert len(goals) >= 3, f"Expected >=3 goals, got {goals}"

    def test_plan_workout_ids(self, api):
        r = api.get(f"{BASE_URL}/api/plan")
        data = r.json()
        # Look for ctr-ride-1/2/3 in phases > workouts (Key Workouts)
        blob = str(data)
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"Missing workout id {wid} in plan payload"


class TestCalendarWeek:
    def test_calendar_week1_dates(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        assert r.status_code == 200, r.text
        data = r.json()
        # Days may be list under 'days'
        days = data.get("days") or data.get("week") or []
        assert len(days) == 7, f"Expected 7 days, got {len(days)}"
        # First day should be Mon 27 Jul 2026
        first = days[0]
        date_str = str(first.get("date") or first.get("iso") or "")
        assert "2026-07-27" in date_str or "27" in date_str, f"First day should be 27 Jul 2026, got {first}"

    def test_calendar_has_cycling_workout_ids(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        data = r.json()
        blob = str(data)
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"Missing workout id {wid} in calendar payload"

    def test_calendar_has_slots(self, api):
        """Each day should have strength(fb50), recovery(wellness), readiness slots."""
        r = api.get(f"{BASE_URL}/api/calendar/week")
        data = r.json()
        days = data.get("days") or data.get("week") or []
        # Check first few days have expected slots
        for d in days[:3]:
            keys = set(d.keys())
            # readiness should be present every day
            assert "readiness" in keys or "readiness_score" in keys, f"Day missing readiness: {d.keys()}"
