"""Iter 31 — Ride Beyond (Advanced) FULL 12-week / 3-phase / 36-ride plan
+ plan_complete flag + Advanced onboarding recommendation + calendar wiring
+ regression on Ride Stronger and Couch-to-Road.

Runs as Green Lantern (Bearer auth). Order matters: assign 'ride-beyond',
verify structured plan / calendar / onboarding, then RESET to 'couch-to-road'
so the demo user is left on the beginner plan (per review instructions).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://roujaune-train.preview.emergentagent.com",
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


# --------------------- 1. GET /api/plans lists ride-beyond (12-wk, Advanced) ---------------------
class TestPlansCatalog:
    def test_ride_beyond_is_advanced_structured_12_weeks(self, api):
        r = api.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200, r.text
        payload = r.json()
        plans = payload.get("plans") if isinstance(payload, dict) else payload
        assert isinstance(plans, list) and len(plans) >= 3, f"expected >=3 plans: {payload}"
        by_id = {p.get("id"): p for p in plans}
        assert "ride-beyond" in by_id, f"missing ride-beyond id in {list(by_id.keys())}"
        rb = by_id["ride-beyond"]
        assert rb.get("type") == "structured", f"type: {rb.get('type')}"
        assert (rb.get("level") or "").lower() == "advanced", f"level: {rb.get('level')}"
        assert rb.get("duration_weeks") == 12, f"duration_weeks: {rb.get('duration_weeks')}"
        assert rb.get("week_count") == 12, f"week_count: {rb.get('week_count')}"
        # Regression: other authored plans still listed
        assert "couch-to-road" in by_id, f"missing couch-to-road: {list(by_id.keys())}"
        assert by_id["couch-to-road"].get("duration_weeks") == 16
        assert "ride-stronger" in by_id, f"missing ride-stronger: {list(by_id.keys())}"
        assert by_id["ride-stronger"].get("duration_weeks") == 12


# --------------------- 2. Advanced onboarding recommends ride-beyond ---------------------
class TestOnboardingRecommendAdvanced:
    def test_advanced_profile_recommends_ride_beyond(self, api):
        # Review payload:
        r = api.post(
            f"{BASE_URL}/api/onboarding/recommend",
            json={
                "experience_years": 8,
                "weekly_rides": 5,
                "longest_ride_min": 150,
                "confident_60min": True,
                "self_rating": "confident",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        level = (data.get("level") or "").lower()
        assert level == "advanced", f"expected Advanced, got: {data.get('level')} — full={data}"
        rec = data.get("recommended") or {}
        assert rec.get("id") == "ride-beyond", f"recommended id: {rec}"
        assert rec.get("authored") is True, f"authored flag: {rec}"


# --------------------- 3. Assign ride-beyond -> GET /api/plan is structured ---------------------
class TestAssignRideBeyond:
    def test_assign_and_fetch_structured_plan(self, api):
        r = api.post(
            f"{BASE_URL}/api/rider/plan",
            json={"plan_id": "ride-beyond", "reset_progress": True},
        )
        assert r.status_code == 200, r.text

        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()

        # Title / id / duration
        assert data.get("id") == "ride-beyond", f"id mismatch: {data.get('id')}"
        title = data.get("title") or data.get("name") or ""
        assert "ride beyond" in title.lower(), f"title mismatch: {title!r}"
        assert data.get("duration_weeks") == 12, f"duration_weeks: {data.get('duration_weeks')}"

        # plan_complete field must exist and be False at week 1
        assert "plan_complete" in data, f"missing plan_complete key. keys={list(data.keys())}"
        assert data["plan_complete"] is False, f"plan_complete should be False at week 1: {data['plan_complete']}"

        # current_week == 1 after reset
        cw = data.get("current_week") or (data.get("progress") or {}).get("current_week")
        assert cw == 1, f"current_week != 1: {cw}"
        weeks_label = str((data.get("progress") or {}).get("weeks") or "")
        assert weeks_label.replace(" ", "") == "1/12", f"progress.weeks: {weeks_label!r}"

        # Three phases: Performance Foundation (active), Power and Durability, Performance Ready
        phases = data.get("phases") or []
        assert len(phases) == 3, f"expected 3 phases, got {len(phases)}: {phases}"
        names = [(p.get("name") or "").lower() for p in phases]
        assert any("performance foundation" in n for n in names), f"phases: {names}"
        assert any("power and durability" in n for n in names), f"phases: {names}"
        assert any("performance ready" in n for n in names), f"phases: {names}"

        # First phase should be marked active/current
        active_flags = [bool(p.get("active") or p.get("current") or p.get("is_active")) for p in phases]
        assert active_flags[0], f"first phase not active: {phases[0]}"

        # Workouts include rb-ride-1..3 for week 1
        workouts = data.get("workouts") or []
        ids = {(w.get("id") or w.get("workout_id")) for w in workouts}
        for wid in ("rb-ride-1", "rb-ride-2", "rb-ride-3"):
            assert wid in ids, f"missing {wid} in workouts — got {ids}"


# --------------------- 4. GET /api/calendar/week wiring ---------------------
class TestCalendarWeek:
    def test_calendar_week_maps_days_to_rides(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        assert r.status_code == 200, r.text
        data = r.json()
        days = data.get("days") or data.get("week") or []
        assert isinstance(days, list) and len(days) >= 7, f"expected 7-day week: {data}"

        def day_key(d):
            return (d.get("day_name") or d.get("day") or d.get("weekday") or "").upper()[:3]

        by_day = {day_key(d): d for d in days}
        for k in ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"):
            assert k in by_day, f"missing {k} in calendar days: {list(by_day.keys())}"

        def cycling_wid(d):
            return ((d.get("cycling") or {}).get("workout_id")) or d.get("workout_id") or ""

        def has_cycling(d):
            return bool((d.get("cycling") or {}).get("workout_id"))

        def is_fb50(d):
            fb = d.get("fb50")
            if fb:
                t = (fb.get("title") or "").lower()
                return "fit beyond 50" in t or "fb50" in t
            focus = (d.get("focus") or d.get("title") or "").lower()
            return "fit beyond 50" in focus or "fb50" in focus

        def is_recovery(d):
            if has_cycling(d):
                return False
            focus = (d.get("focus") or d.get("title") or "").lower()
            return "recovery" in focus or "mobility" in focus

        def is_rest(d):
            if has_cycling(d):
                return False
            focus = (d.get("focus") or d.get("title") or "").lower()
            return "rest" in focus and "recovery" not in focus

        assert cycling_wid(by_day["TUE"]) == "rb-ride-1", f"TUE: {by_day['TUE']}"
        assert cycling_wid(by_day["THU"]) == "rb-ride-2", f"THU: {by_day['THU']}"
        assert cycling_wid(by_day["SAT"]) == "rb-ride-3", f"SAT: {by_day['SAT']}"

        assert is_fb50(by_day["WED"]), f"WED not FB50: {by_day['WED']}"
        assert not has_cycling(by_day["WED"]), f"WED should not be a cycling ride: {by_day['WED']}"
        assert is_recovery(by_day["FRI"]), f"FRI not recovery: {by_day['FRI']}"
        assert is_rest(by_day["MON"]) or is_recovery(by_day["MON"]), f"MON: {by_day['MON']}"
        assert not has_cycling(by_day["SUN"]), f"SUN should not be a cycling ride: {by_day['SUN']}"


# --------------------- 5. Regression: Ride Stronger still intact + plan_complete flag ---------------------
class TestRideStrongerRegression:
    def test_ride_stronger_still_12_weeks_and_plan_complete_flag(self, api):
        r = api.post(
            f"{BASE_URL}/api/rider/plan",
            json={"plan_id": "ride-stronger", "reset_progress": True},
        )
        assert r.status_code == 200, r.text
        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("id") == "ride-stronger"
        assert data.get("duration_weeks") == 12
        # plan_complete field must exist and be False
        assert "plan_complete" in data, "missing plan_complete key on ride-stronger"
        assert data["plan_complete"] is False, f"plan_complete should be False: {data['plan_complete']}"
        blob = str(data)
        for wid in ("rs-ride-1", "rs-ride-2", "rs-ride-3"):
            assert wid in blob, f"missing {wid}"
        phases = data.get("phases") or []
        assert len(phases) == 3, f"ride-stronger phases: {phases}"

    def test_ride_stronger_calendar_week(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        assert r.status_code == 200, r.text
        blob = str(r.json())
        for wid in ("rs-ride-1", "rs-ride-2", "rs-ride-3"):
            assert wid in blob, f"missing {wid} in ride-stronger calendar"


# --------------------- 6. Regression: Couch-to-Road (LEAVES USER on CTR) + plan_complete ---------------------
class TestCouchToRoadRegression:
    def test_reassign_couch_to_road(self, api):
        r = api.post(
            f"{BASE_URL}/api/rider/plan",
            json={"plan_id": "couch-to-road", "reset_progress": True},
        )
        assert r.status_code == 200, r.text
        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("id") == "couch-to-road", f"id: {data.get('id')}"
        assert data.get("duration_weeks") == 16, f"duration_weeks: {data.get('duration_weeks')}"
        # plan_complete field
        assert "plan_complete" in data, "missing plan_complete key on couch-to-road"
        assert data["plan_complete"] is False, f"plan_complete should be False: {data['plan_complete']}"
        blob = str(data)
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"missing {wid} in CTR regression"

    def test_couch_to_road_calendar_week(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        assert r.status_code == 200, r.text
        blob = str(r.json())
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"missing {wid} in CTR calendar week"
