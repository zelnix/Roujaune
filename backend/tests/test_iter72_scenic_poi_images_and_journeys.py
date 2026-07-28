"""Iteration 72 — Scenic POI image enrichment + Journeys elevation/country.

Verifies:
  - GET /api/scenic/routes/{id}/pois enriches most POIs with a Wikipedia
    landmark photo (https URL, not a flag / coat-of-arms / locator map / .svg).
    Tested on lake-garda, lake-achensee, dutch-countryside.
  - Cached second call returns quickly and still carries `image`.
  - ?refresh=true regenerates and still returns image-enriched POIs.
  - POI endpoint never 500s even if image lookup fails (best-effort).
  - GET /api/scenic/journeys now includes `elevation_m` (int|None) and
    `country` (str) alongside the previously-tested fields.
  - Regression: /api/scenic/routes, /routes/{id}, /favourites,
    and discoveries CRUD (POST/GET/PATCH/DELETE) still work.
"""
from __future__ import annotations

import os
import re
import time
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

TARGET_ROUTES = ["lake-garda", "lake-achensee", "dutch-countryside"]

# Images we must NOT accept as landmark photos.
BAD_IMG_RE = re.compile(
    r"(flag_|flag-|coat_of_arms|coat-of-arms|wappen|blason|escudo|bandera|"
    r"location_|locator|_map[._]|map_of|karte|logo|seal_|emblem|\.svg)",
    re.IGNORECASE,
)


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


def _is_good_image(url: str) -> bool:
    if not isinstance(url, str) or not url:
        return False
    if not url.startswith("https://"):
        return False
    # Must be Wikipedia/Wikimedia hosted per the design.
    if "wikipedia" not in url and "wikimedia" not in url:
        return False
    if BAD_IMG_RE.search(url):
        return False
    return True


# ---------------- POI image enrichment ----------------
class TestScenicPOIImages:
    """Each target route gets POIs with real landmark photos on the majority
    of items; cached fetches must still carry `image`."""

    @pytest.mark.parametrize("route_id", TARGET_ROUTES)
    def test_pois_have_landmark_images(self, rider_headers, route_id):
        # First call — may be slow (LLM + wiki lookups). Generous timeout.
        r = requests.get(f"{BASE_URL}/api/scenic/routes/{route_id}/pois",
                         headers=rider_headers, timeout=180)
        assert r.status_code == 200, f"{route_id} pois failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["route_id"] == route_id
        pois = body.get("pois") or []
        assert isinstance(pois, list) and len(pois) >= 3, f"expected >=3 pois for {route_id}, got {len(pois)}"

        # Field shape check
        for p in pois:
            for k in ("order", "at_pct", "title"):
                assert k in p, f"missing {k} in poi for {route_id}"
            assert "image" in p, f"missing image key in poi for {route_id}"

        # MOST pois should carry a valid landmark image (per request).
        good = [p for p in pois if _is_good_image(p.get("image") or "")]
        # Any populated image must not be a flag/coat-of-arms/locator/svg.
        bad = [p for p in pois if p.get("image") and not _is_good_image(p["image"])]
        assert not bad, f"{route_id} has disallowed images: {[p['image'] for p in bad]}"
        assert len(good) > len(pois) / 2, (
            f"{route_id} only {len(good)}/{len(pois)} POIs have a valid landmark image; "
            f"images={[p.get('image') for p in pois]}"
        )

    @pytest.mark.parametrize("route_id", TARGET_ROUTES)
    def test_pois_cached_second_call_fast_and_keeps_image(self, rider_headers, route_id):
        # Warm (should already be cached from the previous test)
        requests.get(f"{BASE_URL}/api/scenic/routes/{route_id}/pois",
                     headers=rider_headers, timeout=180)
        t0 = time.perf_counter()
        r = requests.get(f"{BASE_URL}/api/scenic/routes/{route_id}/pois",
                         headers=rider_headers, timeout=30)
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        body = r.json()
        assert body.get("source") in ("cache", "llm", "fallback")
        pois = body.get("pois") or []
        assert pois, "cached response must include pois"
        # Cached path should be fast — <10s is generous (wiki lookups already done).
        assert elapsed < 15, f"cached call too slow for {route_id}: {elapsed:.1f}s"
        # `image` key must survive the cache.
        assert all("image" in p for p in pois), f"cache lost image field for {route_id}"

    def test_refresh_true_regenerates(self, rider_headers):
        # Use dutch-countryside for the refresh check (small route).
        rid = "dutch-countryside"
        r = requests.get(f"{BASE_URL}/api/scenic/routes/{rid}/pois",
                         headers=rider_headers, params={"refresh": "true"}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        assert body["route_id"] == rid
        pois = body.get("pois") or []
        assert pois, "refresh should still return POIs"
        # After refresh, image field must be present (may be None but key exists).
        assert all("image" in p for p in pois)

    def test_pois_404_for_unknown_route(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes/nope-{uuid.uuid4().hex[:6]}/pois",
                         headers=rider_headers, timeout=30)
        assert r.status_code == 404

    def test_pois_never_500(self, rider_headers):
        """Sanity: even under stress (repeat calls), endpoint returns 200."""
        for rid in TARGET_ROUTES:
            r = requests.get(f"{BASE_URL}/api/scenic/routes/{rid}/pois",
                             headers=rider_headers, timeout=60)
            assert r.status_code == 200, f"{rid} returned {r.status_code}: {r.text[:300]}"


# ---------------- Journeys new fields ----------------
class TestJourneysShape:
    def test_journeys_include_elevation_and_country(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/journeys", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "journeys" in body and isinstance(body["journeys"], list)
        required_keys = ("id", "routeId", "name", "place", "tag",
                         "distance_km", "duration_sec", "at", "thumbnail",
                         "discoveries", "elevation_m", "country")
        for j in body["journeys"]:
            for k in required_keys:
                assert k in j, f"missing {k} in journey {j.get('id')}"
            assert isinstance(j["discoveries"], list)
            # elevation_m: int or None
            assert j["elevation_m"] is None or isinstance(j["elevation_m"], int), (
                f"elevation_m must be int|None, got {type(j['elevation_m']).__name__}")
            # country: string (possibly empty)
            assert isinstance(j["country"], str)

    def test_journeys_empty_ok_for_demo(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/journeys", headers=demo_headers, timeout=30)
        assert r.status_code == 200
        journeys = r.json().get("journeys")
        assert isinstance(journeys, list)


# ---------------- Regressions ----------------
class TestScenicRegression:
    def test_list_routes(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        routes = r.json().get("routes") or []
        assert routes, "expected published scenic routes"
        ids = {r_["id"] for r_ in routes}
        for rid in TARGET_ROUTES:
            assert rid in ids, f"target route {rid} missing from feed"

    def test_get_route_detail(self, rider_headers):
        r = requests.get(f"{BASE_URL}/api/scenic/routes/lake-garda", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "lake-garda"
        assert d["youtube_id"]

    def test_favourites_roundtrip(self, rider_headers):
        rid = "lake-achensee"
        r = requests.post(f"{BASE_URL}/api/scenic/favourites/{rid}", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/scenic/favourites", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        assert rid in (r.json().get("ids") or [])
        r = requests.delete(f"{BASE_URL}/api/scenic/favourites/{rid}", headers=rider_headers, timeout=30)
        assert r.status_code == 200

    def test_discoveries_crud(self, rider_headers):
        payload = {
            "route_id": "lake-garda", "route_name": "Lake Garda",
            "place": "Italy", "poi_order": 9, "at_pct": 0.4,
            "title": "TEST_ iter72 disc", "description": "TEST desc",
            "narration": "TEST narration",
        }
        # POST
        r = requests.post(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers, json=payload, timeout=30)
        assert r.status_code == 200
        did = r.json()["discovery"]["id"]
        # GET
        r = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers,
                         params={"route_id": "lake-garda"}, timeout=30)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()["discoveries"]]
        assert did in ids
        # PATCH
        r = requests.patch(f"{BASE_URL}/api/scenic/discoveries/{did}",
                           headers=rider_headers, json={"description": "TEST patched"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["discovery"]["description"] == "TEST patched"
        # DELETE
        r = requests.delete(f"{BASE_URL}/api/scenic/discoveries/{did}", headers=rider_headers, timeout=30)
        assert r.status_code == 200
        # Verify gone
        r = requests.get(f"{BASE_URL}/api/scenic/discoveries", headers=rider_headers,
                         params={"route_id": "lake-garda"}, timeout=30)
        assert did not in [d["id"] for d in r.json()["discoveries"]]
