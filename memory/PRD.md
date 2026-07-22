# ROUJAUNE — Cycling Coaching Tablet App

## Problem Statement
Premium, tablet-first (landscape) React Native/Expo app for ROUJAUNE (Harmony Wellness Group):
deep charcoal/near-black theme, glass cards, red/yellow accents, French/Italian cycling heritage.
Recreate supplied high-fidelity references as real, reusable, data-driven components (not screenshots).

## Architecture
- **Frontend:** Expo Router (SDK 54). Landscape-locked via `app.json` + runtime `expo-screen-orientation`.
- **State:** Local React state; mock data. **No backend/auth yet.** Live workout uses a simulated telemetry loop (setInterval) designed to be swapped for a WebSocket/sensor stream.
- **Libs:** expo-image, expo-linear-gradient, expo-blur, react-native-svg, @expo/vector-icons, dayjs, expo-haptics, expo-screen-orientation.
- **Theme/tokens:** `src/theme.ts`. Shared UI primitives: `src/components/ui.tsx` (Touchable w/ containerStyle, Card/GlassCard, PrimaryButton, SecondaryButton, YellowButton, CircularProgress, ClimbBars, LineChart, ReadinessScale, GlassPill, SectionLabel).
- **Assets:** `assets/images/` — `logo_glyph_t.png` (bg-removed), `hero_cyclist_b2.jpg` (brightened rider), `coach_alberto_b2.jpg`. Wordmark rendered as 3D-extruded text/image in `BrandHeader`.

## Screens / Routes
- `/` **Home dashboard** — sidebar, hero (3D wordmark + Alberto card + weather), metric strip, Training Plan / Featured Route / Calendar+Today, bottom cards (Progress/Community/Wellness/Achievements). Responsive tablet + phone-landscape (compact).
- `/training` **Today's Training** — reuses sidebar; header (brand/title/date), Alberto coach card, Main Workout (interval profile + metrics), Route/Weather, right sidebar (Readiness/TrainingLoad/WhatToExpect+Start/Equipment), bottom row (Before You Ride/FB50/MPC). Responsive compact layout.
- `/workout` **Live Workout** — full-screen (no sidebar): top bar (live elapsed, route progress, finish, flame), left live cards (Power/HeartRate/Cadence w/ zone visuals), workout timeline (active-interval highlight), rider route viewport (image placeholder for future 3D avatar) + elevation profile overlay, right column (Climb/RouteMap/Wearable), ride summary strip + time-in-zones, control bar (ERG mode, ERG intensity ±, Controls panel, Pause/Resume, End Workout), Alberto live cue. Simulated live telemetry.

## Navigation
Home Alberto "Start Today's Ride" & sidebar Workouts → `/training`. Training "Start Workout" → `/workout`. Workout "End Workout"/menu → `/training`. Sidebar Home → `/`.

## Implemented (2026-06-22)
- All three screens built and verified by testing agent (100% functional pass each).
- **Live telemetry pipeline:** FastAPI WebSocket `/api/ws/telemetry` (~5 Hz trainer/wearable stream, BLE-bridge stand-in) with ERG/pause/resume/dropout control; MongoDB-backed workout sessions (`/api/workouts` start/get/list/end). Frontend `useTelemetry` hook (auto-connect, backoff reconnect, stale→estimated detection) drives Power/HR/Cadence/Speed/Elapsed; connection-status pill (LIVE/RECONNECTING/ESTIMATED/OFFLINE); verified end-to-end over wss through ingress.
- Live workout three-dot **menu overlay** (Reconnect/Settings/Touch Lock/Peaceful Pause/Save & Exit) + Controls panel.
- RN-web deprecation cleanup: `shadow*`→Platform `boxShadow` on web, `pointerEvents` prop→style, `useNativeDriver` disabled on web. (Minor `textShadow*` warning remains — cosmetic.)
- Landscape lock (native), phone-landscape responsive variants for `/` and `/training`.
- Brand images corrected + brightened; 3D wordmark; scrollable sidebar; equal-width bottom row (0px diff).

## Backlog
- **P1:** Real backend (FastAPI + MongoDB) + WebSocket/BLE telemetry for live workout (power/cadence/HR, ERG control, trainer dropout/reconnect states); replace simulated loop.
- **P1:** Build remaining sidebar routes (Virtual Routes, Progress, Community, Wellness, Calendar, Settings).
- **P2:** Real 3D rider avatar (R3F/Three) in the route viewport bound to live physics.
- **P2:** Clean up RN-web deprecation warnings (shadow*/textShadow*/pointerEvents/useNativeDriver); extract shared Toast into ui.tsx; wire workout menu-button to a real menu overlay.
- **P2:** Dedicated photos for Featured Route & Wellness (currently SVG backdrops); gold script font for signatures.

## Next Tasks
1. Decide on backend + live telemetry integration scope.
2. Flesh out the remaining navigation destinations as real screens.

## Workout Complete summary (2026-06-22)
- `/summary` **Workout Complete** screen built to match the supplied high-fidelity reference (real reusable components, no screenshot backgrounds):
  - Header (brand+tagline / "Workout Complete" title w/ checkmark+sparkles / clock+flame+wifi), bespoke wider Sidebar (Overview active, Calendar, Workouts, Routes, Progress, Wellness, Connections, Settings + Alberto coach avatar).
  - Hero Summary Card (rider image + "ALLEZ OOP!!" + "Strong ride / You held your threshold well." + Alberto recap), 10-cell Primary Ride Metrics Grid, Compliance card (overall ring + 4 compliance columns), Charts row (Power bars w/ amber area + dashed target, HR line, Time-in-Zones table), Sync & Export row (visual-only, toast), Right column (Route Summary w/ elevation map, Achievements, Recovery & Next Steps ring+items), Bottom Action Bar (View Full Analysis / Save & Exit→Home / Share Ride / Plan Tomorrow's Ride→/training).
- **Data:** hybrid — backend `POST /api/workouts/summarize` computes real aggregates (avg/NP power, HR, cadence, distance, calories, IF, TSS, time-in-zones, compliance, downsampled charts) from telemetry samples recorded live during `/workout` (`src/lib/ride.ts`); falls back to polished reference dataset when <30 samples (demo). `src/lib/summary.ts` (`useSummary` hook + fallback + static content).
- Live Workout **End Workout** now navigates to `/summary`.
- Sync/Export are visual-only for now; real Strava/Garmin/TrainingPeaks integrations deferred (backlog).
