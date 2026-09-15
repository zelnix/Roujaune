"""Iter 81 features: Climb Detail page endpoint, Milestones endpoint, Taper Auto-Apply
endpoint (demo unstructured + greenlantern structured idempotent), Streak enrichment."""
import json
import os
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")

# Pristine week definitions (source of truth for the couch-to-road template),
# used to restore Green Lantern's OWN plan snapshot after taper-apply mutates
# it — see services/plan_engine.py::_apply_companion_ops. Without this, every
# CI run permanently erodes that week's cycling durations a little further
# until they fall below the 20-min easing threshold and this test fails
# forever (exactly what happened to week 7 from years of un-restored runs —
# fixed once via a one-time DB restore; this restore step prevents recurrence).
_COUCH_WEEKS = {w["number"]: w for w in
                json.loads((Path(__file__).resolve().parent.parent / "couch_to_road_plan.json").read_text())["weeks"]}


def _mongo():
    return MongoClient("mongodb://localhost:27017")[os.environ.get("DB_NAME", "test_database")]


def _restore_rider_week(week_number: int) -> None:
    """Restore Green Lantern's own couch-to-road snapshot for `week_number`
    back to the pristine template + clear the eased_weeks marker."""
    pristine_week = _COUCH_WEEKS.get(week_number)
    if not pristine_week:
        return
    db = _mongo()
    doc = db.training_plans.find_one({"id": "couch-to-road", "user_id": "user_greenlantern"})
    if not doc or not isinstance(doc.get("definition"), dict):
        return
    definition = doc["definition"]
    weeks = definition.get("weeks", [])
    for i, w in enumerate(weeks):
        if w.get("number") == week_number:
            weeks[i] = json.loads(json.dumps(pristine_week))  # deep copy, pristine
            break
    db.training_plans.update_one(
        {"id": "couch-to-road", "user_id": "user_greenlantern"},
        {"$set": {"definition": definition}},
    )
    db.plan_state.update_one(
        {"id": "couch-to-road", "user_id": "user_greenlantern"},
        {"$unset": {"eased_weeks": ""}},
    )


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_headers():
    return _login("demo@roujaune.app", "demo9900")


@pytest.fixture(scope="module")
def gl_headers():
    return _login("greenlantern@roujaune.app", "rideon9900")


# ---- Climb Detail (demo) ----
class TestClimbDetailDemo:
    def test_valid_id_returns_found_with_profile_and_attempts(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/climb-detail",
            headers=demo_headers,
            params={"id": "climb-45.2-6.1108"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert b.get("found") is True, f"expected found=True, got {b}"
        assert b.get("name") == "Col de Test", f"expected Col de Test, got {b.get('name')}"

        # profile is an array of {d,ele} length>=2
        prof = b.get("profile")
        assert isinstance(prof, list) and len(prof) >= 2, f"profile too short: {len(prof) if prof else 0}"
        for p in prof:
            assert "d" in p and "ele" in p, f"bad profile point {p}"
            assert isinstance(p["d"], (int, float))

        # attempts is an array of 2 with a series of {d,speed,t}
        atts = b.get("attempts")
        assert isinstance(atts, list) and len(atts) == 2, f"expected 2 attempts, got {len(atts) if atts else 0}"
        for a in atts:
            assert "series" in a and isinstance(a["series"], list) and len(a["series"]) >= 2
            for pt in a["series"]:
                assert "d" in pt and "speed" in pt and "t" in pt, f"bad series pt {pt}"
            assert "time_s" in a and "activity_id" in a

        # PR flag - exactly one attempt should be pr=True
        pr_count = sum(1 for a in atts if a.get("pr"))
        assert pr_count == 1, f"expected exactly 1 PR, got {pr_count}"

    def test_bogus_id_returns_found_false_not_500(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/climb-detail",
            headers=demo_headers,
            params={"id": "climb-99.9-99.9999"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200 not {r.status_code}: {r.text[:200]}"
        b = r.json()
        assert b.get("found") is False


# ---- Milestones (demo) ----
class TestMilestonesDemo:
    def test_milestones_shape(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/milestones", headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        # Required lifetime totals
        for k in ("total_rides", "total_km", "total_hours", "total_tss"):
            assert k in b, f"missing {k}"
        # Demo has 2 rides
        assert b["total_rides"] == 2, f"expected 2 rides, got {b['total_rides']}"
        assert isinstance(b["total_km"], (int, float)) and b["total_km"] >= 0
        assert isinstance(b["total_hours"], (int, float)) and b["total_hours"] >= 0
        assert isinstance(b["total_tss"], (int, float)) and b["total_tss"] >= 0

        # recent should be null since 2 rides isn't a milestone
        assert b.get("recent") is None, f"expected recent=None for 2 rides, got {b.get('recent')}"

        # Next targets: next milestone ride = 10, rides_to_next = 8; next_km=100
        assert b.get("next_rides") == 10, f"expected next_rides=10, got {b.get('next_rides')}"
        assert b.get("rides_to_next") == 8, f"expected rides_to_next=8, got {b.get('rides_to_next')}"
        assert b.get("next_km") == 100, f"expected next_km=100, got {b.get('next_km')}"
        assert "km_to_next" in b and isinstance(b["km_to_next"], (int, float))


# ---- Taper Auto-Apply (demo: unstructured build-and-climb plan) ----
class TestTaperApplyDemoUnstructured:
    def test_unstructured_plan_returns_applied_false(self, demo_headers):
        r = requests.post(
            f"{BASE_URL}/api/coach/taper-apply",
            headers=demo_headers,
            json={"coach_name": "Alberto"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200 not {r.status_code}: {r.text[:200]}"
        b = r.json()
        assert b.get("applied") is False, f"expected applied=False for demo, got {b}"
        assert b.get("reason") == "unstructured", f"expected reason=unstructured, got {b.get('reason')}"


# ---- Taper Auto-Apply (greenlantern: structured couch-to-road plan, idempotent) ----
class TestTaperApplyGreenLanternStructured:
    def test_first_call_applies_then_second_call_is_idempotent(self, gl_headers):
        # Ensure there is an event set (needed for taper target week calc). Snapshot & restore.
        prior = requests.get(f"{BASE_URL}/api/analysis/event", headers=gl_headers, timeout=15).json()
        # Set a near-future event so days_out is positive — computed relative to
        # "today" (a hardcoded past-relative date here silently makes days_out
        # negative and always resolves week=cur=1, see coach.py taper-apply).
        future_event = (date.today() + timedelta(days=45)).isoformat()
        put_r = requests.put(
            f"{BASE_URL}/api/analysis/event",
            headers=gl_headers,
            json={"event_date": future_event, "event_name": "TEST_GL_Event"},
            timeout=15,
        )
        assert put_r.status_code == 200, put_r.text[:200]

        week1 = None
        try:
            r1 = requests.post(
                f"{BASE_URL}/api/coach/taper-apply",
                headers=gl_headers,
                json={"coach_name": "Alberto"},
                timeout=30,
            )
            assert r1.status_code == 200, f"first call expected 200: {r1.status_code} {r1.text[:200]}"
            b1 = r1.json()
            # applied may be True (fresh apply) OR True+already (if a prior test run already eased that week)
            assert b1.get("applied") is True, f"expected applied=True on structured plan, got {b1}"
            assert "week" in b1 and isinstance(b1["week"], int), f"expected int week, got {b1}"
            week1 = b1["week"]

            # Second call: idempotent — must NOT 500 and applied=True, already=True
            r2 = requests.post(
                f"{BASE_URL}/api/coach/taper-apply",
                headers=gl_headers,
                json={"coach_name": "Alberto"},
                timeout=30,
            )
            assert r2.status_code == 200, f"second call expected 200 not 500: {r2.status_code} {r2.text[:200]}"
            b2 = r2.json()
            assert b2.get("applied") is True, f"idempotent call must return applied=True, got {b2}"
            assert b2.get("already") is True, f"idempotent call must return already=True, got {b2}"
            assert b2.get("week") == week1, f"same week expected, got {b2.get('week')} vs {week1}"
        finally:
            # Restore prior event (may be None fields)
            requests.put(
                f"{BASE_URL}/api/analysis/event",
                headers=gl_headers,
                json={"event_date": prior.get("event_date"), "event_name": prior.get("event_name")},
                timeout=15,
            )
            # Restore Green Lantern's OWN plan snapshot for the eased week so
            # this test is idempotent across repeated CI runs (see module docstring).
            if week1 is not None:
                _restore_rider_week(week1)


# ---- Streak enrichment (at_risk / days_left / weekday) ----
class TestStreakEnrichment:
    def test_streak_shape_has_new_fields(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/streak", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        # Legacy fields
        for k in ("current_weeks", "best_weeks", "this_week_rides", "active", "weeks_ridden"):
            assert k in b, f"missing legacy field {k}"
        # New fields
        assert "at_risk" in b, "missing at_risk"
        assert isinstance(b["at_risk"], bool), f"at_risk must be bool, got {type(b['at_risk'])}"
        assert "days_left" in b, "missing days_left"
        assert isinstance(b["days_left"], int), f"days_left must be int, got {type(b['days_left'])}"
        assert "weekday" in b, "missing weekday"
        assert isinstance(b["weekday"], int), f"weekday must be int, got {type(b['weekday'])}"
        assert 1 <= b["weekday"] <= 7, f"weekday out of range 1..7: {b['weekday']}"
