"""Iter99 — validate new `activity` field + filter on GET /api/scenic/routes.

Contract:
- ?activity=gravel        → exactly 3 seeded routes, each with activity='gravel'
- ?activity=mountain-bike → exactly 3, each with activity='mountain-bike'
- ?activity=running       → exactly 3, each with activity='running'
- ?activity=cycling       → full cycling catalog, NONE of the 9 activity routes
- default (no filter)     → returns all published including new activity ones
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://scenic-trainer.preview.emergentagent.com"

ACTIVITY_IDS = {
    "gravel": {"gravel-tuscany-strade", "gravel-forest-fireroad", "gravel-lakeside-mixed"},
    "mountain-bike": {"mtb-alpine-singletrack", "mtb-forest-flow", "mtb-mountain-epic"},
    "running": {"run-coastal-promenade", "run-park-loop", "run-lakeside-trail"},
}


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "demo@roujaune.app", "password": "demo9900"}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.mark.parametrize("activity", ["gravel", "mountain-bike", "running"])
def test_activity_filter_returns_exact_three(sess, activity):
    r = sess.get(f"{BASE_URL}/api/scenic/routes", params={"activity": activity}, timeout=20)
    assert r.status_code == 200, r.text
    routes = r.json().get("routes", [])
    ids = {rt["id"] for rt in routes}
    # Must contain the 3 seeded routes for that activity
    assert ACTIVITY_IDS[activity].issubset(ids), f"missing seeded {activity} routes: {ACTIVITY_IDS[activity] - ids}"
    # Every returned route must have this activity field
    for rt in routes:
        assert rt.get("activity") == activity, f"route {rt.get('id')} activity={rt.get('activity')} expected {activity}"
    assert len(routes) == 3, f"expected exactly 3 {activity} routes, got {len(routes)}: {ids}"


def test_cycling_filter_excludes_activity_routes(sess):
    r = sess.get(f"{BASE_URL}/api/scenic/routes", params={"activity": "cycling"}, timeout=20)
    assert r.status_code == 200
    routes = r.json().get("routes", [])
    ids = {rt["id"] for rt in routes}
    all_activity = ACTIVITY_IDS["gravel"] | ACTIVITY_IDS["mountain-bike"] | ACTIVITY_IDS["running"]
    leaked = ids & all_activity
    assert not leaked, f"cycling catalog should NOT include activity routes: {leaked}"
    # Ensure activity field is present on every route
    for rt in routes:
        assert rt.get("activity") == "cycling", f"cycling route {rt.get('id')} activity={rt.get('activity')}"
    # Cycling catalog should have a healthy number (seed + admin additions)
    assert len(routes) >= 4, f"expected non-trivial cycling catalog, got {len(routes)}"


def test_default_no_filter_includes_activity_routes(sess):
    r = sess.get(f"{BASE_URL}/api/scenic/routes", timeout=20)
    assert r.status_code == 200
    routes = r.json().get("routes", [])
    ids = {rt["id"] for rt in routes}
    all_activity = ACTIVITY_IDS["gravel"] | ACTIVITY_IDS["mountain-bike"] | ACTIVITY_IDS["running"]
    assert all_activity.issubset(ids), f"default listing missing activity routes: {all_activity - ids}"


def test_activity_field_present_on_all_routes(sess):
    r = sess.get(f"{BASE_URL}/api/scenic/routes", timeout=20)
    routes = r.json().get("routes", [])
    for rt in routes:
        assert "activity" in rt and rt["activity"], f"route {rt.get('id')} missing/empty activity"
