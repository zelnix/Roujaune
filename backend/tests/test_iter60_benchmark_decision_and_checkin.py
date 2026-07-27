"""Iteration 60 — F-02 canonical daily check-in + F-03 deterministic Benchmark Decision Engine.

Covers:
  * benchmark_decision.decide_benchmark determinism (all 9 rule branches).
  * POST /api/rider/checkin persists top-level illness/injury/returning/equipmentChanged.
  * GET  /api/benchmark/plan-gate?plan_id=build-and-climb reflects flags correctly.
  * Safety regression: symptoms.illness=true → safetyOverride, and gate = required.
  * Regression: clean check-in → score 0-100 + safetyOverride=false, readiness/today reflects it.
  * Other critical symptoms trigger safetyOverride.

Also resets greenlantern's check-in to a clean state at the very end.
"""
import os
import sys
import pytest
import requests

# Ensure backend module importable for the pure-logic test.
sys.path.insert(0, "/app/backend")
from benchmark_decision import (  # noqa: E402
    BenchmarkDecisionInput,
    decide_benchmark,
)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = line.strip().split("=", 1)[1].strip('"').rstrip("/")

EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"
NON_BEGINNER_PLAN = "build-and-climb"
CLEAN_CHECKIN = {
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


# ─── F-03: Pure deterministic engine ──────────────────────────────────────────
class TestF03BenchmarkDecisionEngine:
    """Pure-logic tests for the deterministic engine (no DB, no LLM)."""

    def test_beginner_returns_submaximal_not_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Beginner", has_ftp=False, days_since_last=None,
        ))
        assert d.status == "submaximal"
        assert d.requires_benchmark is False
        assert any("beginner" in r.lower() for r in d.reasons)

    def test_no_ftp_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=False, days_since_last=None,
        ))
        assert d.status == "required"
        assert d.requires_benchmark is True

    def test_illness_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10, illness=True,
        ))
        assert d.status == "required"
        assert d.reasons == ["recent illness, injury or return to training"]

    def test_injury_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10, injury=True,
        ))
        assert d.status == "required"
        assert d.reasons == ["recent illness, injury or return to training"]

    def test_returning_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10, returning=True,
        ))
        assert d.status == "required"
        assert d.reasons == ["recent illness, injury or return to training"]

    def test_equipment_changed_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10, equipment_changed=True,
        ))
        assert d.status == "required"
        assert d.reasons == ["your equipment has changed"]

    def test_unknown_days_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=None,
        ))
        assert d.status == "required"
        assert d.requires_benchmark is True

    def test_stale_over_2x_retest_required(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=200, ftp_retest_days=56,
        ))
        assert d.status == "required"

    def test_stale_over_retest_recommended(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=80, ftp_retest_days=56,
        ))
        assert d.status == "recommended"
        assert d.requires_benchmark is True

    def test_low_confidence_recommended(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10, low_confidence=True,
        ))
        assert d.status == "recommended"

    def test_approved_default(self):
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Intermediate", has_ftp=True, days_since_last=10,
        ))
        assert d.status == "approved"
        assert d.requires_benchmark is False

    def test_determinism_same_input_same_output(self):
        inp = BenchmarkDecisionInput(
            plan_level="Advanced", has_ftp=True, days_since_last=15, injury=True,
        )
        first = decide_benchmark(inp)
        second = decide_benchmark(inp)
        third = decide_benchmark(inp)
        assert first == second == third

    def test_precedence_beginner_wins_over_all(self):
        """Beginner rule short-circuits even with injury/no-ftp/etc."""
        d = decide_benchmark(BenchmarkDecisionInput(
            plan_level="Beginner", has_ftp=False, days_since_last=None,
            illness=True, injury=True, returning=True, equipment_changed=True,
            low_confidence=True,
        ))
        assert d.status == "submaximal"


# ─── Auth fixture ─────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "no token in login response"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _plan_gate(api, plan_id=NON_BEGINNER_PLAN):
    r = api.get(f"{BASE_URL}/api/benchmark/plan-gate", params={"plan_id": plan_id}, timeout=20)
    assert r.status_code == 200, f"plan-gate failed: {r.status_code} {r.text}"
    return r.json()


def _checkin(api, symptoms=None, flags=None, date="2026-01-15"):
    payload = {
        **CLEAN_CHECKIN,
        "symptoms": symptoms or {},
        "flags": flags or {},
        "date": date,
    }
    r = api.post(f"{BASE_URL}/api/rider/checkin", json=payload, timeout=20)
    assert r.status_code == 200, f"checkin failed: {r.status_code} {r.text}"
    return r.json()


# ─── F-02 end-to-end: canonical flags flow into plan-gate ─────────────────────
class TestF02CheckinCanonicalFlags:
    def test_clean_checkin_gate_not_required(self, api):
        _checkin(api, symptoms={}, flags={})
        gate = _plan_gate(api)
        assert gate["planId"] == NON_BEGINNER_PLAN
        # build-and-climb is Intermediate, not Beginner
        assert (gate.get("planLevel") or "").lower() != "beginner"
        # No flags, no illness → should NOT be 'required' on illness/injury path.
        # It may be 'required' for another reason (no FTP), but reasons must NOT
        # mention illness/injury/return or equipment.
        reasons_str = " ".join(gate.get("reasons") or []).lower()
        assert "illness" not in reasons_str
        assert "injury" not in reasons_str
        assert "return" not in reasons_str
        assert "equipment" not in reasons_str

    def test_injury_flag_makes_gate_required(self, api):
        _checkin(api, symptoms={}, flags={"injury": True})
        gate = _plan_gate(api)
        assert gate["status"] == "required"
        assert gate["requiresBenchmark"] is True
        reasons_str = " ".join(gate.get("reasons") or []).lower()
        assert "illness" in reasons_str or "injury" in reasons_str or "return" in reasons_str

    def test_returning_flag_makes_gate_required(self, api):
        _checkin(api, symptoms={}, flags={"returning": True})
        gate = _plan_gate(api)
        assert gate["status"] == "required"
        reasons_str = " ".join(gate.get("reasons") or []).lower()
        assert "illness" in reasons_str or "injury" in reasons_str or "return" in reasons_str

    def test_equipment_changed_flag_reason(self, api):
        _checkin(api, symptoms={}, flags={"equipmentChanged": True})
        gate = _plan_gate(api)
        assert gate["status"] == "required"
        reasons_str = " ".join(gate.get("reasons") or []).lower()
        assert "equipment" in reasons_str

    def test_readiness_today_reflects_flags(self, api):
        _checkin(api, symptoms={}, flags={"injury": True, "equipmentChanged": True})
        r = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("available") is True
        assert body.get("injury") is True
        assert body.get("equipmentChanged") is True
        assert body.get("illness") in (False, None) or body.get("illness") is False


# ─── Safety regression: symptoms still trigger safetyOverride + gate ──────────
class TestSafetyRegression:
    def test_symptoms_illness_triggers_safety_and_gate(self, api):
        r = _checkin(api, symptoms={"illness": True}, flags={})
        assert r.get("safetyOverride") is True
        assert r.get("status") == "Do Not Train"
        assert r.get("readinessScore") == 0
        # Illness from symptoms must also feed into the plan-gate.
        gate = _plan_gate(api)
        assert gate["status"] == "required"
        reasons_str = " ".join(gate.get("reasons") or []).lower()
        assert "illness" in reasons_str or "injury" in reasons_str or "return" in reasons_str

    @pytest.mark.parametrize("symptom", [
        "chest_pain", "severe_dizziness", "shortness_of_breath", "new_pain",
    ])
    def test_other_critical_symptoms_trigger_safety(self, api, symptom):
        r = _checkin(api, symptoms={symptom: True}, flags={})
        assert r.get("safetyOverride") is True, f"{symptom} did not trigger safety"
        assert r.get("readinessScore") == 0
        assert r.get("status") == "Do Not Train"


# ─── Regression: clean check-in scoring + readiness/today ─────────────────────
class TestReadinessRegression:
    def test_clean_checkin_produces_sensible_score(self, api):
        r = _checkin(api, symptoms={}, flags={})
        assert r.get("safetyOverride") is False
        score = r.get("readinessScore")
        assert isinstance(score, int) or isinstance(score, float)
        assert 0 <= score <= 100, f"score out of range: {score}"
        assert r.get("status")

    def test_readiness_today_reflects_latest(self, api):
        r = _checkin(api, symptoms={}, flags={})
        latest_score = r.get("readinessScore")
        latest_date = r.get("date")
        got = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15)
        assert got.status_code == 200
        body = got.json()
        assert body.get("available") is True
        assert body.get("score") == latest_score
        assert body.get("date") == latest_date
        assert body.get("safetyOverride") is False


# ─── Teardown: reset greenlantern to clean state ─────────────────────────────
def test_zz_reset_greenlantern_to_clean(api):
    """Runs last (alphabetical) — ensures the demo rider isn't left flagged."""
    r = _checkin(api, symptoms={}, flags={})
    assert r.get("safetyOverride") is False
    got = api.get(f"{BASE_URL}/api/rider/readiness/today", timeout=15).json()
    assert got.get("illness") in (False, None)
    assert got.get("injury") in (False, None)
    assert got.get("returning") in (False, None)
    assert got.get("equipmentChanged") in (False, None)
