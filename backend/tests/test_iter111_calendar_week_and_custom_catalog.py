"""Iteration 111 backend tests.

Covers:
  - /api/calendar/week: date-focused week resolution
      * ?date inside the demo/plan week -> that plan week (start_date matches)
      * ?date outside plan week -> a free week (free:true) starting Monday of that date
      * default (no date) -> unchanged (plan or demo week)
  - /api/catalog custom-workout lifecycle
      * POST /api/catalog -> workout.id starts with 'custom-', custom:true
      * GET /api/catalog -> includes the new custom workout
      * DELETE /api/catalog/{id}/reset -> removes it (subsequent GET does not include it)
"""
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
    or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
)

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def h(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------- /api/calendar/week ----------------

class TestCalendarWeek:
    def test_default_week_no_date(self, h):
        r = requests.get(f"{BASE_URL}/api/calendar/week", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert "start_date" in doc and "days" in doc
        assert isinstance(doc["days"], list) and len(doc["days"]) == 7

    def test_date_inside_demo_plan_week_returns_plan_week(self, h):
        # Demo rider (build-and-climb) has plan week starting 2025-05-12.
        r = requests.get(
            f"{BASE_URL}/api/calendar/week",
            params={"date": "2025-05-14"},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("start_date") == "2025-05-12", doc
        # Demo/plan week should NOT be flagged as a free week.
        assert not doc.get("free"), f"expected plan week, got free=True: {doc}"
        assert len(doc.get("days", [])) == 7

    def test_date_outside_plan_returns_free_week_mon_start(self, h):
        # Pick a date well outside 2025-05-12..18 -> free week
        target = "2026-03-11"  # a Wednesday
        r = requests.get(
            f"{BASE_URL}/api/calendar/week",
            params={"date": target},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("free") is True, f"expected free:true, got {doc}"
        # Monday of 2026-03-11 is 2026-03-09
        y, m, d = (int(x) for x in target.split("-"))
        td = date(y, m, d)
        mon = td - timedelta(days=td.weekday())
        assert doc.get("start_date") == mon.isoformat(), (
            f"expected start_date={mon.isoformat()}, got {doc.get('start_date')}"
        )
        assert len(doc.get("days", [])) == 7
        # Days array should span Monday..Sunday
        first = doc["days"][0].get("date")
        last = doc["days"][-1].get("date")
        assert first == mon.isoformat()
        assert last == (mon + timedelta(days=6)).isoformat()

    def test_date_monday_of_target(self, h):
        # If date is already a Monday, start_date must equal that Monday.
        target = "2027-01-04"  # Monday
        r = requests.get(
            f"{BASE_URL}/api/calendar/week",
            params={"date": target},
            headers=h,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("free") is True
        assert doc.get("start_date") == target


# ---------------- /api/catalog custom-workout lifecycle ----------------

class TestCustomCatalog:
    def test_custom_workout_lifecycle(self, h):
        # 1) Create
        payload = {
            "name": "TEST_Custom Sweet Spot",
            "typeId": "custom",
            "typeName": "Custom",
            "segmentSpec": [
                {"minutes": 10, "pctFtp": 60, "zone": "Z2"},
                {"minutes": 20, "pctFtp": 88, "zone": "Z3"},
                {"minutes": 10, "pctFtp": 55, "zone": "Z1"},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/catalog", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        w = body.get("workout") or {}
        wid = w.get("id")
        assert wid and wid.startswith("custom-"), f"bad id: {wid}"
        assert w.get("custom") is True
        assert w.get("name") == payload["name"]

        # 2) GET catalog includes it
        r = requests.get(f"{BASE_URL}/api/catalog", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        items = (r.json() or {}).get("items") or []
        ids = [it.get("id") for it in items]
        assert wid in ids, f"custom workout {wid} missing from catalog ids={ids[:20]}..."
        mine = next(it for it in items if it.get("id") == wid)
        assert mine.get("custom") is True
        assert mine.get("name") == payload["name"]

        # 3) DELETE (reset) removes it
        r = requests.delete(
            f"{BASE_URL}/api/catalog/{wid}/reset", headers=h, timeout=20
        )
        assert r.status_code == 200, r.text
        rj = r.json()
        assert rj.get("reset") == wid
        # reverted True since the custom workout existed only for the rider.
        assert rj.get("reverted") is True

        # 4) GET catalog no longer includes it
        r = requests.get(f"{BASE_URL}/api/catalog", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        items = (r.json() or {}).get("items") or []
        ids = [it.get("id") for it in items]
        assert wid not in ids, f"custom workout {wid} still present after delete"

    def test_create_custom_requires_name(self, h):
        r = requests.post(
            f"{BASE_URL}/api/catalog",
            json={"name": "   "},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400
