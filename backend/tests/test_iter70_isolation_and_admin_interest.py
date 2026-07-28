"""Iter70 backend tests — Per-rider isolation of favourites & mode-interest,
plus new GET /api/admin/interest.
"""
import os
import secrets
import time

import pytest
import requests

BASE = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL must be set"

RIDER_A = {"email": "greenlantern@roujaune.app", "password": "rideon9900"}
ADMIN = {"email": "roger.parenzee@gmail.com", "password": "letmein9900"}


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def token_a():
    r = requests.post(f"{BASE}/api/auth/login", json=RIDER_A, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def token_b():
    # Register a fresh isolated rider.
    email = f"testb+{secrets.token_hex(4)}@roujaune.app"
    r = requests.post(
        f"{BASE}/api/auth/register",
        json={"email": email, "password": "isolate9900", "name": "Iter70 Isolate"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    uid = r.json()["user"]["user_id"]
    yield tok
    # Cleanup: rider self-delete
    try:
        requests.delete(f"{BASE}/api/auth/me", headers=_hdr(tok), timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/admin/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ── Per-rider isolation ─────────────────────────────────────────────────────
class TestIsolation:
    def test_rider_a_saves_favourite_and_interest(self, token_a):
        # Save lake-garda favourite (route may not exist — fallback to seeded id)
        r = requests.post(
            f"{BASE}/api/scenic/favourites/lake-garda", headers=_hdr(token_a), timeout=15
        )
        # If lake-garda doesn't exist in this env, use a known seeded id.
        if r.status_code == 404:
            r = requests.post(
                f"{BASE}/api/scenic/favourites/dutch-countryside",
                headers=_hdr(token_a),
                timeout=15,
            )
            self._fav_id = "dutch-countryside"
        else:
            self._fav_id = "lake-garda"
        assert r.status_code == 200, r.text

        # Register gravel interest
        r2 = requests.post(
            f"{BASE}/api/rider/interest/gravel", headers=_hdr(token_a), timeout=15
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("registered") == "gravel"

        # Confirm A sees its own data
        favs = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_a), timeout=15).json()
        assert self._fav_id in favs.get("ids", [])
        interest = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_a), timeout=15).json()
        assert "gravel" in interest.get("modes", [])

    def test_rider_b_sees_empty_isolation(self, token_b):
        favs = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_b), timeout=15)
        assert favs.status_code == 200
        assert favs.json().get("ids") == [], f"Rider B favourites leaked: {favs.json()}"
        interest = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_b), timeout=15)
        assert interest.status_code == 200
        assert interest.json().get("modes") == [], f"Rider B interest leaked: {interest.json()}"

    def test_rider_b_own_data_does_not_leak_back(self, token_a, token_b):
        # B saves a different favourite
        requests.post(
            f"{BASE}/api/scenic/favourites/carolina-greenway", headers=_hdr(token_b), timeout=15
        )
        requests.post(f"{BASE}/api/rider/interest/rowing", headers=_hdr(token_b), timeout=15)
        # A must NOT see B's data
        favs_a = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_a), timeout=15).json()
        assert "carolina-greenway" not in favs_a.get("ids", [])
        interest_a = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_a), timeout=15).json()
        assert "rowing" not in interest_a.get("modes", [])

    def test_cleanup_rider_a_data(self, token_a):
        # Clean both possible fav ids
        for rid in ("lake-garda", "dutch-countryside"):
            requests.delete(
                f"{BASE}/api/scenic/favourites/{rid}", headers=_hdr(token_a), timeout=15
            )
        requests.delete(f"{BASE}/api/rider/interest/gravel", headers=_hdr(token_a), timeout=15)
        favs = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_a), timeout=15).json()
        assert "lake-garda" not in favs.get("ids", [])
        assert "dutch-countryside" not in favs.get("ids", [])
        interest = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_a), timeout=15).json()
        assert "gravel" not in interest.get("modes", [])


# ── Admin interest API ──────────────────────────────────────────────────────
class TestAdminInterest:
    def test_anon_401(self):
        r = requests.get(f"{BASE}/api/admin/interest", timeout=15)
        assert r.status_code == 401

    def test_rider_403(self, token_a):
        r = requests.get(f"{BASE}/api/admin/interest", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 403

    def test_admin_shape_and_sort(self, admin_token, token_a):
        # Register gravel interest for A so count>=1
        requests.post(f"{BASE}/api/rider/interest/gravel", headers=_hdr(token_a), timeout=15)
        time.sleep(0.3)

        r = requests.get(f"{BASE}/api/admin/interest", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data
        items = data["items"]
        assert len(items) == 6
        modes = {it["mode"] for it in items}
        assert modes == {"gravel", "mountain-bike", "walking", "running", "rowing", "climbing"}
        # Sorted by count desc
        counts = [it["count"] for it in items]
        assert counts == sorted(counts, reverse=True), f"Not sorted desc: {counts}"
        # Gravel should be >=1
        gravel = next(it for it in items if it["mode"] == "gravel")
        assert gravel["count"] >= 1, f"Gravel count should be >=1, got {gravel}"

        # Cleanup
        requests.delete(f"{BASE}/api/rider/interest/gravel", headers=_hdr(token_a), timeout=15)


# ── Single-rider favourites + interest still work e2e ───────────────────────
class TestSingleRiderRoundTrip:
    def test_favourites_roundtrip(self, token_a):
        rid = "german-country-roads"
        # Save
        r = requests.post(f"{BASE}/api/scenic/favourites/{rid}", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        assert r.json().get("saved") == rid
        # List
        favs = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_a), timeout=15).json()
        assert rid in favs.get("ids", [])
        # Route data present in list
        assert any(rt["id"] == rid for rt in favs.get("routes", []))
        # Remove
        r = requests.delete(f"{BASE}/api/scenic/favourites/{rid}", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        favs = requests.get(f"{BASE}/api/scenic/favourites", headers=_hdr(token_a), timeout=15).json()
        assert rid not in favs.get("ids", [])

    def test_interest_roundtrip(self, token_a):
        # Register mountain-bike
        r = requests.post(f"{BASE}/api/rider/interest/mountain-bike", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        # List
        interest = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_a), timeout=15).json()
        assert "mountain-bike" in interest.get("modes", [])
        # Invalid mode → 422
        bad = requests.post(f"{BASE}/api/rider/interest/spaceship", headers=_hdr(token_a), timeout=15)
        assert bad.status_code == 422
        # Undo
        r = requests.delete(f"{BASE}/api/rider/interest/mountain-bike", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        interest = requests.get(f"{BASE}/api/rider/interest", headers=_hdr(token_a), timeout=15).json()
        assert "mountain-bike" not in interest.get("modes", [])
