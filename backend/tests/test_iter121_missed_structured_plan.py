"""Iteration 121 — Task 1: 'Missed On Plan' feature.
Tests GET /api/rider/missed (adhoc + structured-plan missed rides) and
POST /api/rider/missed/resolve (skip / reschedule) for structured-plan
entries (id shaped 'plan:<plan_id>:<workout_id>') as well as regression
for the pre-existing ad-hoc flow.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

def _load_backend_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE_URL = _load_backend_url()
RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Login failed for {RIDER_EMAIL}: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    return session


class TestRiderMissedBasic:
    """GET /api/rider/missed must always return 200 + valid JSON shape."""

    def test_missed_returns_200_and_valid_shape(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/rider/missed")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "missed" in data
        assert isinstance(data["missed"], list)
        assert "suggested_date" in data
        assert "guidance" in data

    def test_missed_items_shape(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/rider/missed")
        assert resp.status_code == 200
        data = resp.json()
        for item in data["missed"]:
            assert "id" in item
            assert "date" in item
            assert "title" in item
            assert "kind" in item
            assert item["kind"] in ("adhoc", "structured")


class TestStructuredMissedResolve:
    """Skip/Reschedule for a structured-plan missed entry (entry_id 'plan:...')."""

    def _find_structured_entry(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/rider/missed")
        assert resp.status_code == 200
        data = resp.json()
        for item in data["missed"]:
            if item["kind"] == "structured" and item["id"].startswith("plan:"):
                return item
        return None

    def test_skip_structured_entry_removes_from_missed(self, api_client):
        entry = self._find_structured_entry(api_client)
        if not entry:
            pytest.skip("No naturally-occurring past-due structured-plan missed entry found with current seed data — "
                        "verified GET /api/rider/missed still returns 200 valid JSON (see TestRiderMissedBasic).")
        entry_id = entry["id"]
        resp = api_client.post(f"{BASE_URL}/api/rider/missed/resolve", json={"entry_id": entry_id, "action": "skip"})
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("ok") is True

        # Verify it no longer appears in a subsequent GET
        resp2 = api_client.get(f"{BASE_URL}/api/rider/missed")
        assert resp2.status_code == 200
        ids = [m["id"] for m in resp2.json()["missed"]]
        assert entry_id not in ids

    def test_reschedule_structured_entry_appears_in_calendar(self, api_client):
        entry = self._find_structured_entry(api_client)
        if not entry:
            pytest.skip("No naturally-occurring past-due structured-plan missed entry found with current seed data.")
        entry_id = entry["id"]
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        resp = api_client.post(
            f"{BASE_URL}/api/rider/missed/resolve",
            json={"entry_id": entry_id, "action": "reschedule", "date": tomorrow},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("ok") is True
        assert body.get("date") == tomorrow

        # Verify it no longer appears in missed
        resp2 = api_client.get(f"{BASE_URL}/api/rider/missed")
        ids = [m["id"] for m in resp2.json()["missed"]]
        assert entry_id not in ids

        # Verify calendar/week for tomorrow shows a rider-scheduled entry
        resp3 = api_client.get(f"{BASE_URL}/api/calendar/week", params={"date": tomorrow})
        assert resp3.status_code == 200
        week = resp3.json()
        day = next((d for d in week.get("days", []) if d["date"] == tomorrow), None)
        assert day is not None
        assert len(day.get("scheduled", [])) > 0

    def test_invalid_entry_id_format(self, api_client):
        resp = api_client.post(
            f"{BASE_URL}/api/rider/missed/resolve",
            json={"entry_id": "plan:badformat", "action": "skip"},
        )
        assert resp.status_code == 400

    def test_invalid_action(self, api_client):
        resp = api_client.post(
            f"{BASE_URL}/api/rider/missed/resolve",
            json={"entry_id": "plan:couch-to-road:ctr-ride-1", "action": "bogus"},
        )
        assert resp.status_code == 400


class TestAdhocMissedRegression:
    """Regression: existing ad-hoc missed-workout skip/reschedule flow (entry_id NOT plan:*)."""

    def _create_missed_adhoc(self, api_client):
        past_date = (date.today() - timedelta(days=3)).isoformat()
        entry_id = uuid.uuid4().hex
        # Directly test via schedule + can't set date in the past via API? use schedule endpoint then patch date.
        resp = api_client.post(f"{BASE_URL}/api/calendar/schedule", json={
            "workout_id": "TEST_missed_adhoc", "workout_name": "TEST Missed Adhoc Ride",
            "duration": "30 min", "tss": "20", "zone": "Z2", "color": "green", "date": past_date,
        })
        assert resp.status_code == 200
        entry = resp.json()["entry"]
        return entry

    def test_adhoc_missed_skip_flow(self, api_client):
        entry = self._create_missed_adhoc(api_client)
        entry_id = entry["id"]
        try:
            resp = api_client.get(f"{BASE_URL}/api/rider/missed")
            assert resp.status_code == 200
            ids = [m["id"] for m in resp.json()["missed"]]
            assert entry_id in ids, "Newly-created past-due ad-hoc workout should appear in /rider/missed"

            resp2 = api_client.post(f"{BASE_URL}/api/rider/missed/resolve", json={"entry_id": entry_id, "action": "skip"})
            assert resp2.status_code == 200
            assert resp2.json().get("ok") is True

            resp3 = api_client.get(f"{BASE_URL}/api/rider/missed")
            ids3 = [m["id"] for m in resp3.json()["missed"]]
            assert entry_id not in ids3
        finally:
            api_client.delete(f"{BASE_URL}/api/calendar/scheduled/{entry_id}")

    def test_adhoc_missed_reschedule_flow(self, api_client):
        entry = self._create_missed_adhoc(api_client)
        entry_id = entry["id"]
        try:
            tomorrow = (date.today() + timedelta(days=1)).isoformat()
            resp = api_client.post(
                f"{BASE_URL}/api/rider/missed/resolve",
                json={"entry_id": entry_id, "action": "reschedule", "date": tomorrow},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body.get("ok") is True
            assert body.get("date") == tomorrow

            # Verify GET on the entry now shows new date/status
            resp2 = api_client.get(f"{BASE_URL}/api/calendar/scheduled")
            docs = resp2.json()["scheduled"]
            moved = next((d for d in docs if d["id"] == entry_id), None)
            assert moved is not None
            assert moved["date"] == tomorrow
            assert moved["status"] == "scheduled"
            assert moved.get("rescheduled_from") == entry["date"]
        finally:
            api_client.delete(f"{BASE_URL}/api/calendar/scheduled/{entry_id}")
