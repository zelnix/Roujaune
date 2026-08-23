"""Iter 80: climb leaderboard PR/map, streak card, taper note (with & without event)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_headers():
    return _login("demo@roujaune.app", "demo9900")


@pytest.fixture(scope="module")
def gl_headers():
    return _login("greenlantern@roujaune.app", "rideon9900")


# ---- Climb leaderboard (demo, has GPS climbs w/ PR) ----
class TestClimbLeaderboardPR:
    def test_climb_leaderboard_has_pr_and_path(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/climb-leaderboard", headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["has_data"] is True
        climbs = body["climbs"]
        assert isinstance(climbs, list) and len(climbs) >= 1
        # Every climb must have a path with length >= 2 and new_pr / pr_improvement_s fields
        for c in climbs:
            assert "path" in c, "climb missing path"
            assert isinstance(c["path"], list)
            assert len(c["path"]) >= 2, f"path too short for {c.get('name')}"
            for pt in c["path"]:
                assert isinstance(pt, list) and len(pt) == 2
                assert isinstance(pt[0], (int, float)) and isinstance(pt[1], (int, float))
            assert "new_pr" in c and isinstance(c["new_pr"], bool)
            assert "pr_improvement_s" in c  # can be None if not new_pr

        # 'Col de Test' should be a new PR with ~190s improvement
        col = next((c for c in climbs if c.get("name") == "Col de Test"), None)
        assert col is not None, f"Col de Test not found in {[c['name'] for c in climbs]}"
        assert col["new_pr"] is True, "Col de Test should be new_pr"
        assert col["pr_improvement_s"] is not None
        assert 170 <= col["pr_improvement_s"] <= 210, f"pr_improvement_s={col['pr_improvement_s']} expected ~190"


# ---- Streak (greenlantern with ride history) ----
class TestStreak:
    def test_streak_shape(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/streak", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        b = r.json()
        for k in ("current_weeks", "best_weeks", "this_week_rides", "active", "weeks_ridden"):
            assert k in b, f"missing {k}"
        assert isinstance(b["current_weeks"], int) and b["current_weeks"] >= 0
        assert isinstance(b["best_weeks"], int) and b["best_weeks"] >= 0
        assert isinstance(b["this_week_rides"], int) and b["this_week_rides"] >= 0
        assert isinstance(b["weeks_ridden"], int) and b["weeks_ridden"] >= 0
        assert isinstance(b["active"], bool)
        assert b["best_weeks"] >= b["current_weeks"]


# ---- Taper note (demo, event ~21d out & not fresh) ----
class TestTaperNoteDemo:
    def test_taper_note_returns_plan_and_caches(self, demo_headers):
        r1 = requests.get(
            f"{BASE_URL}/api/coach/taper-note",
            headers=demo_headers,
            params={"coach_name": "Alberto", "coach_gender": "male"},
            timeout=60,
        )
        assert r1.status_code == 200, r1.text[:300]
        b1 = r1.json()
        assert b1.get("has_event") is True
        # If demo somehow already fresh, skip the not-fresh assertions
        if b1.get("fresh") is True:
            pytest.skip("demo projected fresh; can't validate taper plan branch")
        assert b1.get("fresh") is False
        assert isinstance(b1.get("note"), str) and b1["note"].strip()
        assert isinstance(b1.get("actions"), list) and 1 <= len(b1["actions"]) <= 3
        for a in b1["actions"]:
            assert isinstance(a, str) and a.strip()

        # Second call: cached
        r2 = requests.get(
            f"{BASE_URL}/api/coach/taper-note",
            headers=demo_headers,
            params={"coach_name": "Alberto", "coach_gender": "male"},
            timeout=30,
        )
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("cached") is True, f"expected cached=True, got {b2}"
        assert b2.get("note") == b1["note"]


# ---- Taper note with no event (greenlantern) — must not 500 ----
class TestTaperNoteNoEvent:
    def test_no_event_branch(self, gl_headers):
        # Snapshot existing event so we can restore
        prior = requests.get(f"{BASE_URL}/api/analysis/event", headers=gl_headers, timeout=15).json()

        # Clear the event
        r_clear = requests.put(
            f"{BASE_URL}/api/analysis/event",
            headers=gl_headers,
            json={"event_date": None, "event_name": None},
            timeout=15,
        )
        assert r_clear.status_code == 200, r_clear.text[:200]

        try:
            r = requests.get(
                f"{BASE_URL}/api/coach/taper-note",
                headers=gl_headers,
                params={"coach_name": "Alberto", "coach_gender": "male"},
                timeout=30,
            )
            assert r.status_code == 200, f"expected 200 not 500: {r.status_code} {r.text[:200]}"
            b = r.json()
            assert b.get("has_event") is False
        finally:
            # Restore prior event (may be None fields — that's fine)
            requests.put(
                f"{BASE_URL}/api/analysis/event",
                headers=gl_headers,
                json={"event_date": prior.get("event_date"), "event_name": prior.get("event_name")},
                timeout=15,
            )
