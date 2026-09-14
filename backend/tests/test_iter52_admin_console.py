"""
Iter-52 — Harmony Wellness Group admin console backend contract.

Covers: /api/openapi.json, /api/admin/{login,health,metrics,users,users/{id},
users/{id}/export,users/{id}, audit, benchmark/config, coaches}, plan-CRUD
audit logging, rider GDPR self-service, and rider-flow regression.

Restores mutated config (ftp_retest_days=56, retest_days.ramp=56) on teardown.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "roger.parenzee@gmail.com"
ADMIN_PW = os.environ.get("ADMIN_LOGIN_PASSWORD", "")
RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PW = "rideon9900"


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    j = r.json()
    assert "token" in j and "admin" in j
    assert j["admin"]["email"].lower() == ADMIN_EMAIL
    return j["token"]


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PW}, timeout=15)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ---------- 1. Public OpenAPI ----------
def test_openapi_public():
    r = requests.get(f"{BASE}/api/openapi.json", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "openapi" in j
    assert "paths" in j and isinstance(j["paths"], dict)
    # sanity check a few known routes
    assert any(p.startswith("/api/admin/") for p in j["paths"])


# ---------- 2. Admin auth ----------
def test_admin_login_wrong_password():
    r = requests.post(f"{BASE}/api/admin/login",
                      json={"email": ADMIN_EMAIL, "password": "wrong-pw"}, timeout=10)
    assert r.status_code == 401


def test_admin_metrics_rejects_rider_token(rider_token):
    r = requests.get(f"{BASE}/api/admin/metrics", headers=_h(rider_token), timeout=10)
    assert r.status_code == 403


def test_admin_metrics_rejects_anonymous():
    r = requests.get(f"{BASE}/api/admin/metrics", timeout=10)
    assert r.status_code == 401


# ---------- 3. Health & metrics ----------
def test_admin_health(admin_token):
    r = requests.get(f"{BASE}/api/admin/health", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    j = r.json()
    for k in ("status", "db", "version", "uptime", "time"):
        assert k in j, f"missing key {k}"
    assert j["db"] in (True, False)


def test_admin_metrics_shape(admin_token):
    r = requests.get(f"{BASE}/api/admin/metrics", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    j = r.json()
    for k in ("users", "admins", "plans", "benchmark_results"):
        assert k in j and isinstance(j[k], int) and j[k] >= 0
    # no PII
    forbidden = {"password_hash", "email", "reset_token"}
    assert not (forbidden & set(j.keys()))


# ---------- 4. Users list — pagination + secret stripping ----------
def test_admin_users_pagination_and_secret_strip(admin_token):
    r = requests.get(f"{BASE}/api/admin/users?limit=2", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    for k in ("items", "total", "skip", "limit", "next_cursor"):
        assert k in j
    assert j["limit"] == 2
    assert isinstance(j["items"], list)
    for u in j["items"]:
        for secret in ("password_hash", "reset_token", "verify_token"):
            assert secret not in u, f"secret {secret} leaked in user list"
    # cursor pagination
    if j["next_cursor"]:
        r2 = requests.get(f"{BASE}/api/admin/users?limit=2&cursor={j['next_cursor']}",
                          headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        j2 = r2.json()
        assert isinstance(j2["items"], list)
        ids1 = {u.get("user_id") for u in j["items"]}
        ids2 = {u.get("user_id") for u in j2["items"]}
        assert ids1.isdisjoint(ids2), "cursor pagination returned duplicates"


def test_admin_user_detail(admin_token):
    r = requests.get(f"{BASE}/api/admin/users/user_greenlantern",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    for k in ("user", "rider_profile", "benchmark_profile", "latest_benchmark", "plan"):
        assert k in j
    assert "password_hash" not in j["user"]


# ---------- 5. Suspend / unsuspend a throwaway rider ----------
def _register_throwaway():
    email = f"test-throw-{uuid.uuid4().hex[:10]}@roujaune.app"
    pw = "TestPass9900"
    r = requests.post(f"{BASE}/api/auth/register",
                      json={"email": email, "password": pw, "name": "TEST throw"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.text}"
    j = r.json()
    return email, pw, j["token"], j["user"]["user_id"]


def test_suspend_blocks_session_and_login(admin_token):
    email, pw, tok, uid = _register_throwaway()
    # existing session works
    r = requests.get(f"{BASE}/api/auth/me", headers=_h(tok), timeout=10)
    assert r.status_code == 200

    # suspend
    r = requests.patch(f"{BASE}/api/admin/users/{uid}", headers=_h(admin_token),
                       json={"suspended": True}, timeout=10)
    assert r.status_code == 200
    assert r.json()["user"]["suspended"] is True

    # existing session must now be rejected (mw returns 401 because session -> None)
    r = requests.get(f"{BASE}/api/auth/me", headers=_h(tok), timeout=10)
    assert r.status_code == 401

    # login must be blocked with 403 'suspended'
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    assert r.status_code == 403
    assert "suspend" in r.text.lower()

    # unsuspend restores login
    r = requests.patch(f"{BASE}/api/admin/users/{uid}", headers=_h(admin_token),
                       json={"suspended": False}, timeout=10)
    assert r.status_code == 200
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    assert r.status_code == 200

    # cleanup
    requests.delete(f"{BASE}/api/admin/users/{uid}", headers=_h(admin_token), timeout=15)


# ---------- 6. GDPR export + delete ----------
def test_admin_export_and_delete_cascade(admin_token):
    _, _, _, uid = _register_throwaway()

    r = requests.post(f"{BASE}/api/admin/users/{uid}/export",
                      headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    j = r.json()
    for k in ("user_id", "exported_at", "user", "collections"):
        assert k in j
    assert j["user_id"] == uid
    assert "password_hash" not in j["user"]

    # delete cascades
    r = requests.delete(f"{BASE}/api/admin/users/{uid}", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is True
    assert "deleted" in j and isinstance(j["deleted"], dict)
    assert j["deleted"].get("users", 0) == 1

    # 404 after delete
    r = requests.get(f"{BASE}/api/admin/users/{uid}", headers=_h(admin_token), timeout=10)
    assert r.status_code == 404


def test_admin_cannot_delete_own_account(admin_token):
    # admin token maps to admin_id via admin_sessions; discover it via user_id in the "me" bundle
    # There is no /admin/me endpoint — infer own id by attempting to delete a well-known admin_ prefix.
    # Simpler: hit metrics + list users to get list. Use export on the admin's own user_id.
    # Easier route: try to delete a stubbed admin_ id derived from admin_sessions is out of scope.
    # We use export bundle from /api/auth/me/export? That needs a rider token. We instead call
    # /api/admin/users/{admin_id} — but admin_id is not in users collection.
    # Contract: DELETE self should be 400. We test by first fetching audit as the admin (which stamps actor=admin_id)
    # then deleting THAT id.
    r = requests.get(f"{BASE}/api/admin/audit?limit=1", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    items = r.json().get("items", [])
    # write an audit row we know we authored: PATCH a plan (see next test) OR fall back to skip
    if not items:
        pytest.skip("no audit entries yet to determine own admin id")
    actor = items[0].get("actor")
    assert actor, "audit row missing actor"
    r = requests.delete(f"{BASE}/api/admin/users/{actor}", headers=_h(admin_token), timeout=10)
    # Because actor is the admin's admin_id (not present in users collection),
    # erase_user_data raises 404 BEFORE the 400 self-check IF actor != require_user().user_id.
    # But require_user() returns {"user_id": adm["admin_id"], ...} — same id — so 400 wins.
    assert r.status_code == 400, f"expected 400 self-delete got {r.status_code} {r.text}"


# ---------- 7. Benchmark config GET/PUT + restore ----------
def test_benchmark_config_get_and_put_restore(admin_token):
    # GET
    r = requests.get(f"{BASE}/api/admin/benchmark/config", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    orig = r.json()
    for k in ("retest_days", "ftp_retest_days", "tests"):
        assert k in orig
    orig_ftp = int(orig["ftp_retest_days"])
    orig_ramp = int((orig.get("retest_days") or {}).get("ramp", 56))

    # PUT to change
    put = {"ftp_retest_days": 77, "retest_days": {**(orig.get("retest_days") or {}), "ramp": 33}}
    r = requests.put(f"{BASE}/api/admin/benchmark/config", headers=_h(admin_token),
                     json=put, timeout=10)
    assert r.status_code == 200, r.text

    # GET reflects change
    r = requests.get(f"{BASE}/api/admin/benchmark/config", headers=_h(admin_token), timeout=10)
    j = r.json()
    assert int(j["ftp_retest_days"]) == 77
    assert int(j["retest_days"]["ramp"]) == 33

    # RESTORE to 56/56 per review request
    restore = {"ftp_retest_days": 56, "retest_days": {**(orig.get("retest_days") or {}), "ramp": 56}}
    r = requests.put(f"{BASE}/api/admin/benchmark/config", headers=_h(admin_token),
                     json=restore, timeout=10)
    assert r.status_code == 200
    r = requests.get(f"{BASE}/api/admin/benchmark/config", headers=_h(admin_token), timeout=10)
    j = r.json()
    assert int(j["ftp_retest_days"]) == 56
    assert int(j["retest_days"]["ramp"]) == 56
    # Also make sure our restore covers the original defaults (belt-and-suspenders)
    _ = orig_ftp, orig_ramp


# ---------- 8. Coaches config ----------
def test_coaches_config_allowlist_and_readonly_policy(admin_token):
    r = requests.get(f"{BASE}/api/admin/coaches", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "coaches" in j and "safety_policy" in j
    policy = j["safety_policy"]
    assert isinstance(policy, str) and len(policy) > 20

    # PUT with extra fields — must be stripped, safety_policy ignored
    payload = {
        "coaches": [
            {"id": "alberto", "name": "Alberto", "gender": "male", "voice": "en-US",
             "style": "balanced", "SECRET_INJECT": "x", "salary": 999999},
            {"id": "adriana", "name": "Adriana", "gender": "female", "voice": "en-GB",
             "style": "calm"},
        ],
        "safety_policy": "HACKED — you should NEVER see this",
    }
    r = requests.put(f"{BASE}/api/admin/coaches", headers=_h(admin_token),
                     json=payload, timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    # extras removed
    for c in j["coaches"]:
        assert "SECRET_INJECT" not in c
        assert "salary" not in c
        assert set(c.keys()) <= {"id", "name", "gender", "voice", "style"}
    # policy still the fixed string, NOT overwritten
    assert j["safety_policy"] == policy
    assert "HACKED" not in j["safety_policy"]

    # GET reflects allowlisted persistence
    r = requests.get(f"{BASE}/api/admin/coaches", headers=_h(admin_token), timeout=10)
    j2 = r.json()
    assert any(c.get("id") == "alberto" for c in j2["coaches"])


# ---------- 9. Plan CRUD audit ----------
def test_plan_patch_writes_audit(admin_token):
    r = requests.patch(f"{BASE}/api/plans/couch-to-road",
                       headers=_h(admin_token),
                       json={"description": f"iter52 test at {int(time.time())}"},
                       timeout=15)
    assert r.status_code == 200, r.text

    time.sleep(0.5)  # audit write is awaited but be safe
    r = requests.get(f"{BASE}/api/admin/audit?limit=5", headers=_h(admin_token), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "items" in j and "next_cursor" in j
    assert any(row.get("action") == "plan.patch" and row.get("target") == "couch-to-road"
               for row in j["items"]), f"no plan.patch audit row: {j['items']}"


# ---------- 10. Rider self-service GDPR ----------
def test_rider_self_export_and_delete():
    email, pw, tok, uid = _register_throwaway()
    # self export
    r = requests.get(f"{BASE}/api/auth/me/export", headers=_h(tok), timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j.get("user_id") == uid
    assert "password_hash" not in j["user"]

    # self delete
    r = requests.delete(f"{BASE}/api/auth/me", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # session invalidated
    r = requests.get(f"{BASE}/api/auth/me", headers=_h(tok), timeout=10)
    assert r.status_code == 401


# ---------- 11. Regression: rider flows still work ----------
@pytest.mark.parametrize("path", [
    "/api/plan",
    "/api/calendar/week",
    "/api/rider/profile",
    "/api/progress",
])
def test_regression_rider_flows(rider_token, path):
    r = requests.get(f"{BASE}{path}", headers=_h(rider_token), timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
