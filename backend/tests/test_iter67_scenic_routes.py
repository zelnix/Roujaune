"""ITER67 — Scenic Cycling routes backend tests.

Covers:
- Public rider feed (auth-gated): GET /api/scenic/routes, /api/scenic/routes/{id}
- Rider scenic-last after POST /api/workouts/summarize (workout_id 'scenic-<id>')
- Admin CRUD on /api/admin/scenic-routes (require_admin), youtube URL normalisation,
  auto-slug id, 409 duplicates, 422 invalid youtube_id
- Auth gating (401 anon / 403 non-admin rider) on admin surface
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"
ADMIN_EMAIL = "roger.parenzee@gmail.com"
ADMIN_PASSWORD = os.environ.get("ADMIN_LOGIN_PASSWORD", "")

TIMEOUT = 25


@pytest.fixture(scope="session")
def rider_token() -> str:
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD},
                      timeout=TIMEOUT)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{BASE}/api/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _rh(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --------------------------------------------------------------------------- #
#  Public rider feed                                                          #
# --------------------------------------------------------------------------- #
class TestScenicPublicFeed:

    def test_list_requires_auth(self):
        r = requests.get(f"{BASE}/api/scenic/routes", timeout=TIMEOUT)
        assert r.status_code == 401, f"expected 401 anon, got {r.status_code}"

    def test_list_returns_lake_garda_and_seeds(self, rider_token):
        r = requests.get(f"{BASE}/api/scenic/routes",
                         headers=_rh(rider_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "routes" in data
        routes = data["routes"]
        assert isinstance(routes, list) and len(routes) >= 5, (
            f"expected >=5 routes (lake-garda + 4 seeds), got {len(routes)}")

        ids = [x.get("id") for x in routes]
        assert "lake-garda" in ids, f"lake-garda missing from feed. ids={ids}"
        # Lake Garda uses sort=-1 (per spec) so it should be first.
        assert routes[0]["id"] == "lake-garda", (
            f"lake-garda should be first (sort=-1). got order={ids}")

        # Field shape on the first item.
        expected = {"id", "name", "place", "country", "youtube_id",
                    "duration_min", "distance_km", "elevation_m", "tag",
                    "terrain", "difficulty", "surface", "highlights",
                    "thumbnail", "description"}
        missing = expected - set(routes[0].keys())
        assert not missing, f"lake-garda projection missing fields: {missing}"

        assert routes[0]["youtube_id"] == "lOkouNCWSqw", (
            f"lake-garda youtube_id mismatch: {routes[0]['youtube_id']}")

        # Seeds also present
        for sid in ("dutch-countryside", "german-country-roads",
                    "lake-achensee", "carolina-greenway"):
            assert sid in ids, f"seed route missing: {sid}"

    def test_get_by_id_ok(self, rider_token):
        r = requests.get(f"{BASE}/api/scenic/routes/lake-garda",
                         headers=_rh(rider_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == "lake-garda"
        assert d["youtube_id"] == "lOkouNCWSqw"

    def test_get_by_id_404(self, rider_token):
        r = requests.get(f"{BASE}/api/scenic/routes/does-not-exist-xyz",
                         headers=_rh(rider_token), timeout=TIMEOUT)
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
#  scenic/last after summarize                                                #
# --------------------------------------------------------------------------- #
class TestScenicLast:

    def test_last_after_summarize(self, rider_token):
        # First, log a scenic ride via workouts/summarize with scenic- prefix.
        payload = {
            "workout": "Scenic Ride · Lake Garda Lakeside Journey",
            "workout_id": "scenic-lake-garda",
            "route": {"id": "lake-garda", "name": "Lake Garda Lakeside Journey",
                      "place": "Italy", "distance": "12 km",
                      "elevation": "80 m", "tag": "Relaxed"},
            "elapsed": 300,
            "manual": {"duration_sec": 300, "distance_km": 12,
                       "elevation_m": 80, "rpe": 3},
        }
        s = requests.post(f"{BASE}/api/workouts/summarize",
                          headers=_rh(rider_token), json=payload, timeout=TIMEOUT)
        assert s.status_code == 200, f"summarize failed: {s.status_code} {s.text}"

        r = requests.get(f"{BASE}/api/scenic/last",
                         headers=_rh(rider_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("available") is True, f"scenic last not available: {d}"
        assert d.get("routeId") == "lake-garda", f"routeId mismatch: {d}"


# --------------------------------------------------------------------------- #
#  Admin auth gating                                                          #
# --------------------------------------------------------------------------- #
class TestAdminAuthGating:

    def test_admin_list_401_anon(self):
        r = requests.get(f"{BASE}/api/admin/scenic-routes", timeout=TIMEOUT)
        assert r.status_code == 401, f"expected 401 anon, got {r.status_code}"

    def test_admin_list_403_rider(self, rider_token):
        r = requests.get(f"{BASE}/api/admin/scenic-routes",
                         headers=_rh(rider_token), timeout=TIMEOUT)
        assert r.status_code == 403, (
            f"rider token should be 403 on admin surface, got {r.status_code}")


# --------------------------------------------------------------------------- #
#  Admin CRUD                                                                 #
# --------------------------------------------------------------------------- #
class TestAdminCRUD:
    """Create → GET → PUT → publish/archive → DELETE. Uses TEST_ prefixed
    ids to keep the rider feed clean, and always deletes at teardown."""

    _created_ids: list = []

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup of any test routes still hanging around.
        try:
            r = requests.post(f"{BASE}/api/admin/login",
                              json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                              timeout=TIMEOUT)
            if r.status_code == 200:
                tok = r.json()["token"]
                for rid in cls._created_ids:
                    requests.delete(f"{BASE}/api/admin/scenic-routes/{rid}",
                                    headers=_rh(tok), timeout=TIMEOUT)
        except Exception:
            pass

    def test_admin_list_ok(self, admin_token):
        r = requests.get(f"{BASE}/api/admin/scenic-routes",
                         headers=_rh(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "total" in d
        assert d["total"] >= 5

    def test_create_with_url_and_auto_slug(self, admin_token):
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_Scenic Route {unique}"
        payload = {
            "name": name,
            "place": "Testland",
            "youtube_id": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "duration_min": 20,
            "distance_km": 8.5,
            "elevation_m": 40,
            "tag": "TEST",
            "status": "draft",
            "sort": 999,
            "highlights": ["Start", "Middle", "End"],
        }
        r = requests.post(f"{BASE}/api/admin/scenic-routes",
                          headers=_rh(admin_token), json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        # Normalises URL to 11-char id
        assert item["youtube_id"] == "dQw4w9WgXcQ", item
        # Auto slug from the name
        assert item["id"].startswith("test-scenic-route-"), item["id"]
        assert item["status"] == "draft"
        assert item["highlights"] == ["Start", "Middle", "End"]

        TestAdminCRUD._created_ids.append(item["id"])

        # Draft should NOT be in rider public feed.
        rider_login = requests.post(f"{BASE}/api/auth/login",
                                    json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD},
                                    timeout=TIMEOUT).json()
        rider_headers = _rh(rider_login["token"])
        pub = requests.get(f"{BASE}/api/scenic/routes",
                           headers=rider_headers, timeout=TIMEOUT).json()
        pub_ids = [x["id"] for x in pub["routes"]]
        assert item["id"] not in pub_ids, (
            f"draft route leaked to public feed: {item['id']}")

    def test_create_invalid_youtube_id_422(self, admin_token):
        r = requests.post(f"{BASE}/api/admin/scenic-routes",
                          headers=_rh(admin_token),
                          json={"name": "TEST_bad", "youtube_id": "not-a-valid-url"},
                          timeout=TIMEOUT)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text}"

    def test_create_duplicate_id_409(self, admin_token):
        # Use an already-known seed id
        r = requests.post(f"{BASE}/api/admin/scenic-routes",
                          headers=_rh(admin_token),
                          json={"id": "lake-garda", "name": "dup",
                                "youtube_id": "lOkouNCWSqw"},
                          timeout=TIMEOUT)
        assert r.status_code == 409, f"expected 409 dup, got {r.status_code}: {r.text}"

    def test_put_and_publish_archive_and_delete(self, admin_token):
        # Create a fresh draft route.
        unique = uuid.uuid4().hex[:6]
        create = requests.post(f"{BASE}/api/admin/scenic-routes",
                               headers=_rh(admin_token),
                               json={"id": f"test-scenic-crud-{unique}",
                                     "name": f"TEST_CRUD {unique}",
                                     "youtube_id": "lOkouNCWSqw",
                                     "status": "draft"},
                               timeout=TIMEOUT)
        assert create.status_code == 200, create.text
        rid = create.json()["item"]["id"]
        TestAdminCRUD._created_ids.append(rid)

        # PUT — update highlights + place.
        upd = requests.put(f"{BASE}/api/admin/scenic-routes/{rid}",
                           headers=_rh(admin_token),
                           json={"place": "Updated Place",
                                 "highlights": ["A", "B"]},
                           timeout=TIMEOUT)
        assert upd.status_code == 200, upd.text
        item = upd.json()["item"]
        assert item["place"] == "Updated Place"
        assert item["highlights"] == ["A", "B"]

        # Publish
        pub = requests.post(f"{BASE}/api/admin/scenic-routes/{rid}/publish",
                            headers=_rh(admin_token), timeout=TIMEOUT)
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "published"

        # Now visible in rider feed.
        rider_login = requests.post(f"{BASE}/api/auth/login",
                                    json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD},
                                    timeout=TIMEOUT).json()
        rider_headers = _rh(rider_login["token"])
        pub_ids = [x["id"] for x in requests.get(
            f"{BASE}/api/scenic/routes", headers=rider_headers,
            timeout=TIMEOUT).json()["routes"]]
        assert rid in pub_ids, f"published route missing from rider feed: {rid}"

        # Archive → draft
        arch = requests.post(f"{BASE}/api/admin/scenic-routes/{rid}/archive",
                             headers=_rh(admin_token), timeout=TIMEOUT)
        assert arch.status_code == 200, arch.text
        assert arch.json()["status"] == "draft"

        # DELETE
        d = requests.delete(f"{BASE}/api/admin/scenic-routes/{rid}",
                            headers=_rh(admin_token), timeout=TIMEOUT)
        assert d.status_code == 200, d.text

        # GET 404 after delete.
        g = requests.get(f"{BASE}/api/admin/scenic-routes/{rid}",
                         headers=_rh(admin_token), timeout=TIMEOUT)
        assert g.status_code == 404
        # Confirmed removed — pop from cleanup list
        try:
            TestAdminCRUD._created_ids.remove(rid)
        except ValueError:
            pass
