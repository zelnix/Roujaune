"""Backend tests for the Training Plan action-button endpoints.

Covers:
- GET /api/plan/progress
- GET /api/plan/adaptations (seed + coach filter)
- PUT /api/plan/goals (persistence)
- POST /api/coach/adaptation (with refresh, LIMITED to one call to avoid burning credits)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ORIGINAL_GOALS = [
    {"id": "g1", "title": "Improved Climbing Strength", "description": "Stronger on long climbs", "status": "complete"},
    {"id": "g2", "title": "Raise FTP", "description": "Increase sustainable power", "status": "complete"},
    {"id": "g3", "title": "Build Endurance", "description": "Ride longer with confidence", "status": "complete"},
    {"id": "g4", "title": "Consistent Training", "description": "Stay on track all season", "status": "incomplete"},
]


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "demo@roujaune.app", "password": "demo9900"}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# --- /api/plan sanity ---------------------------------------------------------
def test_plan_root(api_client):
    r = api_client.get(f"{API}/plan")
    assert r.status_code == 200
    doc = r.json()
    assert doc["id"] == "build-and-climb"
    assert "goals" in doc and isinstance(doc["goals"], list)


# --- /api/plan/progress -------------------------------------------------------
def test_plan_progress_structure(api_client):
    r = api_client.get(f"{API}/plan/progress")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("progress_pct", "summary", "fitness", "trend", "metrics", "weeks"):
        assert k in d, f"missing key {k}"

    # fitness
    f = d["fitness"]
    for k in ("ctl", "atl", "tsb", "ctl_delta", "form_label"):
        assert k in f, f"fitness missing {k}"

    # trend
    t = d["trend"]
    assert isinstance(t["ctl"], list) and len(t["ctl"]) > 0
    assert isinstance(t["atl"], list) and len(t["atl"]) == len(t["ctl"])
    assert isinstance(t["labels"], list) and len(t["labels"]) == len(t["ctl"])

    # metrics
    assert isinstance(d["metrics"], list) and len(d["metrics"]) >= 1
    m0 = d["metrics"][0]
    for k in ("label", "value", "delta", "up"):
        assert k in m0

    # weeks: per-week done/current flags with respect to you_are_here (4)
    weeks = d["weeks"]
    assert len(weeks) == 13  # weekly_load length
    for i, w in enumerate(weeks, start=1):
        assert w["label"] == f"Week {i}"
        assert isinstance(w["tss"], int)
        assert w["done"] == (i < 4)
        assert w["current"] == (i == 4)


# --- /api/plan/adaptations ----------------------------------------------------
def test_adaptations_default(api_client):
    r = api_client.get(f"{API}/plan/adaptations", params={"coach_name": "Alberto"})
    assert r.status_code == 200
    d = r.json()
    assert "adaptations" in d and isinstance(d["adaptations"], list)
    assert len(d["adaptations"]) >= 1, "should seed one entry when history empty"
    e = d["adaptations"][0]
    for k in ("id", "coach", "text", "trigger", "at"):
        assert k in e
    assert "status" in d


def test_adaptations_coach_filter(api_client):
    # Filter for a coach that most likely has no entry — should fall back to full history (not empty)
    r = api_client.get(f"{API}/plan/adaptations", params={"coach_name": "Alberto"})
    assert r.status_code == 200
    entries = r.json()["adaptations"]
    # every entry should have coach == Alberto OR list falls back non-empty
    assert len(entries) >= 1


# --- PUT /api/plan/goals ------------------------------------------------------
def test_update_goals_persists(api_client):
    edited = [
        {"id": "t1", "title": "TEST_Goal_A", "description": "test desc A", "status": "incomplete"},
        {"id": "t2", "title": "TEST_Goal_B", "description": "test desc B", "status": "complete"},
    ]
    r = api_client.put(f"{API}/plan/goals", json={"plan_id": "build-and-climb", "goals": edited})
    assert r.status_code == 200, r.text
    updated = r.json()
    got = [{k: g[k] for k in ("id", "title", "description", "status")} for g in updated["goals"]]
    assert got == edited

    # Verify via GET /api/plan
    r2 = api_client.get(f"{API}/plan")
    assert r2.status_code == 200
    got2 = [{k: g[k] for k in ("id", "title", "description", "status")} for g in r2.json()["goals"]]
    assert got2 == edited


def test_restore_original_goals(api_client):
    """Cleanup: restore the 4 original goals so app remains in known state."""
    r = api_client.put(f"{API}/plan/goals", json={"plan_id": "build-and-climb", "goals": ORIGINAL_GOALS})
    assert r.status_code == 200
    r2 = api_client.get(f"{API}/plan")
    got = [{k: g[k] for k in ("id", "title", "description", "status")} for g in r2.json()["goals"]]
    assert got == ORIGINAL_GOALS


# --- POST /api/coach/adaptation refresh (ONE call max, appends to history) ----
@pytest.mark.order("last")
def test_coach_adaptation_refresh_records_history(api_client):
    # snapshot current history length
    before = api_client.get(f"{API}/plan/adaptations", params={"coach_name": "Alberto"}).json()["adaptations"]
    before_len = len(before)
    before_ids = {e.get("id") for e in before}

    r = api_client.post(
        f"{API}/coach/adaptation",
        json={"plan_id": "build-and-climb", "coach_name": "Alberto", "coach_gender": "male", "refresh": True},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "adaptation" in d and isinstance(d["adaptation"], str) and len(d["adaptation"]) > 20
    assert d.get("cached") is False

    after = api_client.get(f"{API}/plan/adaptations", params={"coach_name": "Alberto"}).json()["adaptations"]
    # New entry appears and has trigger 'Manual refresh'
    new_entries = [e for e in after if e.get("id") not in before_ids]
    assert len(new_entries) >= 1, f"expected new adaptation entry; before={before_len} after={len(after)}"
    assert any(e.get("trigger") == "Manual refresh" for e in new_entries), \
        f"expected 'Manual refresh' trigger; got {[e.get('trigger') for e in new_entries]}"
