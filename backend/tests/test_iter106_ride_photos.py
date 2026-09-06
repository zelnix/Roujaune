"""Iteration 106 — Ride Photos API (Emergent Object Storage).

Tests the full CRUD + auth/ownership flow for /api/rides/{id}/photos
and the tokenized image proxy at /api/rides/photo/{path}.
"""
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"


def _tiny_png() -> bytes:
    """Return a minimal valid 1x1 PNG (RGB) as bytes."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)   # 1x1 8-bit RGB
    raw = b"\x00\xff\x00\x00"                              # filter byte + one RGB pixel
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def ride_id(auth_headers) -> str:
    """Create a ride via /api/workouts/summarize with >=30 telemetry samples."""
    samples = [{"power": 200 + (i % 15), "hr": 140 + (i % 10),
                "cadence": 88 + (i % 5), "speed": 30.0} for i in range(40)]
    body = {
        "workout": "TEST_Photos Ride",
        "workout_id": "test-photos",
        "elapsed": 1800,
        "ftp": 250,
        "weight": 78,
        "samples": samples,
        "est_calories": 400,
    }
    r = requests.post(f"{BASE_URL}/api/workouts/summarize",
                      json=body, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"summarize failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("id"), f"no ride id returned: {data}"
    return data["id"]


# ---------- tests -----------------------------------------------------------
class TestRidePhotos:

    def test_1_summarize_returns_id(self, ride_id):
        """(1) POST /api/workouts/summarize with >=20 samples returns an id."""
        assert isinstance(ride_id, str) and len(ride_id) > 0

    def test_2_upload_photo_ok(self, auth_headers, ride_id):
        """(2) POST photo returns {ok, photo:{id,path}} with roujaune/uploads/ prefix."""
        files = {"file": ("test.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/rides/{ride_id}/photos",
            files=files, headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        photo = data.get("photo") or {}
        assert photo.get("id")
        assert photo.get("path", "").startswith("roujaune/uploads/"), \
            f"unexpected path: {photo.get('path')}"
        # stash for later tests
        pytest._roujaune_photo = photo  # type: ignore[attr-defined]

    def test_3_list_photos(self, auth_headers, ride_id):
        """(3) GET list contains the uploaded photo."""
        r = requests.get(f"{BASE_URL}/api/rides/{ride_id}/photos",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        photos = r.json().get("photos") or []
        photo = pytest._roujaune_photo  # type: ignore[attr-defined]
        assert any(p["id"] == photo["id"] and p["path"] == photo["path"] for p in photos), \
            f"uploaded photo not in list: {photos}"

    def test_4a_get_photo_with_bearer(self, auth_headers):
        """(4) GET /api/rides/photo/{path} WITH Authorization returns 200 image/png."""
        photo = pytest._roujaune_photo  # type: ignore[attr-defined]
        r = requests.get(f"{BASE_URL}/api/rides/photo/{photo['path']}",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.headers.get("Content-Type", "").startswith("image/png"), \
            f"content-type: {r.headers.get('Content-Type')}"
        assert len(r.content) > 0

    def test_4b_get_photo_with_token_query(self, token):
        """(4) Same URL with ?token= query returns 200 image/png (for <img> tags)."""
        photo = pytest._roujaune_photo  # type: ignore[attr-defined]
        r = requests.get(
            f"{BASE_URL}/api/rides/photo/{photo['path']}",
            params={"token": token}, timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.headers.get("Content-Type", "").startswith("image/png")

    def test_4c_get_photo_without_token_401(self):
        """(4) Same URL WITHOUT any token returns 401."""
        photo = pytest._roujaune_photo  # type: ignore[attr-defined]
        r = requests.get(f"{BASE_URL}/api/rides/photo/{photo['path']}", timeout=30)
        assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text[:200]}"

    def test_5_ownership_forbidden(self, token):
        """(5) GET a path under some-other-user/ with demo token returns 403."""
        r = requests.get(
            f"{BASE_URL}/api/rides/photo/roujaune/uploads/some-other-user/x.png",
            params={"token": token}, timeout=30,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_6_delete_photo(self, auth_headers, ride_id):
        """(6) DELETE returns {ok:true} and list becomes empty."""
        photo = pytest._roujaune_photo  # type: ignore[attr-defined]
        r = requests.delete(
            f"{BASE_URL}/api/rides/{ride_id}/photos/{photo['id']}",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # list should be empty (only the one photo we uploaded)
        lst = requests.get(f"{BASE_URL}/api/rides/{ride_id}/photos",
                           headers=auth_headers, timeout=30).json()
        photos = lst.get("photos") or []
        assert not any(p["id"] == photo["id"] for p in photos), \
            f"deleted photo still in list: {photos}"


class TestRidePhotoGuards:

    def test_reject_non_image(self, auth_headers, ride_id):
        """POST with text/plain returns 400."""
        files = {"file": ("bad.txt", b"hello world", "text/plain")}
        r = requests.post(
            f"{BASE_URL}/api/rides/{ride_id}/photos",
            files=files, headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"

    def test_nonexistent_ride_404(self, auth_headers):
        """POST to unknown ride id returns 404."""
        files = {"file": ("test.png", _tiny_png(), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/rides/DOES_NOT_EXIST_TEST_xyz/photos",
            files=files, headers=auth_headers, timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text[:200]}"
