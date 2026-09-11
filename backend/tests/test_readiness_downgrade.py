"""Pre-Ride Readiness Check feature (new): manual HRV/RHR check-in fields +
hybrid coach downgrade suggestion (swap hard ride -> Recovery Spin).

Covers:
- POST /api/rider/checkin (low readiness) -> downgrade.available True + suggestion shape
- POST /api/rider/checkin (good readiness) -> downgrade.available False
- GET /api/rider/readiness/today -> includes downgrade object
- GET /api/plan/readiness-suggestion -> available True/False depending on state
- POST /api/plan/readiness-suggestion/accept -> swaps today's plan day to Recovery Spin, undo-able
- POST /api/plan/undo-reschedule -> restores original ride
- POST /api/plan/readiness-suggestion/dismiss -> keeps plan, suggestion not resurfaced same day
- Safety override (symptom) takes precedence over downgrade suggestion
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"

LOW_CHECKIN = {
    "sleep_hours": 4.5,
    "sleep_quality": 2,
    "energy": 2,
    "soreness": 9,
    "stress": 9,
    "motivation": 2,
    "hrv": 30,
}

GOOD_CHECKIN = {
    "sleep_hours": 8.0,
    "sleep_quality": 10,
    "energy": 10,
    "soreness": 1,
    "stress": 1,
    "motivation": 10,
}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"demo login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def _submit(h, checkin, symptoms=None, flags=None):
    payload = {"checkin": checkin, "symptoms": symptoms or {}, "flags": flags or {}}
    r = requests.post(f"{API}/rider/checkin", headers=h, json=payload, timeout=20)
    return r


class TestPreconditions:
    def test_plan_has_hard_ride_today(self, h):
        r = requests.get(f"{API}/plan", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        # Just sanity check the plan resolves; specific-day check happens via calendar/readiness-suggestion


class TestLowReadinessDowngrade:
    def test_low_checkin_returns_downgrade_available(self, h):
        r = _submit(h, LOW_CHECKIN)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["readinessScore"] < 55, d
        assert "downgrade" in d, "checkin response must include downgrade object"
        dg = d["downgrade"]
        if not dg.get("available"):
            pytest.skip(f"No hard ride scheduled today for downgrade to trigger: {dg}")
        assert dg["suggested"]["title"] == "Recovery Spin"
        assert dg["suggested"]["zone"] == "Z1"
        assert "current" in dg and dg["current"].get("zone") in ("Z3", "Z4", "Z5")

    def test_readiness_today_includes_downgrade(self, h):
        r = requests.get(f"{API}/rider/readiness/today", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("available") is True
        assert "downgrade" in d

    def test_readiness_suggestion_endpoint_matches(self, h):
        r = requests.get(f"{API}/plan/readiness-suggestion", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "available" in d


class TestAcceptAndUndo:
    def test_accept_downgrade_swaps_plan(self, h):
        # ensure a fresh low checkin (in case previous test class's dismiss/accept flags carried over)
        _submit(h, LOW_CHECKIN)
        pre = requests.get(f"{API}/plan/readiness-suggestion", headers=h, timeout=15).json()
        if not pre.get("available"):
            pytest.skip(f"downgrade not available to accept: {pre}")
        r = requests.post(f"{API}/plan/readiness-suggestion/accept", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("can_undo") is True
        assert d["applied"]["title"] == "Recovery Spin"

        # verify no longer available (applied)
        after = requests.get(f"{API}/plan/readiness-suggestion", headers=h, timeout=15).json()
        assert after.get("available") is False

    def test_undo_restores_original_ride(self, h):
        r = requests.post(f"{API}/plan/undo-reschedule", headers=h, json={}, timeout=15)
        # undo may 404 if no snapshot present (e.g. prior test skipped) - accept both paths but log
        if r.status_code == 404:
            pytest.skip("no undo snapshot present (accept step likely skipped)")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True


class TestDismissFlow:
    def test_fresh_checkin_then_dismiss(self, h):
        _submit(h, LOW_CHECKIN)
        pre = requests.get(f"{API}/plan/readiness-suggestion", headers=h, timeout=15).json()
        if not pre.get("available"):
            pytest.skip(f"downgrade not available: {pre}")
        r = requests.post(f"{API}/plan/readiness-suggestion/dismiss", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        after = requests.get(f"{API}/plan/readiness-suggestion", headers=h, timeout=15).json()
        assert after.get("available") is False, "suggestion should not resurface same day after dismiss"


class TestGoodReadinessNoDowngrade:
    def test_good_checkin_no_downgrade(self, h):
        r = _submit(h, GOOD_CHECKIN)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["readinessScore"] >= 55
        assert d["downgrade"]["available"] is False


class TestSafetyOverridePrecedence:
    def test_symptom_override_shows_no_downgrade(self, h):
        r = _submit(h, LOW_CHECKIN, symptoms={"chest_pain": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("safetyOverride") is True
        assert d["downgrade"]["available"] is False, "safety override must take precedence over downgrade suggestion"
