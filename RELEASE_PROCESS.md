# ROUJAUNE — Release Process

> Companion to `PRODUCTION_READINESS_REPORT.md` (readiness status) and
> `SECURITY_AUDIT_REPORT.md` (security sign-off). This document defines *how* a release
> candidate is cut, gated, and rolled back if needed.

## 1. What "Release Candidate" means here

A build is a **Release Candidate (RC)** only when, in order:

1. `.github/workflows/ci.yml` is green on the commit being released:
   - secret-scan clean
   - backend pytest suite: 0 failed (2 known skips are acceptable — see the workflow's
     header comment for what they are)
   - frontend lint + `tsc --noEmit` clean
2. The cross-user isolation test suite (`test_security_audit_2026_isolation.py`,
   `test_iter70_isolation_and_admin_interest.py`, `test_p0_cross_user_isolation_expansion.py`)
   passes — this is the hard release gate for the "rich vertical access within one rider's
   account, hard horizontal isolation between riders" contract.
3. Native acceptance (see `NATIVE_ACCEPTANCE_CHECKLIST.md`) has been run on at least one real
   Android device and one real iOS device, with no P0/P1 findings open.

RC ≠ public store release. Store submission is a separate, explicit decision after the RC has
been used/soaked (see `PRODUCTION_READINESS_REPORT.md` for the current recommendation).

## 2. Cutting a release

1. Confirm CI is green on `main` (or the release branch) — do not release from a red commit.
2. Tag the commit (e.g. `git tag v1.0.0-rc1 && git push origin v1.0.0-rc1`) so the exact code
   state of every RC is addressable later (this is also your rollback target — see §4).
3. Update `PRODUCTION_READINESS_REPORT.md`'s sign-off table with the tag/commit and date.
4. Trigger a build via the Emergent **Publish** button (top-right) to generate the deployed
   web/API instance and, when ready, the iOS/Android builds for store submission or TestFlight/
   internal testing. Emergent's publish/build/App Store & Play Store submission flow is the
   supported path — do not set up a separate EAS/App Store Connect pipeline outside it.

## 3. What CI does NOT verify (and why native acceptance still matters)

The backend test suite is a full HTTP integration suite, but it cannot exercise:
- Real BLE sensor pairing/dropout/reconnection (heart rate, cadence, power)
- Background/foreground transitions, screen lock/resume, real network loss/recovery
- Native push notification delivery, native IAP purchase/restore/entitlement flows
- Actual App Store / Play Store review requirements (permissions prompts, wording, etc.)

These are exactly what `NATIVE_ACCEPTANCE_CHECKLIST.md` is for, and why it's gate #3 above, not
optional.

## 4. Rollback

Because every RC is tagged (§2, step 2), rollback is a **revert-and-redeploy**, not a
"live flip a switch" operation:

1. Identify the last known-good tag (e.g. `v1.0.0-rc1`) — check its CI run was green and it
   passed native acceptance.
2. `git revert` the problematic commit(s) back to that tag's state (prefer `revert` over a
   forced history rewrite so the incident stays traceable), or check out the tag on a hotfix
   branch if a forward-fix isn't ready yet.
3. Re-run CI on the reverted commit — it must be green before redeploying, same as any other
   change (a rollback is still a deploy; don't skip the gate under pressure).
4. Redeploy via the Emergent **Publish** button. If the issue is in an already-submitted native
   build, use the App Store / Play Store's own "release a previous version" / staged-rollout
   halt mechanisms in parallel — a backend/web rollback alone does not un-ship a bad native
   binary already in review or rollout.
5. **Database:** this app makes additive, backward-compatible schema changes in practice (new
   optional fields, new collections) rather than destructive migrations. There is currently no
   automated down-migration tooling. If a release ever requires a genuinely destructive
   migration, that migration must ship with a corresponding rollback script *in the same PR* —
   treat this as a hard requirement to add before any such migration, not a gap to accept.
6. Record the rollback (what broke, what tag you rolled back to, root cause) — this doc doesn't
   mandate a specific incident-log location, but do not skip writing it down somewhere durable.

## 5. Ownership of the gate

Per the hardening-phase instruction this repo is operating under: **a red CI run means fix the
underlying configuration or code — never weaken, skip, or delete the failing check** to force a
green build. If a check is genuinely testing the wrong thing (not just inconveniently failing),
that's a deliberate, reviewed change to the test itself, not a silent bypass.
