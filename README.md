# ROUJAUNE

A cycling **training + scenic-riding** companion app for riders 50+, led by an AI coach
(Alberto/Adriana). Built with Expo (React Native) + FastAPI + MongoDB.

Full technical architecture, data model, routes, and integrations: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Status

**Pre-release / Release Candidate hardening.** See **[PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md)**
for the current READY / NOT READY assessment and open blockers, and
**[SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)** for the security sign-off.

## Repository layout

```
backend/    FastAPI app (Motor/MongoDB), all routes under /api
frontend/   Expo Router app (React Native, TypeScript)
.github/workflows/ci.yml   CI release gate (secret-scan, backend tests, frontend lint+typecheck)
```

## Local development

Both services run under `supervisor` in the dev environment — you should not need to start
them manually. If you do need to:

```bash
# Backend (FastAPI on :8001, all routes prefixed /api)
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (Expo, served on :3000 for web preview + QR code for Expo Go)
cd frontend && npx expo start
```

Environment variables live in `backend/.env` and `frontend/.env`. **Never hardcode URLs, ports,
or secrets in code** — see `ARCHITECTURE.md` → "Runtime / URLs" for the protected variables.

## Running the backend test suite

```bash
cd backend
export EXPO_PUBLIC_BACKEND_URL=<your preview URL or http://localhost:8001>
python -m pytest tests/ -q
```

This is a full HTTP integration suite (registers real riders, calls real endpoints) — it needs
the backend actually running and reachable at that URL. Current baseline: **826 passed, 2
skipped, 0 failed** (see `PRODUCTION_READINESS_REPORT.md` for the latest confirmed count).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`/`master`:

1. **secret-scan** — gitleaks over the full diff.
2. **backend-tests** — restores a MongoDB fixture (`backend/tests/fixtures/ci_seed.archive`),
   boots the real backend, runs the full pytest suite.
3. **frontend-checks** — `yarn lint` + `tsc --noEmit`.

Required GitHub Actions secrets and known limitations are documented in the workflow file's
header comment. This is the permanent release gate — a red run means the underlying issue must
be fixed, not the gate weakened.

## Conventions

- All backend routes under `/api`; per-rider data is read/written via the `udb` scoped proxy
  (`from auth import udb`) — **never** manually filter by `user_id` on a raw `db` handle, and
  never write rider-initiated changes into a shared/global collection (this exact mistake was
  found and fixed once already — see `PRODUCTION_READINESS_REPORT.md`, 2026-09-15 entry).
- New rider-owned collection → add it to `auth.USER_SCOPED` immediately.
- Frontend: `expo-router` screens in `app/`; everything else in `src/`. React Native components
  only — no web-only libraries, no CSS files, `StyleSheet.create()` only.
- No new features during the current hardening phase — see `PRODUCTION_READINESS_REPORT.md` for
  what's explicitly in scope right now.

## Test accounts

See `/app/memory/test_credentials.md` (gitignored, not committed) for current demo/QA/admin
credentials.
