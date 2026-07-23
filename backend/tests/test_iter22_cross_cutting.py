"""Iteration 22 — cross-cutting features validation for Green Lantern.

Covers:
- GET /api/plan  → From Couch to Road plan shape (week_targets, progress_pct, ctr-ride ids)
- GET /api/calendar/week → 27 Jul – 2 Aug 2026, cycling day workout_ids, Tue = today
- GET /api/rider/season?days=7 → zero-state
- POST /api/workouts/summarize (telemetry) → completed status flows to /plan and /calendar
- POST /api/workouts/summarize (manual RPE) → manual=true, tss>0 from RPE
- POST /api/rider/supplementary/complete → season.supplementary increments

Cleans up ride_history + supplementary_log after each test class.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _reset_state(client):
    # There is no explicit delete endpoint; the spec asks us to clean ride_history
    # and supplementary_log via mongo. Use the shell helper to keep tests hermetic.
    import subprocess
    subprocess.run(
        [
            "mongosh",
            "--quiet",
            "--eval",
            'db = db.getSiblingDB("test_database"); db.ride_history.deleteMany({}); db.supplementary_log.deleteMany({});',
        ],
        check=False,
        capture_output=True,
    )


# ---------------------- Plan ----------------------
class TestPlan:
    def test_plan_is_from_couch_to_road(self, client):
        _reset_state(client)
        r = client.get(f"{API}/plan")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["title"] == "From Couch to Road"
        assert p["id"] == "couch-to-road"
        assert p["start_date"] == "2026-07-27"

    def test_plan_week_targets_shape(self, client):
        p = client.get(f"{API}/plan").json()
        t = p.get("week_targets")
        assert t is not None
        assert t["rides"] == 3
        for k in ("duration", "distance_km", "elevation_m", "supplementary"):
            assert k in t, f"missing week_targets.{k}"
        assert t["supplementary"] == 3

    def test_plan_progress_and_ctr_workouts(self, client):
        p = client.get(f"{API}/plan").json()
        assert "progress_pct" in p
        ids = [w["id"] for w in p.get("workouts", [])]
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in ids
        # No completed rides currently
        statuses = {w["id"]: w.get("status") for w in p["workouts"]}
        assert statuses["ctr-ride-1"] != "completed"


# ---------------------- Calendar ----------------------
class TestCalendarWeek:
    def test_week1_dates(self, client):
        _reset_state(client)
        r = client.get(f"{API}/calendar/week")
        assert r.status_code == 200
        w = r.json()
        assert w["start_date"] == "2026-07-27"
        assert w["end_date"] == "2026-08-02"
        assert len(w["days"]) == 7

    def test_cycling_day_workout_ids_and_readiness(self, client):
        w = client.get(f"{API}/calendar/week").json()
        # Non-rest cycling days must carry a workout_id (rest day may omit it)
        cycling_ids = [
            d["cycling"].get("workout_id")
            for d in w["days"]
            if d.get("cycling") and d["cycling"].get("status") != "rest"
        ]
        for wid in ("ctr-ride-1", "ctr-ride-2", "ctr-ride-3"):
            assert wid in cycling_ids, cycling_ids
        # every day has readiness with a score
        for d in w["days"]:
            assert "readiness" in d and "score" in d["readiness"]

    def test_tuesday_is_today(self, client):
        w = client.get(f"{API}/calendar/week").json()
        tue = w["days"][1]
        assert tue["day_name"].upper().startswith("TUE")
        assert tue["cycling"] is not None
        assert tue["cycling"]["status"] == "today"


# ---------------------- Season ----------------------
class TestSeason:
    def test_empty_season_zero_state(self, client):
        _reset_state(client)
        r = client.get(f"{API}/rider/season", params={"days": 7})
        assert r.status_code == 200
        s = r.json()
        assert s["rides"] == 0
        assert s["supplementary"] == 0


# ---------------------- Summarize (telemetry / no telemetry) ----------------------
class TestSummarizeTelemetryFlow:
    def test_summarize_and_plan_reflects_completion(self, client):
        _reset_state(client)
        body = {"workout_id": "ctr-ride-1", "elapsed": 1200, "ftp": 180, "samples": []}
        r = client.post(f"{API}/workouts/summarize", json=body)
        assert r.status_code == 200, r.text
        summary = r.json()
        assert "id" in summary

        plan = client.get(f"{API}/plan").json()
        first = plan["workouts"][0]
        assert first["id"] == "ctr-ride-1"
        assert first.get("status") == "completed", plan["workouts"]
        assert "actual_tss" in first
        assert "actual_duration" in first
        assert isinstance(plan.get("auto_adjustment"), str) and len(plan["auto_adjustment"]) > 0

        # Calendar Tuesday cycling status flips to completed
        week = client.get(f"{API}/calendar/week").json()
        tue = week["days"][1]
        assert tue["cycling"]["status"] == "completed"

        _reset_state(client)
        # After cleanup, plan resets
        plan2 = client.get(f"{API}/plan").json()
        assert plan2["workouts"][0].get("status") != "completed"


class TestManualSummary:
    def test_manual_summary_computes_tss_from_rpe(self, client):
        _reset_state(client)
        body = {
            "workout_id": "ctr-ride-2",
            "manual": {"duration_sec": 1500, "distance_km": 8, "elevation_m": 20, "rpe": 3},
        }
        r = client.post(f"{API}/workouts/summarize", json=body)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s.get("manual") is True
        assert s.get("duration_sec") == 1500
        assert s.get("distance_km") == 8.0
        assert s.get("elevation_m") == 20
        assert s.get("tss", 0) > 0, s
        _reset_state(client)


# ---------------------- Supplementary ----------------------
class TestSupplementary:
    def test_supplementary_increments_season(self, client):
        _reset_state(client)
        before = client.get(f"{API}/rider/season", params={"days": 7}).json()["supplementary"]
        r = client.post(f"{API}/rider/supplementary/complete", json={"kind": "strength"})
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        after = client.get(f"{API}/rider/season", params={"days": 7}).json()["supplementary"]
        assert after == before + 1
        _reset_state(client)
        final = client.get(f"{API}/rider/season", params={"days": 7}).json()["supplementary"]
        assert final == 0
