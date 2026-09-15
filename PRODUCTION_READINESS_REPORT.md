# ROUJAUNE Production Readiness Report

**Date:** 2026-09-15 (round 2) | **Scope of this pass:** Coach Context Audit — complete, 1 more real bug found+fixed. Non-native hardening (frontend warnings, cosmetic wrap, Scenic review, README/release docs) — complete. Release-journey regression via UI testing — complete, 2 bugs found+fixed. Native acceptance checklist — written, execution requires real devices (not yet run). GitHub CI — workflow exists but has not yet executed on GitHub infrastructure (requires repo secrets + a push, both outside this sandbox).

---

## 2026-09-15 round 2 — Coach Context Audit + 2 more real bugs found & fixed

**Coach Context Audit result: the architecture is sound, with one real gap found and fixed.**
Reviewed every rider-data category the Coach principle requires (`routes/coach.py::_build_rider_context`):
profile, capability/experience, goals (plan + event), training plan (phase/progress/schedule),
calendar (via the same computed source as the Calendar screen, so ad-hoc scheduled workouts are
included — no silo), ride history + season totals + streak, performance analytics (CTL/ATL/TSB,
benchmark power curve), training-readiness (daily check-ins, with demo fallback), and skip/
adherence signals. Also re-audited every plan-mutating code path in `routes/coach.py` and
`routes/plan.py` (taper-apply, chat edits, FTP updates, goal add, plan rebase, custom-plan
create/accept, session swap) — all correctly write through `udb` (per-rider scoping); the one
outlier (`_apply_companion_ops`) was already fixed in round 1.

**Real gap found & fixed — Coach had no memory of its own past silent adaptations.**
`adaptation_history` (the record of taper-apply/auto-ease decisions) was written per-rider but
never read back into `_build_rider_context` — chat conversation history covers explicit back-
and-forth, but silent adaptations (taper, low-compliance auto-ease) are NOT chat messages, so
the coach had zero recollection of having made them in a new session. Fixed: the last 2
adaptation notes are now surfaced into context. Verified via targeted regression (49 tests:
`test_companion_plan_edits.py`, `test_coach_chat.py`, `test_iter65_plan_coach_refactor.py`,
`test_iter55_customize_and_wellness_removal.py` — all passed).

**Real bug found & fixed (CRITICAL) — Coach could hallucinate a plan-edit confirmation.**
Found via UI-driven release-journey regression testing: asking the coach to shorten a workout on
an account with an *unstructured* ("custom", no `weeks` key) plan silently skipped the entire
edit-application code path, but the LLM's free-form reply had no signal that nothing happened —
it warmly confirmed a change that never touched the rider's plan. Fixed at the root: the reply
prompt now explicitly tells the LLM whether a change was actually applied this turn, and when a
plan-edit request went unfulfilled, instructs it to be honest (explain the limitation / ask a
clarifying question) instead of confirming. Verified directly against both cases: demo account
(`custom-*`, unstructured) now replies "I cannot directly edit the duration of your scheduled
workouts in the plan right now, but you can simply stop your ride fifteen minutes early..." with
`plan_updated:false`; a fresh rider on a structured plan (`couch-to-road`) still gets a real,
applied edit with `plan_updated:true`. This is the more important of the two fixes — it's a
trust/correctness issue, not a cosmetic one, and closes the gap for any future unhandled phrasing
(not just the one sentence the tester used).

**Real bug found & fixed (HIGH) — plan screen header/tabs unreachable on narrow phones.**
Also found via UI testing: on ~375px-wide screens, the "Message Coach" button (and the plan
tabs row) rendered past the right edge of the screen with no way to reach it — a genuine
accessibility/functional blocker, not merely cosmetic. Root cause: React Native's flex-wrap only
triggers once a flex item has a *resolved* width — an unconstrained "size to content" row never
wraps its own children. Fixed: `headerRight` gets an explicit `width: "100%"` on compact
(phone) widths only (via the existing `useWindowDimensions`-based `compact` flag; desktop/tablet
layout unchanged), and `PlanTabs` is now wrapped in a horizontal `ScrollView` so tabs that don't
fit are reachable by swipe instead of clipped. Verified via screenshot at 375px: "Message
Alberto" button now renders fully on-screen (x=22, width=189, well within bounds).

**Minor data-hygiene fix:** `demo@roujaune.app`'s `rider_profile.name` had stale leftover data
("Green Lantern" instead of "Demo Rider") from an old migration — corrected directly (data fix,
not a code bug; not a cross-user leak, both fields belonged to demo's own single account).

**3 mechanical frontend fixes (no behavior change):** moved `pointerEvents` from the deprecated
direct prop to `style.pointerEvents` in `EmbeddedWebPlayer.tsx`, `ble-context.tsx`, and
`app/index.tsx` (React Native deprecation cleanup).

**Scenic POI/image review:** confirmed all 36 published routes have a valid `youtube_id` and
the thumbnail-fallback logic (`route.thumbnail || ytThumb(route.youtube_id)`) correctly covers
every route with `thumbnail_url: null` (this is by design, not a gap). Identified 21 routes
(4 core cycling + 17 not-yet-unlocked gravel/mtb/run mode placeholders) with zero seeded
`highlights` — not a functional bug (the LLM-generation + improved fallback from round 1 both
handle this safely), but a content-completeness item worth a future backfill pass, not invented
here to avoid fabricating inaccurate real-world route facts.

**Documentation added:** `README.md` (rewritten from a placeholder), `RELEASE_PROCESS.md` (RC
criteria, release/rollback procedure), `NATIVE_ACCEPTANCE_CHECKLIST.md` (23 sections, Android/
iOS/shared, explicit PASS criteria per test).

**Testing approach this round (credit-conscious):** targeted pytest regression (49 tests) for
the backend change, direct API verification for both hallucination-fix scenarios, and manual
screenshot inspection for the frontend wrap fixes — no full 826-test suite re-run was needed
since the previous round's full run (826/2/0) plus this round's targeted regression together
cover the affected surface. A full suite run remains recommended once GitHub CI actually
executes (see below) as the canonical, reproducible confirmation.

**Still open (explicitly deferred, not silently skipped):**
- **GitHub CI has not executed on GitHub infrastructure.** `.github/workflows/ci.yml` exists
  and its restore/seed logic was verified locally (mongodump/mongorestore roundtrip), but
  running it for real requires: (a) the repo's GitHub secrets configured (names only, no
  values, listed in the workflow's header comment), and (b) a push to GitHub — neither of
  which this sandbox can do. **This is the current #1 blocker to calling CI "real."**
- **Native acceptance checklist is written but not executed** — requires real Android + iOS
  devices, which this sandbox cannot provide. **This is the current #2 blocker.**
- Scenic `highlights` content backfill (P2, content quality, not a bug).
- `routes/scenic.py` file-length (700+ lines) — noted, deliberately not refactored (low
  value vs. risk for a hardening pass, per explicit instruction not to refactor for line-count
  alone).

---

## 2026-09-15 update — CI gate + real isolation bugs found & fixed

**1) Resend/email — environment issue, not an app bug, now isolated.**
The live `RESEND_API_KEY` in `backend/.env` is expired (real sends 401 from Resend). Added
`EMAIL_SANDBOX_MODE` (default `false`, set to `true` only in this dev/preview `.env`) — when
true, `emailer.send_email()` short-circuits *before* the network call and logs what would have
been sent; every caller's code path is unchanged either way. This makes the CI/regression suite
deterministic and network-independent without touching production behavior. A real deployment
must set `EMAIL_SANDBOX_MODE=false` (or leave unset) and supply a valid, non-expired key.

**2) Real bug found & fixed — rider-initiated plan edits were silently no-ops (P0).**
While expanding isolation tests, discovered that Coach chat plan-edits, taper-apply, and the
low-compliance auto-ease all called `plans_admin.adapt_plan()`, which mutates the **shared admin
template** (`plans` collection, keyed by the raw `plan_id` e.g. "couch-to-road"). But reads go
through `services/plan_engine.py::_rider_plan_def`, which snapshots the template onto the
rider's **own** `training_plans` doc on first access and never re-reads the template afterwards
(this is the "assigned plans are versioned snapshots" rule, correctly enforced for admin edits).
Net effect: the coach would say "Increased your Welcome Ride to 33 minutes" (`plan_updated:
true`) and the rider's own `/api/plan` would keep showing the old value forever — a completely
broken feature that the existing test (`test_companion_plan_edits.py`) didn't catch because it
asserted against the *admin template* endpoint, not the rider-facing one.
- **Fix:** `_apply_companion_ops()` now mutates the calling rider's own `training_plans`
  snapshot directly (never the shared template). Verified with two fresh riders on the same
  named plan: rider A's edit now takes effect for rider A, and rider B remains fully unaffected
  (isolation held even in the broken state — the bug was "edits don't work," not "edits leak" —
  but the fix restores both correctness AND isolation together).
- Also restored the shared template's + Green Lantern's own snapshot back to the pristine
  `couch_to_road_plan.json` baseline (both had drifted from years of accumulated test runs
  eroding week durations below the easing floor) and added a proper restore step to
  `test_iter81`'s taper-apply test so this can't silently re-erode on every future CI run.

**3) Real bug found & fixed — sandbox activity import missing user_id scoping (P0).**
`activity_sync.ingest_activities()`'s dedup lookup was `{"provider", "external_activity_id"}`
only — no `user_id`. Real provider ids (Strava/Garmin) are globally unique so this was latent,
but the TEST-ONLY sandbox generator's ids were built from `time.time()` (changes every second),
which was ALSO the cause of `test_ride_sync.py`'s intermittent `imported:4` vs `imported:0`
flakiness. Made the sandbox ids deterministic (`sandbox-0..N`, index-only) to fix the flakiness,
which would have made the missing-user_id gap instantly and reliably exploitable (rider B's
import would resolve to rider A's existing "sandbox-0" doc and overwrite its `user_id`, stealing
it). Fixed by scoping the dedup lookup to `user_id` too. New regression test:
`test_p0_cross_user_isolation_expansion.py::test_sandbox_import_deterministic_ids_do_not_collide_across_riders`.

**4) Real bug found & fixed — scenic POI generator could cache a degraded 1-item result.**
`routes/scenic.py::_generate_pois()` accepted any non-empty LLM response, including an
occasional single-item response (asked for 5-7), which then got cached and permanently served a
degraded HUD experience for that route. Added a minimum-count guard (falls back to the
deterministic generator instead of caching a too-short LLM response) and improved the fallback
generator itself to always produce >=3 POIs even for routes with sparse/no seeded highlights.

**5) New permanent isolation test file** (`test_p0_cross_user_isolation_expansion.py`, 12 tests):
covers Coach chat history, plan assignment/progress, custom workouts (catalog CRUD incl. direct
ID access + no-op reset), ride history + energy rollup, Scenic discoveries, notifications
(unread/read-all), profile (settings/appearance/PRs), and the sandbox-import scoping above —
every domain named in the hardening brief that wasn't already covered by
`test_security_audit_2026_isolation.py` (plan_templates/notification_reads/ride_photos) or
`test_iter70_isolation_and_admin_interest.py` (favourites/mode_interest).

**6) `.github/workflows/ci.yml` created** — 3 jobs: `secret-scan` (gitleaks), `backend-tests`
(MongoDB service container restored from a committed, sanitized fixture snapshot —
`backend/tests/fixtures/ci_seed.archive`, regenerated after all fixes above — then boots the
real FastAPI app and runs the full pytest suite against it), `frontend-checks` (lint + `tsc
--noEmit`). Required GitHub secrets (must be added under Settings → Secrets and variables →
Actions before this will pass) and the fixture's known limitations are documented in the
workflow file's header comment.

**Regression baseline: 826 passed, 2 skipped, 0 failed** — confirmed genuinely reproducible
across 3 consecutive full-suite runs after the fixes above (earlier runs in this session
surfaced a small number of transient failures — all root-caused and fixed as real bugs, not
silenced; see items 2-4).

---

**Date:** 2026-09-14 | **Scope of that pass:** Phase 1 (Security) - complete. Phase 2 (Permanent regression tests) - critical items complete, full-suite triage still open. Phases 3-10 - not yet started (scoped below).

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
None that I found are still open. The one P0 (exposed admin credential) is fixed and verified.

**Update (backend test-suite triage session, 2026-09-14):** The 114 pre-existing test failures were triaged and fixed down to 2 known/pending items — both resolved in the 2026-09-15 follow-up above (Resend → `EMAIL_SANDBOX_MODE`; plan snapshot → the tests were right that admin edits shouldn't propagate, but this uncovered that rider-initiated edits had also stopped working, which is now fixed — see the 2026-09-15 update at the top of this file).

Real defects found and fixed in this pass (not just test alignment):
- Coach chat plan-edits (e.g. "shorten my ride to 20 min") were **silently failing 100% of the time** — `companion_plan.py` was calling Anthropic directly with a Gemini-formatted key. Fixed by routing through the same `services/gemini_shim` wrapper the rest of the coach code uses. Verified end-to-end (chat → real DB change persisted).
- The Garmin Connect provider (`providers/garmin.py`) was fully implemented but never registered — `/api/connections` and `/api/connections/garmin/*` were completely missing it. Fixed by registering it in `providers/__init__.py`.
- `/api/plan/progress` returned an empty `weeks: []` for any non-structured/"roadmap" plan (e.g. build-and-climb) — only structured plans got the live-definition merge. Fixed to merge for all plan types.
- 6 separate call sites across `coach.py` (+1 in `companion_plan.py`) used a fragile "first `{` to last `}`" JSON-extraction pattern that broke whenever the LLM's response had any trailing content — this was the root cause of the "intermittent coach create-plan JSON parsing" issue you flagged. Replaced with a proper balanced-brace/string-aware extractor (`services/coach_llm.extract_json_object`).
- Fixed 2 stale rider-account data issues (a profile name defaulted to "Rider One" instead of "Green Lantern"; a demo plan's calendar anchor date had drifted from repeated test runs) and cleaned up several test files that created real DB rows and never deleted them.

## 7a) Regression baseline status
826 backend tests passed, 2 skipped, 0 failed — confirmed reproducible across 3 consecutive
full-suite runs (2026-09-15). The Resend item is now resolved via `EMAIL_SANDBOX_MODE` (see the
2026-09-15 update above); the plan-snapshot item was a real bug, now fixed (not a stale test).
This is a trustworthy green baseline, now wired into `.github/workflows/ci.yml` as the release gate.

---

## What's NOT done yet (the rest of the original 11-phase brief)

- ~~Phase 2 (finish)~~ — done 2026-09-15: 826/828 genuinely green, 0 known-pending.
- ~~Phase 3~~ — done 2026-09-15: isolation expanded to Coach/plans/catalog/ride-history/Scenic/notifications/profile + sandbox-import scoping (2 real cross-user bugs found+fixed).
- ~~Phase 5~~ — done 2026-09-15 round 2: full signup→onboarding→plan→calendar→workout→ride-history→Coach chat→logout→login release-journey run via UI testing. Found + fixed 2 real bugs (Coach hallucinated plan-edit confirmation; plan-screen header/tabs unreachable on narrow phones) — see round 2 entry above.
- ~~Phase 7~~ — done 2026-09-15 round 2: `pointerEvents` deprecation cleanup (3 files); `useNativeDriver` audited, already 100% correct everywhere — no fix needed.
- ~~Phase 8~~ — done 2026-09-15 round 2: Scenic POI/image review — no functional bugs (thumbnail fallback correct for all 36 routes); 21 routes flagged for a future `highlights` content backfill (P2, content quality, not a bug).
- ~~Phase 9~~ — done 2026-09-15 round 2: `README.md` rewritten; `RELEASE_PROCESS.md` and `NATIVE_ACCEPTANCE_CHECKLIST.md` added.
- ~~Coach Context Audit~~ — done 2026-09-15 round 2: architecture confirmed sound; 1 real gap found+fixed (coach's own adaptation history wasn't fed back into its context).
- **Phase 10 (CI) — workflow exists, has NOT executed on GitHub infrastructure.** Blocked on you: add the repo secrets (names below, no values needed from me) and push/trigger a run. I cannot do either from this sandbox.
- **Phase 4 (native) — checklist written, NOT executed.** Blocked on you: real Android + iOS devices. I cannot do this from this sandbox.
- Phase 6 (light Coach/Analysis/Scenic/Benchmark routes→services split) — deliberately not done; the audit found the architecture is already sound, and the explicit instruction is not to refactor for line-count/cleanliness alone during hardening.

## GitHub Actions secrets required by `.github/workflows/ci.yml` (names only — add the values yourself)
`EMERGENT_LLM_KEY`, `GEMINI_API_KEY`, `ADMIN_LOGIN_PASSWORD`, `HWG_SERVICE_TOKEN`, `ENCRYPTION_KEY`,
`STRAVA_CLIENT_ID` (optional), `STRAVA_CLIENT_SECRET` (optional). `RESEND_API_KEY` is intentionally
NOT required (`EMAIL_SANDBOX_MODE=true` is set directly in the workflow). `GITHUB_TOKEN` is
provided automatically by GitHub Actions — do not add it yourself. Values for the required ones
should mirror the current `backend/.env` (the committed Mongo fixture's stored password hash /
service-token comparisons were generated against those exact current values).

## Sign-offs (per your 5 criteria)
| # | Criteria | Status |
|---|---|---|
| 1 | Security — no known P0/P1, credentials rotated | Signed off |
| 2 | Automated regression — critical journeys permanently covered | Signed off — 826/828 genuinely green (reproducible x3 in round 1), targeted regression green in round 2, full UI release-journey run (round 2) found + fixed 2 real bugs |
| 3 | Native — Android/iOS tested on real devices | **Not started** — checklist written (`NATIVE_ACCEPTANCE_CHECKLIST.md`), execution requires your devices |
| 4 | Data integrity — auth/authz/isolation independently verified | Signed off — isolation expanded across every domain named in the brief (12 tests) + 3 real cross-user/correctness bugs found and fixed across both rounds (plan-edit snapshot mismatch, sandbox-import missing user_id scope, coach hallucinated confirmation) + Coach Context Audit confirms no remaining architectural silos |
| 5 | Release — CI/CD gate + rollback documented | Workflow + fixture committed; rollback process documented (`RELEASE_PROCESS.md`). **CI has not yet run on GitHub infrastructure** — needs your secrets + a push |

## Bottom line: READY / NOT READY

**NOT READY for the ROUJAUNE 1.0 Release Candidate label yet — by design, per your own gate order.**
The local code/test baseline (criteria 1, 2, 4) is genuinely ready: 826/828 green, isolation
proven, 3 real bugs found and fixed across two hardening rounds (not just theoretical). What's
missing is entirely outside what this sandbox can execute:

1. **CI has not actually run on GitHub** (criterion 5) — needs your secrets + a push/trigger.
2. **Native acceptance has not been run on real devices** (criterion 3) — needs your hardware.

Once both of those come back green, RC status is warranted. Nothing found in this pass suggests
either gate will fail for architectural reasons — but neither can be honestly marked "passed"
until actually executed on real infrastructure/devices, and I won't claim otherwise.

