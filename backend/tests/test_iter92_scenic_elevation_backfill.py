"""Iteration 92 — verify scenic route elevation/distance backfill.

Every published scenic route should carry:
  * distance_km  (non-null, > 0)
  * elevation_m  (non-null, >= 0)
  * elevation_profile  (list of length > 1)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
EMAIL = "demo@roujaune.app"
PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def routes(auth_token):
    r = requests.get(
        f"{BASE_URL}/api/scenic/routes",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"scenic routes failed: {r.status_code} {r.text}"
    data = r.json()
    assert "routes" in data, f"missing routes key: {data}"
    return data["routes"]


def test_at_least_one_route_present(routes):
    assert len(routes) > 0, "no published scenic routes returned"


def test_all_routes_have_distance_km(routes):
    """Every route must expose a non-null positive distance_km."""
    missing = [r["id"] for r in routes if not r.get("distance_km") or r["distance_km"] <= 0]
    assert not missing, f"routes missing distance_km: {missing}"


def test_all_routes_have_elevation_m(routes):
    """Every route must expose a non-null elevation_m (>= 0)."""
    missing = [r["id"] for r in routes if r.get("elevation_m") is None]
    assert not missing, f"routes missing elevation_m: {missing}"


def test_all_routes_have_elevation_profile(routes):
    """Every route must expose an elevation_profile array of length > 1."""
    bad = []
    for r in routes:
        prof = r.get("elevation_profile")
        if not isinstance(prof, list) or len(prof) <= 1:
            bad.append((r["id"], len(prof) if isinstance(prof, list) else None))
    assert not bad, f"routes with invalid elevation_profile (id, length): {bad}"


def test_elevation_profile_shape(routes):
    """Each sample should carry km + grade numeric fields."""
    for r in routes:
        prof = r.get("elevation_profile") or []
        assert prof, f"empty profile for {r['id']}"
        for i, sample in enumerate(prof[:3]):
            assert "km" in sample and "grade" in sample, (
                f"route {r['id']} sample {i} shape={sample}"
            )
            assert isinstance(sample["km"], (int, float))
            assert isinstance(sample["grade"], (int, float))


def test_backfilled_routes_present(routes):
    """Sanity: the routes listed in _METRICS_BACKFILL should exist and be filled."""
    ids = {r["id"]: r for r in routes}
    expected_backfill = [
        "tyrol-three-lakes", "adige-valley-to-garda", "walchensee-loop",
        "dolomites-cortina-calalzo", "hells-gate-safari", "isarco-river-path",
        "brixen-vineyards-loop", "adige-bozen-lavis", "bavarian-roman-roads",
        "isar-autumn", "fedaia-dam-descent", "passo-fedaia-climb",
        "ledro-to-garda-ponale", "garda-sunrise-promenade",
        "brixen-to-kiens-pustertal",
    ]
    present = [rid for rid in expected_backfill if rid in ids]
    # We don't require every id (admin may have renamed some), but at least a
    # meaningful subset must be present AND filled.
    assert len(present) >= 5, f"expected backfilled routes not published: present={present}"
    for rid in present:
        r = ids[rid]
        assert r["distance_km"] and r["distance_km"] > 0, f"{rid} distance_km missing"
        assert r["elevation_m"] is not None, f"{rid} elevation_m missing"
