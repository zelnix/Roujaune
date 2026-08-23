"""iter85 — email-prefs partial update, public unsubscribe (HTML/no auth), and analysis regressions."""
import os
import requests
import pytest

BASE = "https://scenic-trainer.preview.emergentagent.com"
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PW = "demo9900"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── email-prefs: partial-update semantics ─────────────────────────────────────
class TestEmailPrefsPartial:
    def test_initial_get(self, hdr):
        r = requests.get(f"{BASE}/api/analysis/email-prefs", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "weekly_digest" in j and "digest_weekday" in j
        assert isinstance(j["weekly_digest"], bool)
        assert isinstance(j["digest_weekday"], int)

    def test_put_weekday_only_partial(self, hdr):
        # snapshot
        cur = requests.get(f"{BASE}/api/analysis/email-prefs", headers=hdr, timeout=15).json()
        prev_wd = cur["weekly_digest"]
        r = requests.put(f"{BASE}/api/analysis/email-prefs", headers=hdr, json={"digest_weekday": 3}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["digest_weekday"] == 3
        assert j["weekly_digest"] == prev_wd, "PUT with only digest_weekday must not change weekly_digest"

    def test_put_weekly_true_then_get(self, hdr):
        r = requests.put(f"{BASE}/api/analysis/email-prefs", headers=hdr, json={"weekly_digest": True}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["weekly_digest"] is True
        assert j["digest_weekday"] == 3, "digest_weekday must persist from prior PUT"
        g = requests.get(f"{BASE}/api/analysis/email-prefs", headers=hdr, timeout=15).json()
        assert g["weekly_digest"] is True and g["digest_weekday"] == 3

    def test_zzz_reset_pristine(self, hdr):
        # Leave demo clean per main-agent instructions
        r = requests.put(f"{BASE}/api/analysis/email-prefs", headers=hdr,
                         json={"weekly_digest": False, "digest_weekday": 0}, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{BASE}/api/analysis/email-prefs", headers=hdr, timeout=15).json()
        assert g["weekly_digest"] is False and g["digest_weekday"] == 0


# ── public unsubscribe: HTML, no auth, bogus token → "not recognised" ─────────
class TestPublicUnsubscribe:
    def test_bogus_token_returns_html_200_no_auth(self):
        # NO Authorization header
        r = requests.get(f"{BASE}/api/analysis/unsubscribe?token=bogus", timeout=15)
        assert r.status_code == 200, f"expected 200 public HTML, got {r.status_code}: {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "text/html" in ctype.lower(), f"expected HTML, got {ctype}"
        body = r.text.lower()
        assert "not recognised" in body, "bogus token should return 'not recognised' page"

    def test_missing_token_returns_html(self):
        r = requests.get(f"{BASE}/api/analysis/unsubscribe", timeout=15)
        assert r.status_code == 200
        assert "not recognised" in r.text.lower()


# ── regression: analysis endpoints still 200 ─────────────────────────────────
class TestAnalysisRegression:
    def test_season_recap(self, hdr):
        r = requests.get(f"{BASE}/api/analysis/season-recap", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("year", "rides", "distance_km", "hours", "biggest_climb_m",
                  "longest_ride_km", "records_set", "climbs_conquered", "has_data"):
            assert k in j, f"missing {k}"

    def test_milestone_wall(self, hdr):
        r = requests.get(f"{BASE}/api/analysis/milestone-wall", headers=hdr, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "categories" in j and "earned" in j and "total" in j

    def test_weekly_digest(self, hdr):
        r = requests.get(f"{BASE}/api/analysis/weekly-digest", headers=hdr, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "this_week" in j and "deltas" in j and "new_records" in j
