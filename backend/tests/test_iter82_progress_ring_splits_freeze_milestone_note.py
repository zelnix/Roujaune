"""Iter 82 features:
1. Milestone Progress Ring — /api/analysis/milestones returns prev_rides/rides_progress/prev_km/km_progress
2. Climb Detail Splits — /api/analysis/climb-detail?id=climb-45.2-6.1108 returns splits (len 4), each with fastest
3. Streak Freeze — /api/analysis/streak returns non-null JSON incl. freeze_tokens/frozen_weeks/can_freeze/gap_week
   (regression: duplicate-route stub that returned null was removed)
4. Streak Freeze POST — /api/analysis/streak-freeze on demo returns {ok:false, reason:'nothing_to_freeze'} (not 500)
5. Coach Milestone Shout-out — /api/coach/milestone-note (demo, no recent milestone) returns {has_milestone:false} (not 500)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://roujaune-train.preview.emergentagent.com",
).rstrip("/")


def _login(email: str, password: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_headers():
    return _login("demo@roujaune.app", "demo9900")


# ---- 1. Milestone Progress Ring ----
class TestMilestonesProgressRing:
    def test_milestones_returns_prev_and_progress_fields(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/milestones", headers=demo_headers, timeout=30
        )
        assert r.status_code == 200, r.text[:300]
        b = r.json()

        # New fields for the progress ring
        for k in ("prev_rides", "rides_progress", "prev_km", "km_progress"):
            assert k in b, f"missing new field {k}"

        # Existing totals/next should still be present
        for k in ("total_rides", "total_km", "next_rides", "next_km"):
            assert k in b, f"missing existing field {k}"

        # Progress is normalised 0..1
        rp = b["rides_progress"]
        kp = b["km_progress"]
        assert isinstance(rp, (int, float)) and 0.0 <= float(rp) <= 1.0, f"rides_progress out of 0..1: {rp}"
        assert isinstance(kp, (int, float)) and 0.0 <= float(kp) <= 1.0, f"km_progress out of 0..1: {kp}"

        # prev < total <= next (demo: total_rides=2, prev=0, next=10)
        assert b["prev_rides"] <= b["total_rides"], f"prev_rides > total_rides: {b}"
        assert b["prev_km"] <= b["total_km"], f"prev_km > total_km: {b}"
        # Demo should specifically be prev_rides=0 (below first milestone 10)
        assert b["prev_rides"] == 0, f"demo prev_rides should be 0, got {b['prev_rides']}"


# ---- 2. Climb Detail Splits ----
class TestClimbDetailSplits:
    def test_splits_shape_and_fastest_per_split(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/climb-detail",
            headers=demo_headers,
            params={"id": "climb-45.2-6.1108"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert b.get("found") is True, f"expected found=True, got {b}"

        splits = b.get("splits")
        assert isinstance(splits, list), f"splits missing/not list: {type(splits)}"
        assert len(splits) == 4, f"expected 4 splits, got {len(splits)}"

        # Gather activity_ids from attempts to validate times keys / fastest
        att_ids = {a["activity_id"] for a in b.get("attempts", [])}
        assert len(att_ids) == 2, f"expected 2 attempts, got {len(att_ids)}"

        for i, s in enumerate(splits, start=1):
            assert s.get("index") == i, f"split {i} bad index: {s}"
            assert "from_d" in s and isinstance(s["from_d"], (int, float)), f"split {i} bad from_d"
            assert "to_d" in s and isinstance(s["to_d"], (int, float)), f"split {i} bad to_d"
            assert s["to_d"] > s["from_d"], f"split {i}: to_d must be > from_d, got {s}"

            times = s.get("times")
            assert isinstance(times, dict), f"split {i} times not a dict: {times}"
            # Both attempts have a numeric time for this split
            for aid in att_ids:
                assert aid in times, f"split {i}: attempt {aid} missing from times {times}"
                assert isinstance(times[aid], (int, float)), (
                    f"split {i} time for {aid} not numeric: {times[aid]}"
                )

            fastest = s.get("fastest")
            assert fastest in att_ids, f"split {i} fastest not a valid activity_id: {fastest}"
            # fastest must correspond to the min time in this split
            min_time = min(times.values())
            assert times[fastest] == min_time, (
                f"split {i} fastest={fastest} time={times[fastest]} not equal min {min_time}"
            )


# ---- 3. Streak returns full object (regression: duplicate stub returning null was removed) ----
class TestStreakNonNull:
    def test_streak_returns_full_object_not_null(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/streak", headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        # Body must be non-null JSON object
        assert r.text.strip() not in ("null", ""), f"body is null/empty: {r.text[:200]}"
        b = r.json()
        assert isinstance(b, dict) and b is not None, f"expected dict, got {type(b)}: {b}"

        # Freeze-related fields
        assert "freeze_tokens" in b, "missing freeze_tokens"
        assert isinstance(b["freeze_tokens"], int) and b["freeze_tokens"] >= 0, (
            f"freeze_tokens must be int>=0, got {b['freeze_tokens']!r}"
        )
        assert "frozen_weeks" in b, "missing frozen_weeks"
        assert isinstance(b["frozen_weeks"], int) and b["frozen_weeks"] >= 0, (
            f"frozen_weeks must be int>=0, got {b['frozen_weeks']!r}"
        )
        assert "can_freeze" in b, "missing can_freeze"
        assert isinstance(b["can_freeze"], bool), f"can_freeze must be bool, got {type(b['can_freeze'])}"
        assert "gap_week" in b, "missing gap_week"
        assert isinstance(b["gap_week"], str) and b["gap_week"], f"gap_week must be non-empty str, got {b['gap_week']!r}"


# ---- 4. POST /api/analysis/streak-freeze on demo (nothing to bridge) ----
class TestStreakFreezeNothingToFreeze:
    def test_demo_returns_nothing_to_freeze_not_500(self, demo_headers):
        r = requests.post(
            f"{BASE_URL}/api/analysis/streak-freeze",
            headers=demo_headers,
            json={},
            timeout=30,
        )
        assert r.status_code == 200, (
            f"expected 200 not {r.status_code}: {r.text[:200]}"
        )
        b = r.json()
        assert b.get("ok") is False, f"expected ok=False, got {b}"
        # Accept nothing_to_freeze or no_tokens depending on demo state
        assert b.get("reason") in ("nothing_to_freeze", "no_tokens"), (
            f"unexpected reason: {b}"
        )


# ---- 5. Coach Milestone Shout-out (demo, no recent milestone -> has_milestone:false) ----
class TestCoachMilestoneNoteNoMilestone:
    def test_no_recent_milestone_returns_has_milestone_false(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/coach/milestone-note",
            headers=demo_headers,
            params={"coach_name": "Alberto", "coach_gender": "male"},
            timeout=30,
        )
        assert r.status_code == 200, (
            f"expected 200 not {r.status_code}: {r.text[:200]}"
        )
        b = r.json()
        assert b.get("has_milestone") is False, f"expected has_milestone=False, got {b}"
