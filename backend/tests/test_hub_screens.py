"""Pytest coverage for the 6 new hub screens + enriched calendar readiness.

Hits the public preview URL (EXPO_PUBLIC_BACKEND_URL) so we test what the
mobile client is actually seeing.
"""
import os
from pathlib import Path

import pytest
import requests

# Read backend URL from frontend/.env (same pattern as other tests)
_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = None
for line in _env.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─────────────── Enriched calendar readiness ───────────────
class TestCalendarReadinessEnriched:
    def test_week_readiness_has_source_and_metrics(self, api):
        r = api.get(f"{BASE_URL}/api/calendar/week", params={"start": "2025-05-12"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("seed_version") == 2, f"expected seed_version=2, got {d.get('seed_version')}"
        assert len(d["days"]) == 7
        keys_expected = {"energy", "soreness", "stress", "sleep"}
        for day in d["days"]:
            rd = day["readiness"]
            assert "source" in rd and isinstance(rd["source"], str) and rd["source"]
            assert "metrics" in rd and isinstance(rd["metrics"], list) and len(rd["metrics"]) == 4
            keys = {m["key"] for m in rd["metrics"]}
            assert keys == keys_expected, f"metrics keys mismatch for {day['date']}: {keys}"
            for m in rd["metrics"]:
                assert set(("key", "label", "value", "display")).issubset(m.keys())
                assert isinstance(m["value"], (int, float))

    def test_wednesday_readiness_matches_spec(self, api):
        """Spec asks: readiness-2 (WED) score 68 Moderate, Apple Health, energy/soreness/stress/sleep."""
        r = api.get(f"{BASE_URL}/api/calendar/week", timeout=15)
        d = r.json()
        wed = d["days"][2]
        assert wed["day_name"] == "WED"
        rd = wed["readiness"]
        assert rd["score"] == 68, f"expected WED score 68, got {rd['score']}"
        assert rd["status"] == "Moderate", f"expected WED status Moderate, got {rd['status']}"
        assert rd["source"] == "Apple Health", f"expected Apple Health, got {rd['source']}"


# ─────────────── Progress ───────────────
class TestProgress:
    def test_progress_shape(self, api):
        r = api.get(f"{BASE_URL}/api/progress", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("headline", "subhead", "fitness", "trend", "metrics", "records", "recent"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["metrics"], list) and len(d["metrics"]) == 4
        assert isinstance(d["records"], list) and len(d["records"]) >= 5
        assert isinstance(d["recent"], list) and len(d["recent"]) >= 1
        assert "ctl" in d["trend"] and "atl" in d["trend"]
        assert isinstance(d["trend"]["ctl"], list) and len(d["trend"]["ctl"]) > 0


# ─────────────── Routes ───────────────
class TestRoutes:
    def test_routes_shape(self, api):
        r = api.get(f"{BASE_URL}/api/routes", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "featured" in d and d["featured"].get("name")
        assert "categories" in d and "All" in d["categories"] and "Climbs" in d["categories"]
        assert isinstance(d["routes"], list) and len(d["routes"]) >= 3
        # Each route must have id/name/tag/place
        for rt in d["routes"]:
            for f in ("id", "name", "place", "tag"):
                assert f in rt


# ─────────────── Community ───────────────
class TestCommunity:
    def test_community_shape(self, api):
        r = api.get(f"{BASE_URL}/api/community", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["challenges"], list) and len(d["challenges"]) >= 1
        for c in d["challenges"]:
            assert "progress" in c and 0 <= c["progress"] <= 100
        # "You" is present in the leaderboard
        assert any(p.get("you") is True for p in d["leaderboard"])
        assert isinstance(d["feed"], list) and len(d["feed"]) >= 1
        for p in d["feed"]:
            for f in ("id", "name", "kudos"):
                assert f in p


# ─────────────── Connections ───────────────
class TestConnections:
    def test_connections_shape(self, api):
        r = api.get(f"{BASE_URL}/api/connections", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["devices"], list) and len(d["devices"]) >= 1
        statuses = {dev["status"] for dev in d["devices"]}
        assert "connected" in statuses
        assert "disconnected" in statuses  # at least one disconnected
        assert isinstance(d["services"], list) and len(d["services"]) >= 3
        assert any(s["id"] == "trainingpeaks" for s in d["services"])
        assert any(s["id"] == "strava" for s in d["services"])
