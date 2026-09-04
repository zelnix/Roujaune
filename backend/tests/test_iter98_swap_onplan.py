"""Iter 98 — Swap On Plan Screen (backend integration).

Focused smoke: create+accept a custom plan, hit POST /api/coach/swap-session
with the custom plan_id, verify /api/plan reflects the persisted change and
that an adaptation entry was recorded. Cleanup restores demo to build-and-climb.
"""
import os
import re
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
EMAIL = "demo@roujaune.app"
PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _num(v):
    if isinstance(v, (int, float)):
        return int(v)
    m = re.search(r"\d+", str(v or ""))
    return int(m.group(0)) if m else 0


@pytest.fixture(scope="module")
def custom_plan(headers):
    payload = {"coach_name": "Alberto", "coach_gender": "male", "goal": "iter98 swap test", "weeks": 2, "days_per_week": 3}
    r = requests.post(f"{BASE}/api/coach/create-plan", json=payload, headers=headers, timeout=120)
    assert r.status_code == 200, r.text
    preview = r.json().get("plan") or r.json()
    r2 = requests.post(f"{BASE}/api/coach/create-plan/accept", json={"plan": preview, "coach_name": "Alberto"}, headers=headers, timeout=60)
    assert r2.status_code == 200, r2.text
    plan_id = r2.json()["plan_id"]
    assert plan_id.startswith("custom-")
    yield plan_id
    # cleanup restored in final test


def _first_cycling(headers):
    r = requests.get(f"{BASE}/api/plan", headers=headers, timeout=30)
    assert r.status_code == 200
    plan = r.json()
    for w in plan.get("workouts", []):
        if (w.get("type") or "").lower() == "cycling":
            return plan, w
    pytest.fail("No cycling workout found in custom plan")


def test_swap_easier_persists(custom_plan, headers):
    plan, wo = _first_cycling(headers)
    wid = wo.get("id") or wo.get("workout_id")
    before_load = _num(wo.get("tss"))
    body = {"coach_name": "Alberto", "coach_gender": "male", "goal": "iter98", "day": {"title": wo.get("title"), "zone": wo.get("zone"), "duration": wo.get("duration"), "tss": wo.get("tss"), "workout_id": wid}, "mode": "easier", "plan_id": custom_plan}
    r = requests.post(f"{BASE}/api/coach/swap-session", json=body, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    new_day = r.json().get("day", r.json())
    assert new_day.get("title")
    # verify persisted via GET /api/plan
    _, wo2 = _first_cycling(headers)
    after_load = _num(wo2.get("tss"))
    # 'easier' should not raise load
    assert after_load <= before_load + 5, f"Easier swap should lower/equal load: {before_load} -> {after_load}"


def test_swap_recorded_in_adaptations(custom_plan, headers):
    r = requests.get(f"{BASE}/api/plan/adaptations", params={"coach_name": "Alberto"}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    payload = r.json()
    items = payload.get("adaptations") if isinstance(payload, dict) else payload
    assert isinstance(items, list) and len(items) >= 1
    latest = items[0]
    assert "text" in latest and "trigger" in latest


def test_swap_rejects_noncustom_plan_change(headers):
    # A non-custom plan_id should not be mutated by swap. Send build-and-climb — endpoint
    # accepts (returns a swapped day payload) but must NOT persist into /api/plan.
    r = requests.get(f"{BASE}/api/plan", headers=headers, timeout=30)
    before = r.json()
    body = {"coach_name": "Alberto", "coach_gender": "male", "goal": "iter98", "day": {"title": "Test", "zone": "Z3", "duration": "45 min", "tss": 50, "workout_id": "build-and-climb-something"}, "mode": "harder", "plan_id": "build-and-climb"}
    r2 = requests.post(f"{BASE}/api/coach/swap-session", json=body, headers=headers, timeout=60)
    # accept 200 (swap returns day) — we just verify plan didn't change
    assert r2.status_code in (200, 400)
    r3 = requests.get(f"{BASE}/api/plan", headers=headers, timeout=30)
    after = r3.json()
    # Compare workout IDs; unchanged for non-custom
    b_ids = [w.get("id") for w in before.get("workouts", [])]
    a_ids = [w.get("id") for w in after.get("workouts", [])]
    assert b_ids == a_ids


def test_restore_demo_plan(headers):
    r = requests.post(f"{BASE}/api/rider/plan", json={"plan_id": "build-and-climb"}, headers=headers, timeout=30)
    assert r.status_code == 200
    # cleanup: delete any templates created during previous UI runs
    tpls = requests.get(f"{BASE}/api/coach/plan-templates", headers=headers, timeout=30).json()
    for t in (tpls or []):
        if isinstance(t, dict) and t.get("id"):
            requests.delete(f"{BASE}/api/coach/plan-templates/{t['id']}", headers=headers, timeout=30)
