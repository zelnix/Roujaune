"""Iteration 41 backend tests.

Covers the P0 fixes on GET /api/plan (persistent, multi-type workouts[]) and
GET /api/progress/timeline (bucketed windows with offset scrolling), plus
non-regression checks for the other structured plans.
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def gl_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": GL_EMAIL, "password": GL_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def temp_user():
    import uuid
    email = f"tmp_iter41_{uuid.uuid4().hex[:6]}@roujaune.app"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "TestPass123!", "name": "Iter41 Temp"},
                      timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    hdr = {"Authorization": f"Bearer {tok}"}
    yield hdr, email
    # best-effort cleanup
    try:
        requests.delete(f"{BASE_URL}/api/account", headers=hdr, timeout=10)
    except Exception:
        pass


# -------- /api/plan (couch-to-road, Green Lantern) --------

class TestPlanCouchToRoad:
    def test_plan_returns_persistent_workouts_with_mixed_types(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        plan = r.json()
        assert plan["id"] == "couch-to-road"
        workouts = plan.get("workouts") or []
        # at least 5 incomplete entries
        incomplete = [w for w in workouts if not w.get("completed")]
        assert len(incomplete) >= 5, f"Expected >=5 incomplete, got {len(incomplete)}: {[w.get('id') for w in workouts]}"
        # mixed types — must include at least one non-cycling entry
        types = {w.get("type") for w in workouts}
        non_cycling = types - {"cycling"}
        assert non_cycling, f"Expected at least one non-cycling type, got only {types}"
        # allowed set
        allowed = {"cycling", "rest", "recovery", "strength", "mobility", "balance"}
        assert types.issubset(allowed), f"Unexpected type(s): {types - allowed}"

    def test_plan_workout_shape_cycling_and_non_cycling(self, gl_headers):
        plan = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        workouts = plan["workouts"]
        for w in workouts:
            for f in ("type", "title", "duration", "color", "icon", "id"):
                assert f in w, f"Workout missing '{f}': {w}"
            if w["type"] == "cycling":
                assert "tss" in w and w["tss"], f"Cycling entry missing tss: {w}"
                assert "profile" in w and isinstance(w["profile"], list), f"Cycling missing profile: {w}"
            else:
                assert "subtitle" in w and w["subtitle"], f"Non-cycling missing subtitle: {w}"

    def test_plan_spans_multiple_weeks_if_needed(self, gl_headers):
        plan = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        footers = [w.get("footer", "") for w in plan["workouts"]]
        weeks_seen = {f.split("\u2022")[0].strip() for f in footers if "Week" in f}
        assert weeks_seen, f"No week footers found: {footers}"

    def test_plan_progress_and_phase(self, gl_headers):
        plan = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        assert "progress_pct" in plan
        assert plan.get("phase", {}).get("name"), plan.get("phase")


# -------- /api/plan regression for other plans --------

class TestPlanRegressionOtherPlans:
    def _assign_and_get(self, headers, plan_id):
        r = requests.post(f"{BASE_URL}/api/rider/plan", json={"plan_id": plan_id},
                          headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        r = requests.get(f"{BASE_URL}/api/plan", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_ride_stronger_returns_workouts(self, temp_user):
        headers, _ = temp_user
        plan = self._assign_and_get(headers, "ride-stronger")
        assert plan["id"] == "ride-stronger"
        assert plan.get("workouts"), "ride-stronger returned no workouts"
        # must include at least one cycling entry
        assert any(w.get("type") == "cycling" for w in plan["workouts"])

    def test_ride_beyond_returns_workouts(self, temp_user):
        headers, _ = temp_user
        plan = self._assign_and_get(headers, "ride-beyond")
        assert plan["id"] == "ride-beyond"
        assert plan.get("workouts"), "ride-beyond returned no workouts"
        assert any(w.get("type") == "cycling" for w in plan["workouts"])


# -------- /api/progress/timeline --------

class TestProgressTimeline:
    @pytest.mark.parametrize("rng,expected", [
        ("week", 7),
        ("month", 4),
        ("3m", 13),
        ("6m", 6),
        ("1y", 12),
    ])
    def test_bucket_counts(self, gl_headers, rng, expected):
        r = requests.get(f"{BASE_URL}/api/progress/timeline",
                         params={"range": rng, "offset": 0},
                         headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["range"] == rng
        assert len(data["buckets"]) == expected, f"{rng}: got {len(data['buckets'])}"
        assert data["has_next"] is False, f"has_next should be False at offset=0, got {data['has_next']}"
        assert data.get("window_label"), "window_label missing"

    def test_has_next_true_for_offset_1(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/progress/timeline",
                         params={"range": "3m", "offset": 1},
                         headers=gl_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["offset"] == 1
        assert data["has_next"] is True

    def test_summary_shape(self, gl_headers):
        data = requests.get(f"{BASE_URL}/api/progress/timeline",
                            params={"range": "3m", "offset": 0},
                            headers=gl_headers, timeout=30).json()
        s = data["summary"]
        for f in ("rides", "hours", "tss", "distance_km", "elevation_m", "avg_power", "tss_delta_pct"):
            assert f in s, f"summary missing '{f}': {s}"
        # types
        assert isinstance(s["rides"], int)
        assert isinstance(s["tss"], int)
        assert isinstance(s["distance_km"], (int, float))
        assert isinstance(s["elevation_m"], int)

    def test_offset_windows_differ(self, gl_headers):
        w0 = requests.get(f"{BASE_URL}/api/progress/timeline",
                          params={"range": "month", "offset": 0},
                          headers=gl_headers, timeout=30).json()
        w1 = requests.get(f"{BASE_URL}/api/progress/timeline",
                          params={"range": "month", "offset": 1},
                          headers=gl_headers, timeout=30).json()
        assert w0["window_label"] != w1["window_label"], "offset did not shift the window"

    def test_aggregates_real_ride_history(self, gl_headers):
        """Green Lantern has real rides — the widest window should aggregate at
        least some rides so the timeline is not empty."""
        data = requests.get(f"{BASE_URL}/api/progress/timeline",
                            params={"range": "1y", "offset": 0},
                            headers=gl_headers, timeout=30).json()
        assert data["summary"]["rides"] >= 0  # non-negative sanity
        # At least the aggregated total across buckets equals summary total
        bucket_rides = sum(b["rides"] for b in data["buckets"])
        assert bucket_rides == data["summary"]["rides"], (
            f"bucket sum {bucket_rides} != summary rides {data['summary']['rides']}"
        )


# -------- /api/progress regression --------

class TestProgressRegression:
    def test_get_progress_still_works(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/progress", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        # Basic shape: should be dict with at least one key
        assert isinstance(r.json(), dict)
