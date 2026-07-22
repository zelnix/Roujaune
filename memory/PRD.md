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
- Landscape lock (native), phone-landscape responsive variants for `/` and `/training`.
- Brand images corrected + brightened; 3D wordmark; scrollable sidebar (no label overlap).
- Bug fixes: coach portrait height-collapse on web; Alberto-card/descriptor overlap; bottom-row equal-width (now 0px diff).

## Backlog
- **P1:** Real backend (FastAPI + MongoDB) + WebSocket/BLE telemetry for live workout (power/cadence/HR, ERG control, trainer dropout/reconnect states); replace simulated loop.
- **P1:** Build remaining sidebar routes (Virtual Routes, Progress, Community, Wellness, Calendar, Settings).
- **P2:** Real 3D rider avatar (R3F/Three) in the route viewport bound to live physics.
- **P2:** Clean up RN-web deprecation warnings (shadow*/textShadow*/pointerEvents/useNativeDriver); extract shared Toast into ui.tsx; wire workout menu-button to a real menu overlay.
- **P2:** Dedicated photos for Featured Route & Wellness (currently SVG backdrops); gold script font for signatures.

## Next Tasks
1. Decide on backend + live telemetry integration scope.
2. Flesh out the remaining navigation destinations as real screens.
