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
import os
import secrets
import uuid

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from starlette.responses import JSONResponse, HTMLResponse

import emailer

# ---------------------------------------------------------------------------
_db = None
_current_user: contextvars.ContextVar = contextvars.ContextVar("current_user", default=None)

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_AUDIENCE = "com.hwg.roujaune"  # iOS bundle id (app.json)
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_TTL_DAYS = 7

# Emails that should always be granted the admin role (comma-separated in env).
# Resolved lazily at call time because .env is loaded after this module imports.
def _admin_emails() -> set:
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}


def _role_for(email: str | None, existing: str | None = None) -> str:
    """Resolve a user's role: allow-listed emails become admin; otherwise keep
    their existing role (never demote) or default to rider."""
    if email and email.lower() in _admin_emails():
        return "admin"
    return existing or "rider"

# Collections that hold per-user data (auto-scoped by `udb`).
USER_SCOPED = {
    "rider_profile", "plan_state", "ride_history", "supplementary_log",
    "training_plans", "coach_chats", "connected_accounts", "workout_sessions",
    "scheduled_workouts", "daily_checkins", "workout_prefs", "cycling_activities",
    "settings", "calendar_weeks", "rider_prs", "rider_prefs", "rider_appearance", "kv_prefs",
}

# Public HTTP paths (no auth required).
_PUBLIC = {
    "/api/auth/register", "/api/auth/login", "/api/auth/google", "/api/auth/apple",
    "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/verify-email",
    "/api/admin/login", "/api/admin/logout",
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


def is_admin() -> bool:
    u = _current_user.get()
    return bool(u and u.get("role") == "admin")


def require_admin() -> dict:
    """Gate for /api/admin/* routes — requires an authenticated admin user."""
    u = require_user()
    if u.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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
    if sess:
        exp = sess.get("expires_at")
        if isinstance(exp, datetime.datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=datetime.timezone.utc)
            if exp < _now():
                return None
        return await _db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    # Fall back to the SEPARATE admin store (password-based console admins).
    asess = await _db.admin_sessions.find_one({"session_token": token}, {"_id": 0})
    if asess:
        exp = asess.get("expires_at")
        if isinstance(exp, datetime.datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=datetime.timezone.utc)
            if exp < _now():
                return None
        adm = await _db.admins.find_one({"admin_id": asess["admin_id"]}, {"_id": 0, "password_hash": 0})
        if adm:
            return {"user_id": adm["admin_id"], "email": adm.get("email"),
                    "name": adm.get("name") or "Admin", "role": "admin",
                    "provider": "admin-store", "is_admin_store": True}
    return None


def _public_user(u: dict) -> dict:
    out = {k: u.get(k) for k in ("user_id", "email", "name", "picture", "provider", "assigned_plan_id")}
    out["onboarded"] = bool(u.get("onboarded"))
    out["role"] = u.get("role") or "rider"
    # Email verification only applies to password accounts; OAuth users are trusted.
    out["email_verified"] = bool(u.get("email_verified")) or u.get("provider") in ("google", "apple")
    return out


def _base_url(request: Request) -> str:
    """Public origin of the incoming request (survives the ingress proxy), used
    to build email links that open in a browser on any device."""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


async def _send_verification(user: dict, request: Request) -> bool:
    token = secrets.token_urlsafe(32)
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"verify_token": token, "verify_sent_at": _now(),
                  "verify_expires": _now() + datetime.timedelta(days=7)}},
    )
    link = f"{_base_url(request)}/api/auth/verify-email?token={token}"
    return await emailer.send_email(
        user["email"], "Verify your ROUJAUNE email",
        emailer.verification_email_html(user.get("name") or "there", link),
    )


async def _upsert_oauth_user(email: str, name: str, picture: str, provider: str) -> dict:
    existing = await _db.users.find_one({"email": email.lower()}, {"_id": 0})
    if existing:
        # Enforce admin allow-list on every login (promote only; never demote).
        role = _role_for(email, existing.get("role"))
        if role != existing.get("role"):
            await _db.users.update_one({"user_id": existing["user_id"]}, {"$set": {"role": role}})
            existing["role"] = role
        return existing
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {"user_id": uid, "email": email.lower(), "name": name or email.split("@")[0],
           "picture": picture, "provider": provider, "role": _role_for(email), "created_at": _now()}
    await _db.users.insert_one(doc)
    return doc


# ---- indexes + startup migration ------------------------------------------
async def ensure_indexes():
    await _db.users.create_index("email", unique=True)
    await _db.users.create_index("user_id", unique=True)
    await _db.user_sessions.create_index("session_token", unique=True)
    await _db.user_sessions.create_index("user_id")
    await _db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    # Separate admin store (password-based console admins).
    await _db.admins.create_index("email", unique=True)
    await _db.admins.create_index("admin_id", unique=True)
    await _db.admin_sessions.create_index("session_token", unique=True)
    await _db.admin_sessions.create_index("expires_at", expireAfterSeconds=0)


# --------------------------------------------------------------------------- #
#  Separate password-based admin store (Harmony Wellness Group console)        #
#  Kept fully separate from rider 'users' (Google/Apple OAuth).                #
# --------------------------------------------------------------------------- #
_DUMMY_HASH = bcrypt.hashpw(b"timing-mitigation", bcrypt.gensalt()).decode()
ADMIN_SESSION_TTL_HOURS = 12


async def _create_admin_session(admin_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await _db.admin_sessions.insert_one({
        "session_token": token,
        "admin_id": admin_id,
        "created_at": _now(),
        "expires_at": _now() + datetime.timedelta(hours=ADMIN_SESSION_TTL_HOURS),
    })
    return token


async def seed_login_admin() -> bool:
    """Idempotently create/update the shared console admin from env vars.
    Password is re-synced from env on every startup; never stored in plaintext."""
    email = os.environ.get("ADMIN_LOGIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_LOGIN_PASSWORD", "")
    if not email or not password:
        return False
    existing = await _db.admins.find_one({"email": email})
    if existing:
        await _db.admins.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_pw(password), "role": "admin", "updated_at": _now()}},
        )
    else:
        await _db.admins.insert_one({
            "admin_id": f"admin_{uuid.uuid4().hex[:12]}",
            "email": email, "name": "Admin",
            "password_hash": hash_pw(password), "role": "admin", "created_at": _now(),
        })
    return True


admin_auth_router = APIRouter(prefix="/admin", tags=["admin-auth"])


class AdminLoginReq(BaseModel):
    email: str
    password: str


@admin_auth_router.post("/login")
async def admin_login(req: AdminLoginReq):
    email = (req.email or "").strip().lower()
    adm = await _db.admins.find_one({"email": email})
    # Constant-time-ish: always run verify (dummy hash on miss) to avoid enumeration.
    ok = verify_pw(req.password, adm["password_hash"] if adm else _DUMMY_HASH)
    if not adm or not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await _create_admin_session(adm["admin_id"])
    return {"token": token, "admin": {"email": adm["email"], "name": adm.get("name") or "Admin", "role": "admin"}}


@admin_auth_router.post("/logout")
async def admin_logout(request: Request):
    auth_h = request.headers.get("authorization") or ""
    if auth_h.lower().startswith("bearer "):
        await _db.admin_sessions.delete_one({"session_token": auth_h.split(" ", 1)[1].strip()})
    return {"status": "ok"}


async def seed_admins() -> int:
    """Idempotent: promote every allow-listed email to admin on startup."""
    emails = list(_admin_emails())
    if not emails:
        return 0
    res = await _db.users.update_many(
        {"email": {"$in": emails}}, {"$set": {"role": "admin"}}
    )
    return res.modified_count


async def migrate_singleton(demo_email: str, demo_password: str, demo_name: str = "Green Lantern") -> dict | None:
    """One-time: claim all pre-existing single-user data for a demo account and
    create its email/password login. Runs only if the demo user doesn't exist."""
    if await _db.users.find_one({"email": demo_email.lower()}):
        return None
    uid = "user_greenlantern"
    await _db.users.insert_one({
        "user_id": uid, "email": demo_email.lower(), "name": demo_name,
        "password_hash": hash_pw(demo_password), "provider": "password",
        "onboarded": True, "email_verified": True, "assigned_plan_id": "couch-to-road", "created_at": _now(),
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
    # Static report downloads are public in preview (filename allow-list enforced).
    if path == "/api/reports" or path.startswith("/api/reports/"):
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


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    token: str
    password: str


# ---- router ----------------------------------------------------------------
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register")
async def register(req: RegisterReq, request: Request):
    email = req.email.lower()
    if await _db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {"user_id": uid, "email": email, "name": req.name or email.split("@")[0],
           "password_hash": hash_pw(req.password), "provider": "password",
           "role": _role_for(email),
           "onboarded": False, "email_verified": False, "created_at": _now()}
    await _db.users.insert_one(doc)
    try:
        await _send_verification(doc, request)  # best-effort; soft verification
    except Exception:
        pass
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


# ---- email verification ----------------------------------------------------
@auth_router.post("/resend-verification")
async def resend_verification(request: Request):
    u = require_user()
    user = await _db.users.find_one({"user_id": u["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.get("email_verified"):
        return {"ok": True, "already_verified": True}
    ok = await _send_verification(user, request)
    if not ok:
        raise HTTPException(status_code=502, detail="Couldn't send the email right now. Please try again shortly.")
    return {"ok": True}


def _html_page(title: str, message: str, ok: bool = True) -> HTMLResponse:
    icon = "✓" if ok else "!"
    color = "#FFC20A" if ok else "#C91727"
    return HTMLResponse(f"""\
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} · ROUJAUNE</title></head>
<body style="margin:0;background:#0B0C0C;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F3F1EA;">
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;width:100%;background:#141615;border:1px solid rgba(255,194,10,0.28);border-radius:18px;padding:34px 30px;text-align:center;">
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:22px;">ROU<span style="color:#FFC20A;">JAUNE</span></div>
    <div style="width:66px;height:66px;border-radius:50%;border:3px solid {color};display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:32px;color:{color};font-weight:800;">{icon}</div>
    <h1 style="font-size:20px;margin:0 0 10px;">{title}</h1>
    <p style="color:#C9CAC7;font-size:15px;line-height:1.6;margin:0;">{message}</p>
  </div>
</div></body></html>""")


@auth_router.get("/verify-email")
async def verify_email(token: str = ""):
    if not token:
        return _html_page("Invalid link", "This verification link is missing its token.", ok=False)
    user = await _db.users.find_one({"verify_token": token})
    if not user:
        return _html_page("Link expired", "This verification link is no longer valid. Open the app and tap “Resend” to get a new one.", ok=False)
    exp = user.get("verify_expires")
    if isinstance(exp, datetime.datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < _now():
            return _html_page("Link expired", "This verification link has expired. Open the app and tap “Resend” to get a new one.", ok=False)
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"email_verified": True}, "$unset": {"verify_token": "", "verify_expires": ""}},
    )
    return _html_page("Email verified", "Thanks — your email is confirmed. You can head back to the ROUJAUNE app and keep riding.")


# ---- forgot / reset password ----------------------------------------------
@auth_router.post("/forgot-password")
async def forgot_password(req: ForgotReq, request: Request):
    email = req.email.lower()
    user = await _db.users.find_one({"email": email})
    # Only password accounts can reset; always return ok to avoid leaking which
    # emails exist.
    if user and user.get("provider") == "password":
        token = secrets.token_urlsafe(32)
        await _db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"reset_token": token, "reset_expires": _now() + datetime.timedelta(minutes=60)}},
        )
        link = f"{_base_url(request)}/api/auth/reset-password?token={token}"
        try:
            await emailer.send_email(
                user["email"], "Reset your ROUJAUNE password",
                emailer.reset_email_html(user.get("name") or "there", link),
            )
        except Exception:
            pass
    return {"ok": True, "message": "If an account exists for that email, a reset link is on its way."}


@auth_router.get("/reset-password")
async def reset_password_page(token: str = ""):
    """Browser landing page (opened from the reset email) with a small form that
    POSTs the new password back to /api/auth/reset-password as JSON."""
    safe = token.replace('"', "").replace("<", "").replace(">", "")
    return HTMLResponse(f"""\
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Reset password · ROUJAUNE</title></head>
<body style="margin:0;background:#0B0C0C;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F3F1EA;">
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;width:100%;background:#141615;border:1px solid rgba(255,194,10,0.28);border-radius:18px;padding:32px 30px;">
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:18px;text-align:center;">ROU<span style="color:#FFC20A;">JAUNE</span></div>
    <h1 style="font-size:19px;margin:0 0 6px;">Choose a new password</h1>
    <p style="color:#9A9B98;font-size:13px;margin:0 0 18px;">Enter a new password for your account.</p>
    <input id="pw" type="password" placeholder="New password (min 6 chars)" style="width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:#0E100F;color:#F3F1EA;font-size:15px;margin-bottom:10px;"/>
    <input id="pw2" type="password" placeholder="Confirm new password" style="width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:#0E100F;color:#F3F1EA;font-size:15px;margin-bottom:16px;"/>
    <button id="btn" style="width:100%;padding:14px;border:none;border-radius:12px;background:#FFC20A;color:#241B00;font-size:15px;font-weight:800;cursor:pointer;">Reset password</button>
    <p id="msg" style="font-size:14px;margin:16px 0 0;text-align:center;"></p>
  </div>
</div>
<script>
  var token = "{safe}";
  var btn = document.getElementById('btn'), msg = document.getElementById('msg');
  btn.onclick = async function() {{
    var pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
    if (pw.length < 6) {{ msg.style.color = '#E8631C'; msg.textContent = 'Password must be at least 6 characters.'; return; }}
    if (pw !== pw2) {{ msg.style.color = '#E8631C'; msg.textContent = 'Passwords do not match.'; return; }}
    btn.disabled = true; btn.textContent = 'Resetting…';
    try {{
      var r = await fetch('/api/auth/reset-password', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{ token: token, password: pw }}) }});
      var d = await r.json();
      if (r.ok) {{ msg.style.color = '#55C850'; msg.textContent = 'Password updated. You can now sign in with your new password in the app.'; btn.style.display = 'none'; }}
      else {{ msg.style.color = '#E8631C'; msg.textContent = (d && d.detail) || 'This reset link is invalid or has expired.'; btn.disabled = false; btn.textContent = 'Reset password'; }}
    }} catch (e) {{ msg.style.color = '#E8631C'; msg.textContent = 'Something went wrong. Please try again.'; btn.disabled = false; btn.textContent = 'Reset password'; }}
  }};
</script>
</body></html>""")


@auth_router.post("/reset-password")
async def reset_password(req: ResetReq):
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await _db.users.find_one({"reset_token": req.token})
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used")
    exp = user.get("reset_expires")
    if isinstance(exp, datetime.datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < _now():
            raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_pw(req.password)}, "$unset": {"reset_token": "", "reset_expires": ""}},
    )
    # Invalidate all existing sessions so a leaked/old session can't linger.
    await _db.user_sessions.delete_many({"user_id": user["user_id"]})
    return {"ok": True}
