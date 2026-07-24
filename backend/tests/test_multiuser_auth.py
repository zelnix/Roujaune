"""Iter 26 — Multi-user auth, demo migration, onboarding, per-user isolation."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

DEMO_EMAIL = "greenlantern@roujaune.app"
DEMO_PASSWORD = "rideon9900"


def _unique_email(tag="tester"):
    return f"TEST_{tag}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---- Auth: register/login/me/logout ----
class TestAuthFlow:
    def test_register_success(self):
        email = _unique_email("reg")
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "abc123", "name": "Reg Tester"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and d["token"]
        assert d["user"]["email"] == email.lower()
        assert d["user"]["onboarded"] is False

    def test_register_duplicate_returns_409(self):
        email = _unique_email("dup")
        r1 = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": email, "password": "abc123"}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": email, "password": "abc123"}, timeout=15)
        assert r2.status_code == 409, r2.text

    def test_register_short_password_returns_400(self):
        email = _unique_email("short")
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "abc"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_login_success_and_wrong_password(self):
        email = _unique_email("login")
        requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "abc123"}, timeout=15)
        good = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"email": email, "password": "abc123"}, timeout=15)
        assert good.status_code == 200
        assert "token" in good.json()
        bad = requests.post(f"{BASE_URL}/api/auth/login",
                            json={"email": email, "password": "WRONG"}, timeout=15)
        assert bad.status_code == 401

    def test_plan_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/plan", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_me_with_bearer_returns_user(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == DEMO_EMAIL

    def test_logout_invalidates_token(self):
        email = _unique_email("logout")
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "abc123"}, timeout=15)
        token = reg.json()["token"]
        # confirm active
        r1 = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r1.status_code == 200
        # logout
        r2 = requests.post(f"{BASE_URL}/api/auth/logout",
                           headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r2.status_code == 200
        # reuse old token
        r3 = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r3.status_code == 401


# ---- Demo migration: Green Lantern has couch-to-road ----
class TestDemoMigration:
    def test_demo_login_returns_token(self, demo_token):
        assert isinstance(demo_token, str) and len(demo_token) > 10

    def test_demo_plan_is_couch_to_road(self, demo_token):
        r = requests.get(f"{BASE_URL}/api/plan",
                         headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # /api/plan returns the resolved plan payload
        pid = d.get("id") or d.get("plan_id") or d.get("active_plan_id")
        assert pid == "couch-to-road", f"expected couch-to-road, got {pid}, body keys={list(d.keys())}"
        # 16-week structure
        weeks = d.get("weeks") or d.get("structure") or []
        # If server returned progress with duration_weeks==16, accept that.
        dur = d.get("duration_weeks") or (len(weeks) if weeks else None)
        assert (dur == 16) or (weeks and len(weeks) >= 12), f"expected 16 wk plan; dur={dur}, weeks={len(weeks)}"


# ---- Onboarding classifier ----
class TestOnboarding:
    def test_beginner_recommends_couch_to_road(self):
        # Need a token to call — register a throwaway user
        email = _unique_email("beg")
        tok = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "abc123"}, timeout=15).json()["token"]
        r = requests.post(f"{BASE_URL}/api/onboarding/recommend",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"experience_years": 0, "weekly_rides": 0, "longest_ride_min": 0,
                                "confident_60min": False, "self_rating": "new"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["level"] == "Beginner", d
        assert d["recommended"]["id"] == "couch-to-road", d

    def test_advanced_level(self):
        email = _unique_email("adv")
        tok = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "abc123"}, timeout=15).json()["token"]
        r = requests.post(f"{BASE_URL}/api/onboarding/recommend",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"experience_years": 8, "weekly_rides": 5, "longest_ride_min": 180,
                                "confident_60min": True, "self_rating": "confident"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["level"] == "Advanced"

    def test_assign_none_plan_gives_free_riding(self):
        email = _unique_email("free")
        tok = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "abc123"}, timeout=15).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        r1 = requests.post(f"{BASE_URL}/api/rider/plan",
                           headers=h, json={"plan_id": "none"}, timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = requests.get(f"{BASE_URL}/api/plan", headers=h, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("free") is True, f"expected free:true, got {d}"

    def test_assign_build_and_climb(self):
        email = _unique_email("bnc")
        tok = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "abc123"}, timeout=15).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        r1 = requests.post(f"{BASE_URL}/api/rider/plan",
                           headers=h, json={"plan_id": "build-and-climb"}, timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = requests.get(f"{BASE_URL}/api/plan", headers=h, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        pid = d.get("id") or d.get("plan_id") or d.get("active_plan_id")
        assert pid == "build-and-climb", d


# ---- Per-user data isolation ----
class TestDataIsolation:
    def test_userA_ride_not_visible_to_userB(self):
        # userA and userB
        a_email = _unique_email("uA")
        b_email = _unique_email("uB")
        ta = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": a_email, "password": "abc123"}, timeout=15).json()["token"]
        tb = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": b_email, "password": "abc123"}, timeout=15).json()["token"]
        ha = {"Authorization": f"Bearer {ta}"}
        hb = {"Authorization": f"Bearer {tb}"}

        # userA posts a ride summary (uses reference summary => still writes ride_history)
        r = requests.post(f"{BASE_URL}/api/workouts/summarize",
                          headers=ha, json={"workout": "TEST_isolation", "elapsed": 60,
                                            "ftp": 200, "weight": 70, "samples": []}, timeout=20)
        assert r.status_code == 200, r.text
        ride_id = r.json().get("id")
        assert ride_id

        # userA sees their ride
        rA = requests.get(f"{BASE_URL}/api/rides/history", headers=ha, timeout=15)
        assert rA.status_code == 200
        assert any(x.get("id") == ride_id for x in rA.json()), "userA should see own ride"

        # userB should not see it
        rB = requests.get(f"{BASE_URL}/api/rides/history", headers=hb, timeout=15)
        assert rB.status_code == 200
        b_ids = [x.get("id") for x in rB.json()]
        assert ride_id not in b_ids, f"userB leaked userA data: {b_ids}"
        # And userB's list should be empty (fresh user)
        assert len(rB.json()) == 0, f"userB should have empty ride history, got {len(rB.json())}"
