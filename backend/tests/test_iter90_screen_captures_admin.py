"""Iteration 90: Backend tests for /api/admin/screen-captures router.

Tests auth gating (HWG service token, no/invalid Bearer, rider session token),
screens catalogue, status shape, list payload trimming, store-listing GET/PUT
(partial patch), single-capture image endpoint (variant + not-found + 422),
and ZIP export.
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://scenic-trainer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/admin/screen-captures"

HWG_TOKEN = os.environ.get("HWG_SERVICE_TOKEN", "")

EXPECTED_KEYS = {
    "activities", "calendar", "climbs", "community", "compare", "connections",
    "fitness", "help", "home", "live_workout", "milestones", "plan", "profile",
    "progress", "rider_customise", "routes", "scenic", "settings", "summary",
    "upgrade", "virtual_route", "wellness", "wheel_calibration", "workout_list",
    "workouts",
}

STORE_FIELDS = {"title", "subtitle", "promotional_text", "description", "keywords"}


# --------------------------------------------------------------------------- #
#  Fixtures                                                                    #
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def hwg_headers():
    return {"Authorization": f"Bearer {HWG_TOKEN}"}


@pytest.fixture(scope="module")
def rider_token():
    """Log in as the demo rider to obtain a session Bearer token."""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "demo@roujaune.app", "password": "demo9900"},
                      timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Rider login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok, "Missing token in login response"
    return tok


@pytest.fixture(scope="module")
def original_subtitle(hwg_headers):
    """Snapshot the current subtitle so we can restore it after PUT test."""
    r = requests.get(f"{API}/store-listing", headers=hwg_headers, timeout=30)
    if r.status_code == 200:
        return r.json().get("subtitle", "")
    return ""


# --------------------------------------------------------------------------- #
#  AUTH: 401 / 403 / 200 matrix on /screens                                    #
# --------------------------------------------------------------------------- #
class TestAuth:
    def test_no_bearer_returns_401(self):
        r = requests.get(f"{API}/screens", timeout=30)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:200]}"

    def test_wrong_bearer_returns_401(self):
        r = requests.get(f"{API}/screens",
                         headers={"Authorization": "Bearer this-is-not-a-real-token"},
                         timeout=30)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:200]}"

    def test_rider_token_returns_403(self, rider_token):
        r = requests.get(f"{API}/screens",
                         headers={"Authorization": f"Bearer {rider_token}"},
                         timeout=30)
        assert r.status_code == 403, f"Expected 403 for rider, got {r.status_code}: {r.text[:200]}"

    def test_hwg_service_token_returns_200(self, hwg_headers):
        r = requests.get(f"{API}/screens", headers=hwg_headers, timeout=30)
        assert r.status_code == 200, f"Expected 200 with HWG token, got {r.status_code}: {r.text[:200]}"


# --------------------------------------------------------------------------- #
#  /screens catalogue                                                          #
# --------------------------------------------------------------------------- #
class TestScreens:
    def test_screens_catalogue_shape_and_count(self, hwg_headers):
        r = requests.get(f"{API}/screens", headers=hwg_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "screens" in data, f"Missing 'screens' key: {data}"
        screens = data["screens"]
        assert isinstance(screens, list)
        assert len(screens) == len(EXPECTED_KEYS), \
            f"Expected exactly {len(EXPECTED_KEYS)} screens (catalogue has grown since this test " \
            f"was written — update EXPECTED_KEYS if this is an intentional addition), got {len(screens)}"
        keys = {s["key"] for s in screens}
        assert keys == EXPECTED_KEYS, f"Keys mismatch. Got {keys}, expected {EXPECTED_KEYS}"
        # Every entry has key, title, path, caption
        for s in screens:
            assert set(["key", "title", "path", "caption"]).issubset(s.keys()), f"Missing fields in {s}"


# --------------------------------------------------------------------------- #
#  /status shape                                                               #
# --------------------------------------------------------------------------- #
class TestStatus:
    def test_status_shape(self, hwg_headers):
        r = requests.get(f"{API}/status", headers=hwg_headers, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert "status" in data
        assert data["status"] in ("idle", "running", "done", "error"), f"Bad status: {data['status']}"
        for field in ("total", "done", "screens"):
            assert field in data, f"Missing field {field!r} in status: {data}"
        assert isinstance(data["total"], int)
        assert isinstance(data["done"], int)
        assert isinstance(data["screens"], list)


# --------------------------------------------------------------------------- #
#  List: thumb only, no raw/framed                                             #
# --------------------------------------------------------------------------- #
class TestList:
    def test_list_includes_thumb_excludes_heavy(self, hwg_headers):
        r = requests.get(f"{API}", headers=hwg_headers, timeout=60)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert "items" in data and "count" in data
        items = data["items"]
        assert len(items) > 0, "Expected at least one capture in DB"
        for it in items:
            assert "thumb_base64" in it and it["thumb_base64"], f"Missing thumb_base64 on {it.get('key')}"
            assert "raw_base64" not in it, f"raw_base64 leaked on list for {it.get('key')}"
            assert "framed_base64" not in it, f"framed_base64 leaked on list for {it.get('key')}"


# --------------------------------------------------------------------------- #
#  Store listing GET + partial PUT                                             #
# --------------------------------------------------------------------------- #
class TestStoreListing:
    def test_get_store_listing_has_all_fields(self, hwg_headers):
        r = requests.get(f"{API}/store-listing", headers=hwg_headers, timeout=60)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert STORE_FIELDS.issubset(data.keys()), f"Missing store fields. Got {list(data.keys())}"
        for f in STORE_FIELDS:
            assert isinstance(data[f], str) and data[f], f"Field {f!r} empty/non-string: {data[f]!r}"

    def test_put_partial_updates_only_subtitle(self, hwg_headers, original_subtitle):
        # Snapshot title + description before PUT.
        pre = requests.get(f"{API}/store-listing", headers=hwg_headers, timeout=30).json()
        pre_title = pre["title"]
        pre_description = pre["description"]

        new_subtitle = "Test subtitle"
        r = requests.put(f"{API}/store-listing", headers=hwg_headers,
                         json={"subtitle": new_subtitle}, timeout=30)
        assert r.status_code == 200, f"Expected 200 on PUT, got {r.status_code}: {r.text[:200]}"
        after = r.json()
        assert after["subtitle"] == new_subtitle, f"Subtitle not updated: {after['subtitle']!r}"
        assert after["title"] == pre_title, f"Title changed unexpectedly: {pre_title!r} → {after['title']!r}"
        assert after["description"] == pre_description, "Description changed unexpectedly"

        # Verify persistence via a follow-up GET.
        r2 = requests.get(f"{API}/store-listing", headers=hwg_headers, timeout=30)
        assert r2.status_code == 200
        got = r2.json()
        assert got["subtitle"] == new_subtitle
        assert got["title"] == pre_title
        assert got["description"] == pre_description

        # Restore original subtitle (best-effort) so we don't leave test data behind.
        if original_subtitle and original_subtitle != new_subtitle:
            requests.put(f"{API}/store-listing", headers=hwg_headers,
                         json={"subtitle": original_subtitle}, timeout=30)


# --------------------------------------------------------------------------- #
#  Single capture image endpoint                                               #
# --------------------------------------------------------------------------- #
class TestCaptureImage:
    def test_framed_variant_returns_png(self, hwg_headers):
        r = requests.get(f"{API}/home", headers=hwg_headers,
                         params={"variant": "framed"}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("image/png"), \
            f"Bad content-type: {r.headers.get('content-type')}"
        assert len(r.content) > 1000, "PNG body suspiciously small"
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n", "Body is not a PNG"

    def test_bogus_variant_returns_422(self, hwg_headers):
        r = requests.get(f"{API}/home", headers=hwg_headers,
                         params={"variant": "bogus"}, timeout=30)
        assert r.status_code == 422, f"Expected 422 for bad variant, got {r.status_code}: {r.text[:200]}"

    def test_unknown_key_returns_404(self, hwg_headers):
        r = requests.get(f"{API}/nonexistentkey", headers=hwg_headers,
                         params={"variant": "framed"}, timeout=30)
        assert r.status_code == 404, f"Expected 404 for unknown key, got {r.status_code}: {r.text[:200]}"


# --------------------------------------------------------------------------- #
#  ZIP export                                                                  #
# --------------------------------------------------------------------------- #
class TestExport:
    def test_export_returns_zip_with_attachment(self, hwg_headers):
        r = requests.get(f"{API}/export", headers=hwg_headers, timeout=90)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert ctype.startswith("application/zip"), f"Bad content-type: {ctype}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), f"Missing attachment in Content-Disposition: {cd}"
        # ZIP magic
        assert r.content[:4] == b"PK\x03\x04", "Body is not a ZIP"
