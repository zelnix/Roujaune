"""Tests for the LONGITUDINAL ADAPTATION ASSESSMENT feature (iter 113).

Covers:
  1. POST /api/workouts/summarize with >=40 synthetic samples returns 200 and
     includes per-ride adaptation metrics: ef, vi, decoupling, hrr60,
     w_prime_min_pct, tiz.
  2. GET /api/rides/history?limit=1 shows those same fields persisted.
  3. GET /api/analysis/adaptation returns the documented keys and, with >=3
     computed rides, populates trends.
  4. Regressions: manual summary path (no samples) still returns 200; <30
     samples returns the reference summary with an id.
"""
import os
import math
import uuid
import random
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # fall back to reading the frontend env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "Backend URL not configured"

API = f"{BASE_URL}/api"


# ------------------------- Fixtures -------------------------

@pytest.fixture(scope="module")
def registered_user():
    """Register a throwaway user so we don't pollute demo/greenlantern history."""
    unique = uuid.uuid4().hex[:10]
    email = f"test.adapt.{unique}@roujaune-qa.example.com"
    password = "TestRider9900"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "TEST Adapt"
    }, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("session_token")
    assert token, f"no token on register: {body}"
    return {"email": email, "password": password, "token": token, "body": body}


@pytest.fixture(scope="module")
def api_client(registered_user):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {registered_user['token']}",
    })
    return s


# ------------------------- Helpers -------------------------

def _samples(n=60, seed=1, decouple=True):
    """Synthetic telemetry samples with power/hr/cadence/speed that vary.
    Includes a small cool-down at the tail so hrr60 (final-60s HR drop) fires."""
    random.seed(seed)
    out = []
    tail = max(6, n // 10)  # last ~10% is a cool-down
    for i in range(n):
        cooling = i >= n - tail
        base_p = 200 + 40 * math.sin(i / 6) + random.uniform(-10, 10)
        if cooling:
            base_p = 90  # easy spin
        hr_drift = 5 if decouple and i > n // 2 else 0
        base_hr = 135 + hr_drift + 4 * math.sin(i / 5)
        if cooling:
            # linearly recover ~18 bpm across the cool-down window
            steps_into_cool = i - (n - tail)
            base_hr = 150 - (18 * (steps_into_cool / max(1, tail - 1)))
        out.append({
            "power": max(60, round(base_p)),
            "hr": round(base_hr),
            "cadence": round(90 + 3 * math.sin(i / 7)),
            "speed": round(28 + 3 * math.sin(i / 8), 1),
        })
    return out


# ------------------------- Tests -------------------------

class TestAdaptationMetrics:
    """Per-ride adaptation metrics on /workouts/summarize + /rides/history."""

    def test_summarize_computes_adaptation_metrics(self, api_client):
        # elapsed chosen so dt = elapsed / n_samples ~ 5s (back=12 samples in the
        # final ~60s, exercising the HR-recovery code path).
        payload = {
            "samples": _samples(60, seed=42),
            "ftp": 240,
            "elapsed": 300,
            "est_calories": 0,
        }
        r = api_client.post(f"{API}/workouts/summarize", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("computed") is True, "expected computed=True with >=30 samples"
        for k in ("ef", "vi", "decoupling", "hrr60", "w_prime_min_pct", "tiz"):
            assert k in data, f"missing adaptation metric: {k}"
        assert isinstance(data["tiz"], dict) and data["tiz"]
        assert data["ef"] > 0
        assert data["vi"] >= 1.0
        assert "id" in data and data["id"]

    def test_history_persists_adaptation_metrics(self, api_client):
        r = api_client.get(f"{API}/rides/history?limit=1", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows, "no history rows"
        last = rows[0]
        for k in ("ef", "vi", "decoupling", "hrr60", "w_prime_min_pct", "tiz"):
            assert k in last, f"missing persisted field: {k}"
        assert last.get("ef") is not None
        assert isinstance(last.get("tiz"), dict) and last["tiz"]


class TestAdaptationEndpoint:
    """GET /api/analysis/adaptation shape + trends after >=3 computed rides."""

    def test_seed_two_more_rides_then_adaptation(self, api_client):
        # We already have 1 ride from the previous class. Add 2 more so trends fire.
        for seed in (7, 13):
            payload = {
                "samples": _samples(60, seed=seed),
                "ftp": 240,
                "elapsed": 300,
                "est_calories": 0,
            }
            r = api_client.post(f"{API}/workouts/summarize", json=payload, timeout=30)
            assert r.status_code == 200, r.text
            assert r.json().get("computed") is True

        r = api_client.get(f"{API}/analysis/adaptation?weeks=8", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Required top-level shape
        for k in ("has_data", "trends", "series", "load", "callouts", "coach_actions"):
            assert k in data, f"missing key: {k}"
        for k in ("ef", "ef_z2", "decoupling", "hrr", "w_prime"):
            assert k in data["trends"], f"missing trend: {k}"
        for k in ("ctl", "tsb", "ramp_rate"):
            assert k in data["load"], f"missing load key: {k}"
        assert "auto_apply" in data["coach_actions"]
        assert "confirm" in data["coach_actions"]
        assert isinstance(data["callouts"], list)

        # With >=3 computed rides has_data should be True and at least one of
        # the primary trends (ef or decoupling) should compute a real object.
        assert data["has_data"] is True, f"has_data false: ride_count={data.get('ride_count')}"
        assert data["trends"]["ef"] is not None or data["trends"]["decoupling"] is not None


class TestRegressionSummarize:
    """Regression cases for the summarize endpoint."""

    def test_manual_entry_returns_200(self, api_client):
        payload = {
            "samples": [],
            "ftp": 240,
            "elapsed": 0,
            "est_calories": 0,
            "manual": {
                "duration_sec": 3600,
                "distance_km": 25.0,
                "elevation_m": 320,
                "avg_power": 190,
                "avg_hr": 142,
                "avg_cadence": 85,
                "rpe": 6,
            },
        }
        r = api_client.post(f"{API}/workouts/summarize", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("manual") is True
        assert data.get("id")
        assert data.get("avg_power") == 190

    def test_few_samples_returns_reference_with_id(self, api_client):
        payload = {
            "samples": _samples(10, seed=3),
            "ftp": 240,
            "elapsed": 0,
            "est_calories": 555,
        }
        r = api_client.post(f"{API}/workouts/summarize", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("computed") is False, "expected reference (uncomputed) summary"
        assert data.get("id")
        # est_calories overrides ref calories
        assert data.get("calories") == 555
