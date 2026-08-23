"""Iteration 63 backend regression:

Covers the freshly-extracted route modules:
  * routes/catalog.py (via services/catalog.py) — GET /catalog, GET /catalog/{id},
    POST /catalog/{id}/assign (copy-on-assign), PUT /catalog/{id} (rider edit),
    DELETE /catalog/{id}/reset.
  * routes/system.py static endpoints — GET /routes, GET /community.
  * routes/notifications.py per-rider read-state — GET /read-state,
    POST /read (idempotent via $addToSet), POST /unread, POST /read-all.

Also cleans up (a) any workout copy assigned during the test and (b) resets
the rider's notification read-state at the very end so the demo shows
unread again for greenlantern.
"""
import os
import time

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://scenic-trainer.preview.emergentagent.com"
).rstrip("/")

EMAIL = "greenlantern@roujaune.app"
PASSWORD = "rideon9900"


# ------------------------------ shared fixtures --------------------------

@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def sample_workout(api):
    r = api.get(f"{BASE_URL}/api/catalog", timeout=15)
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert items, "catalog is empty — startup seeding regression"
    return items[0]


# ------------------------------ catalog domain ---------------------------

class TestCatalog:
    def test_catalog_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/catalog", timeout=15)
        assert r.status_code in (401, 403)

    def test_get_catalog_returns_items(self, api):
        r = api.get(f"{BASE_URL}/api/catalog", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("items"), list)
        # spec says ~171 items; assert a healthy lower bound
        assert len(j["items"]) >= 150, f"unexpected catalog size {len(j['items'])}"
        w0 = j["items"][0]
        assert "_id" not in w0
        assert "id" in w0 and "name" in w0

    def test_get_catalog_item_ok(self, api, sample_workout):
        wid = sample_workout["id"]
        r = api.get(f"{BASE_URL}/api/catalog/{wid}", timeout=15)
        assert r.status_code == 200
        w = r.json()
        assert w.get("id") == wid
        assert "_id" not in w

    def test_get_catalog_item_404(self, api):
        r = api.get(f"{BASE_URL}/api/catalog/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404

    def test_assign_edit_reset_flow(self, api, sample_workout):
        wid = sample_workout["id"]
        original_name = sample_workout.get("name")

        # Ensure a clean slate — reset any previous copy
        api.delete(f"{BASE_URL}/api/catalog/{wid}/reset", timeout=15)

        # 1) assign — creates a rider copy
        r = api.post(f"{BASE_URL}/api/catalog/{wid}/assign", timeout=15)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("assigned") == wid
        assert j.get("workout", {}).get("id") == wid
        assert j["workout"].get("origin_id") == wid
        assert j["workout"].get("assigned_at")

        # 2) edit the copy
        new_name = "TEST_ROUJAUNE Edit " + str(int(time.time()))
        e = api.put(
            f"{BASE_URL}/api/catalog/{wid}",
            json={"patch": {"name": new_name}},
            timeout=15,
        )
        assert e.status_code == 200, e.text[:200]
        edited = e.json().get("workout", {})
        assert edited.get("name") == new_name, f"edit did not stick: {edited}"
        assert edited.get("edited_at")

        # 3) confirm the edit is reflected in GET /catalog/{id}
        r2 = api.get(f"{BASE_URL}/api/catalog/{wid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("name") == new_name

        # 4) reset — reverts to global
        d = api.delete(f"{BASE_URL}/api/catalog/{wid}/reset", timeout=15)
        assert d.status_code == 200, d.text[:200]
        assert d.json().get("reset") == wid
        assert d.json().get("reverted") is True

        # 5) after reset, name should match the pre-existing catalog value again
        r3 = api.get(f"{BASE_URL}/api/catalog/{wid}", timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("name") == original_name

    def test_assign_unknown_id_404(self, api):
        r = api.post(f"{BASE_URL}/api/catalog/nope-nope/assign", timeout=15)
        assert r.status_code == 404


# ------------------------------ system: routes/community ----------------

class TestSystemStatic:
    def test_routes_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/routes", timeout=15)
        assert r.status_code in (401, 403)

    def test_routes_shape(self, api):
        r = api.get(f"{BASE_URL}/api/routes", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "featured" in j and isinstance(j["featured"], dict)
        assert j["featured"].get("name") == "Alpe d'Huez"
        assert isinstance(j.get("categories"), list) and "All" in j["categories"]
        assert isinstance(j.get("routes"), list) and len(j["routes"]) == 6
        for row in j["routes"]:
            for k in ("id", "name", "place", "distance", "elevation", "tag", "difficulty", "color"):
                assert k in row, f"routes row missing {k}"

    def test_community_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/community", timeout=15)
        assert r.status_code in (401, 403)

    def test_community_shape(self, api):
        r = api.get(f"{BASE_URL}/api/community", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("challenges"), list) and len(j["challenges"]) == 3
        assert isinstance(j.get("leaderboard"), list) and len(j["leaderboard"]) == 5
        assert any(row.get("you") is True for row in j["leaderboard"])
        assert isinstance(j.get("feed"), list) and len(j["feed"]) == 3


# ------------------------------ notifications read-state -----------------

class TestNotificationsReadState:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/notifications/read-state", timeout=15)
        assert r.status_code in (401, 403)

    def test_read_idempotent_via_addToSet(self, api):
        key = "TEST_iter63_key_a"
        # Ensure clean pre-state
        api.post(f"{BASE_URL}/api/notifications/unread", json={"key": key}, timeout=15)

        r1 = api.post(f"{BASE_URL}/api/notifications/read", json={"key": key}, timeout=15)
        assert r1.status_code == 200 and r1.json().get("ok") is True
        r2 = api.post(f"{BASE_URL}/api/notifications/read", json={"key": key}, timeout=15)
        assert r2.status_code == 200

        gs = api.get(f"{BASE_URL}/api/notifications/read-state", timeout=15)
        assert gs.status_code == 200
        rks = gs.json().get("readKeys", [])
        assert rks.count(key) == 1, f"key should appear exactly once (addToSet), got {rks}"

        # cleanup
        api.post(f"{BASE_URL}/api/notifications/unread", json={"key": key}, timeout=15)
        after = api.get(f"{BASE_URL}/api/notifications/read-state", timeout=15).json().get("readKeys", [])
        assert key not in after

    def test_read_all_sets_allReadAt(self, api):
        keys = ["TEST_iter63_k1", "TEST_iter63_k2", "TEST_iter63_k3"]
        r = api.post(f"{BASE_URL}/api/notifications/read-all", json={"keys": keys}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True and j.get("count") == 3

        gs = api.get(f"{BASE_URL}/api/notifications/read-state", timeout=15)
        assert gs.status_code == 200
        payload = gs.json()
        assert payload.get("allReadAt"), "read-all must set allReadAt"
        rks = payload.get("readKeys", [])
        for k in keys:
            assert k in rks

        # cleanup the injected keys
        for k in keys:
            api.post(f"{BASE_URL}/api/notifications/unread", json={"key": k}, timeout=15)


# ------------------------------ hard cleanup (end of module) -------------

def test_zzz_reset_read_state_for_demo(api):
    """Final housekeeping: unread every key currently in read-state so the
    demo bell shows the live notifications again for greenlantern."""
    gs = api.get(f"{BASE_URL}/api/notifications/read-state", timeout=15)
    if gs.status_code != 200:
        pytest.skip("could not read read-state during teardown")
    rks = gs.json().get("readKeys", [])
    for k in rks:
        api.post(f"{BASE_URL}/api/notifications/unread", json={"key": k}, timeout=15)
    after = api.get(f"{BASE_URL}/api/notifications/read-state", timeout=15).json().get("readKeys", [])
    assert after == [], f"read-state not empty after teardown: {after}"
