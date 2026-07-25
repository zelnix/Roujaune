"""
Backend tests for soft email verification + forgot/reset password flows.

Notes:
- In PREVIEW the Emergent email key is invalid, so actual email SENDS return 401
  at the integration proxy, which causes /resend-verification to return 502.
  This is EXPECTED. We validate token/flag paths via direct Mongo reads instead.
"""
import os
import time
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

DEMO_EMAIL = "greenlantern@roujaune.app"
DEMO_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def temp_user_email():
    # Backend lowercases on insert; keep test values lowercase for consistent Mongo lookups.
    return f"test_verify_{uuid.uuid4().hex[:8]}@resend.dev"


@pytest.fixture(scope="module")
def registered_user(api, temp_user_email, db):
    """Register a fresh password user and yield {email, password, token, user}.
    Cleanup: delete user + sessions at end of module.
    """
    payload = {"email": temp_user_email, "password": "testpass123", "name": "TEST Verify"}
    r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    yield {"email": temp_user_email, "password": "testpass123", **data}

    # Cleanup
    u = db.users.find_one({"email": temp_user_email})
    if u:
        db.user_sessions.delete_many({"user_id": u["user_id"]})
        db.users.delete_one({"user_id": u["user_id"]})


# ---------- Registration + /me email_verified flag ---------------------------

class TestRegisterAndMe:
    def test_register_returns_token_and_unverified_user(self, registered_user):
        assert "token" in registered_user and registered_user["token"]
        user = registered_user["user"]
        assert user["email"] == registered_user["email"]
        assert user["provider"] == "password"
        assert user["email_verified"] is False, "fresh password user must be unverified"

    def test_me_reports_email_verified_false_for_new_user(self, api, registered_user):
        r = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {registered_user['token']}"},
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email_verified"] is False
        assert u["provider"] == "password"

    def test_me_reports_email_verified_true_for_demo(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        u = me.json()["user"]
        assert u["email_verified"] is True
        assert u["assigned_plan_id"] == "couch-to-road"

    def test_register_writes_verify_token_to_db(self, db, registered_user):
        # register attempted best-effort email send; regardless, verify_token
        # should be set on the user doc.
        u = db.users.find_one({"email": registered_user["email"]})
        assert u is not None
        assert u.get("verify_token"), "verify_token should be persisted after registration"


# ---------- /verify-email HTML page --------------------------------------------

class TestVerifyEmail:
    def test_verify_email_bad_token_returns_html_error(self):
        r = requests.get(f"{BASE_URL}/api/auth/verify-email?token=badtoken_xxx")
        assert r.status_code == 200  # HTML page rendered, not 500
        assert "text/html" in r.headers.get("content-type", "")
        assert "Link expired" in r.text or "Invalid link" in r.text

    def test_verify_email_missing_token_returns_html_error(self):
        r = requests.get(f"{BASE_URL}/api/auth/verify-email")
        assert r.status_code == 200
        assert "Invalid link" in r.text

    def test_verify_email_valid_token_sets_email_verified(self, db, registered_user):
        # Read the verify_token straight from mongo
        u = db.users.find_one({"email": registered_user["email"]})
        token = u.get("verify_token")
        assert token, "verify_token missing on registered user"

        r = requests.get(f"{BASE_URL}/api/auth/verify-email?token={token}")
        assert r.status_code == 200
        assert "Email verified" in r.text

        # DB should now show email_verified=True and verify_token cleared
        u2 = db.users.find_one({"email": registered_user["email"]})
        assert u2.get("email_verified") is True
        assert "verify_token" not in u2 or not u2.get("verify_token")


# ---------- /resend-verification ----------------------------------------------

class TestResendVerification:
    def test_resend_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/auth/resend-verification")
        assert r.status_code == 401

    def test_resend_for_already_verified_returns_ok(self, api):
        # login as demo (already verified) and hit resend
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        )
        token = r.json()["token"]
        rr = api.post(
            f"{BASE_URL}/api/auth/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert rr.status_code == 200
        data = rr.json()
        assert data.get("ok") is True
        assert data.get("already_verified") is True

    def test_resend_for_unverified_502_is_expected_in_preview(self, api, db, temp_user_email):
        # Re-register a NEW temp user (previous one was verified in earlier test).
        email = f"test_resend_{uuid.uuid4().hex[:8]}@resend.dev"
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "testpass123"},
        )
        assert r.status_code == 200
        token = r.json()["token"]
        rr = api.post(
            f"{BASE_URL}/api/auth/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        # 502 expected in preview (email key not injected); 200 also acceptable.
        assert rr.status_code in (200, 502), rr.text
        # Regardless of send outcome, DB should have (updated) verify_token
        u = db.users.find_one({"email": email})
        assert u and u.get("verify_token")
        # cleanup
        db.user_sessions.delete_many({"user_id": u["user_id"]})
        db.users.delete_one({"user_id": u["user_id"]})


# ---------- /forgot-password + /reset-password --------------------------------

class TestForgotAndReset:
    @pytest.fixture(scope="class")
    def reset_user(self, api, db):
        email = f"test_reset_{uuid.uuid4().hex[:8]}@resend.dev"
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "oldpass123"},
        )
        assert r.status_code == 200
        yield {"email": email, "old_password": "oldpass123"}
        u = db.users.find_one({"email": email})
        if u:
            db.user_sessions.delete_many({"user_id": u["user_id"]})
            db.users.delete_one({"user_id": u["user_id"]})

    def test_forgot_password_unknown_email_returns_ok(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": f"nonexistent_{uuid.uuid4().hex[:6]}@example.com"},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_password_existing_writes_reset_token(self, api, db, reset_user):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": reset_user["email"]},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
        u = db.users.find_one({"email": reset_user["email"]})
        assert u.get("reset_token"), "reset_token should be set on user doc"
        assert u.get("reset_expires"), "reset_expires should be set"

    def test_reset_password_page_returns_html_form(self, db, reset_user):
        u = db.users.find_one({"email": reset_user["email"]})
        token = u["reset_token"]
        r = requests.get(f"{BASE_URL}/api/auth/reset-password?token={token}")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Choose a new password" in r.text or "Reset password" in r.text
        assert token in r.text  # token embedded in the page's JS

    def test_reset_rejects_short_password(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "whatever", "password": "abc"},
        )
        assert r.status_code == 400
        assert "6 characters" in r.json().get("detail", "")

    def test_reset_rejects_invalid_token(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "not_a_real_token_xxxxxx", "password": "newpass123"},
        )
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower()

    def test_reset_password_success_and_login_with_new_password(self, api, db, reset_user):
        # fetch current reset token
        u = db.users.find_one({"email": reset_user["email"]})
        token = u["reset_token"]
        new_pw = "brandNewPass456"

        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": token, "password": new_pw},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Old password must fail now
        r_old = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": reset_user["email"], "password": reset_user["old_password"]},
        )
        assert r_old.status_code == 401

        # New password must succeed
        r_new = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": reset_user["email"], "password": new_pw},
        )
        assert r_new.status_code == 200
        assert r_new.json().get("token")

        # reset_token should be cleared
        u2 = db.users.find_one({"email": reset_user["email"]})
        assert not u2.get("reset_token")
