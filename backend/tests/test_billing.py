"""Billing / in-app subscription entitlement tests.

Covers:
  - GET /api/billing/products (two products, yearly default, free-ride config)
  - GET /api/billing/status (fresh rider defaults)
  - POST /api/billing/consume-ride gating + idempotency (402 after limit)
  - POST /api/billing/validate rejection with IAP_DEV_TRUST=0
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://roujaune-train.preview.emergentagent.com").rstrip("/")
RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _reset_billing(auth_headers):
    """Reset greenlantern billing doc before + after this module runs."""
    # Reset via admin? No — the backend has no reset endpoint. We use the mongo
    # collection directly through a private helper: delete via API is not
    # available, so best-effort: rely on tests being idempotent within a run.
    # We record starting state so we can restore approximate expectations.
    yield
    # Best-effort cleanup: main agent's cleanup guidance is to delete the
    # billing doc after testing. We attempt via the Mongo driver.
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        mongo = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo and db_name:
            async def _clean():
                c = AsyncIOMotorClient(mongo)
                await c[db_name].billing.delete_many({"user_id": "user_greenlantern"})
                c.close()
            asyncio.get_event_loop().run_until_complete(_clean())
    except Exception as e:
        print(f"cleanup skipped: {e}")


# ---- products --------------------------------------------------------------
class TestProducts:
    def test_products_shape(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/billing/products", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["default_product"] == "premium_yearly"
        assert data["free_rides_limit"] == 3
        assert data["free_ride_minutes"] == 30
        products = data["products"]
        assert len(products) == 2
        pids = {p["id"]: p for p in products}
        assert "premium_monthly" in pids and "premium_yearly" in pids
        assert pids["premium_yearly"]["default"] is True
        assert pids["premium_monthly"]["default"] is False
        assert pids["premium_monthly"]["display_price"] == "$9.99"
        assert pids["premium_yearly"]["display_price"] == "$79.99"


# ---- status + consume-ride gating ------------------------------------------
class TestConsumeRideGating:
    def _reset(self, auth_headers):
        """Reset the rider's billing counter via direct Mongo (no admin endpoint)."""
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            import asyncio
            from dotenv import load_dotenv
            load_dotenv("/app/backend/.env")
            mongo = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            async def _do():
                c = AsyncIOMotorClient(mongo)
                await c[db_name].billing.delete_many({"user_id": "user_greenlantern"})
                c.close()
            asyncio.new_event_loop().run_until_complete(_do())
        except Exception as e:
            pytest.skip(f"could not reset billing: {e}")

    def test_full_gating_flow(self, auth_headers):
        # Fresh reset first
        self._reset(auth_headers)

        # 1) fresh status
        r = requests.get(f"{BASE_URL}/api/billing/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["premium"] is False
        assert s["free_rides_used"] == 0
        assert s["free_rides_limit"] == 3
        assert s["free_ride_minutes"] == 30
        assert s["can_start_ride"] is True

        # 2) consume 3 distinct rides
        for i in range(3):
            r = requests.post(f"{BASE_URL}/api/billing/consume-ride",
                              headers=auth_headers, json={"ride_key": f"ride-{i}"}, timeout=15)
            assert r.status_code == 200, r.text
            s = r.json()
            assert s["free_rides_used"] == i + 1

        # 3) after 3, can_start_ride should be False
        assert s["can_start_ride"] is False
        assert s["free_rides_remaining"] == 0

        # 4) idempotency: repeat ride-1, should NOT increment
        r = requests.post(f"{BASE_URL}/api/billing/consume-ride",
                          headers=auth_headers, json={"ride_key": "ride-1"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["free_rides_used"] == 3

        # 5) 4th distinct ride key → 402
        r = requests.post(f"{BASE_URL}/api/billing/consume-ride",
                          headers=auth_headers, json={"ride_key": "ride-4"}, timeout=15)
        assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text}"

        # cleanup
        self._reset(auth_headers)


# ---- validate rejection ----------------------------------------------------
class TestValidateRejects:
    def test_bogus_receipt_rejected(self, auth_headers):
        # IAP_DEV_TRUST=0 (default) — bogus iOS receipt should be rejected.
        assert os.environ.get("IAP_DEV_TRUST", "0") in ("0", "", "false", "no")
        body = {"platform": "ios", "product_id": "premium_yearly",
                "transaction_receipt": "BOGUS_RECEIPT_" + uuid.uuid4().hex}
        r = requests.post(f"{BASE_URL}/api/billing/validate",
                          headers=auth_headers, json=body, timeout=20)
        assert r.status_code == 400
        assert "verified" in r.text.lower()

        # Also verify: rider is NOT premium after the failed validate.
        r = requests.get(f"{BASE_URL}/api/billing/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["premium"] is False


# ---- auth guard ------------------------------------------------------------
class TestAuthGuard:
    def test_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/billing/status", timeout=15)
        assert r.status_code == 401
