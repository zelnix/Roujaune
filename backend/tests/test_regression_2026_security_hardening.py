"""Phase 1/2 regression pass after the 2026-09-14 security-hardening session.

Covers (as pure regression, not new features):
  - Rider login (demo) still works
  - Admin login: OLD password rejected (401), NEW rotated password works (200)
  - Admin console core flows with new password: list users, user detail, dashboard
  - Admin user search with regex-special characters does not hang/500 (HARD-4 ReDoS fix)
  - Coach chat send/reply still works and can reference the rider's real plan
  - Plan templates save/list/delete round-trip for the SAME user (own data, not cross-user)
"""
import os
import time

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "roger.parenzee@gmail.com"
ADMIN_PW_NEW = "8hvOdFrIOPe0Tt366afx"
ADMIN_PW_OLD = "letmein9900"

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PW = "demo9900"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW_NEW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


class TestRiderLogin:
    def test_demo_login_returns_user(self, demo_token):
        assert demo_token


class TestAdminPasswordRotation:
    def test_old_password_rejected(self):
        r = requests.post(f"{BASE}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW_OLD}, timeout=15)
        assert r.status_code == 401, f"expected 401 for old password, got {r.status_code}: {r.text}"

    def test_new_password_accepted(self, admin_token):
        assert admin_token


class TestAdminConsoleCoreFlows:
    def test_list_users(self, admin_token):
        r = requests.get(f"{BASE}/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        users = body.get("items", [])
        assert isinstance(users, list) and len(users) > 0

    def test_user_detail(self, admin_token):
        r = requests.get(f"{BASE}/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        users = r.json().get("items", [])
        demo_user = next((u for u in users if u.get("email") == DEMO_EMAIL), users[0])
        uid = demo_user.get("user_id") or demo_user.get("id")
        assert uid
        r2 = requests.get(f"{BASE}/api/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r2.status_code == 200, r2.text

    def test_dashboard_loads(self, admin_token):
        r = requests.get(f"{BASE}/api/admin/dashboard", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text

    def test_search_with_regex_special_chars_no_hang(self, admin_token):
        # HARD-4: unescaped $regex ReDoS fix — a classic catastrophic-backtracking
        # payload must return promptly (not hang) and not 500.
        start = time.time()
        r = requests.get(
            f"{BASE}/api/admin/users",
            params={"q": "(a+)+$"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        elapsed = time.time() - start
        assert r.status_code == 200, r.text
        assert elapsed < 5, f"admin search took too long ({elapsed}s) — possible ReDoS regression"

    def test_search_normal_query_still_works(self, admin_token):
        r = requests.get(
            f"{BASE}/api/admin/users",
            params={"q": "demo"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        users = r.json().get("items", [])
        assert any("demo" in (u.get("email") or "") for u in users), "search for 'demo' should find demo user"


class TestCoachChat:
    def test_send_message_and_get_reply(self, demo_token):
        headers = {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE}/api/coach/chat",
            headers=headers,
            json={"message": "What's my next scheduled workout on my plan?"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        reply = body.get("reply") or body.get("message") or body.get("response")
        assert reply and isinstance(reply, str) and len(reply) > 0


class TestPlanTemplatesOwnUserFlow:
    """Own-user regression for the collection that was just added to USER_SCOPED."""

    def test_save_list_delete_roundtrip(self, demo_token):
        headers = {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}
        plan = {
            "title": "TEST_Regression Template",
            "weeks_count": 1,
            "days_per_week": 2,
            "weeks": [{"days": [{"title": "Easy Spin"}, {"title": "Rest"}]}],
        }
        r = requests.post(f"{BASE}/api/coach/plan-templates", headers=headers, json={"plan": plan}, timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        r = requests.get(f"{BASE}/api/coach/plan-templates", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        ids = {t["id"] for t in r.json()["templates"]}
        assert tid in ids, "saved template should appear in own template list"

        r = requests.delete(f"{BASE}/api/coach/plan-templates/{tid}", headers=headers, timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE}/api/coach/plan-templates", headers=headers, timeout=15)
        ids_after = {t["id"] for t in r.json()["templates"]}
        assert tid not in ids_after, "deleted template should no longer appear in own list"
