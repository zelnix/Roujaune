# ROUJAUNE — Cycling Coaching Tablet Dashboard

## Original Problem Statement
Native mobile app for ROUJAUNE (part of Harmony Wellness Group), optimized for tablets in landscape.
Recreate the attached high-fidelity Home dashboard in React Native: deep charcoal/black background,
glass-effect cards, red/yellow accents, fixed left sidebar, prominent gradient "Coach Alberto" card,
cinematic hero, Featured Route card, calendar/today's-plan widget, metric strip and bottom card row.

## Architecture
- **Frontend:** Expo Router (React Native, SDK 54), landscape-locked (`app.json` orientation: landscape).
- **State:** Local React state only. **No backend, no auth, no integrations** — mock data driven.
- **Libraries:** expo-image, expo-linear-gradient, expo-blur (glass), react-native-svg (rings/charts/backdrops),
  @expo/vector-icons, dayjs (calendar), expo-haptics.
- **Data source:** `src/data.ts` (all reference values). Theme tokens: `src/theme.ts`.
- **Brand assets:** `assets/images/` — `logo_glyph_t.png` (cyclist glyph, white bg knocked out),
  `hero_cyclist.png`, `coach_alberto.png`. Wordmark rendered as styled text (ROU red / JAUNE yellow).

## Reusable Components (`src/components/`)
SideNavigation, BrandHeader, HeroRoute, AlbertoCoachCard, MetricSummaryStrip, TrainingPlanCard,
FeaturedRouteCard, CalendarCard (+ Today's Plan), BottomCards (Progress/Community/Wellness/Achievement),
and `ui.tsx` primitives (Card, GlassCard, PrimaryButton, YellowButton, SecondaryButton, CircularProgress,
ClimbBars, LineChart, ReadinessScale, ActivityDots, GlassPill, Touchable, SectionLabel).

## Implemented (2026-06-22)
- Full Home dashboard matching the reference: sidebar (8 items + Settings/Help), cinematic hero with
  brand header/status pills/Alberto signature/weather, gradient Coach Alberto card with CTA, 4-metric
  summary strip with readiness scale, middle row (Training Plan / Featured Route / Calendar+Today), and
  bottom row (Progress line chart / Community avatars / Wellness sunset / Achievements progress).
- Interactivity: active sidebar state, functional buttons (toasts), month navigation, day selection,
  today's-plan row selection, press/hover micro-animations, haptics on native.
- Verified by testing agent: 100% pass on all flows; no runtime errors.

## Backlog
- **P1:** Build out the other sidebar routes (Training Plan, Workouts, Calendar, etc.) as real screens.
- **P1:** Real data layer (FastAPI + MongoDB) for stats, plans, calendar, community.
- **P2:** Provide dedicated photo assets for Featured Route & Wellness (currently stylised SVG backdrops).
- **P2:** Custom gold script font for the "Alberto" signature (currently system italic).

## Next Tasks
1. Confirm scope: expand to multi-screen app or keep single dashboard.
2. If data-driven: design backend models and wire endpoints.
