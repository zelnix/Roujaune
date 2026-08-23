"""Iter 83 features:
1. Season Recap  — GET /api/analysis/season-recap (demo, has_data=True + all fields)
2. Milestone Wall — GET /api/analysis/milestone-wall (3 categories, rows monotone, earned<=total)
3. Split PR Highlights — GET /api/analysis/climb-detail includes recent_split_prs + recent_activity_id
4. Gemini TTS coach voice — GET /api/coach/speak?text=&coach_id=alberto|adriana returns 200 audio/wav
   Without an auth token it must return 401.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://scenic-trainer.preview.emergentagent.com").rstrip("/")


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def demo_headers():
    return _login("demo@roujaune.app", "demo9900")


# ---- 1. Season Recap ----
class TestSeasonRecap:
    def test_season_recap_shape_and_has_data(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/season-recap",
                         headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        for k in ("year", "rides", "distance_km", "hours", "tss",
                  "climbs_conquered", "biggest_climb_m", "longest_ride_km",
                  "records_set", "has_data"):
            assert k in b, f"missing field {k} in {b}"
        assert isinstance(b["year"], int) and b["year"] >= 2020
        assert isinstance(b["rides"], int) and b["rides"] >= 0
        assert isinstance(b["has_data"], bool)
        assert b["has_data"] is True, f"demo should have has_data=True, got {b}"
        assert b["rides"] > 0, f"demo should have rides>0, got {b}"


# ---- 2. Milestone Wall ----
class TestMilestoneWall:
    def test_wall_categories_and_rows(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/milestone-wall",
                         headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert "categories" in b and isinstance(b["categories"], list)
        assert "earned" in b and isinstance(b["earned"], int)
        assert "total" in b and isinstance(b["total"], int)
        assert b["earned"] <= b["total"], f"earned>total: {b['earned']}/{b['total']}"

        cats = b["categories"]
        keys = {c["key"] for c in cats}
        assert {"rides", "distance", "hours"}.issubset(keys), f"missing cats: {keys}"

        total_rows = 0
        total_reached = 0
        for c in cats:
            for k in ("key", "title", "icon", "current", "rows"):
                assert k in c, f"cat missing {k}: {c}"
            rows = c["rows"]
            assert isinstance(rows, list) and rows, f"cat {c['key']} rows empty"
            # rows sorted ascending by value
            vals = [r_["value"] for r_ in rows]
            assert vals == sorted(vals), f"cat {c['key']} rows not sorted: {vals}"
            # reached booleans consistent with current
            for r_ in rows:
                assert isinstance(r_["reached"], bool)
                assert r_["reached"] == (c["current"] >= r_["value"]), (
                    f"cat {c['key']} row {r_['value']} reached mismatch (current={c['current']})"
                )
                total_rows += 1
                if r_["reached"]:
                    total_reached += 1
        assert total_rows == b["total"], f"row count {total_rows} != total {b['total']}"
        assert total_reached == b["earned"], f"reached {total_reached} != earned {b['earned']}"


# ---- 3. Climb Detail Split-PR Highlights ----
class TestClimbDetailSplitPRs:
    def test_climb_detail_has_recent_split_prs_and_recent_activity_id(self, demo_headers):
        # First discover a repeated climb id from the leaderboard
        r = requests.get(f"{BASE_URL}/api/analysis/climb-leaderboard",
                         headers=demo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        lb = r.json()
        climbs = lb.get("climbs") or []
        assert climbs, f"leaderboard has no climbs: {lb}"
        cid = climbs[0]["id"]

        r2 = requests.get(f"{BASE_URL}/api/analysis/climb-detail",
                          headers=demo_headers, params={"id": cid}, timeout=30)
        assert r2.status_code == 200, r2.text[:300]
        b = r2.json()
        assert b.get("found") is True, f"expected found=True for {cid}, got {b}"
        assert "recent_split_prs" in b, "missing recent_split_prs"
        assert isinstance(b["recent_split_prs"], list), (
            f"recent_split_prs not a list: {type(b['recent_split_prs'])}"
        )
        assert "recent_activity_id" in b, "missing recent_activity_id"
        assert b["recent_activity_id"], f"recent_activity_id empty: {b['recent_activity_id']!r}"
        # splits still present
        assert isinstance(b.get("splits"), list) and b["splits"], "splits missing/empty"
        # If recent_split_prs is non-empty, its entries must reference valid split indices
        idxs = {s["index"] for s in b["splits"]}
        for sp in b["recent_split_prs"]:
            assert sp["index"] in idxs, f"split PR references unknown index: {sp}"
            assert "from_d" in sp and "to_d" in sp and "time_s" in sp, f"bad split PR: {sp}"


# ---- 4. Gemini TTS coach voice ----
class TestCoachSpeakTTS:
    def test_speak_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/coach/speak",
                         params={"text": "Great work", "coach_id": "alberto"},
                         timeout=30)
        assert r.status_code == 401, (
            f"expected 401 without auth, got {r.status_code}: {r.text[:200]}"
        )

    def test_speak_alberto_returns_wav(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/coach/speak", headers=demo_headers,
                         params={"text": "Great work today!", "coach_id": "alberto"},
                         timeout=90)
        assert r.status_code == 200, f"alberto speak {r.status_code}: {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert ct.startswith("audio/wav"), f"expected audio/wav, got {ct!r}"
        assert len(r.content) > 1000, f"wav body too small: {len(r.content)} bytes"
        # WAV magic header
        assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WAVE", (
            f"not a valid WAV: {r.content[:16]!r}"
        )

    def test_speak_adriana_returns_wav(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/coach/speak", headers=demo_headers,
                         params={"text": "Nice ride, keep it up!", "coach_id": "adriana"},
                         timeout=90)
        assert r.status_code == 200, f"adriana speak {r.status_code}: {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert ct.startswith("audio/wav"), f"expected audio/wav, got {ct!r}"
        assert len(r.content) > 1000, f"wav body too small: {len(r.content)} bytes"
        assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WAVE"
