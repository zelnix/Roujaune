# ROUJAUNE — Architecture

> Living document. **Keep this up to date** whenever routes, collections, integrations,
> or major flows change. Last updated: 2026-07-29.

ROUJAUNE is a cycling **training + scenic-riding** app for riders 50+. It pairs a
personalised training plan and workouts with an immersive "Scenic Cycling"
experience (real YouTube POV rides, LLM points-of-interest, a saveable discovery
scrapbook, and shareable ride recaps).

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Expo (React Native) + **expo-router** (file-based), TypeScript |
| Backend   | **FastAPI** (Python), Motor (async MongoDB) |
| Database  | MongoDB |
| Realtime/media | YouTube iframe (web + native), `expo-audio`, `react-native-reanimated`, `react-native-svg` |
| Auth      | JWT (email/password) + **Emergent-managed Google Sign-In** |

### Runtime / URLs (do not hardcode)
- Frontend calls the backend via `EXPO_PUBLIC_BACKEND_URL` (+ `/api`). All backend routes are prefixed **`/api`** (Kubernetes ingress → port 8001). Frontend served on port 3000.
- Protected env (never edit): `frontend/.env` (`EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME`), `backend/.env` (`MONGO_URL`).
- Services run under supervisor: `backend`, `expo`.

## Backend layout (`/app/backend`)

- `server.py` — app entry; builds `api_router` (prefix `/api`) and mounts all routers + admin routers.
- `auth.py` — JWT + Google auth, `require_admin`, and the **`udb`** user-scoped DB proxy that auto-injects `user_id`. `USER_SCOPED` set lists per-rider collections (see below).
- `db.py` / `core.py` / `models.py` — Mongo client, shared helpers, Pydantic models.
- `admin_routes.py`, `plans_admin.py` — HWG admin console APIs (`/api/admin/*`, admin-guarded).
- `push.py` — Emergent-managed push (`EMERGENT_PUSH_KEY`, placeholder until deploy).
- `emailer.py` — Emergent-managed Resend email.
- `crypto_util.py`, `activity_sync.py`, `companion_plan.py` — connected-account tokens, activity import, plan generation helpers.
- `routes/` — feature routers:
  | Router | Responsibility |
  |--------|----------------|
  | `scenic.py` | Scenic routes catalog, **LLM POIs w/ Wikipedia images**, discoveries CRUD, journeys, recap covers, admin CRUD |
  | `workouts.py` | Workout sessions + `summarize` (logs rides incl. `scenic-*` to `ride_history`) |
  | `coach.py` | AI coach chat/persona (emergentintegrations) |
  | `plan.py` | Training plan state |
  | `rider.py` | Rider profile / appearance / Rive config |
  | `benchmark.py` | Benchmark workouts + PRs |
  | `catalog.py` | Workout/route catalog |
  | `connections.py` | Connected accounts (Strava-style sync) |
  | `weather.py` | Open-Meteo (keyless) |
  | `notifications.py`, `system.py` | Notices, health/system |

## Frontend layout (`/app/frontend`)

- `app/` — **routes** (each file = a screen). Key: `index.tsx` (Today/home), `scenic-destinations.tsx` (explore), `scenic-ride.tsx` (immersive HUD), `saved-destinations.tsx` (**Journeys**: Rides + Discoveries scrapbook), `coming-soon.tsx`, `training.tsx`, `plan.tsx`, `progress.tsx`, `workout*.tsx`, `benchmark/`, `login.tsx`, `onboarding.tsx`, `settings.tsx`, `profile.tsx`.
- `src/lib/` — data/services + hooks-as-stores. Scenic: `scenic-routes.ts` (routes/POIs/discoveries/journeys/covers APIs), `scenic-resume.ts` (persisted resume), `scenic-recap.ts` (elevation profile + coach caption). Also `auth-context.tsx`, `coach-persona.ts`, `today-mode.ts`, `settings.ts`, `weather.ts`, etc.
- `src/components/` — reusable UI. Scenic: `ScenicRecapCard`, `ScenicRecapShareModal` (cover picker + share/save), `DiscoveryDetailModal`, `RideRouteMap` (animated route map), `ConfettiBurst` (3+ celebration), `YouTubePlayer(.web).tsx`, `HeaderStatus`, `today/ExperienceHero`, `today/TodayModeButton`, `SideNavigation`.
  - **`src/components/scenic/`** — the Scenic Ride HUD, split out of `app/scenic-ride.tsx` for maintainability: `hud-widgets.tsx` (leaf atoms: `GradientText`, `Ring`, `Waveform`, `Metric`, `Seg`, `NavItem`, `MusicControl`, + `SERIF`/`clock` helpers), `RideCompleteOverlay.tsx` (end-of-ride landscape recap card + confetti), `LeaveRideDialog.tsx` (save/end/continue), `DiscoveryPrompt.tsx` (`DiscoveryPrompt` + `SaveToast`). `scenic-ride.tsx` retains all ride state/effects/logic and composes these.
- `src/hooks/` — `useBleSensors(.web)`, `useCast(.web)`, `useCoachSpeech`, `useTelemetry`, `useWorkoutAudio`.
- `assets/audio/` — `scenic_ambient.mp3` (HUD ambience), `discovery_chime.wav` (save prompt / completion).
- `src/theme.ts` — colors/radius/spacing. `+html.tsx`, `_layout.tsx` — router + web shell.

## Key user-scoped collections (`auth.USER_SCOPED`, auto-scoped by `udb`)
`rider_profile, plan_state, ride_history, training_plans, coach_chats,
connected_accounts, workout_sessions, scheduled_workouts, daily_checkins,
workout_prefs, cycling_activities, settings, calendar_weeks, rider_prs,
rider_prefs, rider_appearance, kv_prefs, rider_workouts,
scenic_favourites, scenic_discoveries, scenic_recap_covers, mode_interest`
(+ benchmark collections). Global (not user-scoped): `scenic_routes`, `scenic_poi`.

## Scenic Cycling data model & flow
- **`scenic_routes`** (global): `{id, name, region, place, country, youtube_id, duration_min, distance_km, elevation_m, tag, thumbnail_url, description, status}`.
- **`scenic_poi`** (global cache): `{route_id, pois[], source, at}`; each POI `{order, at_pct, title, description, narration, wiki, image}` — LLM-generated (emergentintegrations), enriched with a Wikipedia landmark photo (keyless, flags/maps filtered).
- **`scenic_discoveries`** (rider): saved POIs `{id, route_id, route_name, place, poi_order, at_pct, title, description, narration, photo, at}`.
- **`scenic_recap_covers`** (rider): `{ride_id, photo}` — chosen cover for a ride's recap.
- **Ride flow:** explore → `scenic-ride` HUD (muted 4K YouTube + ambient audio, hideable panels, Quiet/Discover/Guided voice, LLM POIs with real photos). Progress + POI timing use the video's **real currentTime** (`onProgress`). Reaching a POI shows a one-tap **Save-discovery prompt** (chime + haptic, silenced in Quiet). Ride persists via `scenic-resume` (Scenic hero → "Resume ride"). On completion (pct ≥ 0.98) a **landscape recap** overlay shows stats, an **animated `RideRouteMap`** (self-drawing trail + moving rider + discovery photo bubbles), a **"Great explorer!"** badge + confetti at 3+ saves, a coach caption, and **View & share** → `/saved-destinations?justFinished=1` (auto-opens the shareable recap card w/ cover picker).
- **Journeys** (`saved-destinations`): tabs **Rides** (completed `ride_history` `scenic-*` joined with discoveries → shareable recap cards) and **Discoveries** (photo scrapbook → `DiscoveryDetailModal`).

### Key scenic endpoints
```
GET    /api/scenic/routes                       list published routes
GET    /api/scenic/routes/{id}                   route detail
GET    /api/scenic/routes/{id}/pois[?refresh]    LLM POIs + Wikipedia images (cached)
GET/POST/DELETE /api/scenic/favourites           saved destinations
GET/POST/PATCH/DELETE /api/scenic/discoveries     rider discoveries (idempotent per route+poi_order)
GET    /api/scenic/journeys                       completed scenic rides + discoveries (+cover)
PUT    /api/scenic/journeys/{ride_id}/cover       set/reset recap cover photo
```

## Integrations
- **YouTube** — `react-native-youtube-iframe` (native) + web iframe (4K `hd2160`, `infoDelivery` progress). Video IDs only. Native WebView uses `mediaPlaybackRequiresUserAction:false` so the muted POV video autoplays; if autoplay is still blocked (e.g. Expo Go), the ride screen keeps the video tappable and shows a "Tap the video to begin your ride" fallback (`testID=tap-to-start`) until playback actually starts.
- **emergentintegrations (OpenAI)** — LLM text for coach + scenic POIs. Uses **Emergent LLM key**.
- **Wikipedia** (keyless) — landmark photos for POIs (compliant User-Agent).
- **Open-Meteo** (keyless) — weather.
- **Emergent Google Sign-In**, **Emergent push** (`EMERGENT_PUSH_KEY`), **Emergent Resend** email.
- **In-app subscriptions** — Apple App Store + Google Play only (no web processor). `react-native-iap` v16 behind `src/hooks/useStore.native.ts` (web/Expo Go use the `useStore.ts` stub). Backend `routes/billing.py` is the entitlement source of truth: user-scoped `billing` collection (`premium_until`, `free_rides_used`, `consumed_keys`), verifies Apple/Google purchases (`/billing/validate`, `IAP_DEV_TRUST` dev fallback). **Model:** free tier = 3 rides × ≤30 min; Premium (`premium_monthly`/`premium_yearly`, yearly default) unlocks everything. Gating lives in `scenic-ride.tsx` + `workout.tsx` (consume on start, 30-min cap → `PaywallModal`); entry points: Settings membership card + `app/upgrade.tsx`.

## Ride ingestion & performance analysis
- **Upload** outdoor rides (`.fit`/`.gpx`/`.tcx`) → `routes/activities.py POST /api/activities/upload` (base64 body). `activity_parse.py` parses tracks (GPS, power, HR, cadence, elevation) and computes TrainingPeaks metrics — **NP** (30s rolling, 4th-power mean), **IF** = NP/FTP, **TSS** = (sec·NP·IF)/(FTP·3600)·100, power curve, power/HR zone time — then feeds the existing `activity_sync.ingest_activities` pipeline (dedup + classify + mirror into `ride_history`, now with `user_id`).
- **Unified list** `GET /api/activities` (indoor + outdoor from `ride_history`). **Detail** `GET /api/activities/{id}` returns metrics + decimated `route_data.samples` (≤500) + power curve + zones. **FTP** editable via `GET/POST /api/activities/ftp` (stored in `settings.ftp`, `settings.max_hr`).
- **Frontend:** `app/activities.tsx` (Rides & Analysis list + upload via `expo-document-picker`/`expo-file-system`), `app/activity/[id].tsx` (Strava-style detail), `src/components/analysis/RideAnalysis.tsx` (interactive SVG route map + synced elevation/power/HR graph with a drag scrubber, power curve, zone bars). Nav item "Rides & Analysis" in training + scenic modes. `src/lib/activities.ts` = API client.
- **Parsers:** `fitparse` (FIT), `gpxpy` (GPX), stdlib XML (TCX).
- **Roadmap:** Phase 3 (DONE) = aggregate PMC + PRs + compare; Phase 4 = Strava/Garmin auto-sync (OAuth infra already in `routes/connections.py` + `providers/`; needs a Strava provider + user API keys). Native map (react-native-maps) later; SVG route used everywhere for now.

## Fitness Trends, Records & Compare — Phase 3
- `routes/analysis.py`: `GET /api/analysis/pmc?days=` (daily CTL/ATL/TSB from ride_history TSS — TrainingPeaks exp model, 42d/7d) + summary (fitness/fatigue/form, ramp, weekly TSS, form_state); `GET /api/analysis/records` (all-time best power 5s/1m/5m/20m from `cycling_activities.route_data.power_curve`).
- Frontend: `app/fitness.tsx` (PMC chart + summary + Personal Records), `app/compare.tsx` (pick 2 rides → power overlay + delta table), `src/components/analysis/FitnessCharts.tsx` (`PmcChart`, `PmcSummary`, `RecordsGrid`), `src/lib/analysis.ts`. Nav item "Fitness Trends"; "Compare" button on the rides list.


YouTube playback over a ride, BLE cadence/HR sensors (`useBleSensors`), Chromecast (`useCast`), audio (ambient/chime) & haptics, ride-completion recap trigger, **in-app purchases (`react-native-iap`)**.

## Test accounts
- Rider: `greenlantern@roujaune.app` / `rideon9900`
- Console admin: `roger.parenzee@gmail.com` / `letmein9900`
(see `/app/memory/test_credentials.md`)

## Conventions
- All backend routes under `/api`; per-rider data via `udb` (never manually filter `user_id`).
- Frontend: expo-router screens in `app/`; non-screen code in `src/`. No web-only libs; StyleSheet only.
- New rider-owned collection → add it to `auth.USER_SCOPED`.
