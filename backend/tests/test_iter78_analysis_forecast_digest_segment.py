"""Iter 78 — Fitness Trends & Compare new analysis endpoints.

Covers:
  - GET /api/analysis/pmc?days=90&forecast_days=14 -> series[] + forecast[14]
    with projected:true, plus forecast_fitness / forecast_form /
    forecast_state / projected_daily_tss and legacy fitness/fatigue/form/form_state.
  - GET /api/analysis/weekly-digest -> this_week{tss,hours,rides,distance_km},
    deltas{tss,hours,rides,distance_km}, new_records[], has_activity, week_start.
  - GET /api/analysis/segment-compare?a=<demo A>&b=<demo B>
    -> matched:true with 1 segment (gain_m ~171, length_m ~2500,
       a.time_s/b.time_s present, delta_s, faster in {a,b,tie}, each series ~51pts).
  - segment-compare graceful no-match on greenlantern (no GPS rides) ->
    matched:false with reason in {no_gps, no_shared_climb, not_found} (must NOT 500).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://roujaune-train.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"
DEMO_A = "e3cb783f-fbb9-4306-b0f2-57980b93fa62"
DEMO_B = "c95da076-69c2-455d-bd1e-975f0821eb8e"

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"


# ---- auth ---------------------------------------------------------------- #
def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers():
    tok = _login(DEMO_EMAIL, DEMO_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def gl_headers():
    tok = _login(GL_EMAIL, GL_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# =========================================================================
# 1) PMC + Form Forecast
# =========================================================================
class TestPmcForecast:
    def test_pmc_shape_default(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/pmc", headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Legacy fields
        for k in ("series", "fitness", "fatigue", "form", "form_state",
                  "ramp_rate", "weekly_tss"):
            assert k in j, f"missing legacy field: {k}"
        # New forecast fields
        for k in ("forecast", "forecast_fitness", "forecast_form",
                  "forecast_state", "projected_daily_tss"):
            assert k in j, f"missing forecast field: {k}"
        assert isinstance(j["series"], list) and len(j["series"]) > 0
        # series shape
        s0 = j["series"][0]
        for k in ("date", "ctl", "atl", "tsb", "tss"):
            assert k in s0, f"series pt missing {k}: {s0}"

    def test_pmc_forecast_14_days_projected(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/pmc?days=90&forecast_days=14",
            headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        fc = j["forecast"]
        assert isinstance(fc, list) and len(fc) == 14, f"forecast len={len(fc)}"
        for p in fc:
            for k in ("date", "ctl", "atl", "tsb", "tss", "projected"):
                assert k in p, f"forecast pt missing {k}: {p}"
            assert p["projected"] is True
        # forecast dates must be strictly increasing and after last series date
        last_series_date = j["series"][-1]["date"]
        assert fc[0]["date"] > last_series_date
        for i in range(1, len(fc)):
            assert fc[i]["date"] > fc[i - 1]["date"]
        # forecast_state is a string
        assert isinstance(j["forecast_state"], str) and len(j["forecast_state"]) > 0
        # projected_daily_tss is numeric >= 0
        assert isinstance(j["projected_daily_tss"], (int, float))
        assert j["projected_daily_tss"] >= 0
        # forecast_fitness/form align with last forecast point
        assert abs(j["forecast_fitness"] - fc[-1]["ctl"]) < 0.01
        assert abs(j["forecast_form"] - fc[-1]["tsb"]) < 0.01

    def test_pmc_forecast_days_clamped(self, demo_headers):
        # forecast_days=0 -> empty forecast (still 200)
        r = requests.get(
            f"{BASE_URL}/api/analysis/pmc?days=30&forecast_days=0",
            headers=demo_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["forecast"] == []
        # forecast_days=999 -> clamped to <=28
        r = requests.get(
            f"{BASE_URL}/api/analysis/pmc?days=30&forecast_days=999",
            headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["forecast"]) <= 28


# =========================================================================
# 2) Weekly Digest
# =========================================================================
class TestWeeklyDigest:
    def test_digest_shape(self, demo_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/weekly-digest",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("week_start", "this_week", "deltas", "new_records", "has_activity"):
            assert k in j, f"missing key: {k}"
        for k in ("tss", "hours", "rides", "distance_km"):
            assert k in j["this_week"], f"this_week missing {k}"
            assert k in j["deltas"], f"deltas missing {k}"
        # types
        assert isinstance(j["this_week"]["rides"], int)
        assert isinstance(j["this_week"]["tss"], (int, float))
        assert isinstance(j["this_week"]["hours"], (int, float))
        assert isinstance(j["this_week"]["distance_km"], (int, float))
        assert isinstance(j["new_records"], list)
        assert isinstance(j["has_activity"], bool)
        # has_activity is consistent with rides
        assert j["has_activity"] == (j["this_week"]["rides"] > 0)

    def test_digest_greenlantern_no_activity_ok(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/analysis/weekly-digest",
                         headers=gl_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Doesn't crash; new_records may be empty; has_activity boolean.
        assert isinstance(j.get("new_records"), list)
        assert isinstance(j.get("has_activity"), bool)


# =========================================================================
# 3) Segment Compare — demo (matched GPS climbs)
# =========================================================================
class TestSegmentCompareMatched:
    def test_demo_col_de_test_matched(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/segment-compare?a={DEMO_A}&b={DEMO_B}",
            headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["matched"] is True, f"expected match, got: {j}"
        segs = j["segments"]
        assert isinstance(segs, list) and len(segs) >= 1
        seg = segs[0]
        # Shape
        for k in ("gain_m", "length_m", "grad_pct", "a", "b", "delta_s", "faster"):
            assert k in seg, f"seg missing {k}"
        assert seg["faster"] in ("a", "b", "tie")
        # Approx expected magnitudes for the Col de Test climb (~171m / ~2500m)
        assert 130 <= seg["gain_m"] <= 220, f"gain_m out of range: {seg['gain_m']}"
        assert 2000 <= seg["length_m"] <= 3200, f"length_m out of range: {seg['length_m']}"
        # A + B rides
        for side_key in ("a", "b"):
            side = seg[side_key]
            assert side["time_s"] is not None and side["time_s"] > 0
            series = side["series"]
            assert isinstance(series, list) and 40 <= len(series) <= 60, \
                f"{side_key} series len={len(series)}"
            # Series point shape
            p0 = series[0]
            for k in ("f", "d", "ele", "t"):
                assert k in p0, f"{side_key} pt missing {k}: {p0}"
            assert "speed" in p0  # may be None on first point
        # delta_s consistent with faster
        if seg["faster"] == "a":
            assert seg["delta_s"] > 0  # b took longer -> a faster
        elif seg["faster"] == "b":
            assert seg["delta_s"] < 0

    def test_segment_names_present(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/segment-compare?a={DEMO_A}&b={DEMO_B}",
            headers=demo_headers, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j.get("a_name"), j
        assert j.get("b_name"), j


# =========================================================================
# 4) Segment Compare — graceful no-match on greenlantern
# =========================================================================
class TestSegmentCompareNoMatch:
    def test_greenlantern_no_gps_graceful(self, gl_headers):
        # List green lantern activities and pick two if any exist.
        r = requests.get(f"{BASE_URL}/api/activities", headers=gl_headers, timeout=15)
        assert r.status_code == 200
        acts = (r.json() or {}).get("activities") or []
        if len(acts) < 2:
            pytest.skip("greenlantern has fewer than 2 activities to compare")
        a_id = acts[0].get("cycling_activity_id") or acts[0].get("id")
        b_id = acts[1].get("cycling_activity_id") or acts[1].get("id")
        r = requests.get(
            f"{BASE_URL}/api/analysis/segment-compare?a={a_id}&b={b_id}",
            headers=gl_headers, timeout=20)
        # MUST NOT 500
        assert r.status_code == 200, f"expected 200 (graceful), got {r.status_code}: {r.text}"
        j = r.json()
        assert j["matched"] is False
        assert j.get("reason") in ("no_gps", "no_shared_climb", "not_found"), \
            f"unexpected reason: {j.get('reason')}"
        assert j["segments"] == []

    def test_segment_compare_unknown_ids_graceful(self, demo_headers):
        r = requests.get(
            f"{BASE_URL}/api/analysis/segment-compare?a=nope-1&b=nope-2",
            headers=demo_headers, timeout=15)
        # Must not crash the server; expect matched:false / not_found
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["matched"] is False
        assert j.get("reason") in ("not_found", "no_gps", "no_shared_climb")
