"""Iter69 — Saved Destinations (favourites) + Coming-soon mode interest.

Covers:
  Scenic favourites   POST/GET/DELETE /api/scenic/favourites/{route_id}
  Mode interest       POST/GET/DELETE /api/rider/interest/{mode}
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://scenic-trainer.preview.emergentagent.com").rstrip("/")
RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def rider_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Rider login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token") or (body.get("session") or {}).get("token")
    assert token, f"No token in login response: {body}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ── Scenic Favourites ───────────────────────────────────────────────────────
class TestScenicFavourites:
    ROUTE_A = "lake-garda"
    ROUTE_B = "hells-gate-safari"

    def _cleanup(self, s):
        for rid in (self.ROUTE_A, self.ROUTE_B):
            try:
                s.delete(f"{BASE_URL}/api/scenic/favourites/{rid}", timeout=10)
            except Exception:
                pass

    def test_favourite_unknown_route_returns_404(self, rider_session):
        r = rider_session.post(f"{BASE_URL}/api/scenic/favourites/definitely-not-a-route-xyz", timeout=10)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_favourites_round_trip(self, rider_session):
        s = rider_session
        # clean starting state
        self._cleanup(s)

        # save both real routes
        for rid in (self.ROUTE_A, self.ROUTE_B):
            r = s.post(f"{BASE_URL}/api/scenic/favourites/{rid}", timeout=10)
            assert r.status_code == 200, f"save {rid} -> {r.status_code} {r.text}"
            assert r.json().get("saved") == rid

        # list
        r = s.get(f"{BASE_URL}/api/scenic/favourites", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "ids" in body and "routes" in body
        ids = body["ids"]
        assert self.ROUTE_A in ids and self.ROUTE_B in ids, f"missing ids in {ids}"
        # newest-saved first: B was saved after A
        assert ids.index(self.ROUTE_B) < ids.index(self.ROUTE_A), f"order not newest-first: {ids}"

        routes = body["routes"]
        assert isinstance(routes, list) and len(routes) >= 2
        # each route object should be full (name + youtube_id at minimum)
        by_id = {r_["id"]: r_ for r_ in routes}
        for rid in (self.ROUTE_A, self.ROUTE_B):
            assert rid in by_id, f"{rid} not in list routes"
            assert by_id[rid].get("name")
            assert by_id[rid].get("youtube_id")

        # remove one
        r = s.delete(f"{BASE_URL}/api/scenic/favourites/{self.ROUTE_A}", timeout=10)
        assert r.status_code == 200 and r.json().get("removed") == self.ROUTE_A

        r = s.get(f"{BASE_URL}/api/scenic/favourites", timeout=10)
        assert r.status_code == 200
        ids2 = r.json().get("ids", [])
        assert self.ROUTE_A not in ids2 and self.ROUTE_B in ids2

        # cleanup remaining
        self._cleanup(s)
        r = s.get(f"{BASE_URL}/api/scenic/favourites", timeout=10)
        ids3 = r.json().get("ids", [])
        assert self.ROUTE_A not in ids3 and self.ROUTE_B not in ids3

    def test_delete_nonexistent_is_idempotent(self, rider_session):
        r = rider_session.delete(f"{BASE_URL}/api/scenic/favourites/lake-garda", timeout=10)
        assert r.status_code == 200


# ── Mode Interest (Coming-soon Notify me) ────────────────────────────────────
class TestModeInterest:
    VALID = ["gravel", "mountain-bike", "walking", "running", "rowing", "climbing"]

    def _cleanup(self, s):
        for m in self.VALID:
            try:
                s.delete(f"{BASE_URL}/api/rider/interest/{m}", timeout=10)
            except Exception:
                pass

    def test_invalid_mode_rejected_422(self, rider_session):
        r = rider_session.post(f"{BASE_URL}/api/rider/interest/foobar", timeout=10)
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"

    def test_register_list_remove(self, rider_session):
        s = rider_session
        self._cleanup(s)

        # register a couple
        for m in ("gravel", "walking"):
            r = s.post(f"{BASE_URL}/api/rider/interest/{m}", timeout=10)
            assert r.status_code == 200 and r.json().get("registered") == m

        r = s.get(f"{BASE_URL}/api/rider/interest", timeout=10)
        assert r.status_code == 200
        modes = r.json().get("modes", [])
        assert "gravel" in modes and "walking" in modes

        # remove one
        r = s.delete(f"{BASE_URL}/api/rider/interest/gravel", timeout=10)
        assert r.status_code == 200 and r.json().get("removed") == "gravel"

        r = s.get(f"{BASE_URL}/api/rider/interest", timeout=10)
        modes2 = r.json().get("modes", [])
        assert "gravel" not in modes2 and "walking" in modes2

        self._cleanup(s)

    def test_all_valid_modes_accepted(self, rider_session):
        s = rider_session
        self._cleanup(s)
        for m in self.VALID:
            r = s.post(f"{BASE_URL}/api/rider/interest/{m}", timeout=10)
            assert r.status_code == 200, f"{m} -> {r.status_code} {r.text}"
        r = s.get(f"{BASE_URL}/api/rider/interest", timeout=10)
        modes = set(r.json().get("modes", []))
        assert set(self.VALID).issubset(modes), f"missing: {set(self.VALID) - modes}"
        self._cleanup(s)
