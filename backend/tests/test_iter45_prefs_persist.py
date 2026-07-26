"""Iteration 45 - EVERY rider preference persists server-side.
Covers:
  1. Extended rider settings (units + notification toggles + user-scoping).
  2. NEW generic KV store (/api/rider/kv) with invalid-key rejection.
  3. Regression on /api/rider/settings equipment keys + /api/rider/prefs coach fields.
Uses the seeded Green Lantern demo account.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def gl_headers():
    tok = _login(GL_EMAIL, GL_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tmp_headers():
    """Ephemeral fresh account to prove user-scoping. Deleted at teardown."""
    email = f"tmp_iter45_{uuid.uuid4().hex[:10]}@roujaune.app"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "pw_iter45!", "name": "iter45"},
                      timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    hdr = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    yield hdr
    try:
        requests.delete(f"{BASE_URL}/api/account", headers=hdr, timeout=15)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 1. Extended rider settings (new units + notification keys)
# ---------------------------------------------------------------------------
class TestRiderSettingsExtended:
    def test_put_and_get_new_keys_persist(self, gl_headers):
        patch = {"units": "imperial", "coachAudio": False, "autoSync": False,
                 "weeklyReport": False, "restReminders": True}
        put = requests.put(f"{BASE_URL}/api/rider/settings",
                           json=patch, headers=gl_headers, timeout=15)
        assert put.status_code == 200, put.text
        got = put.json()
        for k, v in patch.items():
            assert got.get(k) == v, f"PUT response missing {k}: {got}"

        get = requests.get(f"{BASE_URL}/api/rider/settings",
                           headers=gl_headers, timeout=15)
        assert get.status_code == 200
        gj = get.json()
        for k, v in patch.items():
            assert gj.get(k) == v, f"GET did not reflect {k}={v}: {gj}"

    def test_user_scoped_new_keys(self, tmp_headers):
        # Fresh account must NOT see GL's imperial+notification values.
        r = requests.get(f"{BASE_URL}/api/rider/settings",
                         headers=tmp_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # empty dict OR defaults, but must NOT contain 'imperial' from GL
        assert d.get("units", "metric") != "imperial", f"leak from GL: {d}"
        assert d.get("restReminders", False) is not True, f"leak from GL: {d}"

    def test_restore_defaults(self, gl_headers):
        patch = {"units": "metric", "coachAudio": True, "autoSync": True,
                 "weeklyReport": True, "restReminders": False}
        put = requests.put(f"{BASE_URL}/api/rider/settings",
                           json=patch, headers=gl_headers, timeout=15)
        assert put.status_code == 200
        got = requests.get(f"{BASE_URL}/api/rider/settings",
                           headers=gl_headers, timeout=15).json()
        for k, v in patch.items():
            assert got.get(k) == v, f"restore did not apply {k}={v}: {got}"


# ---------------------------------------------------------------------------
# 2. Generic KV store
# ---------------------------------------------------------------------------
class TestRiderKV:
    KEY = "roujaune:voiceId:alberto"

    def test_kv_set_get_remove(self, gl_headers):
        # Ensure empty starting state (best-effort clear).
        requests.put(f"{BASE_URL}/api/rider/kv",
                     json={"key": self.KEY, "value": None},
                     headers=gl_headers, timeout=15)

        # Set
        r = requests.put(f"{BASE_URL}/api/rider/kv",
                         json={"key": self.KEY, "value": "onyx"},
                         headers=gl_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        g = requests.get(f"{BASE_URL}/api/rider/kv",
                        headers=gl_headers, timeout=15)
        assert g.status_code == 200
        d = g.json()
        assert d.get(self.KEY) == "onyx", f"KV get missing key: {d}"

        # Remove (value=None)
        r2 = requests.put(f"{BASE_URL}/api/rider/kv",
                          json={"key": self.KEY, "value": None},
                          headers=gl_headers, timeout=15)
        assert r2.status_code == 200
        d2 = requests.get(f"{BASE_URL}/api/rider/kv",
                          headers=gl_headers, timeout=15).json()
        assert self.KEY not in d2, f"KV should be removed but present: {d2}"

    def test_invalid_key_with_dot_rejected(self, gl_headers):
        r = requests.put(f"{BASE_URL}/api/rider/kv",
                         json={"key": "bad.key", "value": "x"},
                         headers=gl_headers, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_empty_key_rejected(self, gl_headers):
        r = requests.put(f"{BASE_URL}/api/rider/kv",
                         json={"key": "", "value": "x"},
                         headers=gl_headers, timeout=15)
        assert r.status_code == 400, r.text

    def test_kv_user_scoped(self, gl_headers, tmp_headers):
        # Set on GL
        requests.put(f"{BASE_URL}/api/rider/kv",
                     json={"key": "roujaune:test:scope45", "value": "gl-val"},
                     headers=gl_headers, timeout=15)
        # tmp account should NOT see it
        d = requests.get(f"{BASE_URL}/api/rider/kv",
                         headers=tmp_headers, timeout=15).json()
        assert "roujaune:test:scope45" not in d, f"KV leaked to tmp: {d}"
        # cleanup
        requests.put(f"{BASE_URL}/api/rider/kv",
                     json={"key": "roujaune:test:scope45", "value": None},
                     headers=gl_headers, timeout=15)


# ---------------------------------------------------------------------------
# 3. Regression: equipment settings + coach prefs still work
# ---------------------------------------------------------------------------
class TestRegression:
    def test_equipment_keys_still_work(self, gl_headers):
        get0 = requests.get(f"{BASE_URL}/api/rider/settings",
                            headers=gl_headers, timeout=15).json()
        orig_trainer = bool(get0.get("hasTrainer", False))

        patch = {"hasTrainer": not orig_trainer}
        p = requests.put(f"{BASE_URL}/api/rider/settings",
                        json=patch, headers=gl_headers, timeout=15)
        assert p.status_code == 200
        assert p.json().get("hasTrainer") == (not orig_trainer)

        g = requests.get(f"{BASE_URL}/api/rider/settings",
                        headers=gl_headers, timeout=15).json()
        assert g.get("hasTrainer") == (not orig_trainer)

        # Restore original
        requests.put(f"{BASE_URL}/api/rider/settings",
                     json={"hasTrainer": orig_trainer}, headers=gl_headers, timeout=15)

    def test_rider_prefs_still_returns_coach_fields(self, gl_headers):
        r = requests.get(f"{BASE_URL}/api/rider/prefs",
                         headers=gl_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("coach_id", "coach_style", "voice_guidance", "speech_rate"):
            assert k in d, f"prefs missing {k}: {d}"
        assert d["coach_id"] == "alberto"
