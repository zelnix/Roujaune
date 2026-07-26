"""Iteration 43 backend tests — PHASE 2 Training Plan deep-dives:
1. GET /api/plan phases each carry non-empty `objective`; phase 1 active.
2. NEW POST /api/coach/adaptation/detail — cache + refresh behaviour, shape,
   groundedness, and graceful handling when coach_gender omitted.
3. rider_appearance is user-scoped (GET/PUT/GET, plus cross-user isolation).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"
PLAN_ID = "couch-to-road"
EXPECTED_PHASE_NAMES = ["Get Moving", "Build the Foundation", "Extend Your Endurance", "Road Ready"]


@pytest.fixture(scope="module")
def gl_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": GL_EMAIL, "password": GL_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def gl_headers(gl_token):
    return {"Authorization": f"Bearer {gl_token}", "Content-Type": "application/json"}


# --- 1) Plan phases carry objective ------------------------------------

class TestPlanPhaseObjectives:
    def test_plan_ok(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_four_phases_with_expected_names(self, gl_headers):
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        phases = p.get("phases") or []
        assert len(phases) == 4, phases
        names = [ph.get("name") for ph in phases]
        assert names == EXPECTED_PHASE_NAMES, names

    def test_every_phase_has_non_empty_objective(self, gl_headers):
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        for ph in p["phases"]:
            obj = ph.get("objective")
            assert isinstance(obj, str) and obj.strip(), f"phase {ph.get('name')} missing objective: {ph}"

    def test_phase_1_active(self, gl_headers):
        p = requests.get(f"{BASE_URL}/api/plan", headers=gl_headers, timeout=30).json()
        phases = p["phases"]
        p1 = phases[0]
        assert p1["number"] == 1, p1
        assert p1["active"] is True, p1
        # Other phases must not be active
        for ph in phases[1:]:
            assert ph.get("active") is False, ph


# --- 2) Adaptation detail endpoint --------------------------------------

class TestAdaptationDetail:
    """POST /api/coach/adaptation/detail — refresh regenerates, cache returns
    identical detail, coach_gender omission is handled."""

    def _post(self, headers, refresh, coach_gender="male"):
        body = {
            "plan_id": PLAN_ID,
            "coach_name": "Alberto",
            "refresh": refresh,
        }
        if coach_gender is not None:
            body["coach_gender"] = coach_gender
        return requests.post(f"{BASE_URL}/api/coach/adaptation/detail",
                             headers=headers, json=body, timeout=60)

    def test_refresh_true_generates(self, gl_headers):
        r = self._post(gl_headers, refresh=True)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cached") is False, body
        detail = body.get("detail")
        assert isinstance(detail, dict), body
        # shape
        assert isinstance(detail.get("summary"), str) and detail["summary"].strip()
        factors = detail.get("factors")
        assert isinstance(factors, list) and 3 <= len(factors) <= 4, factors
        for f in factors:
            assert isinstance(f, dict), f
            assert f.get("label", "").strip(), f
            assert f.get("detail", "").strip(), f
        adjs = detail.get("adjustments")
        assert isinstance(adjs, list) and 2 <= len(adjs) <= 3, adjs
        for a in adjs:
            assert isinstance(a, str) and a.strip(), a
        # stash for cache test
        pytest._iter43_first_detail = detail

    def test_no_refresh_returns_cached_identical(self, gl_headers):
        r = self._post(gl_headers, refresh=False)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cached") is True, body
        assert body["detail"] == getattr(pytest, "_iter43_first_detail", None), (
            "cached detail differs from freshly generated one")

    def test_refresh_true_regenerates(self, gl_headers):
        r = self._post(gl_headers, refresh=True)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cached") is False, body
        # NOTE: content may or may not literally match previous — just assert shape.
        detail = body["detail"]
        assert detail.get("summary", "").strip()
        assert 3 <= len(detail.get("factors") or []) <= 4
        assert 2 <= len(detail.get("adjustments") or []) <= 3

    def test_groundedness_mentions_plan_or_phase_or_goals(self, gl_headers):
        """Refresh once more and confirm the reasoning references the plan,
        phase, or goals — i.e. is grounded, not generic filler."""
        r = self._post(gl_headers, refresh=True)
        assert r.status_code == 200, r.text
        detail = r.json()["detail"]
        blob = " ".join([
            detail.get("summary", ""),
            *[f.get("detail", "") for f in detail.get("factors", [])],
            *[f.get("label", "") for f in detail.get("factors", [])],
            *detail.get("adjustments", []),
        ]).lower()
        hooks = ["couch", "road", "get moving", "week", "phase", "goal", "zone",
                 "endurance", "foundation", "beginner", "ride", "training"]
        assert any(h in blob for h in hooks), f"detail seems ungrounded: {blob[:400]}"

    def test_coach_gender_omitted_ok(self, gl_headers):
        r = self._post(gl_headers, refresh=True, coach_gender=None)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cached") is False
        detail = body["detail"]
        assert detail.get("summary", "").strip()


# --- 3) rider_appearance user-scoped ------------------------------------

class TestRiderAppearanceUserScoped:
    """GET/PUT /api/rider/appearance is user-scoped: doc carries user_id,
    another user cannot see this user's mutations, restore afterwards."""

    def test_get_appearance_has_user_id(self, gl_token, gl_headers):
        # Determine the user_id via /api/auth/me (accept several possible keys)
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=gl_headers, timeout=30)
        assert me.status_code == 200, me.text
        me_body = me.json() or {}
        # user field variants: user_id / id / user.id / user.user_id
        uid = (me_body.get("user_id")
               or me_body.get("id")
               or (me_body.get("user") or {}).get("user_id")
               or (me_body.get("user") or {}).get("id"))
        r = requests.get(f"{BASE_URL}/api/rider/appearance", headers=gl_headers, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert isinstance(doc.get("user_id"), str) and doc["user_id"], (
            f"appearance doc missing user_id (should be present because rider_appearance is USER_SCOPED): {doc}")
        # If we could resolve uid from /me, cross-check equality; otherwise just
        # trust the doc has a stable user_id (which is enough to confirm scoping
        # given the isolation test below).
        if uid:
            assert doc.get("user_id") == uid, (doc, uid)
        # remember to restore
        pytest._iter43_original_appearance = doc

    def test_put_updates_field(self, gl_headers):
        """AppearanceUpdate exposes riderType/bikeType/clothingStyle (skin_tone
        was only an illustrative field name in the review). We set bikeType to
        a distinctive test-only value so the isolation check is unambiguous."""
        pytest._iter43_test_key = "bikeType"
        pytest._iter43_test_value = "tt"  # not the default 'road'
        r = requests.put(f"{BASE_URL}/api/rider/appearance", headers=gl_headers,
                         json={"bikeType": "tt"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("bikeType") == "tt"

    def test_get_reflects_update(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/rider/appearance", headers=gl_headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get(pytest._iter43_test_key) == pytest._iter43_test_value

    def test_user_scoped_isolation(self, gl_headers):
        """A fresh temp user must NOT see Green Lantern's appearance mutation."""
        tmp_email = f"tmp_iter43_{uuid.uuid4().hex[:8]}@roujaune.app"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": tmp_email, "password": "TempPass123!",
                                  "name": "Iter43 Tmp"}, timeout=30)
        assert reg.status_code == 200, reg.text
        tok = reg.json()["token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=30).json()
        tmp_uid = me.get("user_id") or me.get("id")
        # Their appearance doc should be a fresh default, with THEIR user_id
        d = requests.get(f"{BASE_URL}/api/rider/appearance", headers=h, timeout=30).json()
        assert d.get("user_id") == tmp_uid, d
        # crucially, the tuned field must NOT equal GL's just-set value (defaults)
        assert d.get(pytest._iter43_test_key) != pytest._iter43_test_value, d
        # cleanup temp user
        try:
            requests.delete(f"{BASE_URL}/api/account", headers=h, timeout=30)
        except Exception:
            pass

    def test_zzz_restore_appearance(self, gl_headers):
        """Restore Green Lantern's appearance to the shipped defaults so the
        environment stays pristine (bikeType='road' etc.)."""
        # Force default 'road' regardless of any previous run pollution.
        r = requests.put(f"{BASE_URL}/api/rider/appearance", headers=gl_headers,
                         json={"bikeType": "road", "riderType": "younger_male",
                               "clothingStyle": "get_fit"}, timeout=30)
        assert r.status_code == 200, r.text
        d = requests.get(f"{BASE_URL}/api/rider/appearance", headers=gl_headers, timeout=30).json()
        assert d.get("bikeType") == "road", d
