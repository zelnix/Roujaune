"""Iter 84 — Resend email + UX enhancements backend tests.

Coverage:
- GET/PUT /api/analysis/email-prefs (auth demo).
- POST /api/analysis/email-digest sends a REAL email via Resend (call once).
- POST /api/auth/register single throwaway user (welcome email best-effort).
- Regression: season-recap, milestone-wall, weekly-digest, streak, milestones,
  /api/coach/speak audio/wav.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASS = "demo9900"


@pytest.fixture(scope="module")
def demo_token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def h(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


# ── Email prefs ────────────────────────────────────────────────────────────
class TestEmailPrefs:
    def test_get_default(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/email-prefs", headers=h, timeout=30)
        assert r.status_code == 200
        assert "weekly_digest" in r.json()

    def test_put_true_then_reset_false(self, h):
        # opt in
        r = requests.put(f"{BASE_URL}/api/analysis/email-prefs",
                         json={"weekly_digest": True}, headers=h, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True and body.get("weekly_digest") is True

        # verify via GET
        r = requests.get(f"{BASE_URL}/api/analysis/email-prefs", headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json().get("weekly_digest") is True

        # reset (MUST leave demo with weekly_digest=false)
        r = requests.put(f"{BASE_URL}/api/analysis/email-prefs",
                         json={"weekly_digest": False}, headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json().get("weekly_digest") is False

        # confirm reset persisted
        r = requests.get(f"{BASE_URL}/api/analysis/email-prefs", headers=h, timeout=30)
        assert r.json().get("weekly_digest") is False


# ── Real Resend send (ONCE) ────────────────────────────────────────────────
class TestEmailDigest:
    def test_email_digest_send(self, h):
        r = requests.post(f"{BASE_URL}/api/analysis/email-digest", headers=h, timeout=60)
        assert r.status_code == 200, f"digest send failed: {r.status_code} {r.text[:300]}"
        assert r.json().get("ok") is True


# ── Register throwaway (ONCE) ──────────────────────────────────────────────
class TestRegister:
    def test_register_single_throwaway(self):
        email = f"qa+iter84-{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "testpass123", "name": "QA Iter84"},
                          timeout=45)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("token")
        assert body.get("user", {}).get("email") == email


# ── Regression on analysis endpoints ───────────────────────────────────────
class TestAnalysisRegression:
    def test_season_recap_current(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/season-recap", headers=h, timeout=30)
        assert r.status_code == 200
        b = r.json()
        for k in ("year", "rides", "distance_km", "hours", "tss",
                  "climbs_conquered", "biggest_climb_m", "longest_ride_km",
                  "records_set", "has_data"):
            assert k in b, f"missing {k}"

    def test_season_recap_prior_year(self, h):
        # server always returns 200; may just have_data=false
        r = requests.get(f"{BASE_URL}/api/analysis/season-recap?year=2024", headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json().get("year") == 2024

    def test_milestone_wall(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/milestone-wall", headers=h, timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert isinstance(b.get("categories"), list) and len(b["categories"]) == 3
        assert b.get("total") == sum(len(c["rows"]) for c in b["categories"])
        assert 0 <= b.get("earned", -1) <= b["total"]

    def test_weekly_digest(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/weekly-digest", headers=h, timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert "this_week" in b and "deltas" in b

    def test_streak(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/streak", headers=h, timeout=30)
        assert r.status_code == 200
        for k in ("current_weeks", "best_weeks", "freeze_tokens", "this_week_rides"):
            assert k in r.json()

    def test_milestones(self, h):
        r = requests.get(f"{BASE_URL}/api/analysis/milestones", headers=h, timeout=30)
        assert r.status_code == 200
        for k in ("total_rides", "total_km", "next_rides", "next_km"):
            assert k in r.json()


# ── Gemini TTS regression ──────────────────────────────────────────────────
class TestCoachSpeak:
    def test_coach_speak_alberto(self, h):
        r = requests.get(
            f"{BASE_URL}/api/coach/speak",
            params={"text": "Iter 84 QA check", "coach_id": "alberto"},
            headers=h, timeout=60,
        )
        assert r.status_code == 200, f"speak failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("audio/wav")
        assert len(r.content) > 1024
        assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WAVE"

    def test_coach_speak_unauth(self):
        r = requests.get(f"{BASE_URL}/api/coach/speak",
                         params={"text": "x", "coach_id": "alberto"}, timeout=30)
        assert r.status_code == 401
