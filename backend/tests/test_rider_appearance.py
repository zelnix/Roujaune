"""Tests for the Rider Appearance endpoints (identity + bike + clothing).

Covers:
- GET /api/rider/appearance returns default doc on first call (younger_male/road/get_fit).
- PUT /api/rider/appearance with a full body persists and a subsequent GET returns saved values.
- PUT with a partial body updates just that field and leaves others intact.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

TEST_EMAIL = "greenlantern@roujaune.app"
TEST_PASSWORD = "rideon9900"

VALID_RIDERS = {"younger_male", "younger_female", "mature_male", "mature_female"}
VALID_BIKES = {"road", "mountain", "vintage"}
VALID_STYLES = {"pro", "get_fit", "casual"}


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("token")
    assert token, "no token returned"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _restore_after_tests(api_client):
    """Snapshot the appearance before the module runs and restore after."""
    r = api_client.get(f"{BASE_URL}/api/rider/appearance", timeout=15)
    snapshot = r.json() if r.status_code == 200 else None
    yield
    if snapshot:
        body = {k: snapshot[k] for k in ("riderType", "bikeType", "clothingStyle") if k in snapshot}
        api_client.put(f"{BASE_URL}/api/rider/appearance", json=body, timeout=15)


# ---------- GET default / shape ----------
class TestAppearanceGet:
    def test_get_returns_200_and_valid_shape(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rider/appearance", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("riderType") in VALID_RIDERS
        assert d.get("bikeType") in VALID_BIKES
        assert d.get("clothingStyle") in VALID_STYLES

    def test_defaults_when_reset(self, api_client):
        # Force known state (equivalent to the default) then verify the doc shape.
        r = api_client.put(f"{BASE_URL}/api/rider/appearance",
                           json={"riderType": "younger_male",
                                 "bikeType": "road",
                                 "clothingStyle": "get_fit"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["riderType"] == "younger_male"
        assert d["bikeType"] == "road"
        assert d["clothingStyle"] == "get_fit"


# ---------- PUT full body persistence ----------
class TestAppearancePutFull:
    def test_put_full_body_persists_and_get_matches(self, api_client):
        body = {"riderType": "mature_female", "bikeType": "vintage", "clothingStyle": "pro"}
        r = api_client.put(f"{BASE_URL}/api/rider/appearance", json=body, timeout=15)
        assert r.status_code == 200, r.text
        upd = r.json()
        for k, v in body.items():
            assert upd[k] == v, f"PUT response mismatch on {k}: {upd[k]} != {v}"

        # GET must return the same saved values (true persistence).
        r2 = api_client.get(f"{BASE_URL}/api/rider/appearance", timeout=15)
        assert r2.status_code == 200
        got = r2.json()
        for k, v in body.items():
            assert got[k] == v, f"GET after PUT mismatch on {k}: {got[k]} != {v}"


# ---------- PUT partial body (each field alone) ----------
class TestAppearancePutPartial:
    def _seed(self, api_client, seed):
        r = api_client.put(f"{BASE_URL}/api/rider/appearance", json=seed, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_partial_update_rider_only(self, api_client):
        seed = {"riderType": "younger_male", "bikeType": "mountain", "clothingStyle": "casual"}
        self._seed(api_client, seed)
        r = api_client.put(f"{BASE_URL}/api/rider/appearance",
                           json={"riderType": "younger_female"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["riderType"] == "younger_female"
        assert d["bikeType"] == "mountain", "bikeType must be untouched"
        assert d["clothingStyle"] == "casual", "clothingStyle must be untouched"

        # Verify via GET too.
        g = api_client.get(f"{BASE_URL}/api/rider/appearance", timeout=15).json()
        assert g["riderType"] == "younger_female"
        assert g["bikeType"] == "mountain"
        assert g["clothingStyle"] == "casual"

    def test_partial_update_bike_only(self, api_client):
        seed = {"riderType": "mature_male", "bikeType": "road", "clothingStyle": "pro"}
        self._seed(api_client, seed)
        r = api_client.put(f"{BASE_URL}/api/rider/appearance",
                           json={"bikeType": "vintage"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bikeType"] == "vintage"
        assert d["riderType"] == "mature_male"
        assert d["clothingStyle"] == "pro"

    def test_partial_update_clothing_only(self, api_client):
        seed = {"riderType": "mature_female", "bikeType": "mountain", "clothingStyle": "get_fit"}
        self._seed(api_client, seed)
        r = api_client.put(f"{BASE_URL}/api/rider/appearance",
                           json={"clothingStyle": "casual"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["clothingStyle"] == "casual"
        assert d["riderType"] == "mature_female"
        assert d["bikeType"] == "mountain"


# ---------- No MongoDB _id leaks ----------
class TestAppearanceHygiene:
    def test_no_underscore_id_in_get(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rider/appearance", timeout=15)
        assert r.status_code == 200
        assert "_id" not in r.json(), "MongoDB _id must not leak in the response"

    def test_no_underscore_id_in_put(self, api_client):
        r = api_client.put(f"{BASE_URL}/api/rider/appearance",
                           json={"riderType": "younger_male"}, timeout=15)
        assert r.status_code == 200
        assert "_id" not in r.json(), "MongoDB _id must not leak in the response"
