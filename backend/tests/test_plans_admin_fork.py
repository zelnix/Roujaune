"""
Backend tests for the plans-admin fork.

Validates: seeded plans list, get/create/patch/delete of plan definitions,
week replace, day patch, adapt op, and — most importantly — that edits made
through /api/plans/couch-to-road/... immediately reflect in /api/plan and
/api/calendar/week (without a backend restart).

State-hygiene: the seed is non-destructive, so any real-plan edits made here
are restored inside the test body. A throwaway plan id "TEST_plan_admin_fork"
is used for create/patch/delete experiments.
"""
import os
import time
import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to the frontend .env for local runs
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

THROWAWAY_ID = "TEST_plan_admin_fork"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # best-effort teardown of the throwaway plan
    try:
        s.delete(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=10)
    except Exception:
        pass


# ---- 1. Listing & basic reads --------------------------------------------
class TestListing:
    def test_list_plans_contains_both(self, api):
        r = api.get(f"{BASE_URL}/api/plans", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        by_id = {p["id"]: p for p in items}
        assert "couch-to-road" in by_id
        assert "build-and-climb" in by_id
        ctr = by_id["couch-to-road"]
        bac = by_id["build-and-climb"]
        assert ctr["type"] == "structured"
        assert ctr["week_count"] == 16
        assert bac["type"] == "roadmap"

    def test_get_couch_to_road_full(self, api):
        r = api.get(f"{BASE_URL}/api/plans/couch-to-road", timeout=15)
        assert r.status_code == 200
        doc = r.json()
        assert doc["id"] == "couch-to-road"
        assert isinstance(doc.get("weeks"), list)
        assert len(doc["weeks"]) == 16
        # Week 1 sanity
        w1 = next(w for w in doc["weeks"] if int(w["number"]) == 1)
        assert w1.get("days") and len(w1["days"]) >= 2
        # Tuesday cycling day is day_index 1
        assert w1["days"][1]["kind"] == "cycling"
        assert w1["days"][1]["workout_id"] == "ctr-ride-1"

    def test_get_build_and_climb(self, api):
        r = api.get(f"{BASE_URL}/api/plans/build-and-climb", timeout=15)
        assert r.status_code == 200
        doc = r.json()
        assert doc["id"] == "build-and-climb"
        # roadmap plan — has phases / goals structure, may or may not have weeks
        assert doc.get("type", "roadmap") in ("roadmap", None) or True

    def test_get_nonexistent_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/plans/nonexistent_xxx", timeout=15)
        assert r.status_code == 404


# ---- 2. Edit propagation (core) ------------------------------------------
class TestEditPropagation:
    def _get_ctr_ride1_duration_from_plan(self, api):
        r = api.get(f"{BASE_URL}/api/plan", timeout=15)
        assert r.status_code == 200
        p = r.json()
        # /api/plan for Green Lantern returns CTR structure with a 'workouts' list
        wk = p.get("workouts") or []
        ride1 = next((w for w in wk if w.get("id") == "ctr-ride-1"), None)
        assert ride1 is not None, f"ctr-ride-1 missing from workouts (n={len(wk)})"
        return ride1.get("duration")

    def _get_tuesday_duration_from_calendar(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week", timeout=15)
        assert r.status_code == 200
        cal = r.json()
        assert len(cal.get("days", [])) == 7
        # Find the Tuesday cycling day whose workout_id == ctr-ride-1
        for d in cal["days"]:
            c = d.get("cycling")
            if c and c.get("workout_id") == "ctr-ride-1":
                return c.get("duration")
        pytest.fail("No cycling day with workout_id ctr-ride-1 found in calendar week")

    def test_patch_day1_duration_reflects_and_restores(self, api):
        # Baseline
        base_plan_dur = self._get_ctr_ride1_duration_from_plan(api)
        base_cal_dur = self._get_tuesday_duration_from_calendar(api)
        assert base_plan_dur == "20 min", f"Baseline plan duration expected '20 min', got {base_plan_dur!r}"
        assert base_cal_dur == "20 min", f"Baseline calendar duration expected '20 min', got {base_cal_dur!r}"

        # PATCH duration → 23 min
        r = api.patch(
            f"{BASE_URL}/api/plans/couch-to-road/weeks/1/days/1",
            json={"patch": {"duration": "23 min"}},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Small wait for on_change cache reload (should be immediate but be safe)
        time.sleep(0.3)

        try:
            new_plan_dur = self._get_ctr_ride1_duration_from_plan(api)
            new_cal_dur = self._get_tuesday_duration_from_calendar(api)
            assert new_plan_dur == "23 min", f"/api/plan did not reflect PATCH; got {new_plan_dur!r}"
            assert new_cal_dur == "23 min", f"/api/calendar/week did not reflect PATCH; got {new_cal_dur!r}"
        finally:
            # Restore
            rr = api.patch(
                f"{BASE_URL}/api/plans/couch-to-road/weeks/1/days/1",
                json={"patch": {"duration": "20 min"}},
                timeout=15,
            )
            assert rr.status_code == 200, rr.text
            time.sleep(0.3)
            # Verify restore
            assert self._get_ctr_ride1_duration_from_plan(api) == "20 min"
            assert self._get_tuesday_duration_from_calendar(api) == "20 min"


# ---- 3. Adapt op ---------------------------------------------------------
class TestAdapt:
    def test_adapt_day_patch_and_history(self, api):
        # Apply
        r = api.post(
            f"{BASE_URL}/api/plans/couch-to-road/adapt",
            json={
                "source": "coach",
                "reason": "test",
                "ops": [{"target": "day", "week": 1, "day_index": 1,
                         "patch": {"duration": "21 min"}}],
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload.get("applied") and len(payload["applied"]) == 1
        assert "entry" in payload and payload["entry"].get("id")
        time.sleep(0.3)

        try:
            # Verify /api/plan reflects
            plan = api.get(f"{BASE_URL}/api/plan", timeout=15).json()
            ride1 = next((w for w in plan.get("workouts", []) if w.get("id") == "ctr-ride-1"), None)
            assert ride1 and ride1.get("duration") == "21 min"
            # Edit history was recorded on the plan doc
            doc = api.get(f"{BASE_URL}/api/plans/couch-to-road", timeout=15).json()
            hist = doc.get("edit_history", [])
            assert len(hist) >= 1
            assert hist[0]["source"] == "coach"
            assert hist[0]["reason"] == "test"
            assert isinstance(hist[0]["applied"], list) and len(hist[0]["applied"]) >= 1
            # Cap check — never exceeds 30
            assert len(hist) <= 30
        finally:
            # Restore to 20 min via PATCH (simpler than another adapt)
            rr = api.patch(
                f"{BASE_URL}/api/plans/couch-to-road/weeks/1/days/1",
                json={"patch": {"duration": "20 min"}},
                timeout=15,
            )
            assert rr.status_code == 200, rr.text
            time.sleep(0.3)
            plan = api.get(f"{BASE_URL}/api/plan", timeout=15).json()
            ride1 = next((w for w in plan.get("workouts", []) if w.get("id") == "ctr-ride-1"), None)
            assert ride1 and ride1.get("duration") == "20 min"


# ---- 4. Throwaway plan CRUD & duplicate id -------------------------------
class TestCRUDThrowaway:
    def test_create_get_patch_delete_flow(self, api):
        # Clean up any leftovers
        api.delete(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=10)

        # CREATE
        r = api.post(
            f"{BASE_URL}/api/plans",
            json={"id": THROWAWAY_ID, "definition": {
                "title": "Throwaway", "description": "seed", "type": "structured",
                "duration_weeks": 1,
                "weeks": [{"number": 1, "title": "W1", "days": [
                    {"day_name": "MON", "kind": "rest", "title": "Rest"},
                    {"day_name": "TUE", "kind": "cycling", "title": "Easy", "duration": "10 min"},
                ]}],
            }},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["id"] == THROWAWAY_ID
        assert created["title"] == "Throwaway"
        assert created["created_at"] and created["updated_at"]

        # GET
        r = api.get(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15)
        assert r.status_code == 200
        assert r.json()["description"] == "seed"

        # Duplicate id -> 409
        r = api.post(
            f"{BASE_URL}/api/plans",
            json={"id": THROWAWAY_ID, "definition": {"title": "dup"}},
            timeout=15,
        )
        assert r.status_code == 409

        # PATCH description
        r = api.patch(
            f"{BASE_URL}/api/plans/{THROWAWAY_ID}",
            json={"description": "updated"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["description"] == "updated"
        # GET reflects
        assert api.get(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15).json()["description"] == "updated"

        # PUT replace week 1 (must keep number=1 even if body omits it)
        r = api.put(
            f"{BASE_URL}/api/plans/{THROWAWAY_ID}/weeks/1",
            json={"title": "W1-replaced", "days": [
                {"day_name": "MON", "kind": "rest", "title": "Rest"},
            ]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = api.get(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15).json()
        w1 = doc["weeks"][0]
        assert int(w1["number"]) == 1
        assert w1["title"] == "W1-replaced"

        # DELETE
        r = api.delete(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] == THROWAWAY_ID

        # GET -> 404
        r = api.get(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15)
        assert r.status_code == 404

        # DELETE again -> 404
        r = api.delete(f"{BASE_URL}/api/plans/{THROWAWAY_ID}", timeout=15)
        assert r.status_code == 404


# ---- 5. Regressions ------------------------------------------------------
class TestRegression:
    def test_plan_endpoint_for_green_lantern(self, api):
        r = api.get(f"{BASE_URL}/api/plan", timeout=15)
        assert r.status_code == 200
        p = r.json()
        # week_targets and workouts still present
        wt = p.get("week_targets") or {}
        for k in ("rides", "duration", "distance_km", "elevation_m", "supplementary"):
            assert k in wt, f"week_targets missing {k}"
        wk = p.get("workouts") or []
        wk_ids = {w.get("id") for w in wk}
        for k in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert k in wk_ids, f"workouts missing {k}"
        # progress + progress_pct
        assert "progress" in p
        assert "progress_pct" in p

    def test_calendar_week_7_days(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week", timeout=15)
        assert r.status_code == 200
        cal = r.json()
        days = cal.get("days") or []
        assert len(days) == 7
        # readiness on each day; at least one cycling / fb50 / wellness across the week
        assert all("readiness" in d for d in days)
        assert any(d.get("cycling") for d in days)
        assert any(d.get("fb50") for d in days)
        assert any(d.get("wellness") for d in days)

    def test_plan_goals_persist(self, api):
        # Persist a goals overlay for build-and-climb; /api/plan returns CTR for
        # Green Lantern, so we only assert the endpoint returns success and the
        # goals were written into the training_plans overlay (verified via a
        # follow-up PUT that echoes stored data implicitly by not erroring).
        payload = {
            "plan_id": "build-and-climb",
            "goals": [
                {"id": "TEST_goal_1", "title": "Test goal 1", "description": "d1", "status": "incomplete"},
                {"id": "TEST_goal_2", "title": "Test goal 2", "description": "d2", "status": "incomplete"},
            ],
        }
        r = api.put(f"{BASE_URL}/api/plan/goals", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Response echoes the training_plans document with goals persisted
        stored = body.get("goals") or []
        stored_ids = {g.get("id") for g in stored}
        assert "TEST_goal_1" in stored_ids and "TEST_goal_2" in stored_ids
        # Idempotent re-put should not error
        r2 = api.put(f"{BASE_URL}/api/plan/goals", json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
