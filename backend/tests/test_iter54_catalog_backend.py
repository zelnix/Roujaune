"""iter54 — Backend tests for the server-managed workout catalog.

Covers:
  1. Rider read: GET /api/catalog (~171 items), GET /api/catalog/threshold-climb (60min)
  2. Copy-on-assign + per-rider edit isolation + reset
  3. Edit allowlist enforcement (ignore id/user_id/junk)
  4. Admin catalog CRUD (throwaway id) + audit trail
  5. Coach per-rider assign/edit/list/reset (throwaway rider) + audit + rider visibility
  6. GDPR cascade: DELETE /api/admin/users/{id} removes rider_workouts
  7. Regressions: /api/plan (couch-to-road, 16w), /api/calendar/week

Runs against the external EXPO_PUBLIC_BACKEND_URL. Cleans up on completion.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")

RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PW = "rideon9900"
ADMIN_EMAIL = "roger.parenzee@gmail.com"
ADMIN_PW = os.environ.get("ADMIN_LOGIN_PASSWORD", "")


# ---- Session fixtures ------------------------------------------------------- #
@pytest.fixture(scope="module")
def rider_token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PW}, timeout=30)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---- 1. Rider catalog read -------------------------------------------------- #
class TestRiderCatalogRead:
    def test_get_catalog_list_has_all_items(self, rider_token):
        r = requests.get(f"{BASE_URL}/api/catalog", headers=_h(rider_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)
        # Seed has 171 workouts — allow >= in case admin added test items concurrently.
        assert len(j["items"]) >= 170, f"expected ~171 items, got {len(j['items'])}"
        ids = {w.get("id") for w in j["items"]}
        assert "threshold-climb" in ids
        assert "ctr-ride-1" in ids

    def test_get_threshold_climb_defaults(self, rider_token):
        r = requests.get(f"{BASE_URL}/api/catalog/threshold-climb",
                         headers=_h(rider_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["id"] == "threshold-climb"
        assert j["name"] == "Threshold Climb"
        assert j["duration"] == 60


# ---- 2. Copy-on-assign + per-rider edit isolation --------------------------- #
class TestRiderCopyOnAssign:
    def test_assign_edit_isolation_reset(self, rider_token, admin_token):
        wid = "threshold-climb"
        try:
            # Copy-on-assign
            a = requests.post(f"{BASE_URL}/api/catalog/{wid}/assign",
                              headers=_h(rider_token), timeout=30)
            assert a.status_code == 200, a.text
            aj = a.json()
            assert aj.get("assigned") == wid
            assert aj["workout"].get("origin_id") == wid
            assert aj["workout"].get("duration") == 60  # copied from global

            # Edit only the rider copy
            e = requests.put(f"{BASE_URL}/api/catalog/{wid}",
                             headers=_h(rider_token),
                             json={"patch": {"duration": 45, "name": "My copy"}}, timeout=30)
            assert e.status_code == 200, e.text
            ej = e.json()["workout"]
            assert ej["duration"] == 45
            assert ej["name"] == "My copy"
            assert ej["id"] == wid

            # Rider view = 45
            r_rider = requests.get(f"{BASE_URL}/api/catalog/{wid}",
                                   headers=_h(rider_token), timeout=30)
            assert r_rider.status_code == 200
            assert r_rider.json()["duration"] == 45
            assert r_rider.json()["name"] == "My copy"

            # Global admin view unchanged = 60 (isolation)
            r_admin = requests.get(f"{BASE_URL}/api/admin/catalog/{wid}",
                                   headers=_h(admin_token), timeout=30)
            assert r_admin.status_code == 200
            assert r_admin.json()["duration"] == 60, "GLOBAL catalog leaked rider edit"
            assert r_admin.json()["name"] == "Threshold Climb"

            # Reset reverts to global
            d = requests.delete(f"{BASE_URL}/api/catalog/{wid}/reset",
                                headers=_h(rider_token), timeout=30)
            assert d.status_code == 200
            assert d.json()["reverted"] is True

            r_after = requests.get(f"{BASE_URL}/api/catalog/{wid}",
                                   headers=_h(rider_token), timeout=30)
            assert r_after.status_code == 200
            assert r_after.json()["duration"] == 60
            assert r_after.json()["name"] == "Threshold Climb"
        finally:
            # Belt-and-suspenders cleanup — ensure greenlantern has no copy.
            requests.delete(f"{BASE_URL}/api/catalog/{wid}/reset",
                            headers=_h(rider_token), timeout=30)


# ---- 3. Edit allowlist enforcement ----------------------------------------- #
class TestEditAllowlist:
    def test_put_ignores_non_allowlisted_fields(self, rider_token):
        wid = "threshold-climb"
        try:
            # Force copy first (edit auto-forks anyway)
            junk_patch = {
                "id": "hacked-id",
                "user_id": "attacker",
                "origin_id": "spoofed",
                "assigned_at": "1999-01-01",
                "arbitrary_junk": {"x": 1},
                "duration": 30,          # allowed
                "name": "Renamed",       # allowed
            }
            e = requests.put(f"{BASE_URL}/api/catalog/{wid}",
                             headers=_h(rider_token),
                             json={"patch": junk_patch}, timeout=30)
            assert e.status_code == 200, e.text
            w = e.json()["workout"]
            # Allowed fields applied
            assert w["duration"] == 30
            assert w["name"] == "Renamed"
            # Non-allowlisted fields NOT applied
            assert w["id"] == wid, "id must be forced back to path id"
            assert "arbitrary_junk" not in w, "unknown field must not be persisted"
            assert w.get("origin_id") == wid, "origin_id must stay bound to real global id"
            assert "user_id" not in w, "user_id must never be echoed back"
        finally:
            requests.delete(f"{BASE_URL}/api/catalog/{wid}/reset",
                            headers=_h(rider_token), timeout=30)


# ---- 4. Admin catalog CRUD -------------------------------------------------- #
class TestAdminCatalogCRUD:
    def test_admin_catalog_crud_and_audit(self, admin_token):
        test_id = f"test-wk-{uuid.uuid4().hex[:8]}"
        try:
            # LIST
            lst = requests.get(f"{BASE_URL}/api/admin/catalog",
                               headers=_h(admin_token), timeout=30)
            assert lst.status_code == 200
            assert isinstance(lst.json().get("items"), list)
            assert len(lst.json()["items"]) >= 170

            # CREATE
            defn = {"name": "TEST Workout", "duration": 25, "tss": 20,
                    "if": 0.7, "typeId": "endurance"}
            c = requests.post(f"{BASE_URL}/api/admin/catalog",
                              headers=_h(admin_token),
                              json={"id": test_id, "definition": defn}, timeout=30)
            assert c.status_code == 200, c.text
            item = c.json()["item"]
            assert item["id"] == test_id
            assert item["name"] == "TEST Workout"
            assert item["duration"] == 25

            # Duplicate -> 409
            c2 = requests.post(f"{BASE_URL}/api/admin/catalog",
                               headers=_h(admin_token),
                               json={"id": test_id, "definition": defn}, timeout=30)
            assert c2.status_code == 409

            # UPDATE
            u = requests.put(f"{BASE_URL}/api/admin/catalog/{test_id}",
                             headers=_h(admin_token),
                             json={"name": "TEST Updated", "duration": 40,
                                   "typeId": "endurance"}, timeout=30)
            assert u.status_code == 200
            assert u.json()["item"]["name"] == "TEST Updated"
            assert u.json()["item"]["duration"] == 40

            # GET
            g = requests.get(f"{BASE_URL}/api/admin/catalog/{test_id}",
                             headers=_h(admin_token), timeout=30)
            assert g.status_code == 200
            assert g.json()["duration"] == 40

            # DELETE
            d = requests.delete(f"{BASE_URL}/api/admin/catalog/{test_id}",
                                headers=_h(admin_token), timeout=30)
            assert d.status_code == 200
            assert d.json()["deleted"] == test_id

            # Verify gone
            g2 = requests.get(f"{BASE_URL}/api/admin/catalog/{test_id}",
                              headers=_h(admin_token), timeout=30)
            assert g2.status_code == 404

            # Audit contains catalog.create/update/delete for this id
            aud = requests.get(f"{BASE_URL}/api/admin/audit?limit=200",
                               headers=_h(admin_token), timeout=30)
            assert aud.status_code == 200
            actions = {(row.get("action"), row.get("target"))
                       for row in aud.json().get("items", [])}
            assert ("catalog.create", test_id) in actions
            assert ("catalog.update", test_id) in actions
            assert ("catalog.delete", test_id) in actions
        finally:
            requests.delete(f"{BASE_URL}/api/admin/catalog/{test_id}",
                            headers=_h(admin_token), timeout=30)


# ---- 5. Coach per-rider assign/edit + 6. GDPR cascade ---------------------- #
def _register_throwaway() -> tuple[str, str, str]:
    """Register a throwaway rider. Returns (user_id, email, token)."""
    email = f"test-i54-{uuid.uuid4().hex[:8]}@roujaune.app"
    pw = "TestPass9900!"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": pw, "name": "iter54 Throwaway"},
                      timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return j["user"]["user_id"], email, j["token"]


class TestCoachOverridesAndGDPR:
    def test_coach_assign_edit_list_reset_and_gdpr_cascade(self, admin_token):
        uid, email, tok = _register_throwaway()
        wid = "ctr-ride-1"
        try:
            # ASSIGN (coach copy-on-assign)
            a = requests.post(f"{BASE_URL}/api/admin/riders/{uid}/workouts/{wid}/assign",
                              headers=_h(admin_token), timeout=30)
            assert a.status_code == 200, a.text
            aj = a.json()
            assert aj["assigned"] == wid
            assert aj["workout"]["origin_id"] == wid
            assert aj["workout"].get("assigned_by") == ADMIN_EMAIL

            # EDIT via coach patch
            e = requests.put(f"{BASE_URL}/api/admin/riders/{uid}/workouts/{wid}",
                             headers=_h(admin_token),
                             json={"patch": {"duration": 30}}, timeout=30)
            assert e.status_code == 200, e.text
            assert e.json()["workout"]["duration"] == 30

            # LIST rider workouts (coach view)
            lst = requests.get(f"{BASE_URL}/api/admin/riders/{uid}/workouts",
                               headers=_h(admin_token), timeout=30)
            assert lst.status_code == 200
            ids = [w["id"] for w in lst.json().get("items", [])]
            assert wid in ids

            # Rider sees coach override
            g = requests.get(f"{BASE_URL}/api/catalog/{wid}",
                             headers=_h(tok), timeout=30)
            assert g.status_code == 200
            assert g.json()["duration"] == 30, "coach override not visible to rider"

            # Audit trail present
            aud = requests.get(f"{BASE_URL}/api/admin/audit?limit=200",
                               headers=_h(admin_token), timeout=30)
            aud_actions = {(row.get("action"), row.get("target"))
                           for row in aud.json().get("items", [])}
            assert ("rider.workout.assign", uid) in aud_actions
            assert ("rider.workout.edit", uid) in aud_actions

            # RESET reverts (deletes rider copy)
            d = requests.delete(f"{BASE_URL}/api/admin/riders/{uid}/workouts/{wid}",
                                headers=_h(admin_token), timeout=30)
            assert d.status_code == 200
            assert d.json()["reverted"] is True

            g2 = requests.get(f"{BASE_URL}/api/catalog/{wid}",
                              headers=_h(tok), timeout=30)
            assert g2.status_code == 200
            # after reset, rider sees global (whatever its default duration is; not 30)
            assert g2.json().get("duration") != 30

            # Re-assign to seed a rider_workouts doc for the GDPR check
            requests.post(f"{BASE_URL}/api/admin/riders/{uid}/workouts/{wid}/assign",
                          headers=_h(admin_token), timeout=30)
            # confirm doc exists
            lst2 = requests.get(f"{BASE_URL}/api/admin/riders/{uid}/workouts",
                                headers=_h(admin_token), timeout=30)
            assert any(w["id"] == wid for w in lst2.json().get("items", []))

            # GDPR cascade — deleting the rider must delete rider_workouts too
            drop = requests.delete(f"{BASE_URL}/api/admin/users/{uid}",
                                   headers=_h(admin_token), timeout=30)
            assert drop.status_code == 200, drop.text
            body = drop.json()
            deleted = body.get("deleted", {})
            # rider_workouts must be in the cascade report and >=1
            assert "rider_workouts" in deleted, \
                f"rider_workouts missing from GDPR cascade: {deleted}"
            assert deleted["rider_workouts"] >= 1, \
                f"expected >=1 rider_workouts erased, got {deleted['rider_workouts']}"

            # Verify rider gone
            g_user = requests.get(f"{BASE_URL}/api/admin/users/{uid}",
                                  headers=_h(admin_token), timeout=30)
            assert g_user.status_code == 404
        finally:
            # Best-effort cleanup if a mid-test assert bailed early.
            requests.delete(f"{BASE_URL}/api/admin/riders/{uid}/workouts/{wid}",
                            headers=_h(admin_token), timeout=30)
            requests.delete(f"{BASE_URL}/api/admin/users/{uid}",
                            headers=_h(admin_token), timeout=30)


# ---- 7. Regression ---------------------------------------------------------- #
class TestRegression:
    def test_rider_plan_still_couch_to_road(self, rider_token):
        r = requests.get(f"{BASE_URL}/api/plan", headers=_h(rider_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("title") == "From Couch to Road"
        assert j.get("duration_weeks") == 16

    def test_calendar_week_ok(self, rider_token):
        r = requests.get(f"{BASE_URL}/api/calendar/week",
                         headers=_h(rider_token), timeout=30)
        assert r.status_code == 200

    def test_admin_dashboard_still_ok(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/dashboard",
                         headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "riders" in j and "catalog" in j
