# ROUJAUNE — Native Acceptance Checklist

> Run this on **real physical devices** (not simulators/emulators for BLE, and not Expo Go for
> anything under "Requires a native build" below) before signing off Release Candidate gate #3
> (see `RELEASE_PROCESS.md`). Record device model + OS version for every run. A test is
> **PASS** only if the explicit PASS criteria is met with no workaround; anything else is
> **FAIL** and blocks the RC until fixed or explicitly accepted as a known issue.

**Cannot be validated in Expo Go / web preview — requires a real dev/production build:**
BLE sensors, background/locked-screen audio, native push notifications, native IAP. Trigger a
build via the Emergent Publish button before starting this checklist.

Legend: Android-only, iOS-only, or Shared (run on both) is marked per row.

---

## 1. Install / Update

| # | Test | Platform | Steps | PASS criteria |
|---|---|---|---|---|
| 1.1 | Fresh install | Shared | Install the build on a device with no prior ROUJAUNE data | App launches to login/onboarding within 5s, no crash |
| 1.2 | Update over existing install | Shared | Install a newer build over an existing one (same account already logged in) | Session persists (no forced re-login) OR a clean re-login is required with no data loss server-side; no crash |
| 1.3 | APK/AAB integrity | Android | Install via the provided .apk on a real Android device | Installs without "app not installed" errors; icon/name correct |
| 1.4 | TestFlight/IPA integrity | iOS | Install via TestFlight or the provided .ipa | Installs and launches; icon/name/version correct |

## 2. Signup / Login / Logout (Shared)

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 2.1 | Email signup | New email + password → onboarding | Account created, lands in onboarding, no duplicate-account errors |
| 2.2 | Email login | Existing credentials | Lands on Today/home within a few seconds |
| 2.3 | Wrong password | Valid email, wrong password | Clear error, no account lockout info leak, no crash |
| 2.4 | Logout | Settings → Log out | Returns to login screen; relaunching app does not auto-restore the session |
| 2.5 | Session persistence | Log in, fully kill the app, reopen | Still logged in (no forced re-login) |

## 3. Google / Apple Authentication

| # | Test | Platform | Steps | PASS criteria |
|---|---|---|---|---|
| 3.1 | Google Sign-In | Shared | Tap "Sign in with Google", complete the native/OS account picker | Returns to app logged in; profile name/email populated from Google account |
| 3.2 | Apple Sign-In (if enabled) | iOS | Tap "Sign in with Apple" | Returns to app logged in; works with both a real Apple ID and "Hide My Email" relay |
| 3.3 | Cancel mid-flow | Shared | Start Google/Apple sign-in, cancel before completing | Returns cleanly to login screen, no crash, no partial account created |
| 3.4 | Existing email collision | Shared | Sign in with Google using an email that already has a password-based account | Either merges/links per documented behavior, or gives a clear, non-crashing error — must not silently create a duplicate, orphaned account |

## 4. Coach (Alberto / Adriana) — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 4.1 | Chat basic | Ask a simple question ("How's my week going?") | Coherent, rider-specific answer referencing real data (not generic), reply within ~10s |
| 4.2 | Plan-edit via chat | "Shorten my next ride to 20 minutes" | Coach confirms the change AND the calendar/plan screen actually reflects the new duration on reload |
| 4.3 | Voice/TTS (coach speak) | Trigger a coach voice line (cue, greeting) | Audio plays, correct voice for selected coach persona, no distortion |
| 4.4 | Persona switch | Switch Alberto ↔ Adriana in settings | New persona's voice/tone reflected in the next chat/cue |
| 4.5 | Two-account isolation spot check | Log in as a second test account on a second device/session | Coach never references the first account's rides/plan/data |

## 5. Training Plan Creation / Editing — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 5.1 | Assign a plan | Onboarding or Plan screen → pick a structured plan | Plan appears with correct week 1 workouts |
| 5.2 | Edit via taper-apply | Set a target event ~30-45 days out, trigger taper | Applied once (`applied:true`); calling again is idempotent (`already:true`), no error |
| 5.3 | Reset start date | Change the plan's start date | Calendar recomputes; workouts shift to the new dates |
| 5.4 | Custom plan | Have the coach generate a custom plan via chat | New plan created and assignable without affecting any other rider |

## 6. Calendar — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 6.1 | Week view | Open Calendar/Training tab | Correct week highlighted, workouts show correct type/duration |
| 6.2 | Schedule a custom workout | Add an ad-hoc workout to a future date | Appears on that date, doesn't disturb the structured plan's other days |
| 6.3 | Missed workout | Let a scheduled workout's date pass without completing it | Marked missed/resolvable, doesn't silently disappear |

## 7. Workout Execution — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 7.1 | Start indoor workout | Start any structured workout | Timer/zones/instructions render correctly, start/pause/end controls responsive |
| 7.2 | Complete + summarize | Finish a workout | Summary screen shows correct duration/effort; ride appears in Ride History |
| 7.3 | Abandon mid-workout | Start, then quit early | Handled gracefully (discard or partial-save prompt), no crash, no orphaned session blocking the next start |

## 8. BLE Sensors — Heart Rate — Shared (real device + real/simulated HR strap)

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 8.1 | Permission prompt | First BLE scan attempt | Contextual pre-permission explanation shown before the OS Bluetooth prompt |
| 8.2 | Pair | Scan → select HR sensor | Connects within ~10s, live BPM shown and updates in real time |
| 8.3 | Denied permission | Deny Bluetooth permission | App still usable without BLE (no dead-end); "Open Settings" button shown if `canAskAgain` is false |
| 8.4 | Reconnect after workout | End workout, start a new one | Previously paired sensor reconnects without re-pairing from scratch |

## 9. BLE Sensors — Cadence — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 9.1 | Pair | Scan → select cadence sensor | Connects, live RPM shown |
| 9.2 | Simultaneous with HR | Pair HR + cadence at the same time | Both stream live data without one dropping the other |

## 10. BLE Sensors — Power — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 10.1 | Pair | Scan → select power meter/smart trainer | Connects, live watts shown |
| 10.2 | Zone display | Ride at varying power | Zone indicator updates correctly against the rider's FTP |

## 11. Sensor Dropout / Reconnection — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 11.1 | Mid-ride dropout | Physically move sensor out of range / power it off during a ride | UI clearly shows "disconnected" state (not a frozen stale value), ride keeps running |
| 11.2 | Auto-reconnect | Bring sensor back in range | Reconnects automatically within a reasonable time without restarting the ride |
| 11.3 | Ride survives dropout | Complete a ride that had a mid-ride dropout | Ride still saves; missing-data gaps don't corrupt the summary/analytics |

## 12. Long Ride — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 12.1 | 60+ minute ride | Run a workout or Scenic ride for 60+ minutes continuously | No memory-growth slowdown, no crash, timer/metrics stay accurate throughout |
| 12.2 | Long ride + backgrounding | Background the app partway through a 60+ min ride, foreground later | Ride timer/metrics correctly reflect elapsed time (or clearly pause/resume per design) |

## 13. Background / Foreground — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 13.1 | Background during workout | Home button during active workout, then return | Workout state (elapsed time, sensor connection) preserved |
| 13.2 | Background during Scenic ride | Home button during Scenic video ride | Playback/audio behavior matches documented design (pause or continue), no crash on return |
| 13.3 | Long background (5+ min) | Background the app for 5+ minutes, return | No forced logout, no stale/frozen UI — refreshes correctly |

## 14. Screen Lock / Resume — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 14.1 | Lock during workout | Lock screen mid-workout, unlock after 30s | Workout continues correctly, sensor data not lost |
| 14.2 | Lock during Scenic ride audio | Lock screen during Scenic ride with ambient audio playing | Confirm current behavior against documented design — if background audio is expected, it must survive lock; if not, resuming must not corrupt ride state |

## 15. Network Loss / Recovery — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 15.1 | Airplane mode during use | Enable airplane mode while using any core screen | Clear offline indication, no crash, no infinite spinner |
| 15.2 | Recovery | Disable airplane mode | App recovers/refetches without requiring a manual app restart |
| 15.3 | Workout completion offline | Complete a workout while offline | Either queues and syncs on reconnect, or clearly informs the rider it couldn't save — must never silently lose the ride |

## 16. Notifications — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 16.1 | Permission prompt | First notification-triggering action | Contextual explanation before OS prompt |
| 16.2 | Delivery | Trigger a real notification-worthy event | Notification received (requires a real build + push credentials — cannot be tested in Expo Go) |
| 16.3 | Tap-through | Tap the notification | Opens the app to the relevant screen, not just the home screen |

## 17. Audio / Media — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 17.1 | Coach voice audio | Trigger a coach voice cue | Plays clearly, respects device volume/mute switch |
| 17.2 | Scenic ride video + ambient audio | Start a Scenic ride | 4K YouTube video autoplays muted (or shows the documented tap-to-start fallback), ambient audio track plays correctly |
| 17.3 | Interruption handling | Receive a phone call or other audio interruption during playback | Playback pauses/resumes sensibly, no crash |

## 18. Scenic Cycling — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 18.1 | Browse routes | Open Scenic → destinations list | Thumbnails load (YouTube-derived or curated) for every route |
| 18.2 | Start a ride | Pick a route → start | Video plays, HUD (metrics, discovery prompts) renders correctly |
| 18.3 | Discovery save | Reach a POI, tap save | Chime/haptic (unless Quiet mode), saved to Journeys → Discoveries |
| 18.4 | Ride completion recap | Finish a Scenic ride | Recap overlay with stats + animated route map + share option renders correctly |
| 18.5 | Resume | Exit mid-ride, return later | "Resume ride" offered from the Scenic hero, resumes at the correct position |

## 19. IAP / Subscription Purchase

| # | Test | Platform | Steps | PASS criteria |
|---|---|---|---|---|
| 19.1 | Google Play purchase | Android | Trigger paywall → purchase monthly/yearly | Native Play Billing sheet appears, completes, entitlement unlocks immediately |
| 19.2 | App Store purchase | iOS | Trigger paywall → purchase monthly/yearly | Native StoreKit sheet appears, completes, entitlement unlocks immediately |
| 19.3 | Free-tier limits | Shared | Use 3 free rides (≤30 min each) while not premium | 4th ride (or any ride >30 min) correctly triggers the paywall |

## 20. Restore Purchase — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 20.1 | Restore on same device | After a real purchase, reinstall the app | "Restore purchase" correctly re-unlocks entitlement without a new charge |
| 20.2 | Restore on a new device | Log into the same account on a second device | Entitlement reflects the existing subscription (server-side truth, not device-local) |

## 21. Entitlement Changes — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 21.1 | Upgrade monthly → yearly | Change plan via the store | Backend `/billing/validate` reflects the new plan on next check |
| 21.2 | Webhook/poll lag | Immediately after a purchase, check entitlement | Unlocks within a reasonable time (no indefinite "still locked" state) |

## 22. Cancellation / Expiry Behaviour — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 22.1 | Cancel subscription | Cancel via store subscription management | Access continues until the current period ends (standard store behavior), then correctly reverts to free tier |
| 22.2 | Expired subscription | Let a test subscription lapse (sandbox/test track) | Reverts to free-tier limits without deleting any rider data (plan, history, discoveries all still present) |

## 23. Crash / Error Handling — Shared

| # | Test | Steps | PASS criteria |
|---|---|---|---|
| 23.1 | Backend unreachable | Point at an intentionally broken backend URL (or block via firewall) | App shows a clear error state, doesn't hard-crash on launch |
| 23.2 | Malformed/slow LLM response | Coach chat during a deliberately slow/failed AI response | Graceful timeout/error message, no crash, retry possible |
| 23.3 | Force-quit recovery | Force-quit the app during any active flow (workout, purchase, chat) | Reopening the app returns to a sane state — no corrupted local state requiring reinstall |

---

## Sign-off

| Platform | Device(s) tested | Date | Tester | Result |
|---|---|---|---|---|
| Android | | | | PASS / FAIL |
| iOS | | | | PASS / FAIL |

List any FAIL items with severity (P0 blocks RC / P1 must-fix-before-store / P2 backlog) below
before updating `PRODUCTION_READINESS_REPORT.md`'s final recommendation.
