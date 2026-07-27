"""Iteration 59 backend tests:
- Avatar persistence via PUT/GET /api/rider/profile
- DELETE /api/rider/account (GDPR cascade) using a throwaway rider
- Auth guard on DELETE /api/rider/account
- Regression: PUT /api/rider/profile still updates other fields
"""
import os
import uuid
import time
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://roujaune-train.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

GL_EMAIL = "greenlantern@roujaune.app"
GL_PASSWORD = "rideon9900"

# tiny valid PNG (1x1 transparent) as data URI
_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SAMPLE_AVATAR_DATA_URI = "data:image/png;base64," + base64.b64encode(_PNG_BYTES).decode()


@pytest.fixture(scope="module")
def gl_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": GL_EMAIL, "password": GL_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"greenlantern login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Avatar round-trip ----------------
class TestAvatarRoundTrip:
    def test_put_profile_persists_avatar(self, gl_headers):
        # Snapshot current profile
        r0 = requests.get(f"{BASE_URL}/api/rider/profile", headers=gl_headers, timeout=15)
        assert r0.status_code == 200, r0.text
        original = r0.json()

        # PUT avatar
        r = requests.put(
            f"{BASE_URL}/api/rider/profile",
            headers=gl_headers,
            json={"avatar": SAMPLE_AVATAR_DATA_URI},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("avatar") == SAMPLE_AVATAR_DATA_URI

        # GET verifies persistence
        r2 = requests.get(f"{BASE_URL}/api/rider/profile", headers=gl_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("avatar") == SAMPLE_AVATAR_DATA_URI

        # Cleanup: restore original avatar (or clear via empty string if absent)
        restore_val = original.get("avatar") or ""
        requests.put(
            f"{BASE_URL}/api/rider/profile",
            headers=gl_headers,
            json={"avatar": restore_val},
            timeout=15,
        )


# ---------------- Regression: field updates still work ----------------
class TestProfileFieldsRegression:
    def test_put_profile_updates_fields(self, gl_headers):
        r0 = requests.get(f"{BASE_URL}/api/rider/profile", headers=gl_headers, timeout=15)
        assert r0.status_code == 200
        original = r0.json()

        payload = {
            "name": "TEST_Greenlantern",
            "weight_kg": 77.5,
            "age": 43,
            "gender": "male",
            "capability": "intermediate",
            "city": "TEST_Perth",
            "region": "WA",
            "country": "AU",
        }
        r = requests.put(f"{BASE_URL}/api/rider/profile", headers=gl_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for k, v in payload.items():
            assert body.get(k) == v, f"field {k}: expected {v}, got {body.get(k)}"

        # GET reflects
        r2 = requests.get(f"{BASE_URL}/api/rider/profile", headers=gl_headers, timeout=15)
        got = r2.json()
        for k, v in payload.items():
            assert got.get(k) == v

        # Cleanup: restore prior values
        restore = {k: original.get(k) for k in payload.keys() if original.get(k) is not None}
        if restore:
            requests.put(f"{BASE_URL}/api/rider/profile", headers=gl_headers, json=restore, timeout=15)


# ---------------- DELETE /api/rider/account requires auth ----------------
class TestDeleteAccountAuthGuard:
    def test_delete_without_bearer_returns_401(self):
        r = requests.delete(f"{BASE_URL}/api/rider/account", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_delete_with_invalid_bearer_returns_401(self):
        r = requests.delete(
            f"{BASE_URL}/api/rider/account",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code == 401


# ---------------- DELETE /api/rider/account GDPR cascade (throwaway rider) ----------------
class TestDeleteAccountCascade:
    def test_throwaway_register_delete_cascade(self):
        email = f"test-del-{uuid.uuid4().hex[:8]}@roujaune-tests.app"
        password = "throwaway9900"
        # Register
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": password, "name": "TEST Throwaway"},
            timeout=20,
        )
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        data = r.json()
        token = data["token"]
        uid = data["user"]["user_id"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Seed some user-scoped data so cascade has content to remove
        requests.put(
            f"{BASE_URL}/api/rider/profile",
            headers=headers,
            json={"name": "TEST Throwaway", "weight_kg": 70.0, "age": 30, "gender": "male", "capability": "beginner"},
            timeout=15,
        )
        r_prof = requests.get(f"{BASE_URL}/api/rider/profile", headers=headers, timeout=15)
        assert r_prof.status_code == 200

        # DELETE account
        r_del = requests.delete(f"{BASE_URL}/api/rider/account", headers=headers, timeout=30)
        assert r_del.status_code == 200, f"delete failed: {r_del.status_code} {r_del.text}"
        body = r_del.json()
        assert body.get("ok") is True
        assert body.get("user_id") == uid
        deleted = body.get("deleted") or {}
        # users doc and user_sessions must be removed
        assert deleted.get("users", 0) >= 1, f"users not deleted: {deleted}"
        assert "user_sessions" in deleted

        # Old token now invalid
        time.sleep(0.5)
        r_after = requests.get(f"{BASE_URL}/api/rider/profile", headers=headers, timeout=15)
        assert r_after.status_code == 401, f"expected 401 after delete, got {r_after.status_code} {r_after.text}"

        # Login attempt fails
        r_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=15,
        )
        assert r_login.status_code == 401, f"expected 401 on login after delete, got {r_login.status_code} {r_login.text}"
