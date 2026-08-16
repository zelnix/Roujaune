"""In-app subscription entitlement + free-ride gating.

Monetisation model (Apple App Store / Google Play only — no web card processor):
  - Free tier: FREE_RIDE_LIMIT rides total, each capped at FREE_RIDE_MINUTES.
  - Premium: single auto-renewing subscription (monthly / yearly, yearly default)
    that unlocks everything (unlimited rides, full length, all features).

The BACKEND is the source of truth for entitlement. The app only caches it.
Store purchases are verified server-side (`/api/billing/validate`) against Apple
(verifyReceipt, sandbox fallback) and Google Play (subscriptionsv2). Real
verification needs store credentials (set at deploy); until then a purchase can
be dev-trusted only when IAP_DEV_TRUST is truthy (default OFF).

`react-native-iap` is native-only, so the whole purchase path runs on a device
build; the free-ride gating below is fully enforceable regardless of platform.
"""
from __future__ import annotations

import datetime
import math
import os
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import auth
from auth import udb

router = APIRouter(prefix="/billing", tags=["billing"])

FREE_RIDE_LIMIT = 3
FREE_RIDE_MINUTES = 30
EXPIRY_REMINDER_DAYS = 4   # nudge a non-renewing (gifted/granted) rider this many days before expiry
PRODUCTS = {
    "premium_monthly": {"period": "monthly", "display_price": "$9.99", "label": "Monthly"},
    "premium_yearly": {"period": "yearly", "display_price": "$79.99", "label": "Yearly"},
}
DEFAULT_PRODUCT = "premium_yearly"


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _parse_dt(v) -> Optional[datetime.datetime]:
    if isinstance(v, datetime.datetime):
        return v if v.tzinfo else v.replace(tzinfo=datetime.timezone.utc)
    if isinstance(v, str):
        try:
            return datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


async def _doc() -> dict:
    return await udb.billing.find_one({}, {"_id": 0}) or {}


def _is_premium(doc: dict) -> bool:
    exp = _parse_dt(doc.get("premium_until"))
    return bool(exp and exp > _now())


def _status_payload(doc: dict) -> dict:
    premium = _is_premium(doc)
    used = int(doc.get("free_rides_used", 0) or 0)
    exp = _parse_dt(doc.get("premium_until"))
    source = doc.get("source")
    days_left: Optional[int] = None
    expiring_soon = False
    if premium and exp:
        days_left = max(0, math.ceil((exp - _now()).total_seconds() / 86400))
        # Only nudge for admin-granted/gifted access (store subs auto-renew).
        non_renewing = isinstance(source, str) and source.startswith("admin_")
        expiring_soon = non_renewing and days_left <= EXPIRY_REMINDER_DAYS
    return {
        "premium": premium,
        "plan": doc.get("plan") if premium else None,
        "product_id": doc.get("product_id") if premium else None,
        "expires_at": exp.isoformat() if exp else None,
        "source": source if premium else None,
        "days_left": days_left,
        "expiring_soon": expiring_soon,
        "free_rides_used": used,
        "free_rides_limit": FREE_RIDE_LIMIT,
        "free_rides_remaining": max(0, FREE_RIDE_LIMIT - used),
        "free_ride_minutes": FREE_RIDE_MINUTES,
        "can_start_ride": premium or used < FREE_RIDE_LIMIT,
    }


@router.get("/products")
async def products():
    """Product catalog + display fallbacks (store prices override on device)."""
    return {
        "products": [
            {"id": pid, **meta, "default": pid == DEFAULT_PRODUCT}
            for pid, meta in PRODUCTS.items()
        ],
        "default_product": DEFAULT_PRODUCT,
        "free_rides_limit": FREE_RIDE_LIMIT,
        "free_ride_minutes": FREE_RIDE_MINUTES,
    }


@router.get("/status")
async def status():
    """Current rider entitlement + free-ride allowance. Source of truth."""
    return _status_payload(await _doc())


class ConsumeIn(BaseModel):
    ride_key: Optional[str] = None   # dedupe key so a remount can't double-count


@router.post("/consume-ride")
async def consume_ride(body: ConsumeIn):
    """Record the start of a free ride. Premium riders are a no-op. Idempotent
    per ride_key so re-mounting the ride screen never double-counts. Returns the
    updated status (with can_start_ride)."""
    doc = await _doc()
    if _is_premium(doc):
        return _status_payload(doc)

    consumed = set(doc.get("consumed_keys") or [])
    if body.ride_key and body.ride_key in consumed:
        return _status_payload(doc)  # already counted this ride

    used = int(doc.get("free_rides_used", 0) or 0)
    if used >= FREE_RIDE_LIMIT:
        # Out of free rides — the app should have shown the paywall already.
        raise HTTPException(status_code=402, detail="Free ride limit reached")

    update = {"$inc": {"free_rides_used": 1}, "$set": {"updated_at": _now().isoformat()}}
    if body.ride_key:
        update["$addToSet"] = {"consumed_keys": body.ride_key}
    await udb.billing.update_one({}, update, upsert=True)
    return _status_payload(await _doc())


# --------------------------------------------------------------------------- #
#  Purchase validation (native-only path; verified server-side)              #
# --------------------------------------------------------------------------- #
class ValidateIn(BaseModel):
    platform: Literal["ios", "android"]
    product_id: str
    transaction_receipt: Optional[str] = None      # iOS
    purchase_token: Optional[str] = None           # Android
    package_name: Optional[str] = None             # Android


def _dev_trust() -> bool:
    return os.environ.get("IAP_DEV_TRUST", "0").strip() in ("1", "true", "yes")


async def _apple_verify(receipt: str) -> Optional[datetime.datetime]:
    """Return the latest expiry for our products, or None if invalid/inactive."""
    secret = os.environ.get("APPLE_SHARED_SECRET", "")
    if not secret:
        return None
    import httpx
    payload = {"receipt-data": receipt, "password": secret, "exclude-old-transactions": False}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://buy.itunes.apple.com/verifyReceipt", json=payload)
        data = r.json()
        if data.get("status") == 21007:  # sandbox receipt sent to prod
            r = await c.post("https://sandbox.itunes.apple.com/verifyReceipt", json=payload)
            data = r.json()
    if data.get("status") != 0:
        return None
    rows = [x for x in (data.get("latest_receipt_info") or []) if x.get("product_id") in PRODUCTS]
    if not rows:
        return None
    latest = max(rows, key=lambda x: int(x.get("expires_date_ms", "0")))
    return datetime.datetime.fromtimestamp(int(latest["expires_date_ms"]) / 1000, datetime.timezone.utc)


async def _google_verify(package: str, product_id: str, token: str) -> Optional[datetime.datetime]:
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not creds_path or not os.path.exists(creds_path):
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except Exception:
        return None
    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=["https://www.googleapis.com/auth/androidpublisher"])
    client = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    raw = client.purchases().subscriptionsv2().get(packageName=package, token=token).execute()
    if raw.get("subscriptionState") != "SUBSCRIPTION_STATE_ACTIVE":
        return None
    item = (raw.get("lineItems") or [{}])[0]
    return _parse_dt(item.get("expiryTime"))


@router.post("/validate")
async def validate(body: ValidateIn):
    """Verify a store purchase and grant Premium. Native-only path."""
    if body.product_id not in PRODUCTS:
        raise HTTPException(status_code=400, detail="Unknown product")

    expiry: Optional[datetime.datetime] = None
    try:
        if body.platform == "ios":
            if not body.transaction_receipt:
                raise HTTPException(status_code=400, detail="Missing receipt")
            expiry = await _apple_verify(body.transaction_receipt)
        else:
            package = body.package_name or os.environ.get("ANDROID_PACKAGE_NAME", "")
            if not body.purchase_token or not package:
                raise HTTPException(status_code=400, detail="Missing purchase token / package")
            expiry = await _google_verify(package, body.product_id, body.purchase_token)
    except HTTPException:
        raise
    except Exception:
        expiry = None

    # Dev/sandbox fallback: when store credentials aren't configured yet, allow
    # a trusted grant so the end-to-end flow can be exercised on a dev build.
    if expiry is None and _dev_trust():
        days = 365 if PRODUCTS[body.product_id]["period"] == "yearly" else 31
        expiry = _now() + datetime.timedelta(days=days)

    if expiry is None or expiry <= _now():
        raise HTTPException(status_code=400, detail="Purchase could not be verified")

    await udb.billing.update_one(
        {},
        {"$set": {
            "premium_until": expiry.isoformat(),
            "plan": PRODUCTS[body.product_id]["period"],
            "product_id": body.product_id,
            "platform": body.platform,
            "updated_at": _now().isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, **_status_payload(await _doc())}


class RestoreIn(BaseModel):
    platform: Literal["ios", "android"]
    purchases: list[ValidateIn] = []


@router.post("/restore")
async def restore(body: RestoreIn):
    """Re-verify previously-owned purchases (from getAvailablePurchases)."""
    best: Optional[datetime.datetime] = None
    best_pid: Optional[str] = None
    for p in body.purchases:
        try:
            res = await validate(p)  # reuse verification + grant
            exp = _parse_dt(res.get("expires_at"))
            if exp and (best is None or exp > best):
                best, best_pid = exp, p.product_id
        except HTTPException:
            continue
    doc = await _doc()
    payload = _status_payload(doc)
    payload["restored"] = bool(best)
    return payload
