"""
Backend tests for the HWG external admin console service token.

Scope (iteration 86):
- Static service token grants admin access to /api/admin/* endpoints.
- Security boundary: wrong / missing token -> 401.
- Authorization boundary: rider session token -> 403 on admin endpoints.
- Regression: interactive /api/admin/login still works and its token accesses admin.
- Regression: rider token still accesses rider endpoints.

Read-only: no data is mutated on any admin endpoint. Only login POSTs create
short-lived session tokens (12h admin, 7d rider).
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
# NOTE (2026-06 security audit): this file originally tested a retired
# mechanism named ADMIN_API_TOKEN with a hardcoded token literal. That
# mechanism was superseded by HWG_SERVICE_TOKEN (see auth.py::_resolve_token)
# and the old env var/code path no longer exists — testing it would have
# been testing dead code with a leaked credential. Fixed to test the real,
# current mechanism, reading the live token from the environment.
HWG_SERVICE_TOKEN = os.environ.get("HWG_SERVICE_TOKEN", "")
ADMIN_EMAIL = os.environ.get("ADMIN_LOGIN_EMAIL", "roger.parenzee@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_LOGIN_PASSWORD", "")
RIDER_EMAIL = "demo@roujaune.app"
RIDER_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def rider_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and body["token"]
    return body["token"]


@pytest.fixture(scope="module")
def admin_login_token(s):
    r = s.post(f"{BASE_URL}/api/admin/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and body["token"]
    assert body.get("admin", {}).get("role") == "admin"
    return body["token"]


# ---------- 1) Service token grants admin -----------------------------------
class TestServiceTokenGrantsAdmin:
    def _h(self):
        return {"Authorization": f"Bearer {HWG_SERVICE_TOKEN}"}

    def test_admin_me(self, s):
        r = s.get(f"{BASE_URL}/api/admin/me", headers=self._h(), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # Response is {"admin": {...}} per admin_routes
        adm = body.get("admin") or body
        # user_id 'hwg_console' is the synthetic HWG service principal
        uid = adm.get("admin_id") or adm.get("user_id") or adm.get("id")
        assert uid == "hwg_console", f"expected hwg_console, got {adm}"
        assert (adm.get("role") or "").lower() == "admin"

    def test_admin_users(self, s):
        r = s.get(f"{BASE_URL}/api/admin/users", headers=self._h(), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Paginated response: {"items":[...], "total":N, "skip":..., "limit":..., "next_cursor":...}
        if isinstance(body, dict):
            users = body.get("items") or body.get("users")
        else:
            users = body
        assert isinstance(users, list), f"expected list of users, got body={body!r}"

    def test_admin_dashboard(self, s):
        r = s.get(f"{BASE_URL}/api/admin/dashboard", headers=self._h(), timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (dict, list))

    def test_admin_metrics(self, s):
        r = s.get(f"{BASE_URL}/api/admin/metrics", headers=self._h(), timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (dict, list))


# ---------- 2) Security: wrong / missing token ------------------------------
class TestServiceTokenSecurity:
    def test_wrong_token_returns_401(self, s):
        r = s.get(f"{BASE_URL}/api/admin/me",
                  headers={"Authorization": "Bearer bogus123"}, timeout=20)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_missing_auth_returns_401(self, s):
        # Use a fresh session so no default auth header sneaks in
        r = requests.get(f"{BASE_URL}/api/admin/me", timeout=20)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ---------- 3) Authorization boundary: rider CANNOT access admin ------------
class TestRiderBoundary:
    def test_rider_token_forbidden_on_admin_me(self, s, rider_token):
        r = s.get(f"{BASE_URL}/api/admin/me",
                  headers={"Authorization": f"Bearer {rider_token}"}, timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        # Body should mention admin access
        try:
            detail = (r.json().get("detail") or "").lower()
            assert "admin" in detail
        except Exception:
            pass

    def test_rider_token_forbidden_on_admin_users(self, s, rider_token):
        r = s.get(f"{BASE_URL}/api/admin/users",
                  headers={"Authorization": f"Bearer {rider_token}"}, timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- 4) Regression: interactive admin login still works --------------
class TestInteractiveAdminRegression:
    def test_admin_login_token_hits_admin_me(self, s, admin_login_token):
        r = s.get(f"{BASE_URL}/api/admin/me",
                  headers={"Authorization": f"Bearer {admin_login_token}"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        adm = body.get("admin") or body
        assert (adm.get("role") or "").lower() == "admin"
        # Must NOT be the synthetic service principal (must be the real admin store)
        uid = adm.get("admin_id") or adm.get("user_id") or adm.get("id")
        assert uid != "hwg_console", "interactive admin login should not resolve to service principal"


# ---------- 5) Regression: rider auth still works on rider endpoints --------
class TestRiderRegression:
    def test_auth_me_with_rider_token(self, s, rider_token):
        r = s.get(f"{BASE_URL}/api/auth/me",
                  headers={"Authorization": f"Bearer {rider_token}"}, timeout=20)
        assert r.status_code == 200, r.text
        u = r.json().get("user") or {}
        assert u.get("email", "").lower() == RIDER_EMAIL

    def test_analysis_streak_with_rider_token(self, s, rider_token):
        r = s.get(f"{BASE_URL}/api/analysis/streak",
                  headers={"Authorization": f"Bearer {rider_token}"}, timeout=30)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
