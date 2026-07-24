"""Iter 27 — Ride Stronger intermediate plan + regression on Couch-to-Road.

Runs as Green Lantern (Bearer auth). Order matters: we assign 'ride-stronger',
verify structured response + calendar, then reset to 'couch-to-road' to leave
demo state intact for other suites/frontend.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
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


# ---------- 1. GET /api/plans ----------
class TestPlansCatalog:
    def test_three_plans_incl_ride_stronger(self, api):
        r = api.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200, r.text
        payload = r.json()
        plans = payload.get("plans") if isinstance(payload, dict) else payload
        assert isinstance(plans, list) and len(plans) >= 3, f"expected >=3 plans, got: {payload}"
        by_id = {p.get("id"): p for p in plans}
        assert "ride-stronger" in by_id, f"missing ride-stronger id in {list(by_id.keys())}"
        rs = by_id["ride-stronger"]
        assert rs.get("type") == "structured", f"type mismatch: {rs.get('type')}"
        assert rs.get("week_count") == 4 or rs.get("duration_weeks") == 4, f"week_count/duration_weeks !=4: {rs}"
        # Also ensure couch-to-road still listed (regression)
        assert "couch-to-road" in by_id


# ---------- 2. Onboarding recommend -> Intermediate -> ride-stronger ----------
class TestOnboardingRecommend:
    def test_intermediate_profile_recommends_ride_stronger(self, api):
        body = {
            "experience_years": 2,
            "weekly_rides": 2,
            "longest_ride_min": 45,
            "confident_60min": False,
            "self_rating": "some",
        }
        r = api.post(f"{BASE_URL}/api/onboarding/recommend", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        level = data.get("level") or data.get("classification") or ""
        assert str(level).lower() == "intermediate", f"expected level Intermediate, got {level} — full={data}"
        rec = data.get("recommended") or data.get("plan") or {}
        assert rec.get("id") == "ride-stronger", f"expected recommended.id ride-stronger, got {rec}"
        assert rec.get("authored") is True, f"expected recommended.authored true, got {rec}"


# ---------- 3. Assign ride-stronger -> GET /api/plan ----------
class TestAssignRideStronger:
    def test_assign_and_fetch(self, api):
        r = api.post(f"{BASE_URL}/api/rider/plan", json={"plan_id": "ride-stronger", "reset_progress": True})
        assert r.status_code == 200, r.text

        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()

        assert data.get("id") == "ride-stronger", f"id mismatch: {data.get('id')}"
        title = (data.get("title") or data.get("name") or "")
        assert "ride stronger" in title.lower(), f"title mismatch: {title}"
        assert data.get("duration_weeks") == 4, f"duration_weeks: {data.get('duration_weeks')}"

        # current_week can live at top level or under progress
        cw = data.get("current_week") or (data.get("progress") or {}).get("current_week")
        assert cw == 1, f"current_week != 1: {cw} — payload keys={list(data.keys())}"

        phase = data.get("phase") or (data.get("phases") or [{}])[0]
        phase_name = (phase.get("name") if isinstance(phase, dict) else str(phase)) or ""
        assert "foundation and control" in phase_name.lower(), f"phase mismatch: {phase}"

        # progress.weeks '1 / 4'
        progress = data.get("progress") or {}
        weeks_label = str(progress.get("weeks") or progress.get("weeks_label") or "")
        assert weeks_label.replace(" ", "") == "1/4", f"progress.weeks: {weeks_label!r} — progress={progress}"

        # workouts array (Week 1 rides)
        workouts = data.get("workouts")
        if workouts is None:
            # fall back to first week's cycling days
            weeks = data.get("weeks") or []
            assert weeks, f"no weeks in payload keys={list(data.keys())}"
            days = weeks[0].get("days", [])
            workouts = [d for d in days if (d.get("type") == "cycling" or d.get("kind") == "cycling")]
        assert len(workouts) >= 3, f"expected 3 rides, got {len(workouts)}: {workouts}"

        by_id = {(w.get("id") or w.get("workout_id")): w for w in workouts}
        for wid, expected_title, expected_dur in [
            ("rs-ride-1", "intermediate baseline ride", "55"),
            ("rs-ride-2", "cadence and aerobic control", "50"),
            ("rs-ride-3", "foundation endurance ride", "90"),
        ]:
            assert wid in by_id, f"missing {wid} in {list(by_id.keys())}"
            w = by_id[wid]
            t = (w.get("title") or w.get("name") or "").lower()
            assert expected_title in t, f"{wid} title mismatch: {t}"
            dur = str(w.get("duration") or w.get("duration_min") or "")
            assert expected_dur in dur, f"{wid} duration mismatch: {dur}"


# ---------- 4. Calendar week under ride-stronger ----------
class TestCalendarRideStronger:
    def test_week_layout(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week")
        assert r.status_code == 200, r.text
        data = r.json()
        days = data.get("days") or data.get("week") or []
        assert len(days) == 7, f"expected 7 days, got {len(days)}"

        # Map by day_name if present, else index-based (MON..SUN)
        by_name = {}
        order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        for i, d in enumerate(days):
            dn = (d.get("day_name") or d.get("day") or order[i]).upper()[:3]
            by_name[dn] = d

        def _title(day):
            return str(
                day.get("title")
                or (day.get("cycling") or {}).get("title")
                or (day.get("workout") or {}).get("title")
                or (day.get("strength") or {}).get("title")
                or ""
            ).lower()

        def _kind(day):
            return str(day.get("type") or day.get("kind") or "").lower()

        # MON strength "Cycling Strength and Stability"
        mon = by_name["MON"]
        blob_mon = str(mon).lower()
        assert "strength" in _kind(mon) or "strength" in blob_mon
        assert "cycling strength and stability" in blob_mon, f"MON title mismatch: {mon}"

        # TUE ride (rs-ride-1)
        tue = by_name["TUE"]
        assert "cycling" in _kind(tue) or "rs-ride-1" in str(tue).lower()

        # WED recovery
        wed = by_name["WED"]
        assert "recovery" in _kind(wed) or "recovery" in str(wed).lower()

        # THU ride
        thu = by_name["THU"]
        assert "cycling" in _kind(thu) or "rs-ride-2" in str(thu).lower()

        # FRI strength / balance
        fri = by_name["FRI"]
        assert "strength" in _kind(fri) or "balance" in str(fri).lower() or "balance" in _kind(fri)

        # SAT ride Foundation Endurance
        sat = by_name["SAT"]
        assert "foundation endurance" in str(sat).lower(), f"SAT title mismatch: {sat}"

        # SUN rest
        sun = by_name["SUN"]
        assert "rest" in _kind(sun) or "rest" in str(sun).lower()


# ---------- 5. Regression: reassign couch-to-road (leaves state clean) ----------
class TestCouchToRoadRegression:
    def test_reassign_and_fetch(self, api):
        r = api.post(f"{BASE_URL}/api/rider/plan", json={"plan_id": "couch-to-road", "reset_progress": True})
        assert r.status_code == 200, r.text

        r = api.get(f"{BASE_URL}/api/plan")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("id") == "couch-to-road", f"id mismatch: {data.get('id')}"
        assert data.get("duration_weeks") == 16, f"duration_weeks: {data.get('duration_weeks')}"

        # Ensure 3 weekly workouts (rides) for week 1
        workouts = data.get("workouts")
        if workouts is None:
            weeks = data.get("weeks") or []
            days = (weeks[0].get("days") if weeks else []) or []
            workouts = [d for d in days if (d.get("type") == "cycling" or d.get("kind") == "cycling")]
        assert len(workouts) >= 3, f"expected 3 rides, got {len(workouts)}"

        blob = str(data)
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in blob, f"missing {wid} after regression reassign"
