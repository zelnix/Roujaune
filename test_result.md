#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================


accessibility_toggles:
  - task: "App-wide Large Text + High Contrast accessibility toggles in Settings"
    implemented: true
    working: true
    file: "frontend/src/lib/a11y.ts, frontend/src/lib/text-scale.ts, frontend/app/_layout.tsx, frontend/app/settings.tsx, frontend/src/lib/auth-context.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added ACCESSIBILITY card in Settings with Large text + High contrast toggles (for the 50+ audience). Global Text/TextInput render patch (text-scale.ts) injects an override into the INPUT style before RN/RN-Web processes it: Large Text multiplies fontSize/lineHeight by 1.22 app-wide; High Contrast promotes dim/neutral body text to #FFFFFF and bumps light font-weights to 600 (accent colours left vivid). Reactive module-store (a11y.ts) persists both flags per rider via /api/rider/settings (backend already merges arbitrary keys) + AsyncStorage cache; refreshes on login, resets on logout/delete (no cross-account leak). AuthGate re-keys the expo-router <Stack> on toggle so the whole app re-renders instantly. Verified end-to-end on web preview (tablet landscape): both toggles flip, persist, and apply app-wide (sidebar + cards + preview) with text visibly larger and dim copy turned bright/bold; expo-router preserved the current route through the re-key (non-disruptive). Demo account reset to OFF baseline."

today_mode_experience_selector:
  - task: "Today Mode selector + experience-aware side navigation (Phase 1)"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/today-mode.ts, frontend/src/components/today/*, frontend/src/components/SideNavigation.tsx, frontend/src/components/app-scaffold.tsx, frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    verified: "iter66 frontend 100% (7/7 acceptance + 8/8 rail regression); polish applied (mtb label truncation, web useNativeDriver guard)."
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added a data-driven Today Mode selector below the ROUJAUNE wordmark in the rail (TodayModeButton + floating dark-glass TodayModeMenu with all 8 activities; Train today + Take a scenic ride available, others 'Coming soon' with badges + disabled). New reactive session store (today-mode.ts) holds experience + per-experience last-route memory (AsyncStorage, reset on logout). SideNavigation + AppScaffold now render the CURRENT experience's nav config (experienceNavigation record) instead of static navItems; coming-soon items show a toast and never navigate. Today screen (index.tsx) swaps content by mode with a 240ms fade (respects reduce-motion): training = existing dashboard untouched; scenic-cycling = new ScenicCyclingTodayView (Lake Garda hero, POV/guided badges, 42m/Relaxed/8 discoveries, BEGIN SCENIC JOURNEY -> /virtual-route, EXPLORE DESTINATIONS -> /routes, prefs summary, 5 destination rows); other modes = FutureActivityTodayView (activity-specific Coming-soon + disabled CTA + Back to Train today). Non-destructive ScheduledWorkoutReminder shown for non-training modes. Verified via screenshots (tablet landscape): selector, menu, scenic switch (nav + content swap, shell mounted), and AppScaffold /plan still renders with new rail + active highlight. Switching modes never touches the training plan/scheduled workout. NEEDS: frontend regression across nav from all rail items + mode switching + coming-soon toasts."


  - task: "server.py restructure Phase 2 — extract Coach + Plan engine and routes"
    implemented: true
    working: "NA"
    file: "backend/server.py, backend/services/plan_engine.py, backend/routes/plan.py, backend/routes/coach.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    verified: "iter65 fix — 29/29 pytest pass. Fixed 6 missing imports (plan.py: os, coach_system; coach.py: json, plans_admin, get_plan, WELLNESS_DATA from routes.plan). No 500s; calendar/review + coach/adaptation/detail confirmed working."
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Completed the deferred P1 refactor. server.py 3850 -> 496 lines. NEW services/plan_engine.py holds the entire deterministic plan engine (BUILD_AND_CLIMB, CTR/RS/RB structured-plan state + hot-reload from DB, _struct_ctx*, _ctr_state/progress/readiness/calendar_week/plan_response, _plan_done, _with_adaptation_meta, LEVEL_PLAN/_plan_for_level, NUDGE_* + _aggregate_ride_zones + _update_adaptive_targets, _free_calendar_week, NO_PLAN). External callers read mutable plan globals via live module-attribute access (plan_engine.CTR_PLAN etc.); functions inside mutate via `global`. NEW routes/plan.py (get_plan, rider/plan assign, onboarding/recommend, plan/targets, plan/adaptations, plan/goals, plan/progress, calendar/week+scheduled+schedule+move+review, workout-favorites, progress, progress/timeline, rider/missed). NEW routes/coach.py (coach/cue, extend-advice, debrief, chat+history, adaptation+detail, plus helpers _build_rider_context, _refresh_adaptation_after_ride, _record_adaptation, _generate_adaptation(+detail), _extend_decision, _chat_id). Dependency is strictly one-way coach->plan->plan_common->rider_common (no cycles). server.py now only keeps: app/middleware setup, TrainerSim + /ws/telemetry, /openapi.json, admin-config router (benchmark thresholds + coaches, still mutating benchmark_routes constants), startup seed (uses plan_engine.CTR/RS/RB + _reload_* + _on_plan_change) and shutdown. Self-verified via curl (greenlantern demo): plan/calendar/progress/coach/onboarding/targets/adaptations + coach chat/cue/extend/adaptation(+detail) all 200; backend boots + seeds cleanly. NEEDS: full backend regression across plan/calendar/coach/progress + admin config + benchmark + rider to confirm zero behavioural change."


  - task: "server.py restructure — extract Rider + Benchmark domains into routes/ + shared services/"
    implemented: true
    working: "NA"
    file: "backend/server.py, backend/routes/rider.py, backend/routes/benchmark.py, backend/services/rider_common.py, backend/services/coach_llm.py, backend/services/plan_common.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    verified: "iter64 — 40/40 backend tests pass, ZERO behavioural regression. Rider + Benchmark domains, engine consumers of moved helpers, and admin cross-module config sync all confirmed."
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Continued the P1 backend modularization (server.py 3850 -> 2610 lines). Extracted: (1) ALL rider-domain endpoints into routes/rider.py — /rider/profile,appearance,prefs,settings,kv,prs,account,season,achievements,supplementary/complete,readiness,level,checkin,readiness/today + /progress/summary; (2) ALL benchmark endpoints into routes/benchmark.py — /benchmark/profile,results,sessions,results/{id}/decision,zones,plan-gate,nudge,plan-review(+apply/dismiss),trends,week(+start/day/cancel),recommendation. Shared helpers moved to services/: rider_common.py (_rider_doc,_rider_line,_cal_status,RIDER_DEFAULT), coach_llm.py (coach_system,coach_chat_system,STYLE_TONE,coach_line), plan_common.py (STRUCTURED_PLAN_IDS,_RIDE_PREFIX,_active_plan_id,_plan_id_or_active). Admin benchmark-config router now mutates benchmark_routes.BM_RETEST_DAYS/FTP_RETEST_DAYS (module attribute) so cross-module admin edits stay in sync with the benchmark route. Self-verified via curl (demo greenlantern): all rider GET/PUT/POST 200, all benchmark endpoints 200 incl. plan-gate LLM coachMessage, admin /admin/benchmark/config GET+PUT+restore 200, and engine endpoints that consume the moved helpers still 200 (/plan, /calendar/week uses _cal_status, /coach/chat/history uses _rider_line). NEEDS: full backend regression to confirm no behavioural change across rider/benchmark/plan/calendar/coach/progress and admin config. NOTE: coach + plan engines intentionally left in server.py (deeply intertwined via module-global mutation — CTR/RS/RB reload); deferred to a future pass."


benchmark_wp_c_d_e_g_and_ui:
  - task: "WP-C personalised recommendation, WP-G plan-start benchmark gate (rule + LLM), WP-D Benchmark Week (calendar overlay), WP-E plan-change review + Progress trends"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/benchmark/index.tsx, frontend/app/plan.tsx, frontend/app/progress.tsx, frontend/src/components/benchmark/*, frontend/src/lib/benchmark/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "WP-C: GET /api/benchmark/recommendation scores tests by missing metrics/recency/confidence/capability/power; landing 'Recommended Next Benchmark' + WHY reasons wired (verified iter49). WP-G: GET /api/benchmark/plan-gate returns rule-based status (required/recommended/approved/submaximal/deferred/coach_review) + best-effort in-persona LLM coachMessage; rendered as PlanBenchmarkGate on Plan Overview (verified iter49: beginner→submaximal). WP-D: benchmark_week collection + start/get/patch/cancel endpoints (default 7-day plan, maximal spacing enforced, calendar-week overlay); BenchmarkWeekCard on landing (verified via screenshot: 7-day schedule + Start/Skip/Replace/Reschedule/Cancel). WP-E: GET/POST plan-review (proposes settings.ftp vs benchmark_profile.ftp, Apply updates settings.ftp, Keep dismisses) + GET benchmark/trends; PlanReviewCard on landing + BenchmarkTrendsCard on Progress. Curl-verified: sim-accept never changes profile, real-accept sets profile.ftp, apply sets settings.ftp, spacing rejection. Screenshot-verified plan-review card 287→305 +6.3% with zone preview. NOTE: Green Lantern has SEEDED demo benchmark data (profile.ftp=305 + one accepted result) to demo WP-C/E — can be cleared."
  - task: "Today screen UI refinements + weather location"
    implemented: true
    working: true
    file: "frontend/app/index.tsx, frontend/src/components/HeroRoute.tsx, frontend/src/components/TodayTrainingCard.tsx, frontend/src/components/AlbertoCoachCard.tsx, frontend/src/components/virtual-route/VirtualRidePlayer.tsx, backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Per user: (1) Next Scheduled Workout card now overlaid on hero graphic beside the coach card via HeroRoute sideSlot with matched height + compact glass style. (2) Removed rectangular red-glow boxShadow behind the coach 'View Next Scheduled Workout' button. (3) Card order now Training Plan/Progress/Achievements/Wellness in one row, Community moved to bottom row. (4) Virtual-route live ride pause/exit buttons + bottom icon row scaled down substantially (exit 88→50, pause 72→50, icons 24→18). (5) Home weather location set to South Perth, Australia (lat -31.9833, lon 115.8586) — live Open-Meteo now shows ~13°C. All verified via screenshots."


benchmark_part7_9_10:
  - task: "Part 7 — Setup launches Workout Player; player runs 4 core protocols with sim data"
    implemented: true
    working: "NA"
    file: "frontend/app/benchmark/setup/[id].tsx, frontend/app/benchmark/player/[id].tsx, frontend/src/lib/benchmark/player.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Setup 'Begin Test' now navigates to /benchmark/player/{id}?session={sid} (was a Part-7-placeholder). Player is fully stateful: timeline from intervals, sim telemetry (SIM DATA badge), ramp step config (10/15/20/25W), pause (maximal-warning), stop reasons (safety vs non-safety), sensor-dropout inject, session recovery. Player now captures per-interval aggregates (avg/max power, HR, cadence in-band, halves) and on completion/limit-stop computes a result and navigates to /benchmark/result/current. Safety stops (pain/unwell) stay on the safety screen and do NOT produce a result. TEST 4 protocols: Ramp (open-ended → Stop 'reached my limit' → result FTP+MAP), 20-Min FTP (long — use the fact that intervals auto-advance; verify it runs & Stop early works), Aerobic Efficiency (submaximal, no pause warning), Cadence Control (primary metric = CADENCE, target rpm shown). Credentials greenlantern@roujaune.app / rideon9900."
  - task: "Part 9 — Result page: versioned calc, 0–100 confidence, reflection, accept/exclude/save"
    implemented: true
    working: "NA"
    file: "frontend/app/benchmark/result/current.tsx, frontend/src/lib/benchmark/calc.ts, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "computeResult() maps each test's calculation method (ramp_map ×0.75, twenty_min ×0.95, five/one-min power, sprint_peak, aerobic_decoupling, cadence_consistency, recovery_hrr) into headline metrics + a 0–100 confidence (completion + steadiness + sensor level + pauses). Result page shows primary metric, confidence meter, measurements, insight, feel chips + notes, and Accept/Save-for-later/Exclude → POST /api/benchmark/results. Because runs are SIM DATA (isDevData), accepting shows a clear 'profile not changed' notice. Backend verified via curl: sim accept does NOT change profile; real accept sets profile.ftp. TEST: finish a Ramp via player → result page shows Estimated FTP + confidence → Accept → dev notice → back to landing."
  - task: "Part 10 — Landing: results with decision actions, Training Zones, FTP trend"
    implemented: true
    working: "NA"
    file: "frontend/app/benchmark/index.tsx, frontend/src/lib/benchmark/api.ts, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Recent Results rows now show primary metric + confidence% + decision chip (Accepted/Review/Excluded) and Accept/Exclude buttons for pending results (POST /api/benchmark/results/{id}/decision; accept updates profile+zones ONLY for non-sim). New TRAINING ZONES card (GET /api/benchmark/zones, 7-zone model from FTP; falls back to settings.ftp=287 for Green Lantern). BENCHMARK HISTORY now renders a View-based FTP trend (bars + delta) from FTP-bearing non-excluded results, else the placeholder. Backend curl verified: zones from ftp 287, decision endpoint, sim-guard. NOTE: since all player data is SIM, accepting from the player result page will NOT populate the real profile/zones — that is intended. Zones still render from settings.ftp."


user_problem_statement: "ROUJAUNE cycling app — MULTI-USER: auth (email/password + Emergent Google + Apple), per-user data scoping, onboarding that classifies rider level + recommends a plan (or ride free), account sign-out. Green Lantern is a real user migrated to a demo account (greenlantern@roujaune.app / rideon9900)."

multi_user_backend:
  - task: "Multi-user auth + per-user scoping + Green Lantern migration"
    implemented: true
    working: true
    file: "backend/auth.py, backend/server.py"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "users+user_sessions, bcrypt email/password, Emergent Google (/api/auth/google {session_id}), Apple (/api/auth/apple, iOS-only), /me, /logout. AuthMiddleware resolves Bearer→ContextVar; all /api/* require auth except /api/auth/{register,login,google,apple}. udb proxy auto-injects user_id into 14 collections. Startup migrated single-user data to demo account. Self-tested via curl."
  - task: "Onboarding recommend + level classifier + ride-free + assign"
    implemented: true
    working: true
    file: "backend/server.py"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/onboarding/recommend classifies level + recommends plan; POST /api/rider/plan assigns (plan_id 'none' = ride free) + marks onboarded. couch-to-road=Beginner, build-and-climb=Intermediate."

multi_user_frontend:
  - task: "Auth UI + route guard + onboarding + sign-out"
    implemented: true
    working: "NA"
    file: "frontend/app/_layout.tsx, login.tsx, onboarding.tsx, profile.tsx, src/lib/auth-context.tsx, src/lib/session.ts"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "AuthGate redirects: no user→/login, !onboarded→/onboarding, else app. Global fetch patched to attach Bearer. login (email/pw+Google+Apple), onboarding (5-Q→recommend→pick/ride-free), profile sign-out. Verified via screenshot: demo login → Green Lantern dashboard."

multi_user_agent_comm:
    -agent: "main"
    -comment: "Demo: greenlantern@roujaune.app / rideon9900. All /api/* need Bearer except 4 public auth endpoints. TEST: register NEW user via UI → /onboarding → pick plan or ride-free → home with isolated empty data (vs Green Lantern's data). Green Lantern login → migrated couch-to-road. Sign out from Profile → login. Backend: 401 w/o token; 409 dup register; 401 bad pw; two-user data isolation. Apple = iOS-BUILD-ONLY. Google needs real redirect — just verify button initiates. CLEANUP after: mongosh mongodb://localhost:27017/test_database --eval 'db.users.deleteMany({user_id:{$ne:\"user_greenlantern\"}}); db.user_sessions.deleteMany({user_id:{$ne:\"user_greenlantern\"}})'. NEVER delete user_greenlantern."

user_problem_statement_prev: "ROUJAUNE cycling app — fork session: /training date hydration, CalendarCard key fix, Seated Mode toggle, Native BLE sensors feeding WS telemetry."

backend:
  - task: "Companion plan editing — chat-driven edits (Part A) + adaptive auto-ease on low compliance (Part B)"
    implemented: true
    working: "NA"
    file: "backend/companion_plan.py, backend/server.py, frontend/src/components/CoachChatModal.tsx, frontend/src/lib/plan.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Part A: POST /api/coach/chat now detects plan-edit intent (keyword gate), asks the LLM to emit sanitized structured ops (allowlist: day duration/zone/tss/title/rpe, week objective/title; max 8 ops; validated week+day range), applies them via plans_admin.adapt_plan (source='rider-request'), records an adaptation-history note, and returns plan_updated + plan_change. The coach reply confirms the change. Self-tested: 'shorten my First Endurance Ride to 20 minutes' → plan_updated true, week1 day5 30->20 min, reply confirmed; restored to 30. Part B: after a ride debrief with 0<compliance<70 (couch-to-road only), _refresh_adaptation_after_ride eases the NEXT week's cycling days ~10% (floor 15 min) once (plan_state.eased_weeks marker), and the adaptation note mentions it. Self-tested: compliance 55 → week2 25/30/35 -> 22/27/32, eased_weeks=[2]; restored pristine. Frontend: CoachChatModal shows a 'Plan updated · ...' pill (testID chat-plan-notice) and calls onPlanUpdated; /plan passes usePlan().refresh so the plan refetches. NEEDS: retest chat-edit flow end-to-end via UI + confirm pill + plan refresh; confirm non-edit chat messages do NOT set plan_updated."

  - task: "Plan definitions in MongoDB — portable plans_admin router + non-destructive seed"
    implemented: true
    working: "NA"
    file: "backend/plans_admin.py, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New portable module backend/plans_admin.py exposes /api/plans CRUD + structured editors (PUT /plans/{id}/weeks/{n}, PATCH /plans/{id}/weeks/{n}/days/{i}, POST /plans/{id}/adapt) writing to a `plans` collection. On startup, server seeds couch-to-road (from JSON) + build-and-climb (from BUILD_AND_CLIMB) ONLY if missing (non-destructive). couch-to-road edits reload an in-memory cache via on_change so /api/plan + /api/calendar/week reflect edits instantly (no rebuild). Self-tested: PATCH day duration 20->22 reflected in /api/plan and /api/calendar/week; adapt endpoint applied + recorded edit_history; build-and-climb PATCH persisted. Reset plans collection to pristine afterwards. NEEDS regression: GET /api/plan (Green Lantern couch-to-road) full structure + progress unaffected; GET /api/plan?id=build-and-climb definition from DB overlaying training_plans goals; PUT /api/plan/goals still works (overlay)."

  - task: "POST /api/coach/cue — seated flag adjusts cue (no standing efforts)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added seated:bool to CoachCueRequest; when true, prompt directs coach to keep rider seated (no out-of-saddle cues). Self-tested via curl: seated cue returned with no standing instruction."
  - task: "WS /api/ws/telemetry — {type:'sensor'} overrides sim with real BLE readings (4s TTL) then falls back"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "TrainerSim gained sensor_power/cadence/hr with a 4s freshness window; step() overrides sim values while fresh, sample() source flips to 'sensor'. Self-tested with a websockets client: {power:333,cadence:101,hr:149} applied then fell back to 'trainer' after 5s."

frontend:
  - task: "/training header shows the active workout's real calendar date"
    implemented: true
    working: "NA"
    file: "frontend/app/training.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "dateLabel now derived from useCalendarWeek() day whose cycling.workout_id === activeId, formatted 'dddd, D MMMM YYYY'. Falls back to plan footer. Needs verify for Green Lantern ctr-ride-* (e.g. 'Tuesday, 28 July 2026')."
  - task: "Home CalendarCard — no React unique-key warning"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CalendarCard.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "today-scope plan rows keyed by `${type}-${id ?? index}` (fb50/wellness have no id). Verify no key warning in console on home."
  - task: "Seated Mode toggle in workout SettingsPanel → seated cues + SEATED pill"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/settings.ts, frontend/src/components/workout.tsx, frontend/app/workout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "settings.seatedMode persisted; toggle-seatedMode switch in SettingsPanel (verified visible via screenshot). When on, coachCtx.seated=true (sent to /api/coach/cue), buildCue fallback uses seated variants, and AlbertoLiveCue shows a SEATED pill. Verify toggle persists + pill appears."
  - task: "Bluetooth Sensors panel (native BLE) — opens from workout menu; web shows needs-native-build notice"
    implemented: true
    working: "NA"
    file: "frontend/src/components/BleSensorsPanel.tsx, frontend/src/hooks/useBleSensors.ts, frontend/src/hooks/useBleSensors.web.ts, frontend/src/lib/ble/parse.ts, frontend/app/workout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Menu item 'Bluetooth Sensors' opens BleSensorsPanel. On web/Expo Go supported=false → shows 'needs a native build' notice (verified via screenshot, testID ble-unsupported). GATT parsers 11/11 unit tests pass. Actual pairing NOT testable without a native build. sendSensor pushes readings to WS (backend verified)."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "/training header shows the active workout's real calendar date"
    - "Home CalendarCard — no React unique-key warning"
    - "Seated Mode toggle in workout SettingsPanel → seated cues + SEATED pill"
    - "Bluetooth Sensors panel opens from workout menu; web shows needs-native-build notice"
    - "POST /api/coach/cue seated flag"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -comment: "Fork tasks: (1) /training header date hydration, (2) CalendarCard key warning fix, (3) Seated Mode toggle (settings + cues + SEATED pill + backend seated flag), (4) Native BLE sensors (react-native-ble-plx) feeding the WS telemetry contract. Backend WS sensor override + coach/cue seated self-tested and pass. GATT parsers 11/11 unit tests pass. Rider 'Green Lantern' drives couch-to-road; cleanup after summarize/supplementary tests: mongosh test_database delete ride_history+supplementary_log AND `sudo supervisorctl restart backend`. IMPORTANT: real Bluetooth pairing CANNOT be tested on web/Expo Go — only verify the panel opens and shows the native-build notice (testID ble-unsupported). To open the workout three-dot menu on web, the ellipsis (testID menu-button) is overlapped by the media bar — dispatch a DOM click or use force. Then click testID menu-sensors."

previous_agent_communication_iter1:
    -agent: "main"

backend:
  - task: "GET /api/rider/season?days=N — period-filtered aggregates"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added optional days query param filtering ride_history by created_at within last N days. days=0 = all-time. ride_history was cleared (reset), so expect zeros currently."
  - task: "GET /api/rider/achievements — auto-unlock badges from ride history"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Computes unlocked badges (First Ride, Century Club, Big Climber, 500/1000 km, 3/7-day streak, Everest) from ride_history aggregates. Returns [] when no rides."
  - task: "GET /api/connections — services updated (Google Fit + Samsung Health added, TrainingPeaks removed)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Services list now: Strava, Garmin, Apple Health, Google Fit, Samsung Health, Harmony Wellness. TrainingPeaks removed. devices no longer served (frontend uses settings)."

frontend:
  - task: "Profile: YOUR PROGRESS card with period pills (7/30/90/365) + reusable ProgressPanel"
    implemented: true
    working: "NA"
    file: "frontend/app/profile.tsx, frontend/src/components/ProgressPanel.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Renamed THIS SEASON -> YOUR PROGRESS; horizontally scrollable period pills; stats refetch per period."
  - task: "Profile: edit FTP + show regional details; avatar/flame/bell removed from top"
    implemented: true
    working: "NA"
    file: "frontend/app/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "FTP field added to edit modal (persists to settings.ftp, disables ftpAuto). Location line shown. TopStatus fully removed on profile."
  - task: "Profile: achievements auto-unlock from backend"
    implemented: true
    working: "NA"
    file: "frontend/app/profile.tsx, frontend/src/lib/rider-profile.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "useRiderAchievements() fetches /api/rider/achievements; empty state shown when none."
  - task: "Home: metric strip real weekly data (rides/time/distance/elevation) + FTP"
    implemented: true
    working: "NA"
    file: "frontend/src/components/MetricSummaryStrip.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Fetches /api/rider/season?days=7 + settings.ftp. Verified rendering (all 0 after reset)."
  - task: "Home: flame->progress modal, bell->notifications (tap-to-read, mark read/unread), avatar shows user avatar"
    implemented: true
    working: "NA"
    file: "frontend/app/index.tsx, frontend/src/components/HeroRoute.tsx, frontend/src/components/NotificationsModal.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Smoke-tested via screenshot script: all 3 flows opened. Avatar falls back to person icon when none uploaded."
  - task: "Workout: track control moved to Audio panel; now-playing pills removed from media bar + HUD; music random rotation"
    implemented: true
    working: "NA"
    file: "frontend/src/hooks/useWorkoutAudio.ts, frontend/src/components/workout.tsx, frontend/app/workout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "10 named tracks, random shuffle; Skip control now in MusicPanel only. Audio playback itself only verifiable on device/Expo Go."
  - task: "TopStatus (avatar/flame/bell) removed from all non-home screens"
    implemented: true
    working: "NA"
    file: "frontend/src/components/app-scaffold.tsx, plan.tsx, calendar.tsx, workouts.tsx, workout-list.tsx, training.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Removed from AppScaffold + all custom-header screens. Home retains it."
  - task: "Settings: Rider profile card removed; Connections: real device state from settings"
    implemented: true
    working: "NA"
    file: "frontend/app/settings.tsx, frontend/app/connections.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Settings rider profile card removed. Connections devices now reflect settings.hasTrainer/hasWearable with Connect/Disconnect."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "PREF PERSISTENCE (both): all rider preferences now persist server-side (cross-device) with an AsyncStorage cache. NEW GET/PUT /api/rider/settings (user-scoped `settings` collection) stores {hasTrainer,hasWearable,demoMode,hudEnabled,ftp,ftpAuto,seatedMode,homeCity,homeLat,homeLon}. useSettings loads local→merges remote→writes both on change. Coaching prefs (coach_style, voice_guidance, speech_rate) now write-through to /api/rider/prefs and hydrate on startup via coach-persona.initCoach → hydrateRiderPrefs()."
    - "AUTO-REFRESH ADAPTATION (both): after a completed ride, POST /api/coach/debrief fires a background task that now regenerates BOTH the short adaptation note AND the detailed reasoning cache (adaptation_detail_<coach>). GET /api/plan now returns adaptation_ai_<coach>_at + adaptation_detail_<coach>_at timestamps (via _with_adaptation_meta) for structured plans so the client can detect the refresh."
    - "PLAN-UPDATED NUDGE (frontend): PlanUpdatedNudge (testID plan-updated-nudge) shows at the TOP of the Today screen when usePlanBadge() detects a fresh adaptation vs last-seen; title '<coach> updated your plan'; tapping (or 'View') marks seen + navigates to /plan; a dismiss X (testID plan-updated-nudge-dismiss) clears it. plan-badge now checks both alberto/adriana timestamps."
    - "DATA HYGIENE: deduped training_plans collection (had duplicate id docs) and added a UNIQUE index on `id` so adaptation caches write/read deterministically."
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -comment: "FOUR MORE FEATURES on top of forecast/digest/segment. (1) CLIMB LEADERBOARD: GET /api/analysis/climb-leaderboard clusters every GPS climb (backend/segments.py) into repeated climbs (>=2 attempts) ranked fastest-first with pr + gap_s. New screen /climbs (linked from /fitness Personal Records header, testID climbs-link). Demo account: 1 climb 'Col de Test' 171m x2 (PR 10:13, attempt 2 13:23 +3:10). (2) FORM TARGET: GET/PUT /api/analysis/event stores event_date/event_name; GET /api/analysis/form-target projects Form/TSB onto the event date (fresh if >5). /fitness 'Form Target' card: event name input + In 4/8/12 wks presets (testIDs event-in-4w etc) + Clear + result box (testID form-target-result). (3) DIGEST SHARE: 'Share' button (testID digest-share) on the Weekly Digest card opens the existing ShareCardModal with a branded WEEKLY RECAP card (TSS/rides/hours/distance). (4) COACH WEEKLY NOTE: GET /api/coach/weekly-note?coach_name=&coach_gender=&refresh= -> LLM (claude via emergentintegrations) returns {note, focus, has_activity}, cached per ISO-week+coach in udb.settings. /fitness 'Coach's Weekly Note' card shows note + 'This week:' focus + Listen TTS button (testID weekly-note-play) + Regenerate (weekly-note-refresh). TEST REQUEST: BACKEND — all 4 endpoint shapes; climb-leaderboard on demo returns 1 climb w/ 2 attempts & correct pr/gap; form-target after PUT event returns projected_form/state/fresh/days_out; weekly-note returns non-empty note+focus (LLM). FRONTEND (demo@roujaune.app / demo9900, landscape ~1024x1000): /fitness shows Coach's Weekly Note (Listen btn), Form Target (set 'In 4 wks' -> form-target-result appears; Clear removes it), Weekly Digest Share button opens modal; /climbs shows 'Col de Test' with Personal best (10:13) + Attempt 2 (13:23 +3:10). Green Lantern (greenlantern/rideon9900): /climbs shows empty state (no repeated GPS climbs), form-target has an event set only if PUT. Do NOT ride to completion. Server ~2026-08. Prior iter78 (forecast/digest/segment) already PASS."

    -agent: "main"
    -comment: "THREE ANALYSIS FEATURES added. (1) FORM FORECAST: GET /api/analysis/pmc also returns forecast[] (next forecast_days, default 14, projected from recent 14-day avg daily TSS) + forecast_fitness/forecast_form/forecast_state/projected_daily_tss. /fitness shows a dashed forecast on the PMC chart + an 'In 2 weeks' card. (2) WEEKLY DIGEST: GET /api/analysis/weekly-digest returns this_week{tss,hours,rides,distance_km}, deltas vs last week, new_records[]. Shown as a 'This Week' recap card atop /fitness. (3) SEGMENT COMPARE: GET /api/analysis/segment-compare?a=&b= (backend/segments.py) detects+matches the same GPS climb, returns aligned base->summit speed/elevation series + per-climb time/avg-speed + delta. /compare has a 'Whole ride'/'Same climb' toggle (testID mode-climb); climb mode shows an 'X faster up this climb' banner (testID segment-banner) + chart (testID segment-compare). TEST DATA on demo@roujaune.app / demo9900: TWO uploaded GPX rides both 'Col de Test' (same ~171m climb; a=e3cb783f-fbb9-4306-b0f2-57980b93fa62 slower, b=c95da076-69c2-455d-bd1e-975f0821eb8e faster) -> matched:true 1 segment. Green Lantern has NO GPS rides -> matched:false (graceful, no crash). Do NOT ride to completion. Main agent will delete demo's test rides after testing."

    -agent: "main"
    -comment: "HEALTH SYNC (bidirectional Apple Health / Health Connect). NEW backend native-health endpoints in routes/connections.py + providers/native.py now registers health_connect alongside apple_health. TEST REQUEST — BACKEND ONLY (frontend native health can't run in preview): login greenlantern@roujaune.app / rideon9900. (a) GET /api/connections includes BOTH device_native providers 'apple_health' AND 'health_connect' (kind='device_native', requires_native_build true). (b) POST /api/connections/native/apple_health/link {\"permissions\":[\"read\",\"write\"]} returns connection_status='connected', connected=true. (c) POST /api/connections/native/health_connect/import {\"workouts\":[{\"id\":\"hc-1\",\"startDate\":\"2026-06-01T08:00:00Z\",\"endDate\":\"2026-06-01T09:00:00Z\",\"distanceMeters\":25000,\"calories\":600,\"title\":\"Cycling\"}]} returns imported>=1; the ride then appears in GET /api/connections/activities and GET /api/activities. (d) POST /api/connections/native/health_connect/pushed {\"count\":1} returns ok:true. (e) Unknown/non-native provider id (e.g. 'strava') on /native/{id}/link returns 404. (f) REGRESSION: existing OAuth connections flow unaffected (GET /api/connections still returns garmin+google_fit with correct not_configured/setup status). CLEANUP AFTER TEST: DELETE /api/connections/health_connect/data and POST /api/connections/apple_health/disconnect + /api/connections/health_connect/disconnect so Green Lantern stays pristine (no imported rides, native providers disconnected). Server date ~2026-08. Do NOT ride a route to completion."

    -agent: "main"
    -comment: "PREF PERSISTENCE + AUTO-REFRESH ADAPTATION NUDGE. Verified by me: GET/PUT /api/rider/settings persists per user; POST /api/coach/debrief background task regenerates couch-to-road note_at + detail_at (confirmed fresh timestamps in Mongo); /api/plan now surfaces adaptation_ai_alberto_at; PlanUpdatedNudge renders on the Today screen (testID present). Fixed duplicate training_plans docs + added unique index on id."

#====================================================================================================