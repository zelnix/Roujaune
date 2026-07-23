"""Pytest coverage for the new Calendar + Plan-adaptation features.

Tests hit the PUBLIC ingress URL (EXPO_PUBLIC_BACKEND_URL) so we exercise the
same path the mobile client does.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─────────────── Calendar: week ───────────────
class TestCalendarWeek:
    def test_get_week_returns_full_shape(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week", params={"start": "2025-05-12"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == "2025-05-12"
        assert d["end_date"] == "2025-05-18"
        assert d["range_label"].strip() != ""
        assert isinstance(d["days"], list) and len(d["days"]) == 7
        # every day has the 4 required slots
        for day in d["days"]:
            assert set(["date", "day_name", "day_num", "focus", "readiness"]).issubset(day.keys())
            for k in ("cycling", "fb50", "wellness"):
                assert k in day  # value may be None once a session is moved out
            assert "score" in day["readiness"] and "status" in day["readiness"]
        # Tuesday reference session
        tue = d["days"][1]
        assert tue["day_name"] == "TUE"
        # cycling may have been moved by an earlier test run — accept either
        if tue["cycling"]:
            assert tue["cycling"]["title"] in ("Threshold Climb",)
            assert tue["cycling"]["tss"] == "92 TSS"
        # summary + tip
        s = d["summary"]
        assert s["workouts_completed"] == 5 and s["workouts_planned"] == 7
        assert s["tss"] == "287"
        assert len(s["zones"]) == 5 and all("pct" in z for z in s["zones"])
        assert isinstance(d.get("tip"), str) and len(d["tip"]) > 0

    def test_no_mongo_objectid_leak(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week", timeout=15)
        assert r.status_code == 200
        assert "_id" not in r.json()


# ─────────────── Calendar: move + review ───────────────
class TestCalendarMove:
    def test_move_and_verify_persists_and_returns_updated_week(self, api):
        # move Wed cycling to Sun, then move back to keep the seed reasonable
        params = {
            "week_start": "2025-05-12",
            "session_type": "cycling",
            "from_date": "2025-05-14",
            "to_date": "2025-05-18",
        }
        r = api.post(f"{BASE_URL}/api/calendar/move", json=params, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        sun = next(x for x in d["days"] if x["date"] == "2025-05-18")
        wed = next(x for x in d["days"] if x["date"] == "2025-05-14")
        assert sun["cycling"] is not None
        assert sun["cycling"]["status"] == "rescheduled"
        assert sun["cycling"]["scheduled_date"] == "2025-05-18"
        assert wed["cycling"] is None

        # GET should reflect persisted state
        r2 = api.get(f"{BASE_URL}/api/calendar/week", timeout=15)
        after = r2.json()
        wed2 = next(x for x in after["days"] if x["date"] == "2025-05-14")
        sun2 = next(x for x in after["days"] if x["date"] == "2025-05-18")
        assert wed2["cycling"] is None
        assert sun2["cycling"]["status"] == "rescheduled"

        # move back (undo) so other tests / UI are stable
        undo = {**params, "from_date": "2025-05-18", "to_date": "2025-05-14"}
        r3 = api.post(f"{BASE_URL}/api/calendar/move", json=undo, timeout=15)
        assert r3.status_code == 200

    def test_move_invalid_session_type_returns_400(self, api):
        bad = {"week_start": "2025-05-12", "session_type": "yoga",
               "from_date": "2025-05-12", "to_date": "2025-05-13"}
        r = api.post(f"{BASE_URL}/api/calendar/move", json=bad, timeout=15)
        # Pydantic may accept the string then fail in the endpoint -> 400,
        # OR reject via validation -> 422. Both are acceptable failures.
        assert r.status_code in (400, 422)

    def test_move_missing_source_session_returns_400(self, api):
        # Rest day (Sun) has no fb50 pattern that starts empty; use a day we
        # move OUT of twice in a row to guarantee None.
        first = {"week_start": "2025-05-12", "session_type": "fb50",
                 "from_date": "2025-05-14", "to_date": "2025-05-15"}
        api.post(f"{BASE_URL}/api/calendar/move", json=first, timeout=15)
        second = {**first}  # source now None
        r = api.post(f"{BASE_URL}/api/calendar/move", json=second, timeout=15)
        assert r.status_code == 400
        # restore
        restore = {"week_start": "2025-05-12", "session_type": "fb50",
                   "from_date": "2025-05-15", "to_date": "2025-05-14"}
        api.post(f"{BASE_URL}/api/calendar/move", json=restore, timeout=15)


class TestCalendarReview:
    def test_review_returns_message(self, api):
        payload = {
            "session_title": "Threshold Climb",
            "session_type": "cycling",
            "from_day": "Tuesday",
            "to_day": "Thursday",
            "to_focus": "Sweet Spot Power",
            "to_existing": "Sweet Spot",
            "coach_name": "Alberto",
            "coach_gender": "male",
        }
        r = api.post(f"{BASE_URL}/api/calendar/review", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert isinstance(d.get("message"), str) and len(d["message"]) > 10


# ─────────────── Coach: adaptation cache + refresh ───────────────
class TestCoachAdaptation:
    def test_adaptation_cached_then_refresh(self, api):
        first = api.post(f"{BASE_URL}/api/coach/adaptation",
                         json={"plan_id": "build-and-climb", "coach_name": "Alberto",
                               "coach_gender": "male", "refresh": False}, timeout=60)
        assert first.status_code == 200, first.text
        text_a = first.json().get("adaptation", "")
        assert len(text_a) > 10

        # second call should hit cache
        second = api.post(f"{BASE_URL}/api/coach/adaptation",
                          json={"plan_id": "build-and-climb", "coach_name": "Alberto",
                                "coach_gender": "male", "refresh": False}, timeout=15)
        assert second.status_code == 200
        assert second.json().get("cached") is True
        assert second.json().get("adaptation") == text_a

        # refresh=True regenerates (cached=False)
        third = api.post(f"{BASE_URL}/api/coach/adaptation",
                         json={"plan_id": "build-and-climb", "coach_name": "Alberto",
                               "coach_gender": "male", "refresh": True}, timeout=60)
        assert third.status_code == 200
        assert third.json().get("cached") is False


class TestCoachDebriefTriggersAdaptation:
    def test_debrief_sets_adaptation_at_timestamp(self, api):
        # capture existing timestamp
        p0 = api.get(f"{BASE_URL}/api/plan", timeout=15).json()
        before = p0.get("adaptation_ai_alberto_at")

        body = {
            "ride_id": None,
            "workout": "Threshold Climb",
            "route": "Alpe d'Huez",
            "duration_sec": 3600, "distance_km": 23.7, "elevation_m": 1050,
            "avg_power": 248, "norm_power": 251, "power_target": 251,
            "avg_cadence": 89, "avg_hr": 148, "max_hr": 172, "calories": 622,
            "tss": 92, "intensity": 0.87, "compliance": 96,
            "zones": [{"z": "Z4", "pct": 36}],
            "coach_name": "Alberto", "coach_gender": "male",
        }
        r = api.post(f"{BASE_URL}/api/coach/debrief", json=body, timeout=90)
        assert r.status_code == 200, r.text
        assert len(r.json().get("debrief", "")) > 10

        # background task refreshes the adaptation — poll for change
        changed = False
        for _ in range(20):
            time.sleep(2)
            p = api.get(f"{BASE_URL}/api/plan", timeout=15).json()
            after = p.get("adaptation_ai_alberto_at")
            if after and after != before:
                changed = True
                break
        assert changed, "Expected adaptation_ai_alberto_at to update after a debrief"
