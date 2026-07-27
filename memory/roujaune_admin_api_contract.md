# Roujaune — Admin API Contract (Harmony Wellness Group console)

**App:** Roujaune (`roujaune`) · cycling training for riders 50+
**Bundle/package:** `com.hgw.roujaune`
**Status of this document:** DRAFT contract for integrating Roujaune into the HWG group admin console.
It marks clearly what **EXISTS today** vs what must be **BUILT** before the console can safely manage this app.

> ⚠️ **Reality check (from the architecture/security review):** Roujaune currently has **no admin role, no RBAC, and the plan-management routes are publicly writable by any authenticated rider** (finding F-01). The preview backend uses a **pod-local MongoDB `test_database`** that is not a managed/persistent datastore. This contract therefore describes the **target `/api/admin/*` surface** to build, plus the existing endpoints it will wrap.

---

## 1. Environments & routing

| Item | Preview (current) | Production (to provision) |
|---|---|---|
| API base | `https://roujaune-train.preview.emergentagent.com/api` | Stable HWG production URL (TBD) |
| Backend | FastAPI on `0.0.0.0:8001`, ingress routes `/api/*` | Same, managed host |
| Database | MongoDB `localhost:27017`, db `test_database` (pod-local) | Managed MongoDB (e.g. Atlas) |
| CORS | `allow_origins=["*"]` (F-12) | Allow-list the console origin(s) only |
| OpenAPI | expose at `/api/openapi.json` (currently `/openapi.json` not reachable via ingress) | same |

All admin calls MUST be `/api`-prefixed (ingress rule) and target `/api/admin/*`.

---

## 2. Authentication (console → Roujaune) — PICK ONE

The console authenticates as a **machine/admin identity**, never a rider login.

- **Option A — Group SSO / OIDC (recommended).** HWG provides: issuer URL, JWKS URI, `client_id`, expected `aud`, and the admin `role`/`group` claim. Roujaune validates the console's bearer JWT and maps the claim → admin.
- **Option B — Service API key / signed service JWT.** Shared secret sent as `Authorization: Bearer <service-jwt>` or `X-Admin-Key: <key>`. Stored in `backend/.env` (must be git-ignored — F-08). Simplest to stand up.
- **Option C — mTLS.** Only if HWG mandates it.

**Required from HWG to implement:** chosen option + its credentials/endpoints, plus the console origin URL(s) for CORS.

Enforcement: a reusable `require_admin` FastAPI dependency on every `/api/admin/*` route.
Roles to add on `users`: `role: "rider" | "support" | "admin"` (today the `users` doc has **no** role field).

---

## 3. Authorization matrix (target)

| Capability | rider | support | admin | console (service) |
|---|---|---|---|---|
| Own rider data (CRUD) | ✅ | read | read | read |
| List/search users | ❌ | ✅ | ✅ | ✅ |
| Suspend / delete / export user | ❌ | limited | ✅ | ✅ |
| Manage training plans (global) | ❌ | ❌ | ✅ | ✅ |
| Manage workout catalog/content | ❌ | ❌ | ✅ | ✅ |
| Manage coach (Alberto/Adriana) config | ❌ | ❌ | ✅ | ✅ |
| Edit benchmark thresholds/config | ❌ | ❌ | ✅ | ✅ |
| Read metrics / health | ❌ | ✅ | ✅ | ✅ |
| Read audit log | ❌ | ✅ | ✅ | ✅ |

---

## 4. Standard conventions

- **Auth header:** `Authorization: Bearer <token>` (or `X-Admin-Key`).
- **Content type:** `application/json`.
- **IDs:** users = `user_id` string (`user_<12 hex>`); demo/legacy singleton = `user_greenlantern`.
- **Timestamps:** ISO-8601 UTC.
- **Errors:** `{ "detail": "<message>" }` with standard HTTP codes (400/401/403/404/409/422/5xx).
- **Pagination:** `?limit=&cursor=` returning `{ items: [...], next_cursor }` (to add).
- **Idempotency:** admin writes should accept `Idempotency-Key` header.
- **Audit:** every admin write records to `admin_audit` (actor, action, target, before/after, ts). Does NOT exist yet.

---

## 5. Endpoint surface

Legend: **[EXISTS]** live today · **[WRAP]** exists but must be gated/moved under admin · **[BUILD]** new.

### 5.1 Health / contract
- `GET /api/openapi.json` — **[BUILD]** expose OpenAPI for contract import.
- `GET /api/admin/health` — **[BUILD]** `{ status, db, version, uptime }`.

### 5.2 Users
- `GET /api/admin/users?limit=&cursor=&q=` — **[BUILD]** list/search (fields: `user_id,email,name,provider,assigned_plan_id,onboarded,email_verified,created_at,role`).
- `GET /api/admin/users/{user_id}` — **[BUILD]** profile + summary (rider_profile, plan, latest benchmark).
- `PATCH /api/admin/users/{user_id}` — **[BUILD]** set `role`, `assigned_plan_id`, suspend flag.
- `POST /api/admin/users/{user_id}/export` — **[BUILD]** GDPR export of all user-scoped docs (also needed for riders — F-07).
- `DELETE /api/admin/users/{user_id}` — **[BUILD]** erase user + all user-scoped collections + sessions (F-07).

### 5.3 Training plans (global `plans` collection)
> Existing routes live in `plans_admin.py` and are **UNGATED (F-01)** — wrap under admin.
- `GET /api/plans` / `GET /api/plans/{id}` — **[WRAP]**
- `POST /api/plans` — **[WRAP]** create
- `PUT /api/plans/{id}` — **[WRAP]** replace
- `PATCH /api/plans/{id}` — **[WRAP]** partial
- `DELETE /api/plans/{id}` — **[WRAP]** delete
- `PUT /api/plans/{id}/weeks/{number}` — **[WRAP]** week edit
- Note: plans are **shared** across riders; rider-initiated edits should target per-user copies (design fix), console edits the master.

### 5.4 Workout catalog / content — **[BUILD]**
- `GET/POST/PUT/DELETE /api/admin/workouts` — currently workout content is largely in `frontend/src/lib/workout-catalog.ts` (client) + plan defs; expose a server-managed catalog if the console must edit it.

### 5.5 Coach (Alberto/Adriana) config — **[BUILD]**
- `GET/PUT /api/admin/coaches` — persona name/gender/voice/style + **safety-policy** text. Today prompts are hard-coded in `server.py` (`coach_system`, `coach_chat_system`). Presentation config MUST NOT alter safety rules.

### 5.6 Benchmark config — **[BUILD]**
- `GET/PUT /api/admin/benchmark/config` — expose retest windows & thresholds currently hard-coded as `BM_RETEST_DAYS`, `FTP_RETEST_DAYS`, `BM_*` tables in `server.py`.

### 5.7 Metrics — **[BUILD]**
- `GET /api/admin/metrics` — counts (users, active plans, benchmarks), error/latency snapshots. No PII/health data in metrics.

### 5.8 Audit — **[BUILD]**
- `GET /api/admin/audit?limit=&cursor=` — admin action log.

### 5.9 Not applicable (features absent)
- **Community moderation** — `/api/community` is static read-only demo data; no UGC/report/block backend. N/A until built.
- **Subscriptions/entitlements** — no payment code exists. N/A until built.

---

## 6. Data dictionary (MongoDB collections)

Owner field is `user_id` on user-scoped collections. `plans` is **global/shared** (no owner).

| Collection | Scope | Key fields (non-exhaustive) |
|---|---|---|
| `users` | global | user_id, email, name, picture, provider, password_hash, role*(to add), assigned_plan_id, onboarded, email_verified, created_at |
| `user_sessions` | global | session_token, user_id, expires_at (TTL index) |
| `plans` | global (shared) | id, title, label, phases, weeks, workouts, goals, created_at |
| `rider_profile` | per-user | name, weight_kg, age, gender, city/region/country, capability |
| `benchmark_profile` | per-user | ftp, zones, lastBenchmarkDate, per-metric values |
| `benchmark_results` | per-user | id, primaryMetric{key,value,confidence}, decision, createdAt |
| `benchmark_sessions` | per-user | id/sid, test flow state |
| `benchmark_week` | per-user | id="current", active, startDate, days[] |
| `daily_checkins` | per-user | id="latest", checkin{sleep,energy,soreness,stress,symptoms…} |
| `coach_chats` | per-user | coach, messages[] (contains health context) |
| activity/ride docs | per-user | provider sync + ride telemetry |

*`role` not present yet. Note naming inconsistency: backend snake_case vs camelCase inside benchmark docs.*

---

## 7. Privacy / data-handling flags (console must respect)
- **Health/wellness data** (HRV, resting HR, stress, symptoms, FTP) is sensitive; console access must be role-gated + audited.
- Rider health/wellness fields are sent to the **third-party LLM** as prompt input (Emergent → Anthropic). Consent capture is **missing (F-07)**.
- **No PII/health data** in logs, metrics, notifications, or error messages.
- Account **deletion & export** must cascade to all user-scoped collections + sessions.

---

## 8. Build checklist (prereqs before console integration)
1. Add `role` to `users` + `require_admin` dependency.
2. Create `/api/admin/*` router; **wrap** `plans_admin` CRUD behind it (fixes F-01).
3. Implement chosen auth adapter (OIDC verifier or service key).
4. Add `admin_audit` collection + writes on every admin mutation.
5. CORS allow-list the console origin (replace `*`).
6. Expose `/api/openapi.json`.
7. Add user export/delete endpoints (also satisfies rider GDPR gaps).
8. Provision managed production MongoDB + stable prod API URL + secrets vault.

---

## 9. What HWG must provide to Roujaune
1. Auth model choice (A/B/C) + credentials (OIDC issuer/JWKS/client_id/aud/claims, **or** service key, **or** mTLS certs).
2. Console origin URL(s) for CORS.
3. Day-1 admin capabilities required (from §5).
4. Group conventions: user-ID format, `admin_audit` schema, required headers, role names.
5. Production infra decisions: managed DB, prod domain, secrets store, `google-services.json` for `com.hgw.roujaune` (Android push).

---
_Last updated: 2026-06 · Source of truth: Roujaune backend (`/app/backend`) + app.json. Sections marked [BUILD]/[WRAP] are not yet implemented._
