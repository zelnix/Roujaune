"""Backend tests for workout favorites + calendar scheduling (iteration 16).

Covers:
- GET/POST /api/workout-favorites[/toggle] persistence + toggle behavior.
- POST /api/calendar/schedule + GET /api/calendar/scheduled persistence.
- GET /api/calendar/week attaches scheduled entries to the matching day.
- DELETE /api/calendar/scheduled/{id} removes the entry.
- GET /api/workouts/{id}?workoutId=... indirectly via HUD (not applicable to backend);
  we only test backend-persisted state.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "demo@roujaune.app", "password": "demo9900"}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# --- helpers ---------------------------------------------------------------
def _cleanup_favorite(client, wid):
    favs = client.get(f"{BASE_URL}/api/workout-favorites").json().get("favorites", [])
    if wid in favs:
        client.post(f"{BASE_URL}/api/workout-favorites/toggle", json={"workout_id": wid})


def _cleanup_scheduled(client, entry_id):
    if entry_id:
        client.delete(f"{BASE_URL}/api/calendar/scheduled/{entry_id}")


# --- favorites -------------------------------------------------------------
class TestWorkoutFavorites:
    def test_toggle_add_then_get_persists(self, api_client):
        wid = "TEST_endurance-ride"
        _cleanup_favorite(api_client, wid)
        try:
            r = api_client.post(f"{BASE_URL}/api/workout-favorites/toggle",
                                json={"workout_id": wid})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["favorited"] is True
            assert wid in data["favorites"]

            g = api_client.get(f"{BASE_URL}/api/workout-favorites")
            assert g.status_code == 200
            assert wid in g.json()["favorites"]
        finally:
            _cleanup_favorite(api_client, wid)

    def test_toggle_removes_when_already_favorited(self, api_client):
        wid = "TEST_toggle-remove"
        # Add
        api_client.post(f"{BASE_URL}/api/workout-favorites/toggle",
                        json={"workout_id": wid})
        # Remove
        r = api_client.post(f"{BASE_URL}/api/workout-favorites/toggle",
                            json={"workout_id": wid})
        assert r.status_code == 200
        data = r.json()
        assert data["favorited"] is False
        assert wid not in data["favorites"]

        g = api_client.get(f"{BASE_URL}/api/workout-favorites").json()
        assert wid not in g["favorites"]


# --- scheduled workouts ----------------------------------------------------
class TestCalendarScheduling:
    def test_schedule_persists_and_appears_in_week(self, api_client):
        payload = {
            "workout_id": "TEST_vo2-max-intervals",
            "workout_name": "TEST VO2 Max Intervals",
            "duration": "1h 05m",
            "tss": "88 TSS",
            "zone": "Z5",
            "color": "rouge",
            "date": "2025-05-13",
        }
        r = api_client.post(f"{BASE_URL}/api/calendar/schedule", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        entry = body["entry"]
        entry_id = entry["id"]
        assert entry["title"] == payload["workout_name"]
        assert entry["date"] == payload["date"]
        assert entry["status"] == "scheduled"

        try:
            # GET /calendar/scheduled must include it
            g = api_client.get(f"{BASE_URL}/api/calendar/scheduled").json()
            ids = [d["id"] for d in g["scheduled"]]
            assert entry_id in ids, f"scheduled list missing {entry_id}: {ids}"

            # GET /calendar/week must attach it to the 2025-05-13 day
            w = api_client.get(f"{BASE_URL}/api/calendar/week?start=2025-05-12").json()
            day = next(d for d in w["days"] if d["date"] == "2025-05-13")
            assert "scheduled" in day
            day_ids = [s["id"] for s in day["scheduled"]]
            assert entry_id in day_ids
        finally:
            _cleanup_scheduled(api_client, entry_id)

    def test_delete_scheduled_removes_from_week(self, api_client):
        # Create
        r = api_client.post(f"{BASE_URL}/api/calendar/schedule", json={
            "workout_id": "TEST_delete-me",
            "workout_name": "TEST Delete Me",
            "date": "2025-05-15",
        })
        entry_id = r.json()["entry"]["id"]

        # Delete
        d = api_client.delete(f"{BASE_URL}/api/calendar/scheduled/{entry_id}")
        assert d.status_code == 200
        assert d.json()["ok"] is True

        # Verify removed
        g = api_client.get(f"{BASE_URL}/api/calendar/scheduled").json()
        assert entry_id not in [x["id"] for x in g["scheduled"]]

        # And no longer attached to any day
        w = api_client.get(f"{BASE_URL}/api/calendar/week?start=2025-05-12").json()
        for day in w["days"]:
            assert entry_id not in [s["id"] for s in day.get("scheduled", [])]
