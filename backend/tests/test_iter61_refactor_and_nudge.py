"""Iteration 61 — Backend restructure regression + new /api/benchmark/nudge.

Validates:
  * Public: GET /api/reports (no auth) returns the two report ids.
  * Public: GET /api/reports/{name} downloads a PDF.
  * Auth : GET /api/weather with valid params returns available=true + temp_c.
  * Auth : POST/GET /api/status round-trips a StatusCheck.
  * Auth guard: GET /api/ requires bearer (401 without).
  * Core flows still work: login, /rider/profile, /plan, benchmark plan-gate, checkin, readiness/today.
  * NEW: GET /api/benchmark/nudge:
      - greenlantern default (couch-to-road, beginner): required=false, status='submaximal'.
      - on ride-stronger + injury flag: required=true, status='required',
        reason mentions illness/injury/return, recommendedTestName present.
      - RESTORE greenlantern to couch-to-road + clean check-in at end.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://roujaune-train.preview.emergentagent.com"
).rstrip("/")

EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"

CLEAN_CHECKIN_BODY = {
    "checkin": {
        "sleep_hours": 7.5,
        "sleep_quality": 8,
        "energy": 7,
        "soreness": 2,
        "stress": 2,
        "motivation": 8,
    },
    "symptoms": {},
    "flags": {},
    "date": "2026-01-15",
}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ─── Refactor regression: moved endpoints ─────────────────────────────────
class TestPublicReports:
    def test_reports_list_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/reports", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        ids = {rep["id"] for rep in body["reports"]}
        assert ids == {"ux-audit", "architecture-security"}
        for rep in body["reports"]:
            assert rep["download"].endswith(f"/api/reports/{rep['id']}")

    @pytest.mark.parametrize("name", ["ux-audit", "architecture-security"])
    def test_reports_download_no_auth(self, name):
        r = requests.get(f"{BASE_URL}/api/reports/{name}", timeout=30)
        assert r.status_code == 200
        # PDF magic bytes
        assert r.content[:4] == b"%PDF", f"not a pdf: {r.content[:8]}"


class TestWeather:
    def test_weather_with_auth(self, api):
        r = api.get(
            f"{BASE_URL}/api/weather",
            params={"city": "Perth", "region": "Western Australia", "country": "Australia"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Open-Meteo is external — accept 'available' either way, but if true, temp_c present.
        if body.get("available"):
            assert "temp_c" in body
            assert "feels_c" in body
            assert isinstance(body["temp_c"], (int, float))


class TestStatusRoundTrip:
    def test_root_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_root_with_auth(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert "ROUJAUNE" in r.json().get("message", "")

    def test_post_and_get_status(self, api):
        name = f"TEST_{uuid.uuid4().hex[:8]}"
        r = api.post(f"{BASE_URL}/api/status", json={"client_name": name}, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["client_name"] == name
        assert "id" in created and "timestamp" in created

        r2 = api.get(f"{BASE_URL}/api/status", timeout=20)
        assert r2.status_code == 200
        rows = r2.json()
        assert any(row.get("client_name") == name for row in rows), "created status not in list"


# ─── Core flows still work after refactor ─────────────────────────────────
class TestCoreFlows:
    def test_rider_profile(self, api):
        r = api.get(f"{BASE_URL}/api/rider/profile", timeout=15)
        assert r.status_code == 200
        assert "id" in r.json()

    def test_plan(self, api):
        r = api.get(f"{BASE_URL}/api/plan", timeout=20)
        assert r.status_code == 200
        body = r.json()
        # Either a plan with 'id' or NO_PLAN {id:'none', no_plan:true}
        assert "id" in body or body.get("no_plan") is True

    def test_plan_gate(self, api):
        r = api.get(
            f"{BASE_URL}/api/benchmark/plan-gate",
            params={"plan_id": "build-and-climb"},
            timeout=25,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("planId") == "build-and-climb"
        assert body.get("status") in (
            "required", "recommended", "approved", "deferred", "submaximal", "coach_review",
        )

    def test_checkin_and_readiness(self, api):
        # Clean check-in
        r = api.post(f"{BASE_URL}/api/rider/checkin", json=CLEAN_CHECKIN_BODY, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("safetyOverride") is False
        r2 = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15)
        assert r2.status_code == 200
        rt = r2.json()
        assert rt.get("available") is True


# ─── NEW: /api/benchmark/nudge ────────────────────────────────────────────
def _set_plan(api, plan_id: str):
    r = api.post(f"{BASE_URL}/api/rider/plan", json={"plan_id": plan_id}, timeout=20)
    assert r.status_code == 200, f"set plan {plan_id} failed: {r.status_code} {r.text}"


def _checkin(api, flags=None, symptoms=None):
    payload = {**CLEAN_CHECKIN_BODY, "flags": flags or {}, "symptoms": symptoms or {}}
    r = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=20)
    assert r.status_code == 200, f"checkin failed: {r.status_code} {r.text}"
    return r.json()


class TestBenchmarkNudge:
    def test_beginner_default_not_required(self, api):
        # Ensure greenlantern on couch-to-road + clean flags
        _set_plan(api, "couch-to-road")
        _checkin(api, flags={}, symptoms={})
        r = api.get(f"{BASE_URL}/api/benchmark/nudge", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("required") is False
        assert body.get("status") == "submaximal"
        assert body.get("planId") == "couch-to-road"

    def test_intermediate_plus_injury_required(self, api):
        _set_plan(api, "ride-stronger")
        _checkin(api, flags={"injury": True}, symptoms={})
        r = api.get(f"{BASE_URL}/api/benchmark/nudge", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("required") is True
        assert body.get("status") == "required"
        reason = (body.get("reason") or "").lower()
        assert (
            "illness" in reason or "injury" in reason or "return" in reason
        ), f"unexpected reason: {body.get('reason')}"
        assert body.get("recommendedTestName"), "recommendedTestName missing"


# ─── Restore greenlantern at the very end (alphabetical last) ─────────────
def test_zz_restore_greenlantern(api):
    _set_plan(api, "couch-to-road")
    r = _checkin(api, flags={}, symptoms={})
    assert r.get("safetyOverride") is False
    got = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15).json()
    assert got.get("injury") in (False, None)
    assert got.get("illness") in (False, None)
    assert got.get("equipmentChanged") in (False, None)
    # Confirm nudge back to submaximal
    r2 = api.get(f"{BASE_URL}/api/benchmark/nudge", timeout=15).json()
    assert r2.get("required") is False
    assert r2.get("status") == "submaximal"
    assert r2.get("planId") == "couch-to-road"
