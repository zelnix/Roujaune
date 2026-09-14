# ROUJAUNE Production Readiness Report

**Date:** 2026-09-14 | **Scope of this pass:** Phase 1 (Security) - complete. Phase 2 (Permanent regression tests) - critical items complete, full-suite triage still open. Phases 3-10 - not yet started (scoped below).

---

## FINAL RECOMMENDATION: NOT READY for public release yet - but the release-blocking security work IS done.

Nothing found in this pass is a P0 that's still open. What remains (114 pre-existing broken tests, native device sign-off, CI gate, docs) is real work, but none of it is "the app is currently insecure" - it's "we don't yet have proof/coverage/process for everything else."

---

## 1) What was fixed

Security (all verified working, zero regressions):
- Rotated the live admin console password (old value -> new random value) - it was hardcoded in git history AND 12 currently-tracked files on the public GitHub repo. Old value now returns 401; scrubbed from all tracked files.
- Fixed a broken-object-level-authorization bug (SEC-001): 5 MongoDB collections (plan_templates, plan_skips, plan_undo, coach_pending_confirm, notification_reads) were missing from the per-user data-scoping allowlist - any authenticated rider could read every other rider's saved plan templates, and could collide with their skip/undo/notification state.
- Fixed a second cross-user bug (SEC-002): ride_photos.py imported the raw, unscoped DB handle instead of the scoped one - a rider who learned another rider's ride_id could list/upload/delete photos on it.
- Fixed a ReDoS in the admin user-search endpoint (unescaped regex input).
- Cleaned up 2 dead/stale hardcoded tokens in test files (already-inactive, but bad hygiene + one was testing a mechanism that no longer exists in the code).
- Bonus catch during regression verification: found and fixed a real, currently-live bug (not part of the original security scope) - on the demo account's catalog plan, tapping any calendar day's workout card would silently show the WRONG workout ("Threshold Climb") instead of the tapped day's actual session, because that plan's calendar data has no workout_id field and an empty-string param was being treated as "not provided." Fixed in calendar.tsx/training.tsx/workout.tsx; verified end-to-end on both account types.

Full detail, file/line references, and severity for every item: /app/SECURITY_AUDIT_REPORT.md.

## 2) Tests added (permanent, committed to the repo)
- backend/tests/conftest.py - loads .env before test collection (so credentials are read from env, never hardcoded again).
- backend/tests/test_security_audit_2026_isolation.py - 3 tests proving SEC-001/SEC-002 stay fixed (plan-template cross-user read/delete, notification read-state isolation, ride-photo cross-user list/upload/delete).
- frontend/scripts/workout-resolution.test.mjs - 4 assertions proving an unknown/custom workout id can never silently resolve to an unrelated catalog/demo workout (the explicit release-blocking test requested). Run with `node frontend/scripts/workout-resolution.test.mjs`.
- Removed hardcoded secrets from 11 existing test files (now read from env) - no test behavior changed except test_admin_service_token.py, which was corrected to test the current auth mechanism instead of a retired one.

## 3) Tests passed
- Verified by automated test: admin password rotation (old->401, new->200), SEC-001 (3/3), SEC-002 (1/1), HARD-4 ReDoS fix, test_admin_service_token.py (20/20), workout-resolution contract (4/4), full affected admin/plan test suites (53/55 - 2 failures are pre-existing stale assertions, see below).
- Verified by code inspection: CORS credential exposure (Bearer-only auth means low risk as-is), token-in-query usage scope (limited to a few read-only image routes), every call site of the 5 newly-scoped collections (confirmed no unsupported Motor method usage that scoping would have broken).
- Verified by testing_agent (browser/E2E, live preview): full re-verification pass - admin console login/list/detail with new password, coach chat, plan-template save/list/delete, ride-photo same-user flows, and the calendar->training->live-ride workout-resolution flow on both a catalog-plan account (demo) and a structured-plan account (greenlantern). All pass after fixes.

## 4) Security findings (severity)
| Severity | Count | Status |
|---|---|---|
| P0 | 1 | Fixed |
| P1 | 1 | Fixed + permanently regression-tested |
| P2 | 3 | Fixed |
| P3 | 5 | 1 fixed, 4 documented backlog (CORS allowlist, auth rate-limiting, token-in-URL, git-history purge) |

Full detail: /app/SECURITY_AUDIT_REPORT.md.

## 5) Remaining risks (honest gaps, not hidden)
- A full run of the entire backend test suite (785 tests) found 114 pre-existing failures + 3 errors, unrelated to this security pass (rigorously confirmed via `git stash` - identical failures with the security fixes removed). Root causes: ~60+ are legacy tests written before the app enforced auth on every route (they send unauthenticated requests, now correctly get 401); ~15 are stale/environment-dependent assertions (exact counts, timing); a handful trace to one real bug - the coach's create-plan LLM call intermittently returns malformed JSON (502). This means "green CI" isn't meaningful yet - a real Phase 2 triage pass is needed before any test-based release gate can be trusted.
- CORS is wide open (`*`) - low risk today (Bearer-only auth, no cookies) but should be locked to an explicit origin allowlist before public launch.
- No rate limiting on login/register/forgot-password/admin-login.
- Git history still contains the old (now-inert) admin password - cosmetic risk only; purging requires a force-push I can't perform from this sandbox (no GitHub remote access here).
- No automated E2E test framework is committed to the repo yet (Playwright isn't a dependency here) - the current regression safety net is backend pytest + this session's testing_agent-driven manual verification, not a repo-committed, CI-runnable E2E suite.

## 6) Native tests YOU must perform (I cannot do these from this sandbox)
Per the features_requiring_native_build rule - none of the following can be validated in Expo Go or the web preview; they require an actual build via the Publish button and a real device:
- Bluetooth: heart-rate/cadence/power sensor connect, disconnect, reconnect, background/foreground transitions, dropout handling, multiple simultaneous sensors.
- Auth on-device: Google/Apple sign-in, session expiry/logout/re-login on a real device (the web preview mocks/short-circuits some of this).
- App lifecycle: cold start, background/resume, network loss/recovery, screen lock, incoming-call interruption, a long (60+ min) uninterrupted ride session.
- Media: background audio, YouTube/Scenic Cycling video playback, Bluetooth audio routing.
- Notifications: permission prompts, scheduled/workout-reminder delivery, deep links, background delivery - also requires google-services.json to be supplied before this can even be wired up.
- IAP/subscriptions: real sandbox purchase, restore, cancellation, expiry, entitlement refresh, account switch, offline behavior - on both Android (Play Console sandbox tester) and iOS (App Store Connect sandbox tester).

I've kept app.json permissions/entitlements in a build-ready state; I have not changed anything here in this pass since no native-facing code was touched.

## 7) Exact release blockers today
None that I found are still open. The one P0 (exposed admin credential) is fixed and verified. If you want a stricter bar: the 114 pre-existing test failures mean I cannot currently promise "the whole regression suite is green," which I'd treat as a process blocker (can't safely automate the release gate yet) even though it isn't a security blocker.

---

## What's NOT done yet (the rest of the original 11-phase brief)
Given the true scope this pass uncovered (114 broken tests alone is a multi-day triage), I stopped here deliberately rather than spreading thin across everything below. Proposed order for the next pass:

- Phase 2 (finish): triage the 114 pre-existing failures (mostly: add login steps to legacy test files, or retire ones superseded by newer iter-numbered files); fix the coach create-plan intermittent JSON-parse 502.
- Phase 3: extend multi-user isolation tests to the remaining domains explicitly listed in your brief (analytics, Scenic data, uploaded files, subscriptions) - SEC-001/SEC-002 covered the two I found; a systematic sweep of every collection against every route is the next step.
- Phase 5: the full signup->...->logout release-regression script (new + existing user, empty states, offline/API-failure states).
- Phase 6: light Coach/Analysis/Scenic/Benchmark hardening (routes->services split), no rewrite.
- Phase 7: frontend warning cleanup (pointerEvents, useNativeDriver, SVG Infinity, overflow).
- Phase 8: Scenic POI image-validation review.
- Phase 9: README -> full engineering/release doc.
- Phase 10: `.github/workflows/` CI gate in zelnix/Roujaune (lint/type-check/test/secret-scan) - real, committed to the repo, not just drafted, per your instruction.
- Phase 4 & IAP: requires you to build and test on real devices per section 6 above - I'll prep anything build-related when you're ready to trigger it.

## Sign-offs (per your 5 criteria)
| # | Criteria | Status |
|---|---|---|
| 1 | Security - no known P0/P1, credentials rotated | Signed off |
| 2 | Automated regression - critical journeys permanently covered | Partial - the specific custom-workout regression is now permanently covered; the broader suite has 114 pre-existing gaps still open |
| 3 | Native - Android/iOS tested on real devices | Not started - requires your build + device testing (I can't do this) |
| 4 | Data integrity - auth/authz/isolation independently verified | Signed off for the areas audited (2 real bugs found + fixed + regression-tested); a full collection-by-collection sweep (Phase 3) is recommended before calling this exhaustive |
| 5 | Release - CI/CD gate + rollback documented | Not started |

Bottom line: the app is meaningfully more secure and correct than it was this morning, with real bugs found and fixed (not just theoretical hardening). It is not yet at the "confidently ship" bar you set - mainly because of the newly-discovered test-suite debt and the native/CI/doc work that hasn't started.
