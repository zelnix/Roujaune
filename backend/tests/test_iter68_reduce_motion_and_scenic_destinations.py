"""ITER68 — Reduce motion accessibility toggle + scenic catalog (destinations screen backend surface).

Backend acceptance:
- PUT /api/rider/settings accepts arbitrary whitelisted fields including reduceMotion,
  and GET returns it. Existing largeText/highContrast still round-trip.
- GET /api/scenic/routes returns the full published scenic catalogue (>= 22
  routes per iter68 spec) that the /scenic-destinations screen consumes.
- Auth gating: /api/rider/settings requires auth (401 without token).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")

RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASS = "rideon9900"


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASS}, timeout=15)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


# ---------- Auth gating ----------
class TestSettingsAuth:
    def test_settings_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/rider/settings", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_settings_put_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/rider/settings",
                         json={"reduceMotion": True}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------- Reduce motion round-trip ----------
class TestReduceMotionPersistence:
    def test_reduce_motion_true_roundtrip(self, auth_headers):
        r = requests.put(f"{BASE_URL}/api/rider/settings",
                         headers=auth_headers, json={"reduceMotion": True}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("reduceMotion") is True, f"PUT did not echo reduceMotion=True: {data}"

        g = requests.get(f"{BASE_URL}/api/rider/settings", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        assert g.json().get("reduceMotion") is True

    def test_reduce_motion_false_roundtrip(self, auth_headers):
        r = requests.put(f"{BASE_URL}/api/rider/settings",
                         headers=auth_headers, json={"reduceMotion": False}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("reduceMotion") is False

        g = requests.get(f"{BASE_URL}/api/rider/settings", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        assert g.json().get("reduceMotion") is False

    def test_a11y_bundle_roundtrip(self, auth_headers):
        """largeText + highContrast + reduceMotion save & load together (the exact
        payload shape /src/lib/a11y.ts::persist sends)."""
        payload = {"largeText": True, "highContrast": True, "reduceMotion": True}
        r = requests.put(f"{BASE_URL}/api/rider/settings",
                         headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k, v in payload.items():
            assert body.get(k) == v, f"{k} not persisted: {body}"

        g = requests.get(f"{BASE_URL}/api/rider/settings", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        gj = g.json()
        for k, v in payload.items():
            assert gj.get(k) == v, f"GET after PUT lost {k}: {gj}"

        # cleanup: switch them all off so we don't leave the rider in high-contrast
        requests.put(f"{BASE_URL}/api/rider/settings",
                     headers=auth_headers,
                     json={"largeText": False, "highContrast": False, "reduceMotion": False},
                     timeout=15)

    def test_reduce_motion_does_not_clobber_other_fields(self, auth_headers):
        # First set homeCity to a known value
        requests.put(f"{BASE_URL}/api/rider/settings", headers=auth_headers,
                     json={"homeCity": "TEST_City", "hudEnabled": True}, timeout=15)
        # Then toggle reduceMotion
        r = requests.put(f"{BASE_URL}/api/rider/settings", headers=auth_headers,
                         json={"reduceMotion": True}, timeout=15)
        assert r.status_code == 200
        # Verify homeCity still there
        g = requests.get(f"{BASE_URL}/api/rider/settings", headers=auth_headers, timeout=15)
        gj = g.json()
        assert gj.get("homeCity") == "TEST_City", f"reduceMotion PUT clobbered homeCity: {gj}"
        assert gj.get("hudEnabled") is True
        assert gj.get("reduceMotion") is True

    def test_mongo_id_stripped(self, auth_headers):
        g = requests.get(f"{BASE_URL}/api/rider/settings", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        assert "_id" not in g.json(), "MongoDB _id leaked in GET /api/rider/settings"


# ---------- Scenic catalog for the destinations screen ----------
class TestScenicCatalogForDestinations:
    def test_scenic_routes_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/scenic/routes", timeout=15)
        assert r.status_code in (401, 403), f"scenic routes should be auth-gated, got {r.status_code}"

    def test_scenic_catalog_has_22_plus_routes(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        routes = r.json().get("routes", [])
        assert isinstance(routes, list)
        assert len(routes) >= 22, f"expected >=22 published scenic routes, got {len(routes)}"

    def test_scenic_route_shape(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=auth_headers, timeout=15)
        routes = r.json().get("routes", [])
        for req in ("id", "name", "youtube_id"):
            assert all(req in rt for rt in routes), f"missing '{req}' in some scenic routes"
        # region present (used by destinations-region-* chips)
        regions = {rt.get("region") for rt in routes if rt.get("region")}
        assert regions, "no region metadata present — Explore Destinations chips will not render"

    def test_scenic_search_terms_have_matches(self, auth_headers):
        """Frontend does client-side filtering; confirm the seed data supports the
        review-request scenarios: 'garda' → ~4 rides, 'kenya' → Hell's Gate."""
        r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=auth_headers, timeout=15)
        routes = r.json().get("routes", [])

        def matches(q):
            q = q.lower()
            return [
                rt for rt in routes
                if q in (rt.get("name") or "").lower()
                or q in (rt.get("place") or "").lower()
                or q in (rt.get("country") or "").lower()
                or q in (rt.get("tag") or "").lower()
            ]

        garda = matches("garda")
        assert len(garda) >= 1, f"'garda' search must match >=1 route; got {len(garda)}"

        kenya = matches("kenya")
        assert len(kenya) >= 1, f"'kenya' must match Hell's Gate route; got {kenya}"
        assert any("hell" in (rt.get("name") or "").lower() for rt in kenya), \
            f"expected 'Hell's Gate' in kenya matches, got {[rt.get('name') for rt in kenya]}"

    def test_lake_garda_scenic_route_playable(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes/lake-garda",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"lake-garda not published/available: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("youtube_id"), "lake-garda missing youtube_id"
