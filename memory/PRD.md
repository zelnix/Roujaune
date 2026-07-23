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
- **Phone-landscape:** `/summary` has a compact variant (icon-only sidebar rail, logo-only header, compact hero/metrics/compliance, vertically-stacked full-width charts, right-column cards wrapped below main content, wrapped Sync row, compact action bar).

## Immersive route video (2026-06-22)
- Live Workout `/workout` now features an **immersive first-person cycling YouTube video** as the center visual focus (replaces the static rider image viewport).
  - Reusable cross-platform `RouteVideo` (`src/components/RouteVideo.tsx`) + platform player cores: native `src/components/video/RouteVideoPlayer.tsx` (`react-native-youtube-iframe` over `react-native-webview`, official IFrame API, no key) and web `RouteVideoPlayer.web.tsx` (real DOM `<iframe>` controlled via postMessage; picked automatically by Metro `.web.tsx` resolution — no babel alias / `react-native-web-webview` needed).
  - States: loading (with YouTube poster), invalid URL, video-unavailable + Retry, 16:9 responsive, accessible labelled controls. `getYouTubeId`/`posterFor` in `src/lib/youtube.ts`.
  - **Sync:** `playing = !paused` — video plays while the workout runs, pauses on Pause, resumes on Resume, stops on End (unmount → navigate to `/summary`). Always **muted** (no sound), muted autoplay.
  - Config-driven source in `src/data.ts` (`routeVideo.url = https://youtu.be/XlwjMjyU410`, admin-replaceable). Added `NextUpStrip` (next interval preview: label/time/power target/RPE) + `SafetyNote` under the video. All existing workout metrics/controls preserved.
  - **NOTE:** YouTube playback CANNOT be validated in the automated preview/screenshot tool — YouTube blocks embed playback in headless/automation browsers ("Video unavailable"), confirmed even for a universally-embeddable control video. It plays correctly on real browsers and on iOS/Android via Expo Go. Future: route selection, cadence/power-matched playback, interval-linked chapters, locally-hosted licensed videos.
- **Immersive expand + live-data HUD:** the route video has an expand control (top-right) opening a full-screen immersive overlay (`ImmersiveHud`) with translucent live-data feeds overlaid on the video — elapsed + connection status (LIVE/ESTIMATED/…) + route progress (top-left), Alberto cue (top-center), metric chips Power(+W/kg)/Heart Rate/Cadence/Speed (bottom-left), Pause/Resume + End controls (bottom-right); collapse control restores the inline layout (`VideoPlaceholder` holds the inline slot while expanded). `RouteVideo` now measures its own container (onLayout) and supports `fill` + a `children` overlay slot.
- **Route picker:** `ROUTES` button on both the inline video (bottom-left) and the immersive HUD (top-right) opens `RoutePicker` — a modal grid of selectable routes (thumbnail, tag chip, place, distance/elevation) driven by `routeVideos` in `src/data.ts` (5 verified-embeddable POV rides: Alpe d'Huez, Lake Garda, Alpine Descent, Bavaria Autumn, Countryside Roads; admin-replaceable). Selecting swaps the active video (`routeIdx`) live, in both inline and immersive modes.
  - **Auto-match to workout:** on load the route is auto-selected to match the workout type (`currentWorkout.recommendedTag`, e.g. Climb → Mountain → Alpe d'Huez); matching routes show a "Great for your workout" pill, the active auto card shows a ✨ badge, and the inline title reads "· Auto-matched". "Auto-match to workout" button re-applies it.
  - **Surprise me:** shuffle button picks a random different route.
  - **Last ride memory:** the chosen route is persisted with AsyncStorage (`src/lib/prefs.ts`) and restored on the next session (title shows "· Last ride", picker marks it "Your last ride", with a resume toast); choosing Auto-match clears it so it re-matches by workout type.
  - **Route library (15 routes, 2 curated sections):** `routeVideos` now carries a `level` field and the picker groups into **"Legendary race climbs & stages"** (Alpe d'Huez, Mont Ventoux, Passo dello Stelvio, Dolomites Passes, Alpine Ascent, Legendary Climbs, Lake Garda, Alpine Descent) and **"Easy & scenic — casual riders"** (Mincio Riverside, Lake Achensee, Ocean Shores Coast, Spreewald Waterways, German Countryside, Bavaria Autumn, Countryside Roads). All verified embeddable; tag colors encode difficulty. `currentWorkout.recommendedTag = "Climb"`.
- **Route carried into summary + ride history:** the ridden route (name/place/distance/elevation) flows via `rideRecorder` into the `/summary` Route Summary card and the ROUTE metric cell (`useSummary` returns `route`; `RouteSummaryCard`/`MetricsGrid` accept it). Backend `POST /api/workouts/summarize` now accepts the route object and persists a lightweight `ride_history` record (route + key metrics + timestamp); `GET /api/rides/history` lists recent rides.

## Device connection, HUD toggle & audio (2026-06-22)
- **Persistent settings** (`src/lib/settings.ts`, AsyncStorage): `hasTrainer`, `hasWearable`, `hudEnabled`. Opened via the top-bar gear or menu → `SettingsPanel` (Switches).
- **Not-connected indicators:** when `hasTrainer` is off, Power/Cadence cards + Speed show a "Not connected · Connect a smart trainer" state; when `hasWearable` is off, Heart Rate + wearable card show "Connect a wearable". Immersive HUD chips show "—" for the disconnected metrics.
- **Hide HUD (persistent):** `hudEnabled` controls the immersive live-data overlay; an eye toggle in full screen reveals/hides it on the fly; a heads-up toast is shown when entering the workout with the HUD off. Collapse control always remains so the user is never stuck.
- **Cycling music + spoken cues** (`src/hooks/useWorkoutAudio.ts`, `expo-audio` + `expo-speech`): looping instrumental track with a Music & Audio panel (music on/off, volume stepper, Alberto voice on/off). Alberto speaks each in-workout cue aloud in a **deep male voice with a mild French accent** (runtime-selects a male French/fr-CA voice, low pitch 0.78); music **ducks to ~22%** while he speaks, then restores. Floating music button for quick access.
  - **NOTE:** audio playback, TTS voice, and the YouTube video CANNOT be validated in the preview/screenshot tool (headless browser blocks media/voices) — verify on a real device / Expo Go. TTS cannot finely tune accent intensity; voice availability varies by OS.
- **App icon:** set to the ROUJAUNE cyclist logo (`assets/images/icon.png` on dark bg, `adaptive-icon.png` transparent foreground, `favicon.png`, `splash-image.png`).

## Update (latest session)
- **App renamed to "Roujaune"** in `app.json` (name/slug/scheme).
- **Voice selector** (`useWorkoutAudio.ts` + Music panel): lists device voices filtered to Spanish/English/Italian/French (all read English → accent), numbered per accent, tap-to-preview, persisted (`prefs.ts` voiceId). Numbers in cues are spoken as English words to stop the TTS engine handing digits to a fallback (female) voice. Voice-tone slider was added then removed per user.
- **Media bar:** Audio pill + **Cast pill** (bottom-left). Immersive HUD also has a Cast button under the eye toggle.
- **Cast to TV** (`react-native-google-cast` + `expo-build-properties`, config in `app.json`, receiver `CC1AD845`, iOS Bonjour `_googlecast/_airplay`): real device discovery/connect on NATIVE BUILDS ONLY via platform-split `useCast.ts`/`useCast.web.ts`; web/Expo Go falls back to a simulated cast sheet. YouTube+HUD can't be media-cast → sheet guides Screen Mirroring for full ride. NEEDS a dev/prod build to test.
- **Tablet/TV fit-to-screen:** workout renders at fixed `DESIGN_W=1024` and scales to fit (down on tablets, up to 2× on TVs) so all panels show without scrolling; phones (height<620) keep scrolling.
- **Alberto AI coaching cues** (LIVE integration): backend `POST /api/coach/cue` uses `emergentintegrations` LlmChat with **claude-sonnet-4-6** and an Alberto persona (former grand-tour champion, cycling professor, team director, sports psychologist). Frontend (`src/lib/coach.ts`) requests a cue every 60s AND on meaningful power/cadence drift (~25s debounce), with rule-based `buildCue()` fallback on error/timeout. Requires `EMERGENT_LLM_KEY` in backend `.env` (set). Cost accrues per cue.

## "Your Training Plan" screen (2026-06-23)
- New strategic (non-calendar) roadmap screen at **`/plan`** — wired to the **Training Plan** sidebar item (home & training screens route "training" → `/plan`; `/training` remains "Today's Training", reachable via "workouts"/coach card).
- Built as real reusable RN components in `src/components/plan.tsx` (+ screen `app/plan.tsx`): `TrainingPlanSidebar` (wide branded sidebar w/ ROU•JAUNE wordmark, labeled nav, coach card + Message button), `PlanHeader/TopStatus/PlanSelector/PlanTabs`, `PlanHeroCard`, `PlanGoalsCard`, `CurrentPhaseRoadmap`+`PhaseCard`, `WeeklyLoadChart` (13-week TSS bars coloured by phase + "You are here" marker), `KeyWorkoutCard`, `AlbertoAdaptationsCard`, `PlanProgressStrip`+`ProgressRing`, `AlbertoTipFooter`. Charts are memoised `react-native-svg`.
- Mock data lives in the exported `PLAN` object (Build & Climb, 12wk/5days, 4 phases, goals, key workouts, adaptation, progress 25%). Coach persona (Alberto/Adriana) flows in via `useCoach()`.
- Landscape tablet-first: whole canvas (sidebar+content, DESIGN_W 1420) scales on both axes to fill the screen (same technique as workout). Interactions (tabs, plan selector cycle, phase/workout taps, Edit Goals, View All, Message, View Progress, nav) fire toasts. Accessibility roles/labels + 44px targets included. Backend/Alberto/FB50 data-model shapes documented in the request are represented in the component props/`PLAN` shape for later API binding.
- **The 3D rider avatar was abandoned** (deleted `src/avatar3d/`, `/avatar-3d` route, kit prefs, rider overlay/button; three/r3f packages left installed but unused).
- Added a **selectable coach persona**: `src/lib/coach-persona.ts` (`COACHES`, module store + `useCoach()` hook + `getCoach/setCoach`, persisted via `prefs.getCoachId/setCoachId`). Two coaches:
  - **Alberto** — male, default, portrait `assets/images/coach_alberto_v2.png`, uses device **Spanish (English) voice 18**.
  - **Adriana** — female, portrait `assets/images/coach_adriana.png`, uses **Spanish (English) voice 7** (slightly higher TTS pitch).
- The **coach toggle** lives at the top of the workout **Audio** panel (`MusicPanel`, testIDs `coach-alberto`/`coach-adriana`). `useWorkoutAudio` maps the active coach → its voice number (falls back to matching-gender / first Spanish-English voice if the exact number isn't on the device), re-picking whenever the coach changes or the persisted coach loads in async on cold start.
- **Name + portrait propagate everywhere** via `useCoach()`: BrandHeader descriptor, home hero signature + `AlbertoCoachCard`, training `TopStatus`/`AlbertoTrainingCard`/toasts, summary sidebar + recap (`"<name>'s recap"`, avatar, "reviewing…").
- **Backend** (`server.py`): `coach_system(name, gender)` builds the persona prompt; `POST /api/coach/cue` and `/api/coach/debrief` accept `coach_name`/`coach_gender`; debrief is cached per-coach on the ride (`debrief_<name>`), so switching coach regenerates. Verified: cue endpoint returns in-persona Adriana text.
- **NOTE:** voice numbers are per-device — the selector shows "Spanish (English) voice N"; #18/#7 map to what the rider sees on their hardware. In the headless web preview `Speech.getAvailableVoicesAsync()` is empty ("Loading device voices…"), so voices/TTS can only be validated on a real device / Expo Go.

## Training Plan action buttons wired (2026-06-23)
- **Edit Goals** → `EditGoalsModal` (`src/components/plan-modals.tsx`): add/edit/delete goals, toggle complete/incomplete, saved via `PUT /api/plan/goals` (persists to `training_plans.goals`). Screen keeps a `goalsOverride` and passes a merged `displayPlan` into `PlanProvider` so the Goals card updates instantly after save.
- **View Progress** → `ProgressModal`: fetches `GET /api/plan/progress` (progress_pct, summary, fitness CTL/ATL/TSB, 12-wk trend series, key metrics, per-week completion bars). Renders a dual-line CTL/ATL SVG trend chart + weekly-completion bars.
- **View All Adaptations** → `AdaptationsModal`: fetches `GET /api/plan/adaptations` (newest-first history, coach-filtered, seeds first entry from cached/static adaptation). Timeline of coach notes with trigger chip + relative time. Backend now records adaptation history (`_record_adaptation`, capped 20) on manual refresh and after each post-ride debrief.
- New lib fns in `src/lib/plan.ts`: `savePlanGoals`, `fetchPlanProgress`, `fetchAdaptations`.

## Coach Chat + Coach Preferences + dynamic signature (2026-06-23)
- **Coach Chat** (Alberto/Adriana Intelligence): two-way AI chat. Backend `POST /api/coach/chat` (per-coach persisted thread in `coach_chats`, feeds last 10 msgs as context, Claude Sonnet 4.6, `coach_chat_system(name,gender,style)` with FB50 + My Peaceful Companion capabilities), `GET/DELETE /api/coach/chat/history`. Frontend `src/lib/coach-chat.ts` + `src/components/CoachChatModal.tsx` (empty-state greeting + suggestions, optimistic send, typing dots, tap-to-play TTS per coach via `src/hooks/useCoachSpeech.ts`). Launched from "Message {coach}" button in `/plan` header (reusable).
- **Coach Preference (Settings)**: new COACH PREFERENCE card — Coaching Style (Balanced/Performance/Calm/Essential) + Voice Guidance (Full/Essential/Visual/Muted), backed by global stores + AsyncStorage prefs (`get/setCoachStyle`, `get/setVoiceGuidance` in prefs.ts; `useCoachStyle/useVoiceGuidance` in coach-persona.ts). Existing coach select + voice preview retained. Chat respects the selected coaching style.
- **Dynamic coach identity**: `CoachPersona` gained `pronouns` + `signature`; plan.tsx `Signature`, `AlbertoTipFooter` ("{name}'s Tip") and `PlanHeader` ("Adapted by {name}") are now coach-dynamic. Locked side-nav order already compliant (data.ts).

## Coach chat context-awareness (2026-06-23)
- `POST /api/coach/chat` now prepends a `_build_rider_context()` snapshot to the prompt: current plan phase + week X/Y, progress (workouts/time/TSS/CTL/ATL/TSB), open goals, most recent ride (workout/route/duration/distance/avg power/TSS from `ride_history`), and readiness (score/status/sleep/HRV/stress from WELLNESS_DATA). Coach references real numbers naturally; verified (e.g. "Week 4 of your Build Phase… TSB +6… last climb on Alpe d'Huez"). Best-effort, never blocks the reply.

## Chat empty-state latest-ride chip (2026-06-23)
- CoachChatModal empty state now fetches `GET /api/rides/history?limit=1` (`fetchLatestRide`) and shows a highlighted yellow chip "Review my {route.name or workout} ride" that seeds a contextual message, surfacing the coach's ride-awareness immediately. Verified: chip reads "Review my Alpe d'Huez ride".

## Wording + post-ride chat invite (2026-06-23)
- Renamed all "Your Coach"/"your coach" → "Your Companion Coach"/"your companion coach" across the app (coach-persona role, data.ts, plan.tsx, plan-modals, workout, HeroRoute, training, settings label + hint).
- Post-ride debrief invite: `/summary` recap card now shows a "Talk to {coach} about this ride" pill (HeroSummaryCard `onChat`) that opens the reusable CoachChatModal — inviting the rider to debrief with their companion coach while it's fresh. Verified via screenshot.

## Gender-correct coach voices + Home chat launcher (2026-06-23)
- **Voice fix:** New `src/lib/coach-voice.ts` centralises a GENDER-FIRST voice picker — Alberto → Spanish-accented **male** voice, Adriana → Spanish-accented **female** voice, kept distinct from each other, with graceful fallbacks (Spanish+gender → gender → distinct → any). Detects gender from device voice names (Jorge/Diego… vs Mónica/Paulina…) + male/female keywords. Replaced the fragile voice-index logic in `useWorkoutAudio.ts` (pickVoiceForCoach now honors a manual pick first, then gender), rewrote `useCoachSpeech.ts` (chat TTS), and updated `settings.tsx` preview to use `resolveBothCoachVoices`. Shared `COACH_PITCH` (alberto 0.9 / adriana 1.06) as a gentle secondary distinction. Settings coach card now shows "Spanish accent · male/female". NOTE: TTS voices can only be validated on a real device / Expo Go (headless web preview has no voices).
- **Home chat launcher:** AlbertoCoachCard gained a "Message {coach}" button (onMessage) → HeroRoute → Home opens the reusable CoachChatModal, making the companion coach reachable from the first screen.

## Voice fine-tuning in Settings (2026-06-23)
- New "VOICE FINE-TUNING" card: (1) **Speaking speed** segmented control (Slower 0.8 / Normal 0.95 / Faster 1.12) persisted globally (`useCoachRate`/`setCoachRate`, prefs `speechRate`), applied to chat TTS, workout cues and previews. (2) **Per-coach voice picker** — lists installed Spanish voices (`loadSpanishVoices`/`listSpanishVoices`, labelled Male/Female N), tap to select+preview, persisted via existing `setVoiceId(coachId,...)`. Empty-state hint shown in web preview (no device voices). `pickCoachVoice`/`resolveBothCoachVoices` now honor each coach's saved manual pick first; useCoachSpeech + Settings preview honor saved picks + chosen speed. Verified UI via screenshot; actual voices/speed only testable on device / Expo Go.

## Workouts hub screen (2026-06-23)
- New route `app/workouts.tsx` (the "Workouts" nav item now points here everywhere; live session stays `/workout`, reachable from training). Matches the provided reference: wide labelled sidebar (`src/components/WideSidebar.tsx`, reusable) with ROUJAUNE logo+wordmark, locked nav order, dynamic coach portrait card (NO Message button) + coach signature, Settings/Help footer.
- Content: header + 7 tabs (All/By Goal/By Duration/By Intensity/FB50/My Workouts/Favorites), ALL WORKOUT TYPES 4×2 grid of `WorkoutTypeCard`s (icon, purpose, SVG mini power-profile, Best-for, View button, favorite star), right column (Workout Categories with counts, Popular This Week, Quick Actions), bottom "Ask {coach}" recommendation panel (dynamic portrait/quote/signature → opens CoachChatModal), footer "{coach}'s Tip". Data in `src/lib/workouts.ts` (static catalog).
- Interactivity: tabs switch sections; category clicks filter grid / open FB50; favorites persist to Favorites tab; all buttons produce toasts. Fully dynamic coach (Alberto/Adriana). Verified by testing agent (iteration_14, all 11 flows pass). Tablet-first landscape.
