"""Iteration 71 — Scenic Discoveries + Journeys backend tests.

Covers:
  - POST/GET/PATCH/DELETE /api/scenic/discoveries (rider-scoped, idempotent
    per route_id+poi_order).
  - GET /api/scenic/journeys (joined with saved discoveries, empty by default).
  - Regression: GET /api/scenic/routes, /routes/{id}, /routes/{id}/pois,
    /favourites.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PW = "rideon9900"
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PW = "demo9900"


def _login(email: str, pw: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def rider_headers():
    return {"Authorization": f"Bearer {_login(RIDER_EMAIL, RIDER_PW)}"}


@pytest.fixture(scope="module")
def demo_headers():
    return {"Authorization": f"Bearer {_login(DEMO_EMAIL, DEMO_PW)}"}


@pytest.fixture(scope="module")
def a_route(rider_headers):
    r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=rider_headers, timeout=30)
    assert r.status_code == 200
    routes = r.json().get("routes") or []
    assert routes, "expected seeded scenic routes"
    return routes[0]


# ---------------- Scenic routes / pois / favourites regression ----------------
class TestScenicRegression:
    def test_list_routes(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "routes" in body and isinstance(body["routes"], list)
        assert len(body["routes"]) >= 1
        first = body["routes"][0]
        for k in ("id", "name", "youtube_id"):
            assert k in first and first[k]

    def test_get_route(self, rider_headers, a_route):
        r = requests.get(f"{BASE_URL}/api/scenic/routes/{a_route['id']}", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == a_route["id"]

    def test_get_route_pois(self, rider_headers, a_route):
        r = requests.get(f"{BASE_URL}/api/scenic/routes/{a_route['id']}/pois", headers=rider_headers, timeout=60)
        assert r.status_code == 200
        body = r.json()
        assert body["route_id"] == a_route["id"]
        assert isinstance(body.get("pois"), list) and len(body["pois"]) >= 1
        p0 = body["pois"][0]
        for k in ("order", "at_pct", "title"):
            assert k in p0

    def test_favourites_roundtrip(self, rider_headers, a_route):
        rid = a_route["id"]
        # add
        r = requests.post(f"{BASE_URL}/api/scenic/favourites/{rid}", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        # list
        r = requests.get(f"{BASE_URL}/api/scenic/favourites", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        ids = r.json().get("ids") or []
        assert rid in ids
        # remove
        r = requests.delete(f"{BASE_URL}/api/scenic/favourites/{rid}", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/scenic/favourites", headers=rider_headers, timeout=30)
        assert rid not in (r.json().get("ids") or [])


# ---------------- Discoveries CRUD ----------------
class TestDiscoveries:
    _created_ids: list[str] = []

    def test_list_empty_for_random_route(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers,
                         params={"route_id": f"nope-{uuid.uuid4().hex[:6]}"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("discoveries") == []

    def test_create_discovery(self, rider_headers, a_route):
        payload = {
            "route_id": a_route["id"],
            "route_name": a_route["name"],
            "place": a_route.get("place") or "",
            "poi_order": 0,
            "at_pct": 0.25,
            "title": "TEST_ Cathedral view",
            "description": "TEST desc",
            "narration": "TEST narration",
        }
        r = requests.post(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()["discovery"]
        assert d["id"] and d["title"] == "TEST_ Cathedral view"
        assert d["route_id"] == a_route["id"] and d["poi_order"] == 0
        TestDiscoveries._created_ids.append(d["id"])

        # verify list
        lr = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers,
                          params={"route_id": a_route["id"]}, timeout=30)
        assert lr.status_code == 200
        ids = [x["id"] for x in lr.json()["discoveries"]]
        assert d["id"] in ids

    def test_idempotent_per_poi_order(self, rider_headers, a_route):
        # posting again with same route+poi_order should return same id but update fields
        payload = {
            "route_id": a_route["id"], "poi_order": 0, "at_pct": 0.25,
            "title": "TEST_ Updated title", "description": "TEST desc2",
        }
        r1 = requests.post(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers, json=payload, timeout=30)
        r2 = requests.post(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers, json=payload, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        d1 = r1.json()["discovery"]; d2 = r2.json()["discovery"]
        assert d1["id"] == d2["id"], "idempotent id should match on repeat"
        assert d2["title"] == "TEST_ Updated title"

    def test_patch_discovery(self, rider_headers):
        assert TestDiscoveries._created_ids, "need created discovery"
        did = TestDiscoveries._created_ids[0]
        r = requests.patch(f"{BASE_URL}/api/scenic/discoveries/{did}", headers=rider_headers,
                           json={"description": "TEST patched", "narration": "TEST patched nar"}, timeout=30)
        assert r.status_code == 200
        d = r.json()["discovery"]
        assert d["description"] == "TEST patched"
        assert d["narration"] == "TEST patched nar"

    def test_patch_404(self, rider_headers):
        r = requests.patch(f"{BASE_URL}/api/scenic/discoveries/does-not-exist-{uuid.uuid4().hex[:6]}",
                           headers=rider_headers, json={"title": "TEST"}, timeout=30)
        assert r.status_code == 404

    def test_user_isolation(self, rider_headers, demo_headers, a_route):
        """A discovery saved by rider must not appear in demo's list."""
        # Create as rider (idempotent for poi_order=1)
        payload = {"route_id": a_route["id"], "poi_order": 1, "at_pct": 0.5,
                   "title": "TEST_ isolated"}
        r = requests.post(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers, json=payload, timeout=30)
        assert r.status_code == 200
        rider_id = r.json()["discovery"]["id"]
        TestDiscoveries._created_ids.append(rider_id)

        # Demo listing must not include it
        r = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=demo_headers,
                         params={"route_id": a_route["id"]}, timeout=30)
        assert r.status_code == 200
        demo_ids = [x["id"] for x in r.json()["discoveries"]]
        assert rider_id not in demo_ids

    def test_delete_discovery(self, rider_headers, a_route):
        assert TestDiscoveries._created_ids
        for did in list(TestDiscoveries._created_ids):
            r = requests.delete(f"{BASE_URL}/api/scenic/discoveries/{did}", headers=rider_headers, timeout=30)
            assert r.status_code == 200

        # verify list no longer contains any
        r = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers,
                         params={"route_id": a_route["id"]}, timeout=30)
        got = [x["id"] for x in r.json()["discoveries"]]
        for did in TestDiscoveries._created_ids:
            assert did not in got
        TestDiscoveries._created_ids.clear()


# ---------------- Journeys ----------------
class TestJourneys:
    def test_journeys_endpoint_shape(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/journeys", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "journeys" in body and isinstance(body["journeys"], list)
        # Each entry (if any) must include required shape.
        for j in body["journeys"]:
            for k in ("id", "routeId", "name", "distance_km", "duration_sec", "at", "thumbnail", "discoveries"):
                assert k in j, f"missing {k} in journey"
            assert isinstance(j["discoveries"], list)

    def test_journeys_never_fabricated_for_fresh_user(self, demo_headers):
        """Assumes demo has no scenic rides completed. If any exist, they must
        be real scenic-* workouts, not fabricated."""
        r = requests.get(f"{BASE_URL}/api/scenic/journeys", headers=demo_headers, timeout=30)
        assert r.status_code == 200
        journeys = r.json().get("journeys")
        assert isinstance(journeys, list)
        # If demo has any, they must have proper thumbnail/routeId (real data).
        for j in journeys:
            assert j.get("routeId")
