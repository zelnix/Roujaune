"""
Multi-user authentication + per-user data scoping.

Provides:
  - email/password auth (bcrypt) and Emergent-managed Google + Apple sign-in,
    all issuing a revocable Bearer session token stored in `user_sessions`.
  - `AuthMiddleware` (pure ASGI) that resolves the Bearer token per request and
    stores the user in a ContextVar (propagates to endpoints + helpers + tasks).
  - `udb` — a user-scoped DB proxy that auto-injects `user_id` into every query
    for user-owned collections, so the rest of the app becomes multi-user with
    minimal changes.
"""
from __future__ import annotations

import contextvars
import datetime
import secrets
import uuid

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from starlette.responses import JSONResponse

# ---------------------------------------------------------------------------
_db = None
_current_user: contextvars.ContextVar = contextvars.ContextVar("current_user", default=None)

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_AUDIENCE = "com.emergent.coachalbertodash.wsjvnf"  # iOS bundle id (app.json)
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_TTL_DAYS = 7

# Collections that hold per-user data (auto-scoped by `udb`).
USER_SCOPED = {
    "rider_profile", "plan_state", "ride_history", "supplementary_log",
    "training_plans", "coach_chats", "connected_accounts", "workout_sessions",
    "scheduled_workouts", "daily_checkins", "workout_prefs", "cycling_activities",
    "settings", "calendar_weeks",
}

# Public HTTP paths (no auth required).
_PUBLIC = {
    "/api/auth/register", "/api/auth/login", "/api/auth/google", "/api/auth/apple",
}


def init(db):
    global _db
    _db = db
    udb._db = db


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def current_user_id():
    u = _current_user.get()
    return u.get("user_id") if u else None


def require_user() -> dict:
    u = _current_user.get()
    if not u:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return u


# ---- user-scoped DB proxy --------------------------------------------------
class _ScopedCollection:
    def __init__(self, coll, uid):
        self._c = coll
        self._uid = uid

    def _f(self, filt):
        f = dict(filt or {})
        f["user_id"] = self._uid
        return f

    async def find_one(self, filt=None, *a, **k):
        return await self._c.find_one(self._f(filt), *a, **k)

    def find(self, filt=None, *a, **k):
        return self._c.find(self._f(filt), *a, **k)

    async def count_documents(self, filt=None, *a, **k):
        return await self._c.count_documents(self._f(filt), *a, **k)

    async def insert_one(self, doc, *a, **k):
        d = dict(doc)
        d["user_id"] = self._uid
        return await self._c.insert_one(d, *a, **k)

    async def update_one(self, filt, update, *a, **k):
        update = dict(update)
        soi = dict(update.get("$setOnInsert", {}))
        soi["user_id"] = self._uid
        update["$setOnInsert"] = soi
        return await self._c.update_one(self._f(filt), update, *a, **k)

    async def update_many(self, filt, update, *a, **k):
        return await self._c.update_many(self._f(filt), update, *a, **k)

    async def delete_one(self, filt, *a, **k):
        return await self._c.delete_one(self._f(filt), *a, **k)

    async def delete_many(self, filt=None, *a, **k):
        return await self._c.delete_many(self._f(filt), *a, **k)


class _ScopedDB:
    _db = None

    def __getattr__(self, name):
        uid = current_user_id()
        coll = getattr(self._db, name)
        if name in USER_SCOPED:
            return _ScopedCollection(coll, uid)
        return coll


udb = _ScopedDB()


# ---- password + session helpers -------------------------------------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


async def _create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await _db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": _now(),
        "expires_at": _now() + datetime.timedelta(days=SESSION_TTL_DAYS),
    })
    return token


async def _resolve_token(token: str):
    if not token:
        return None
    sess = await _db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, datetime.datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < _now():
            return None
    return await _db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})


def _public_user(u: dict) -> dict:
    out = {k: u.get(k) for k in ("user_id", "email", "name", "picture", "provider", "assigned_plan_id")}
    out["onboarded"] = bool(u.get("onboarded"))
    return out


async def _upsert_oauth_user(email: str, name: str, picture: str, provider: str) -> dict:
    existing = await _db.users.find_one({"email": email.lower()}, {"_id": 0})
    if existing:
        return existing
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {"user_id": uid, "email": email.lower(), "name": name or email.split("@")[0],
           "picture": picture, "provider": provider, "created_at": _now()}
    await _db.users.insert_one(doc)
    return doc


# ---- indexes + startup migration ------------------------------------------
async def ensure_indexes():
    await _db.users.create_index("email", unique=True)
    await _db.users.create_index("user_id", unique=True)
    await _db.user_sessions.create_index("session_token", unique=True)
    await _db.user_sessions.create_index("user_id")
    await _db.user_sessions.create_index("expires_at", expireAfterSeconds=0)


async def migrate_singleton(demo_email: str, demo_password: str, demo_name: str = "Green Lantern") -> dict | None:
    """One-time: claim all pre-existing single-user data for a demo account and
    create its email/password login. Runs only if the demo user doesn't exist."""
    if await _db.users.find_one({"email": demo_email.lower()}):
        return None
    uid = "user_greenlantern"
    await _db.users.insert_one({
        "user_id": uid, "email": demo_email.lower(), "name": demo_name,
        "password_hash": hash_pw(demo_password), "provider": "password",
        "onboarded": True, "assigned_plan_id": "couch-to-road", "created_at": _now(),
    })
    # Stamp every user-scoped doc that has no owner yet onto the demo account.
    for coll in USER_SCOPED:
        await getattr(_db, coll).update_many(
            {"user_id": {"$exists": False}}, {"$set": {"user_id": uid}},
        )
    return {"user_id": uid, "email": demo_email}


# ---- ASGI middleware -------------------------------------------------------
def _requires_auth(path: str, method: str) -> bool:
    if method == "OPTIONS":
        return False
    if not path.startswith("/api/"):
        return False
    if path in _PUBLIC:
        return False
    return True


class AuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else ""
        user = await _resolve_token(token) if token else None
        ctx = _current_user.set(user)
        try:
            path = scope.get("path", "")
            method = scope.get("method", "GET")
            if _requires_auth(path, method) and not user:
                resp = JSONResponse({"detail": "Not authenticated"}, status_code=401)
                return await resp(scope, receive, send)
            await self.app(scope, receive, send)
        finally:
            _current_user.reset(ctx)


# ---- request models --------------------------------------------------------
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleReq(BaseModel):
    session_id: str


class AppleReq(BaseModel):
    identity_token: str
    name: str | None = None


# ---- router ----------------------------------------------------------------
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register")
async def register(req: RegisterReq):
    email = req.email.lower()
    if await _db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {"user_id": uid, "email": email, "name": req.name or email.split("@")[0],
           "password_hash": hash_pw(req.password), "provider": "password",
           "onboarded": False, "created_at": _now()}
    await _db.users.insert_one(doc)
    token = await _create_session(uid)
    return {"token": token, "user": _public_user(doc)}


@auth_router.post("/login")
async def login(req: LoginReq):
    user = await _db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password_hash") or not verify_pw(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await _create_session(user["user_id"])
    return {"token": token, "user": _public_user(user)}


@auth_router.post("/google")
async def google(req: GoogleReq):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": req.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed")
    data = r.json()
    user = await _upsert_oauth_user(data.get("email", ""), data.get("name", ""), data.get("picture", ""), "google")
    token = await _create_session(user["user_id"])
    return {"token": token, "user": _public_user(user)}


@auth_router.post("/apple")
async def apple(req: AppleReq):
    try:
        jwk_client = jwt.PyJWKClient(APPLE_KEYS_URL)
        signing_key = jwk_client.get_signing_key_from_jwt(req.identity_token)
        claims = jwt.decode(
            req.identity_token, signing_key.key, algorithms=["RS256"],
            audience=APPLE_AUDIENCE, issuer=APPLE_ISSUER,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Apple sign-in failed")
    email = claims.get("email") or f"{claims.get('sub')}@appleid.roujaune.app"
    user = await _upsert_oauth_user(email, req.name or "Rider", "", "apple")
    token = await _create_session(user["user_id"])
    return {"token": token, "user": _public_user(user)}


@auth_router.get("/me")
async def me():
    return {"user": _public_user(require_user())}


@auth_router.post("/logout")
async def logout(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if token:
        await _db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}
