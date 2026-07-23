"""Iteration 20 — Daily Check-in, live readiness, calendar override & rider_level."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Rider check-in / readiness / calendar override ----------------
class TestCheckin:
    def test_healthy_checkin_returns_score(self, api):
        payload = {
            "checkin": {
                "sleep_hours": 8.0,
                "sleep_quality": 9,
                "energy": 8,
                "soreness": 2,
                "stress": 2,
                "motivation": 8,
            },
            "date": "2025-05-13",
        }
        r = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "readinessScore" in d and isinstance(d["readinessScore"], int)
        assert d["readinessScore"] >= 55, f"expected healthy score, got {d}"
        assert d["status"]
        assert isinstance(d.get("mainFactors", []), list)
        assert d.get("confidence") in {"low", "medium", "high"}
        assert d.get("date") == "2025-05-13"
        assert d.get("safetyOverride") is False

    def test_symptom_override(self, api):
        payload = {
            "checkin": {"sleep_hours": 7, "sleep_quality": 6, "energy": 6, "soreness": 2, "stress": 3, "motivation": 6},
            "symptoms": {"chest_pain": True},
            "date": "2025-05-13",
        }
        r = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("readinessScore") == 0
        assert d.get("safetyOverride") is True
        assert d.get("status") == "Do Not Train"

    def test_readiness_today_after_healthy_checkin(self, api):
        # Post a healthy checkin then fetch today
        payload = {
            "checkin": {
                "sleep_hours": 8.0, "sleep_quality": 9, "energy": 8,
                "soreness": 2, "stress": 2, "motivation": 8,
            },
            "date": "2025-05-13",
        }
        api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=15)
        r = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("available") is True
        assert "score" in d and isinstance(d["score"], int)
        assert d.get("status")
        assert d.get("band")
        assert isinstance(d.get("mainFactors", []), list)
        assert isinstance(d.get("metrics", []), list)
        # sub-metrics must contain expected keys after a full checkin
        keys = {m.get("key") for m in d.get("metrics", [])}
        assert {"energy", "sleep", "stress", "soreness"}.issubset(keys)
        assert d.get("safetyOverride") is False

    def test_calendar_week_reflects_checkin(self, api):
        # ensure a specific score is stored for 2025-05-13
        payload = {
            "checkin": {
                "sleep_hours": 8.0, "sleep_quality": 9, "energy": 8,
                "soreness": 2, "stress": 2, "motivation": 8,
            },
            "date": "2025-05-13",
        }
        ci = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=15).json()
        score = ci.get("readinessScore")

        r = api.get(f"{BASE_URL}/api/calendar/week", params={"start": "2025-05-12"}, timeout=15)
        assert r.status_code == 200, r.text
        wk = r.json()
        days = wk.get("days", [])
        target = next((d for d in days if d.get("date") == "2025-05-13"), None)
        assert target, "2025-05-13 must be present in the week"
        readiness = target.get("readiness") or {}
        assert readiness.get("source") == "Daily check-in"
        assert readiness.get("score") == score
        # other days should not be overridden
        other = next((d for d in days if d.get("date") == "2025-05-12"), None)
        assert other and (other.get("readiness") or {}).get("source") != "Daily check-in"


# ---------------- Rider level ----------------
class TestRiderLevel:
    def test_returns_structure(self, api):
        payload = {
            "rides_per_week": 3,
            "avg_duration_min": 55,
            "completion_rate": 0.9,
            "avg_rpe": 6,
            "recovery": 0.75,
            "consistent_weeks": 8,
            "completed_types": {"endurance": True, "tempo": True},
            "current_level": "Beginner",
            "weeks_meeting_intermediate": 5,
            "improving": True,
            "longest_ride_min": 70,
        }
        r = api.post(f"{BASE_URL}/api/rider/level", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("riderLevel", "previousLevel", "levelChanged",
                  "progressTowardNextLevel", "confidence", "mainReasons", "nextLevelRequirements"):
            assert k in d, f"missing key {k}"
        assert d["riderLevel"] in {"Beginner", "Intermediate", "Advanced"}
        assert isinstance(d["mainReasons"], list) and d["mainReasons"]
        assert isinstance(d["nextLevelRequirements"], list) and d["nextLevelRequirements"]
        # improving / longest_ride_min surface in reasons when there's room
        sparse = {"current_level": "Beginner", "improving": True, "longest_ride_min": 70}
        d2 = api.post(f"{BASE_URL}/api/rider/level", json=sparse, timeout=15).json()
        joined = " | ".join(d2["mainReasons"])
        assert "Improving" in joined
        assert "70" in joined

    def test_missed_or_stopped_triggers_concern(self, api):
        # missed>=3 should suppress promotion (concerns=True)
        payload = {
            "rides_per_week": 2, "avg_duration_min": 40, "completion_rate": 0.85,
            "avg_rpe": 6, "recovery": 0.7, "consistent_weeks": 6,
            "completed_types": {"endurance": True, "tempo": True},
            "current_level": "Beginner",
            "weeks_meeting_intermediate": 4,
            "missed_or_stopped": 4,
        }
        r = api.post(f"{BASE_URL}/api/rider/level", json=payload, timeout=15).json()
        # With concerns True, Beginner should NOT promote to Intermediate
        assert r["riderLevel"] == "Beginner", r


# ---------------- Cleanup: reset to healthy readiness ----------------
def test_zzz_reset_to_healthy(api):
    payload = {
        "checkin": {
            "sleep_hours": 8.0, "sleep_quality": 9, "energy": 8,
            "soreness": 2, "stress": 2, "motivation": 8,
        },
    }
    r = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json().get("readinessScore", 0) >= 55
