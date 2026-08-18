"""Iteration 91 — In-app feedback API tests.

Covers:
  - POST /api/feedback (auth, validation, happy path)
  - POST /api/feedback/screenshot (auth, content-type gate, happy path)
  - GET  /api/admin/feedback (rider forbidden, admin OK, includes new entry)
"""
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://roujaune-train.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

RIDER_EMAIL = "demo@roujaune.app"
RIDER_PASSWORD = "demo9900"
HWG_TOKEN = "hwg_svc_roujaune_0KR5RCmk6XI-TInq6iQTZyFXlRZGMn9J"


def _make_png(w=2, h=2) -> bytes:
    """Return a minimal valid PNG."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in {r.json()}"
    return token


@pytest.fixture(scope="module")
def rider_headers(rider_token):
    return {"Authorization": f"Bearer {rider_token}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {HWG_TOKEN}"}


# ── POST /api/feedback ──────────────────────────────────────────────────────

class TestFeedbackSubmit:
    def test_no_auth_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/feedback", json={"rating": 5, "message": "great"}, timeout=30)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_rating_zero_returns_422(self, rider_headers):
        r = requests.post(f"{BASE_URL}/api/feedback",
                          json={"rating": 0, "message": "meh"}, headers=rider_headers, timeout=30)
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"

    def test_rating_seven_returns_422(self, rider_headers):
        r = requests.post(f"{BASE_URL}/api/feedback",
                          json={"rating": 7, "message": "meh"}, headers=rider_headers, timeout=30)
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"

    def test_valid_submission_returns_200(self, rider_headers, request):
        r = requests.post(f"{BASE_URL}/api/feedback",
                          json={"rating": 5, "message": "great TEST_iter91"},
                          headers=rider_headers, timeout=30)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("id"), str) and len(data["id"]) > 0
        # stash for admin test
        request.config._iter91_fb_id = data["id"]


# ── POST /api/feedback/screenshot ───────────────────────────────────────────

class TestFeedbackScreenshot:
    def test_no_auth_returns_401(self):
        files = {"file": ("s.png", _make_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/feedback/screenshot", files=files, timeout=30)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_text_plain_returns_400(self, rider_headers):
        files = {"file": ("s.txt", b"hello world", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/feedback/screenshot",
                          files=files, headers=rider_headers, timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_png_upload_returns_200_and_path(self, rider_headers):
        files = {"file": ("shot.png", _make_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/feedback/screenshot",
                          files=files, headers=rider_headers, timeout=60)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        path = r.json().get("path")
        assert isinstance(path, str) and path.startswith("roujaune/uploads/"), f"bad path: {path}"

    def test_jpeg_upload_returns_200(self, rider_headers):
        # Tiny JPEG (SOI+APP0+SOF0+DHT+SOS+data+EOI is overkill; storage only cares content-type
        # is allowed and the body isn't empty)
        body = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 32 + b"\xff\xd9"
        files = {"file": ("shot.jpg", body, "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/feedback/screenshot",
                          files=files, headers=rider_headers, timeout=60)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        assert r.json().get("path", "").startswith("roujaune/uploads/")


# ── GET /api/admin/feedback ─────────────────────────────────────────────────

class TestAdminFeedbackList:
    def test_rider_forbidden(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/admin/feedback", headers=rider_headers, timeout=30)
        assert r.status_code == 403, f"expected 403 for rider, got {r.status_code} {r.text}"

    def test_admin_success_and_contains_entry(self, admin_headers, rider_headers, request):
        # Submit a marker feedback in-line so ordering is guaranteed for this run.
        marker = "TEST_iter91_marker great app"
        sub = requests.post(f"{BASE_URL}/api/feedback",
                            json={"rating": 4, "message": marker}, headers=rider_headers, timeout=30)
        assert sub.status_code == 200, f"marker submit failed: {sub.status_code} {sub.text}"
        marker_id = sub.json()["id"]

        r = requests.get(f"{BASE_URL}/api/admin/feedback", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"admin GET failed: {r.status_code} {r.text}"
        payload = r.json()
        assert "feedback" in payload and "count" in payload
        assert isinstance(payload["feedback"], list)
        assert payload["count"] == len(payload["feedback"])
        ids = [row.get("id") for row in payload["feedback"]]
        assert marker_id in ids, f"marker id {marker_id} not in returned list (first ids: {ids[:5]})"
        # Response must not leak Mongo _id
        for row in payload["feedback"][:5]:
            assert "_id" not in row
