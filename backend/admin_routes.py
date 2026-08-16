"""
Admin API surface for the Harmony Wellness Group console.

All routes are gated by `auth.require_admin` (403 for non-admins, 401 for
anonymous). Mounted at /api/admin/*. Mutations are recorded to `admin_audit`.

Contract reference: /app/memory/roujaune_admin_api_contract.md
"""
from __future__ import annotations

import datetime
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

import auth

admin_router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(auth.require_admin)])

_db = None
_on_plan_change = None
_STARTED = time.monotonic()
_VERSION = "1.0.0"


def init(db, on_plan_change=None) -> None:
    global _db, _on_plan_change
    _db = db
    _on_plan_change = on_plan_change


async def _notify_plan(plan_id: str) -> None:
    if _on_plan_change:
        try:
            await _on_plan_change(plan_id)
        except Exception:
            pass


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def _audit(action: str, target: str, meta: Optional[dict] = None) -> None:
    actor = auth.require_user()
    await _db.admin_audit.insert_one({
        "actor": actor.get("user_id"),
        "actor_email": actor.get("email"),
        "action": action,
        "target": target,
        "meta": meta or {},
        "at": _now(),
    })


# --------------------------------------------------------------------------- #
#  Health / metrics                                                           #
# --------------------------------------------------------------------------- #
@admin_router.get("/health")
async def health():
    try:
        await _db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "version": _VERSION,
        "uptime": round(time.monotonic() - _STARTED, 1),
        "time": _now(),
    }


@admin_router.get("/metrics")
async def metrics():
    return {
        "users": await _db.users.count_documents({}),
        "admins": await _db.users.count_documents({"role": "admin"}),
        "plans": await _db.plans.count_documents({}),
        "benchmark_results": await _db.benchmark_results.count_documents({}),
        "time": _now(),
    }


@admin_router.get("/interest")
async def activity_interest():
    """Demand signal for roadmap ('coming soon') activities: how many riders
    tapped 'Notify me when this launches' for each mode. Powers the HWG console
    roadmap prioritisation view."""
    modes = ["gravel", "mountain-bike", "walking", "running", "rowing", "climbing"]
    pipeline = [{"$group": {"_id": "$mode", "count": {"$sum": 1}}}]
    rows = await _db.mode_interest.aggregate(pipeline).to_list(100)
    counts = {r["_id"]: r["count"] for r in rows}
    items = [{"mode": m, "count": int(counts.get(m, 0))} for m in modes]
    items.sort(key=lambda x: -x["count"])
    return {"items": items, "total": int(sum(counts.values())), "time": _now()}



# --------------------------------------------------------------------------- #
#  Users                                                                      #
# --------------------------------------------------------------------------- #
@admin_router.get("/users")
async def list_users(q: Optional[str] = None, limit: int = 50, skip: int = 0, cursor: Optional[str] = None):
    """List/search users. Supports both skip/limit and cursor pagination
    (`cursor` = the `created_at` of the last item from the previous page)."""
    limit = max(1, min(limit, 200))
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]}
    if cursor:
        filt = {"$and": [filt, {"created_at": {"$lt": cursor}}]} if filt else {"created_at": {"$lt": cursor}}
    proj = {"_id": 0, "password_hash": 0, "reset_token": 0, "reset_expires": 0, "verify_token": 0}
    cur = _db.users.find(filt, proj).sort("created_at", -1).skip(max(0, skip)).limit(limit)
    items = await cur.to_list(limit)
    total = await _db.users.count_documents({} if not q else {"$or": [
        {"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}},
    ]})
    next_cursor = items[-1].get("created_at") if len(items) == limit else None
    return {"items": items, "total": total, "skip": skip, "limit": limit, "next_cursor": next_cursor}


@admin_router.get("/users/{user_id}")
async def get_user(user_id: str):
    u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0, "reset_token": 0, "verify_token": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    profile = await _db.rider_profile.find_one({"user_id": user_id}, {"_id": 0})
    bench = await _db.benchmark_profile.find_one({"user_id": user_id}, {"_id": 0})
    latest_result = await _db.benchmark_results.find_one(
        {"user_id": user_id}, {"_id": 0}, sort=[("createdAt", -1)])
    plan = None
    pid = u.get("assigned_plan_id")
    if pid and pid != "none":
        p = await _db.plans.find_one({"id": pid}, {"_id": 0, "weeks": 0})
        if p:
            plan = {"id": p.get("id"), "title": p.get("title"), "level": p.get("level")}
    return {
        "user": u,
        "rider_profile": profile,
        "benchmark_profile": bench,
        "latest_benchmark": latest_result,
        "plan": plan,
        "billing": await _billing_status(user_id),
    }


def _plan_label(plan: Optional[str]) -> str:
    return {"yearly": "Annual", "monthly": "Monthly"}.get(plan or "", "Premium")


async def _billing_status(user_id: str) -> dict:
    b = await _db.billing.find_one({"user_id": user_id}, {"_id": 0}) or {}
    until = b.get("premium_until")
    premium = False
    if until:
        try:
            premium = datetime.datetime.fromisoformat(until) > datetime.datetime.now(datetime.timezone.utc)
        except Exception:
            premium = False
    return {"premium": premium, "plan": b.get("plan"), "plan_label": _plan_label(b.get("plan")) if premium else None,
            "product_id": b.get("product_id"), "premium_until": until, "source": b.get("source")}


class PremiumGrant(BaseModel):
    action: str = "grant"           # grant | revoke
    plan: Optional[str] = "yearly"  # yearly | monthly | gift_month (grant only)


async def _send_grant_email(user_id: str, plan: str, exp: datetime.datetime) -> None:
    """Best-effort 'your Premium is active' email after an admin grant/gift.
    Never raises — a mail failure must not fail the grant."""
    try:
        import emailer
        u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1}) or {}
        email = (u.get("email") or "").strip()
        if not email:
            return
        name = (u.get("name") or "").split(" ")[0].strip() or "rider"
        gifted = plan == "gift_month"
        plan_label = {"yearly": "Annual", "monthly": "Monthly", "gift_month": "Gift"}.get(plan, "Premium")
        expires_human = exp.strftime("%-d %B %Y")
        html = emailer.grant_email_html(name, plan_label, expires_human, gifted)
        subject = "Your ROUJAUNE Premium is active 🎉" if not gifted else "A month of ROUJAUNE Premium — on us 🎁"
        await emailer.send_email(email, subject, html)
    except Exception:
        pass


@admin_router.post("/riders/{user_id}/premium")
async def set_rider_premium(user_id: str, body: PremiumGrant):
    """Grant, gift (a free month) or revoke a rider's Premium plan from the console."""
    if not await _db.users.find_one({"user_id": user_id}):
        raise HTTPException(status_code=404, detail="Rider not found")
    now = datetime.datetime.now(datetime.timezone.utc)
    if body.action == "revoke":
        await _db.billing.update_one({"user_id": user_id}, {"$set": {
            "user_id": user_id, "premium_until": now.isoformat(), "plan": None,
            "product_id": None, "source": "admin_revoke", "updated_at": now.isoformat(),
        }}, upsert=True)
        await _audit("rider.premium.revoke", user_id, {})
    elif body.action == "grant":
        plan = body.plan or "yearly"
        days = {"yearly": 365, "monthly": 31, "gift_month": 30}.get(plan)
        if not days:
            raise HTTPException(status_code=422, detail="plan must be yearly | monthly | gift_month")
        product = {"yearly": "premium_yearly", "monthly": "premium_monthly", "gift_month": "premium_monthly"}[plan]
        source = "admin_gift" if plan == "gift_month" else "admin_grant"
        exp = now + datetime.timedelta(days=days)
        await _db.billing.update_one({"user_id": user_id}, {"$set": {
            "user_id": user_id, "premium_until": exp.isoformat(),
            "plan": "monthly" if plan == "gift_month" else plan,
            "product_id": product, "platform": source, "source": source,
            "updated_at": now.isoformat(),
        }}, upsert=True)
        await _audit(f"rider.premium.{'gift' if plan == 'gift_month' else 'grant'}", user_id,
                     {"plan": plan, "expires": exp.isoformat()})
        await _send_grant_email(user_id, plan, exp)
    else:
        raise HTTPException(status_code=422, detail="action must be grant | revoke")
    return {"ok": True, "billing": await _billing_status(user_id)}


class UserPatch(BaseModel):
    role: Optional[str] = None
    assigned_plan_id: Optional[str] = None
    suspended: Optional[bool] = None


@admin_router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch):
    updates: dict = {}
    if body.role is not None:
        if body.role not in ("rider", "support", "admin"):
            raise HTTPException(status_code=422, detail="role must be rider|support|admin")
        updates["role"] = body.role
    if body.assigned_plan_id is not None:
        updates["assigned_plan_id"] = body.assigned_plan_id
    if body.suspended is not None:
        updates["suspended"] = body.suspended
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await _db.users.update_one({"user_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await _audit("user.patch", user_id, updates)
    u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": u}


@admin_router.post("/users/{user_id}/export")
async def export_user(user_id: str):
    """GDPR export of all documents owned by a rider."""
    bundle = await auth.export_user_data(user_id)
    await _audit("user.export", user_id, {"collections": list(bundle.get("collections", {}).keys())})
    return bundle


@admin_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    """GDPR erasure — deletes the user + every user-scoped collection + sessions."""
    actor = auth.require_user()
    if actor.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="Admins cannot delete their own account here")
    result = await auth.erase_user_data(user_id)
    await _audit("user.delete", user_id, result.get("deleted", {}))
    return {"ok": True, **result}


# --------------------------------------------------------------------------- #
#  Audit log                                                                  #
# --------------------------------------------------------------------------- #
@admin_router.get("/audit")
async def audit_log(limit: int = 50, skip: int = 0, cursor: Optional[str] = None):
    limit = max(1, min(limit, 200))
    filt: dict = {"at": {"$lt": cursor}} if cursor else {}
    cur = _db.admin_audit.find(filt, {"_id": 0}).sort("at", -1).skip(max(0, skip)).limit(limit)
    items = await cur.to_list(limit)
    next_cursor = items[-1].get("at") if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}


# --------------------------------------------------------------------------- #
#  Console identity + navigation                                              #
# --------------------------------------------------------------------------- #
@admin_router.get("/me")
async def me():
    """Current authenticated admin identity (console session bootstrap)."""
    a = auth.require_user()
    return {
        "admin_id": a.get("user_id"),
        "email": a.get("email"),
        "name": a.get("name") or "Admin",
        "role": a.get("role", "admin"),
        "provider": a.get("provider", "admin-store"),
    }


@admin_router.get("/nav-badges")
async def nav_badges():
    """Counts the console renders as sidebar/nav badges."""
    riders = await _db.users.count_documents({"role": {"$ne": "admin"}})
    suspended = await _db.users.count_documents({"suspended": True})
    plans = await _db.plans.count_documents({})
    catalog = await _db.workout_catalog.count_documents({})
    return {"riders": riders, "suspended": suspended, "plans": plans, "catalog": catalog}


# --------------------------------------------------------------------------- #
#  Dashboard + analytics                                                      #
# --------------------------------------------------------------------------- #
@admin_router.get("/dashboard")
async def dashboard():
    """Rollup metrics for the console home (superset of /metrics)."""
    week_ago = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).isoformat()
    total = await _db.users.count_documents({"role": {"$ne": "admin"}})
    suspended = await _db.users.count_documents({"suspended": True})
    new_week = await _db.users.count_documents({"created_at": {"$gte": week_ago}})
    onboarded = await _db.users.count_documents({"onboarded": True})
    return {
        "riders": total,
        "active": total - suspended,
        "suspended": suspended,
        "onboarded": onboarded,
        "new_this_week": new_week,
        "admins": await _db.users.count_documents({"role": "admin"}),
        "plans": await _db.plans.count_documents({}),
        "benchmark_results": await _db.benchmark_results.count_documents({}),
        "catalog": await _db.workout_catalog.count_documents({}),
        "time": _now(),
    }


@admin_router.get("/analytics/growth")
async def analytics_growth():
    """6-month rider growth series (new + cumulative) for the HWG rollup."""
    now = datetime.datetime.now(datetime.timezone.utc)
    # Build the last 6 month buckets (oldest → newest).
    buckets: list[dict] = []
    y, m = now.year, now.month
    months = []
    for _ in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()
    labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    docs = await _db.users.find({"role": {"$ne": "admin"}}, {"created_at": 1, "_id": 0}).to_list(100000)
    def _ym(s):
        try:
            return (int(str(s)[0:4]), int(str(s)[5:7]))
        except Exception:
            return None
    created = [_ym(d.get("created_at")) for d in docs if d.get("created_at")]
    cumulative = 0
    start = months[0]
    # seed cumulative with everyone created before the window
    cumulative = sum(1 for c in created if c and c < start)
    for (yy, mm) in months:
        new_count = sum(1 for c in created if c == (yy, mm))
        cumulative += new_count
        buckets.append({
            "month": f"{yy}-{mm:02d}",
            "label": labels[mm - 1],
            "new_users": new_count,
            "total_users": cumulative,
        })
    return {"series": buckets}


# --------------------------------------------------------------------------- #
#  Riders (alias of /users + lifecycle actions)                               #
# --------------------------------------------------------------------------- #
@admin_router.get("/riders")
async def list_riders(q: Optional[str] = None, limit: int = 50, skip: int = 0, cursor: Optional[str] = None):
    return await list_users(q=q, limit=limit, skip=skip, cursor=cursor)


@admin_router.get("/riders/export/csv")
async def export_riders_csv():
    """Download all riders as CSV (no secrets)."""
    fields = ["user_id", "email", "name", "provider", "role", "assigned_plan_id",
              "onboarded", "email_verified", "suspended", "created_at"]
    docs = await _db.users.find({"role": {"$ne": "admin"}},
                                {"_id": 0, "password_hash": 0, "reset_token": 0, "verify_token": 0}
                                ).sort("created_at", -1).to_list(100000)
    def _cell(v):
        s = "" if v is None else str(v)
        return '"' + s.replace('"', '""') + '"' if ("," in s or '"' in s) else s
    lines = [",".join(fields)]
    for d in docs:
        lines.append(",".join(_cell(d.get(f)) for f in fields))
    await _audit("riders.export.csv", "riders", {"count": len(docs)})
    return Response(content="\n".join(lines), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=roujaune-riders.csv"})


@admin_router.get("/riders/{user_id}")
async def get_rider(user_id: str):
    return await get_user(user_id)


async def _set_suspended(user_id: str, value: bool) -> dict:
    res = await _db.users.update_one({"user_id": user_id}, {"$set": {"suspended": value}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rider not found")
    if value:
        await _db.user_sessions.delete_many({"user_id": user_id})  # force logout
    await _audit("rider.suspend" if value else "rider.reactivate", user_id, {"suspended": value})
    u = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0, "reset_token": 0, "verify_token": 0})
    return {"user": u}


@admin_router.post("/riders/{user_id}/suspend")
async def suspend_rider(user_id: str):
    return await _set_suspended(user_id, True)


@admin_router.post("/riders/{user_id}/reactivate")
async def reactivate_rider(user_id: str):
    return await _set_suspended(user_id, False)


@admin_router.post("/riders/{user_id}/reset-password")
async def reset_rider_password(user_id: str):
    """Issue a temporary password and invalidate the rider's active sessions.
    Returns the temp password once so the admin can relay it to the rider."""
    u = await _db.users.find_one({"user_id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="Rider not found")
    temp = secrets.token_urlsafe(9)
    await _db.users.update_one({"user_id": user_id}, {"$set": {"password_hash": auth.hash_pw(temp), "provider": "password"}})
    await _db.user_sessions.delete_many({"user_id": user_id})
    await _audit("rider.reset_password", user_id, {})
    return {"ok": True, "temporary_password": temp}


@admin_router.delete("/riders/{user_id}")
async def delete_rider(user_id: str):
    return await delete_user(user_id)


# --------------------------------------------------------------------------- #
#  Plans (admin list + lifecycle)                                             #
# --------------------------------------------------------------------------- #
@admin_router.get("/plans")
async def list_plans():
    docs = await _db.plans.find({}, {"_id": 0}).to_list(200)
    out = []
    for d in docs:
        out.append({
            "id": d.get("id"),
            "title": d.get("title"),
            "level": d.get("level"),
            "label": d.get("label"),
            "type": d.get("type"),
            "status": d.get("status", "published"),
            "week_count": len(d.get("weeks", []) or []),
            "updated_at": d.get("updated_at"),
        })
    return {"items": out}


async def _plan_status(plan_id: str, status: str) -> dict:
    res = await _db.plans.update_one({"id": plan_id}, {"$set": {"status": status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await _notify_plan(plan_id)
    await _audit(f"plan.{status}", plan_id, {"status": status})
    return {"id": plan_id, "status": status}


@admin_router.post("/plans/{plan_id}/publish")
async def publish_plan(plan_id: str):
    return await _plan_status(plan_id, "published")


@admin_router.post("/plans/{plan_id}/archive")
async def archive_plan(plan_id: str):
    return await _plan_status(plan_id, "archived")


@admin_router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str):
    res = await _db.plans.delete_one({"id": plan_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await _notify_plan(plan_id)
    await _audit("plan.delete", plan_id, {})
    return {"deleted": plan_id}


# --------------------------------------------------------------------------- #
#  Integrations health + estimated monthly spend (HWG cost rollup)            #
# --------------------------------------------------------------------------- #
# Hybrid billing model:
#   • FLAT   — fixed/subscription fee. Editable from the console (persisted to
#              admin_config → integration_costs.overrides).
#   • METERED — usage-based. Auto-computed from real activity; NOT editable.
_INTEGRATION_META = {
    "llm":         {"billing": "metered", "unit_price": 0.012, "calls_per_ride": 9, "budget": 200.0},
    "push":        {"billing": "flat", "default": 5.0,  "budget": 25.0},
    "email":       {"billing": "flat", "default": 10.0, "budget": 40.0},
    "weather":     {"billing": "flat", "default": 0.0,  "budget": 5.0},
    "google_auth": {"billing": "flat", "default": 0.0,  "budget": 5.0},
    "database":    {"billing": "flat", "default": 15.0, "budget": 60.0},
    "route_data":  {"billing": "flat", "default": 19.0, "budget": 30.0},
}
_FLAT_INTEGRATIONS = {k for k, v in _INTEGRATION_META.items() if v["billing"] == "flat"}


async def _metered_llm_cost() -> float:
    """Auto usage-based estimate for the LLM coach: rides in the last 30 days ×
    est. LLM calls per ride (cues + debrief) × unit price."""
    meta = _INTEGRATION_META["llm"]
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)).isoformat()
    try:
        rides = await _db.ride_history.count_documents({"created_at": {"$gte": since}})
    except Exception:
        rides = 0
    return round(rides * meta["calls_per_ride"] * meta["unit_price"], 2)


async def _cost_overrides() -> dict:
    doc = await _db.admin_config.find_one({"_id": "integration_costs"}, {"_id": 0})
    return (doc or {}).get("overrides", {}) or {}


async def _cost_estimates() -> dict:
    """Per-integration flat-fee estimates persisted via the
    PUT /integrations/{id}/cost-estimate endpoint (collection keyed by _id)."""
    try:
        docs = await _db.integration_cost_estimates.find().to_list(length=200)
    except Exception:
        docs = []
    return {d["_id"]: float(d.get("usd", 0) or 0) for d in docs}


@admin_router.get("/integrations")
async def integrations(health: int = 1):
    import os
    def _st(configured: bool) -> str:
        return "healthy" if configured else "not_configured"
    items = [
        {"id": "llm", "name": "Coach AI (Claude via Emergent)", "type": "llm",
         "configured": bool(os.environ.get("EMERGENT_LLM_KEY")), "status": _st(bool(os.environ.get("EMERGENT_LLM_KEY")))},
        {"id": "push", "name": "Push Notifications (Emergent)", "type": "push",
         "configured": bool(os.environ.get("EMERGENT_PUSH_KEY")), "status": _st(bool(os.environ.get("EMERGENT_PUSH_KEY")))},
        {"id": "email", "name": "Transactional Email (Resend)", "type": "email",
         "configured": bool(os.environ.get("EMERGENT_EMAIL_KEY")), "status": _st(bool(os.environ.get("EMERGENT_EMAIL_KEY")))},
        {"id": "weather", "name": "Weather (Open-Meteo)", "type": "weather", "configured": True, "status": "healthy"},
        {"id": "google_auth", "name": "Google Sign-In (Emergent)", "type": "auth", "configured": True, "status": "healthy"},
        {"id": "route_data", "name": "Route/Map Data", "type": "data", "provider": "MapTiler",
         "category": "Data", "cost_type": "flat", "configured": True, "status": "healthy",
         "health": {"status": "ok"}},
    ]
    if health:
        try:
            await _db.command("ping")
            db_ok = True
        except Exception:
            db_ok = False
        items.append({"id": "database", "name": "MongoDB", "type": "database", "configured": True,
                      "status": "healthy" if db_ok else "down"})
    overrides = await _cost_overrides()
    estimates = await _cost_estimates()
    for it in items:
        meta = _INTEGRATION_META.get(it["id"], {"billing": "flat", "default": 0.0, "budget": 0.0})
        if meta["billing"] == "metered":
            est = await _metered_llm_cost()
            editable = False
        else:
            # Precedence for flat fees: persisted per-integration estimate →
            # legacy console override → meta default.
            if it["id"] in estimates:
                est = estimates[it["id"]]
            else:
                est = float(overrides.get(it["id"], meta["default"]))
            editable = True
        est = round(est, 2)
        budget = float(meta.get("budget", 0.0))
        it["billing"] = meta["billing"]
        it["editable"] = editable
        it["est_cost_month_usd"] = est
        it["budget_month_usd"] = budget
        it["over_budget"] = bool(budget) and est > budget
    month_total = round(sum(float(i.get("est_cost_month_usd", 0) or 0) for i in items), 2)
    over = sum(1 for i in items if i.get("over_budget"))
    return {
        "integrations": items,   # console reads either key
        "items": items,
        "totals": {"est_cost_month_usd": month_total, "over_budget_count": over},
        "summary": {
            "day": round(month_total / 30, 2),
            "week": round(month_total / 4.3, 2),
            "month": month_total,
            "year": round(month_total * 12, 2),
        },
        "generated_at": _now(),
    }


class CostOverrides(BaseModel):
    overrides: dict


@admin_router.put("/integrations/costs")
async def update_integration_costs(body: CostOverrides):
    """Edit the FLAT-fee estimates only. Metered integrations (usage-based) are
    auto-computed and cannot be overridden."""
    applied: dict = {}
    rejected: list = []
    for k, v in (body.overrides or {}).items():
        if k in _FLAT_INTEGRATIONS and isinstance(v, (int, float)) and float(v) >= 0:
            applied[k] = round(float(v), 2)
        else:
            rejected.append(k)
    doc = await _db.admin_config.find_one({"_id": "integration_costs"}) or {}
    cur = doc.get("overrides", {}) or {}
    cur.update(applied)
    await _db.admin_config.update_one({"_id": "integration_costs"}, {"$set": {"overrides": cur}}, upsert=True)
    await _audit("integrations.costs.update", "integrations", {"applied": applied, "rejected": rejected})
    return {"overrides": cur, "applied": applied, "rejected": rejected, "editable": sorted(_FLAT_INTEGRATIONS)}


@admin_router.put("/integrations/{iid}/cost-estimate")
async def set_cost_estimate(iid: str, body: dict):
    """Persist a flat-fee monthly estimate for a single integration. Stored in
    `integration_cost_estimates` (keyed by integration id) and used by
    GET /integrations for flat items."""
    usd = max(0.0, float(body.get("usd", 0)))
    await _db.integration_cost_estimates.update_one(
        {"_id": iid}, {"$set": {"_id": iid, "usd": usd}}, upsert=True)
    await _audit("integrations.cost_estimate.set", iid, {"usd": usd})
    return {"ok": True, "id": iid, "usd": usd}


# --------------------------------------------------------------------------- #
#  Workout catalog (server-managed content the console manages)               #
# --------------------------------------------------------------------------- #
@admin_router.get("/catalog")
async def list_catalog():
    items = await _db.workout_catalog.find({}, {"_id": 0}).to_list(2000)
    return {"items": items}


@admin_router.get("/catalog/{item_id}")
async def get_catalog_item(item_id: str):
    w = await _db.workout_catalog.find_one({"id": item_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return w


class CatalogItem(BaseModel):
    id: str
    definition: dict


@admin_router.post("/catalog")
async def create_catalog_item(body: CatalogItem):
    if await _db.workout_catalog.find_one({"id": body.id}):
        raise HTTPException(status_code=409, detail="Workout id already exists")
    doc = {**body.definition, "id": body.id, "created_at": _now()}
    await _db.workout_catalog.update_one({"id": body.id}, {"$set": doc}, upsert=True)
    await _audit("catalog.create", body.id, {})
    return {"item": {k: v for k, v in doc.items() if k != "_id"}}


@admin_router.put("/catalog/{item_id}")
async def update_catalog_item(item_id: str, definition: dict):
    definition.pop("_id", None)
    definition["id"] = item_id
    definition["updated_at"] = _now()
    res = await _db.workout_catalog.update_one({"id": item_id}, {"$set": definition}, upsert=True)
    await _audit("catalog.update", item_id, {"upserted": res.upserted_id is not None})
    return {"item": definition}


@admin_router.delete("/catalog/{item_id}")
async def delete_catalog_item(item_id: str):
    res = await _db.workout_catalog.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    await _audit("catalog.delete", item_id, {})
    return {"deleted": item_id}


# --- Per-rider workout copies (coach assigns / edits on a rider's behalf) ---- #
async def _resolve_wk_for(user_id: str, wid: str) -> Optional[dict]:
    c = await _db.rider_workouts.find_one({"user_id": user_id, "id": wid}, {"_id": 0, "user_id": 0})
    if c:
        return c
    return await _db.workout_catalog.find_one({"id": wid}, {"_id": 0})


@admin_router.get("/riders/{user_id}/workouts")
async def list_rider_workouts(user_id: str):
    items = await _db.rider_workouts.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(2000)
    return {"items": items}


@admin_router.post("/riders/{user_id}/workouts/{workout_id}/assign")
async def assign_rider_workout(user_id: str, workout_id: str):
    """Coach/console: create a rider-scoped copy of a workout (copy-on-assign)."""
    if not await _db.users.find_one({"user_id": user_id}):
        raise HTTPException(status_code=404, detail="Rider not found")
    src = await _resolve_wk_for(user_id, workout_id)
    if not src:
        raise HTTPException(status_code=404, detail="Workout not found")
    doc = {k: v for k, v in src.items() if k != "seeded_at"}
    doc["id"] = workout_id
    doc.setdefault("origin_id", workout_id)
    doc["assigned_at"] = _now()
    doc["assigned_by"] = auth.require_user().get("email")
    await _db.rider_workouts.update_one(
        {"user_id": user_id, "id": workout_id}, {"$set": {**doc, "user_id": user_id}}, upsert=True)
    await _audit("rider.workout.assign", user_id, {"workout_id": workout_id})
    return {"assigned": workout_id, "workout": {k: v for k, v in doc.items() if k != "user_id"}}


_CATALOG_EDITABLE = {"name", "typeId", "typeName", "color", "icon", "duration", "tss", "if",
                     "difficulty", "description", "focus", "zones", "level", "environment", "segmentSpec"}


@admin_router.put("/riders/{user_id}/workouts/{workout_id}")
async def edit_rider_workout(user_id: str, workout_id: str, body: dict):
    """Coach/console: edit a rider's copy (auto-forks from global on first edit)."""
    existing = await _db.rider_workouts.find_one({"user_id": user_id, "id": workout_id}, {"_id": 0, "user_id": 0})
    if not existing:
        src = await _resolve_wk_for(user_id, workout_id)
        if not src:
            raise HTTPException(status_code=404, detail="Workout not found")
        existing = {**{k: v for k, v in src.items() if k != "seeded_at"}, "origin_id": workout_id}
    patch = body.get("patch", body) if isinstance(body, dict) else {}
    for k, v in patch.items():
        if k in _CATALOG_EDITABLE:
            existing[k] = v
    existing["id"] = workout_id
    existing["edited_at"] = _now()
    existing["edited_by"] = auth.require_user().get("email")
    await _db.rider_workouts.update_one(
        {"user_id": user_id, "id": workout_id}, {"$set": {**existing, "user_id": user_id}}, upsert=True)
    await _audit("rider.workout.edit", user_id, {"workout_id": workout_id})
    return {"workout": {k: v for k, v in existing.items() if k != "user_id"}}


@admin_router.delete("/riders/{user_id}/workouts/{workout_id}")
async def reset_rider_workout(user_id: str, workout_id: str):
    res = await _db.rider_workouts.delete_one({"user_id": user_id, "id": workout_id})
    await _audit("rider.workout.reset", user_id, {"workout_id": workout_id})
    return {"reset": workout_id, "reverted": res.deleted_count > 0}
