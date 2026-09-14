"""Iteration 94 — GET /api/admin/feedback RBAC gate.

Verifies:
- HWG external admin console service token → 200 with {feedback:[...], count:N}
- Rider session token → 403
- Missing auth → 401
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
HWG_SERVICE_TOKEN = os.environ.get("HWG_SERVICE_TOKEN", "")
RIDER_EMAIL = "demo@roujaune.app"
RIDER_PASSWORD = "demo9900"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def rider_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"rider login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


class TestAdminFeedbackGate:
    def test_service_token_200(self, s):
        r = s.get(
            f"{BASE_URL}/api/admin/feedback",
            headers={"Authorization": f"Bearer {HWG_SERVICE_TOKEN}"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert "feedback" in body and isinstance(body["feedback"], list)
        assert "count" in body and isinstance(body["count"], int)
        assert body["count"] == len(body["feedback"])
        # If any rows present, they must not leak Mongo _id
        for row in body["feedback"][:5]:
            assert "_id" not in row, "MongoDB _id leaked in admin feedback response"

    def test_rider_token_403(self, s, rider_token):
        r = s.get(
            f"{BASE_URL}/api/admin/feedback",
            headers={"Authorization": f"Bearer {rider_token}"},
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_missing_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/feedback", timeout=20)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_bogus_token_401(self, s):
        r = s.get(
            f"{BASE_URL}/api/admin/feedback",
            headers={"Authorization": "Bearer bogus_not_a_real_token_xyz"},
            timeout=20,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
