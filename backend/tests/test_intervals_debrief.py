"""Backend tests for iteration 18: coach/debrief with new interval fields."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestCoachDebriefIntervals:
    """Iteration 18: /api/coach/debrief accepts interval_compliance + intervals."""

    def test_debrief_accepts_interval_fields(self, api_client):
        payload = {
            "workout": "VO2 Max Intervals",
            "route": "Alpe d'Huez",
            "duration_sec": 720,
            "distance_km": 6.2,
            "elevation_m": 240,
            "avg_power": 268,
            "norm_power": 275,
            "power_target": 287,
            "avg_cadence": 92,
            "avg_hr": 158,
            "max_hr": 174,
            "calories": 210,
            "tss": 32,
            "intensity": 0.94,
            "compliance": 84,
            "interval_compliance": 78,
            "intervals": [
                {"label": "Warm-up", "targetW": 187, "avgW": 184, "compliance": 88},
                {"label": "Z5 Effort 1/4", "targetW": 321, "avgW": 305, "compliance": 62},
                {"label": "Z5 Effort 2/4", "targetW": 321, "avgW": 318, "compliance": 84},
                {"label": "Cool-down", "targetW": 144, "avgW": 150, "compliance": 92},
            ],
            "zones": [{"z": "Z2", "pct": 20}, {"z": "Z5", "pct": 40}],
            "coach_name": "Alberto",
            "coach_gender": "male",
        }
        r = api_client.post(f"{BASE_URL}/api/coach/debrief", json=payload, timeout=60)
        # 502/503 = config-only (LLM). 200 = real debrief.
        assert r.status_code in (200, 502, 503), f"unexpected: {r.status_code} {r.text[:200]}"
        if r.status_code == 200:
            data = r.json()
            assert "debrief" in data
            text = str(data["debrief"]).strip()
            assert len(text) > 20, "debrief too short"
            # Sanity: pacing/interval-aware language
            low = text.lower()
            assert any(k in low for k in ["target", "power", "interval", "effort", "pace", "z5", "watts"]), \
                f"debrief lacks pacing language: {text}"

    def test_debrief_backwards_compat_without_intervals(self, api_client):
        """Old clients without interval fields should still succeed."""
        payload = {
            "workout": "Threshold Climb",
            "duration_sec": 3600,
            "avg_power": 248,
            "norm_power": 251,
            "tss": 92,
            "compliance": 96,
            "coach_name": "Alberto",
            "coach_gender": "male",
        }
        r = api_client.post(f"{BASE_URL}/api/coach/debrief", json=payload, timeout=60)
        assert r.status_code in (200, 502, 503)


class TestSummarizeStillWorks:
    """Regression: summarize endpoint still returns reference for empty samples."""

    def test_summarize_empty_returns_reference(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/workouts/summarize", json={"samples": []}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["computed"] is False
        assert data["duration_sec"] == 3600
        assert "compliance" in data
