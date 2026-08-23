"""Iter25: Companion plan edits — chat-driven (Part A) and adaptive auto-ease (Part B).

Tests run against the public preview URL. They restore any real-plan edits at the end.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PLAN_ID = "couch-to-road"

# Pristine values (per problem statement)
PRISTINE_W1 = {1: "20 min", 3: "25 min", 5: "30 min"}
PRISTINE_W2 = {1: "25 min", 3: "30 min", 5: "35 min"}


def _mongo():
    return MongoClient("mongodb://localhost:27017")["test_database"]


def _get_plan():
    r = requests.get(f"{API}/plans/{PLAN_ID}", timeout=15)
    assert r.status_code == 200, f"GET /plans/{PLAN_ID} → {r.status_code}"
    return r.json()


def _day(plan, week_num, day_idx):
    for w in plan["weeks"]:
        if w["number"] == week_num:
            return w["days"][day_idx]
    raise AssertionError(f"week {week_num} not found")


def _patch_day(week_num, day_idx, patch):
    r = requests.patch(
        f"{API}/plans/{PLAN_ID}/weeks/{week_num}/days/{day_idx}",
        json={"patch": patch}, timeout=15,
    )
    assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"


def _restore_pristine():
    """Restore week1 & week2 cycling day durations to seeded values + clear eased_weeks."""
    for di, dur in PRISTINE_W1.items():
        _patch_day(1, di, {"duration": dur})
    for di, dur in PRISTINE_W2.items():
        _patch_day(2, di, {"duration": dur})
    db = _mongo()
    db.plan_state.update_one(
        {"id": PLAN_ID},
        {"$set": {"current_week": 1}, "$unset": {"eased_weeks": ""}},
        upsert=True,
    )


@pytest.fixture(scope="module", autouse=True)
def _restore_after_module():
    # Ensure clean baseline before running
    _restore_pristine()
    yield
    _restore_pristine()


# ---- PART A: chat-driven plan edit ----

class TestChatEdit:
    def test_a1_chat_edits_first_endurance_ride_to_20min(self):
        # Pre-check: week1 day5 duration is '30 min'
        plan_before = _get_plan()
        d5_before = _day(plan_before, 1, 5)
        assert d5_before["title"] == "First Endurance Ride"
        assert d5_before["duration"] == "30 min"

        body = {
            "coach_name": "Alberto",
            "coach_gender": "male",
            "coaching_style": "balanced",
            "message": "Please shorten my First Endurance Ride to 20 minutes to make this week easier.",
        }
        r = requests.post(f"{API}/coach/chat", json=body, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("plan_updated") is True, f"plan_updated missing/false: {data}"
        assert isinstance(data.get("plan_change"), str) and data["plan_change"].strip(), \
            f"empty plan_change: {data}"
        assert isinstance(data.get("reply"), str) and data["reply"].strip()

        # Verify plan was actually modified in DB
        plan_after = _get_plan()
        d5_after = _day(plan_after, 1, 5)
        assert d5_after["duration"] == "20 min", \
            f"expected '20 min' after chat edit, got {d5_after['duration']!r}"

        # Restore (so subsequent tests see pristine)
        _patch_day(1, 5, {"duration": "30 min"})
        plan_restored = _get_plan()
        assert _day(plan_restored, 1, 5)["duration"] == "30 min"

    def test_a2_status_question_does_not_edit_plan(self):
        # Snapshot week 1 durations
        plan_before = _get_plan()
        before = {i: _day(plan_before, 1, i)["duration"] for i in range(7)}

        body = {
            "coach_name": "Alberto",
            "coach_gender": "male",
            "coaching_style": "balanced",
            "message": "How is my training going?",
        }
        r = requests.post(f"{API}/coach/chat", json=body, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        # plan_updated must be falsy (False/absent)
        assert not data.get("plan_updated"), f"unexpected plan_updated=True: {data}"
        assert not (data.get("plan_change") or "").strip(), \
            f"unexpected plan_change: {data.get('plan_change')!r}"

        # Plan must be unchanged
        plan_after = _get_plan()
        after = {i: _day(plan_after, 1, i)["duration"] for i in range(7)}
        assert before == after, f"plan changed unexpectedly: {before} -> {after}"


# ---- PART B: adaptive auto-ease ----

class TestAutoEase:
    def test_b1_low_compliance_eases_week2_and_is_idempotent(self):
        # Ensure clean state: eased_weeks empty
        db = _mongo()
        db.plan_state.update_one(
            {"id": PLAN_ID},
            {"$set": {"current_week": 1}, "$unset": {"eased_weeks": ""}},
            upsert=True,
        )
        # Confirm baseline week2 durations
        plan_before = _get_plan()
        d_before = {i: _day(plan_before, 2, i)["duration"] for i in (1, 3, 5)}
        assert d_before[1] == "25 min", d_before
        assert d_before[3] == "30 min", d_before
        assert d_before[5] == "35 min", d_before

        body = {
            "workout": "Welcome Ride",
            "route": "Indoor",
            "duration_sec": 1200,
            "avg_power": 95,
            "tss": 15,
            "compliance": 55,
            "interval_compliance": 52,
            "coach_name": "Alberto",
            "coach_gender": "male",
            "zones": [{"z": "Z1", "pct": 60}, {"z": "Z2", "pct": 40}],
        }
        r = requests.post(f"{API}/coach/debrief", json=body, timeout=90)
        assert r.status_code == 200, f"debrief: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data.get("debrief"), str) and data["debrief"].strip()

        # Wait for background task to run auto-ease
        deadline = time.time() + 20
        eased_ok = False
        while time.time() < deadline:
            time.sleep(2)
            state = db.plan_state.find_one({"id": PLAN_ID}) or {}
            if 2 in (state.get("eased_weeks") or []):
                eased_ok = True
                break
        assert eased_ok, f"week 2 was never eased. plan_state={db.plan_state.find_one({'id': PLAN_ID})}"

        plan_after = _get_plan()
        d_after = {i: _day(plan_after, 2, i)["duration"] for i in (1, 3, 5)}
        # Expected: 25→22, 30→27, 35→32 (round(mins*0.9))
        assert d_after[1] == "22 min", f"day1 expected 22 min, got {d_after[1]}"
        assert d_after[3] == "27 min", f"day3 expected 27 min, got {d_after[3]}"
        assert d_after[5] == "32 min", f"day5 expected 32 min, got {d_after[5]}"

        # Second identical debrief must NOT ease week 2 again (idempotent)
        r2 = requests.post(f"{API}/coach/debrief", json=body, timeout=90)
        assert r2.status_code == 200, f"debrief2: {r2.status_code} {r2.text}"
        time.sleep(8)
        plan_third = _get_plan()
        d_third = {i: _day(plan_third, 2, i)["duration"] for i in (1, 3, 5)}
        assert d_third == d_after, f"idempotency broken: {d_after} -> {d_third}"

        # eased_weeks still contains 2 (only)
        state = db.plan_state.find_one({"id": PLAN_ID}) or {}
        assert 2 in (state.get("eased_weeks") or [])
