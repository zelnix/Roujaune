"""
Iter-53 — HWG admin console EXACT path surface.

Adds coverage for the newly-added console endpoints:
  GET  /api/admin/me                            (HARD BLOCKER)
  GET  /api/admin/nav-badges
  GET  /api/admin/dashboard
  GET  /api/admin/analytics/growth              (6-item series)
  GET  /api/admin/riders  + lifecycle actions:
       POST /riders/{id}/suspend
       POST /riders/{id}/reactivate
       POST /riders/{id}/reset-password
       DELETE /riders/{id}
       GET  /riders/export/csv
  GET  /api/admin/plans (items with status)
       POST /plans/couch-to-road/publish|archive|publish
  GET  /api/admin/integrations?health=1         (must contain database entry)
  GET  /api/admin/catalog
  GET  /api/admin/config/benchmarks             (alias of benchmark/config)
  GET  /api/admin/coaches
  RBAC on /me and /dashboard.

Restores couch-to-road status='published' AND ftp_retest_days=56,
retest_days.ramp=56 at the end.
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
    return j["token"]


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PW}, timeout=15)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _register_throwaway():
    """Register a fresh throwaway rider and return (token, user_id, email, password)."""
    email = f"test-i53-{uuid.uuid4().hex[:8]}@roujaune.app"
    pw = "Throwaway9900!"
    r = requests.post(f"{BASE}/api/auth/register",
                      json={"email": email, "password": pw, "name": "Iter53 Throwaway"},
                      timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    assert "token" in j and "user" in j
    return j["token"], j["user"]["user_id"], email, pw


# ==========================================================================
#  /api/admin/me — HARD BLOCKER
# ==========================================================================
def test_admin_me_shape(admin_token):
    r = requests.get(f"{BASE}/api/admin/me", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("admin_id", "email", "name", "role", "provider"):
        assert k in j, f"missing {k} in /api/admin/me: {j}"
    assert j["email"].lower() == ADMIN_EMAIL
    assert j["role"] == "admin"
    assert isinstance(j["admin_id"], str) and j["admin_id"]


def test_admin_me_no_token_is_401():
    r = requests.get(f"{BASE}/api/admin/me", timeout=15)
    assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


def test_admin_me_rider_token_is_403(rider_token):
    r = requests.get(f"{BASE}/api/admin/me", headers=_h(rider_token), timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ==========================================================================
#  /api/admin/dashboard — RBAC
# ==========================================================================
def test_admin_dashboard_shape(admin_token):
    r = requests.get(f"{BASE}/api/admin/dashboard", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("riders", "active", "suspended", "onboarded", "new_this_week",
             "admins", "plans", "benchmark_results", "catalog", "time"):
        assert k in j, f"missing {k}"
    assert isinstance(j["riders"], int) and j["riders"] >= 0
    assert j["active"] == j["riders"] - j["suspended"]


def test_admin_dashboard_no_token_is_401():
    r = requests.get(f"{BASE}/api/admin/dashboard", timeout=15)
    assert r.status_code == 401


def test_admin_dashboard_rider_token_is_403(rider_token):
    r = requests.get(f"{BASE}/api/admin/dashboard", headers=_h(rider_token), timeout=15)
    assert r.status_code == 403


# ==========================================================================
#  /api/admin/nav-badges
# ==========================================================================
def test_admin_nav_badges(admin_token):
    r = requests.get(f"{BASE}/api/admin/nav-badges", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("riders", "suspended", "plans", "catalog"):
        assert k in j and isinstance(j[k], int) and j[k] >= 0


# ==========================================================================
#  /api/admin/analytics/growth — 6 buckets
# ==========================================================================
def test_admin_analytics_growth_series(admin_token):
    r = requests.get(f"{BASE}/api/admin/analytics/growth", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "series" in j and isinstance(j["series"], list)
    assert len(j["series"]) == 6, f"expected 6 buckets, got {len(j['series'])}"
    prev_total = -1
    for row in j["series"]:
        for k in ("month", "label", "new_users", "total_users"):
            assert k in row, f"row missing {k}: {row}"
        assert isinstance(row["new_users"], int) and row["new_users"] >= 0
        assert isinstance(row["total_users"], int) and row["total_users"] >= 0
        # cumulative must be non-decreasing
        assert row["total_users"] >= prev_total
        prev_total = row["total_users"]
        # label is a 3-letter month abbrev
        assert len(row["label"]) == 3
        # month is YYYY-MM
        assert len(row["month"]) == 7 and row["month"][4] == "-"


# ==========================================================================
#  /api/admin/riders + /api/admin/riders/export/csv
# ==========================================================================
def test_admin_riders_list(admin_token):
    r = requests.get(f"{BASE}/api/admin/riders?limit=5", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and "total" in j
    for u in j["items"]:
        assert "password_hash" not in u


def test_admin_riders_export_csv_route_not_shadowed(admin_token):
    """The /riders/export/csv path MUST NOT be captured by /riders/{id}."""
    r = requests.get(f"{BASE}/api/admin/riders/export/csv",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
    assert r.status_code == 200, f"csv export failed: {r.status_code} {r.text[:200]}"
    ctype = r.headers.get("content-type", "")
    assert "text/csv" in ctype, f"unexpected content-type: {ctype}"
    body = r.text
    first_line = body.splitlines()[0]
    # Header must start with these fields in order
    assert first_line.startswith("user_id,email,name"), f"csv header mismatch: {first_line}"
    for f in ("provider", "role", "assigned_plan_id", "onboarded",
              "email_verified", "suspended", "created_at"):
        assert f in first_line, f"csv header missing {f}"


# ==========================================================================
#  Rider lifecycle — throwaway rider (register/suspend/reactivate/reset/delete)
# ==========================================================================
def test_rider_lifecycle_full(admin_token):
    tok, uid, email, pw = _register_throwaway()

    # sanity: fresh rider can log in
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200

    try:
        # ---- suspend ----
        r = requests.post(f"{BASE}/api/admin/riders/{uid}/suspend",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["user"]["suspended"] is True

        # login blocked with 403
        r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 403, f"expected 403 after suspend, got {r.status_code} {r.text}"

        # ---- reactivate ----
        r = requests.post(f"{BASE}/api/admin/riders/{uid}/reactivate",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["suspended"] is False

        r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 200, f"login failed after reactivate: {r.status_code} {r.text}"

        # ---- reset password ----
        r = requests.post(f"{BASE}/api/admin/riders/{uid}/reset-password",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        temp = j.get("temporary_password")
        assert isinstance(temp, str) and len(temp) >= 8

        # old password no longer works
        r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 401, f"old pw should be invalid, got {r.status_code}"

        # new temp password works
        r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": temp}, timeout=15)
        assert r.status_code == 200, f"temp pw login failed: {r.status_code} {r.text}"

        # ---- delete (cascade) ----
        r = requests.delete(f"{BASE}/api/admin/riders/{uid}",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True

        # GET should now 404
        r = requests.get(f"{BASE}/api/admin/riders/{uid}",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 404, f"expected 404 after delete, got {r.status_code} {r.text}"
        uid = None  # avoid double-cleanup
    finally:
        if uid:
            try:
                requests.delete(f"{BASE}/api/admin/riders/{uid}",
                                headers=_h(admin_token), timeout=15)
            except Exception:
                pass


# ==========================================================================
#  Plans list + lifecycle (publish/archive/publish) + audit
# ==========================================================================
def test_admin_plans_items_have_status(admin_token):
    r = requests.get(f"{BASE}/api/admin/plans", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and isinstance(j["items"], list)
    assert len(j["items"]) >= 1
    for p in j["items"]:
        assert "id" in p and "status" in p
    # couch-to-road must be present
    ids = [p["id"] for p in j["items"]]
    assert "couch-to-road" in ids, f"couch-to-road not listed: {ids}"


def test_plan_lifecycle_and_audit(admin_token):
    pid = "couch-to-road"

    # publish → archive → publish
    r = requests.post(f"{BASE}/api/admin/plans/{pid}/publish",
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 200 and r.json() == {"id": pid, "status": "published"}, r.text

    r = requests.post(f"{BASE}/api/admin/plans/{pid}/archive",
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 200 and r.json() == {"id": pid, "status": "archived"}, r.text

    r = requests.post(f"{BASE}/api/admin/plans/{pid}/publish",
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 200 and r.json() == {"id": pid, "status": "published"}, r.text

    # audit rows visible
    r = requests.get(f"{BASE}/api/admin/audit?limit=25",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    actions = [row.get("action") for row in r.json().get("items", [])]
    assert "plan.published" in actions, f"plan.published not in recent audit: {actions}"
    assert "plan.archived" in actions, f"plan.archived not in recent audit: {actions}"


# ==========================================================================
#  /api/admin/integrations?health=1
# ==========================================================================
def test_admin_integrations_health(admin_token):
    r = requests.get(f"{BASE}/api/admin/integrations?health=1",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j
    ids = [it["id"] for it in j["items"]]
    assert "database" in ids, f"database entry missing when health=1: {ids}"
    for expected in ("llm", "email", "push", "weather", "google_auth"):
        assert expected in ids, f"integration {expected} missing"
    for it in j["items"]:
        assert "status" in it
        assert "configured" in it


def test_admin_integrations_without_health_omits_database(admin_token):
    r = requests.get(f"{BASE}/api/admin/integrations",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    ids = [it["id"] for it in r.json()["items"]]
    assert "database" not in ids


# ==========================================================================
#  /api/admin/catalog
# ==========================================================================
def test_admin_catalog(admin_token):
    r = requests.get(f"{BASE}/api/admin/catalog", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "items" in j and isinstance(j["items"], list)


# ==========================================================================
#  /api/admin/config/benchmarks (alias) — round-trip
# ==========================================================================
def test_config_benchmarks_alias_roundtrip(admin_token):
    # baseline
    r = requests.get(f"{BASE}/api/admin/config/benchmarks",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    baseline = r.json()
    assert "ftp_retest_days" in baseline
    assert "retest_days" in baseline and "ramp" in baseline["retest_days"]

    # cross-check the canonical endpoint returns the same
    r_can = requests.get(f"{BASE}/api/admin/benchmark/config",
                         headers=_h(admin_token), timeout=15)
    assert r_can.status_code == 200
    assert r_can.json().get("ftp_retest_days") == baseline["ftp_retest_days"]

    # mutate via alias
    put = requests.put(f"{BASE}/api/admin/config/benchmarks",
                       headers=_h(admin_token),
                       json={"ftp_retest_days": 71, "retest_days": {"ramp": 42}},
                       timeout=15)
    assert put.status_code == 200, put.text

    # GET reflects
    r = requests.get(f"{BASE}/api/admin/config/benchmarks",
                     headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["ftp_retest_days"] == 71
    assert j["retest_days"]["ramp"] == 42

    # canonical endpoint sees the same
    r_can = requests.get(f"{BASE}/api/admin/benchmark/config",
                         headers=_h(admin_token), timeout=15)
    assert r_can.status_code == 200
    assert r_can.json()["ftp_retest_days"] == 71


# ==========================================================================
#  /api/admin/coaches
# ==========================================================================
def test_admin_coaches(admin_token):
    r = requests.get(f"{BASE}/api/admin/coaches", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    # Accept either {coaches:[...]} or {items:[...]} shapes
    coaches = j.get("coaches") or j.get("items") or j
    assert coaches, f"empty coaches response: {j}"


# ==========================================================================
#  REGRESSION — greenlantern rider still healthy
# ==========================================================================
def test_regression_rider_endpoints(rider_token):
    r = requests.get(f"{BASE}/api/plan", headers=_h(rider_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("title") == "From Couch to Road"
    assert j.get("duration_weeks") == 16

    r = requests.get(f"{BASE}/api/calendar/week", headers=_h(rider_token), timeout=15)
    assert r.status_code == 200

    r = requests.get(f"{BASE}/api/rider/profile", headers=_h(rider_token), timeout=15)
    assert r.status_code == 200

    r = requests.get(f"{BASE}/api/progress", headers=_h(rider_token), timeout=15)
    assert r.status_code == 200


def test_regression_existing_admin_endpoints(admin_token):
    for path in ("/api/admin/users?limit=1", "/api/admin/metrics", "/api/admin/health"):
        r = requests.get(f"{BASE}{path}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code}"


# ==========================================================================
#  ZZ_teardown — restore global state
# ==========================================================================
def test_zz_restore_couch_to_road_published(admin_token):
    r = requests.post(f"{BASE}/api/admin/plans/couch-to-road/publish",
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "published"


def test_zz_restore_benchmark_config(admin_token):
    r = requests.put(f"{BASE}/api/admin/config/benchmarks",
                     headers=_h(admin_token),
                     json={"ftp_retest_days": 56, "retest_days": {"ramp": 56}},
                     timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{BASE}/api/admin/config/benchmarks",
                     headers=_h(admin_token), timeout=15)
    j = r.json()
    assert j["ftp_retest_days"] == 56
    assert j["retest_days"]["ramp"] == 56
