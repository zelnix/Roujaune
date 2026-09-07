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
    -comment: "FOUR MORE FEATURES (round 5). (1) MILESTONE PROGRESS RING: GET /api/analysis/milestones now also returns prev_rides/rides_progress + prev_km/km_progress (0..1). /fitness Milestones card shows an SVG ProgressRing toward the nearest next milestone (demo: '8 to 10' rides). (2) CLIMB DETAIL SPLITS: GET /api/analysis/climb-detail now returns splits[] (n=4 equal-distance segments; each {index,from_d,to_d,times:{activity_id:sec},fastest}). /climb/[id] renders a 'Split times' table highlighting the fastest attempt per split. (3) COACH MILESTONE SHOUT-OUT: GET /api/coach/milestone-note?coach_name=&coach_gender= -> when milestones.recent!=null, LLM returns {has_milestone:true, note}, cached per milestone. MilestonesCard celebration banner gets a Listen (TTS) button (testID milestone-listen). Returns {has_milestone:false} when no recent milestone. (4) STREAK FREEZE: GET /api/analysis/streak now returns freeze_tokens (earned=min(3,1+weeks_ridden//4)-frozen), frozen_weeks, can_freeze, gap_week; POST /api/analysis/streak-freeze spends a token to bridge the off-week breaking the streak (returns {ok:true,frozen_week} or {ok:false,reason:'no_tokens'|'nothing_to_freeze'}). StreakCard shows 'N Streak Freezes banked' + a 'Use a freeze' button (testID streak-freeze-btn) only when can_freeze. IMPORTANT FIX: an accidental duplicate '@router.get(\"/streak\")' stub (returning null) was removed — streak now returns full JSON. TEST REQUEST: BACKEND — milestones has rides_progress/prev_rides etc; climb-detail (demo id climb-45.2-6.1108) has splits len 4 each with fastest + times for both attempts; streak has freeze_tokens/can_freeze/gap_week and returns non-null; streak-freeze on demo returns ok:false nothing_to_freeze (no 500); milestone-note demo -> has_milestone:false. FRONTEND (demo, landscape ~1024x1050): /climb/climb-45.2-6.1108 shows 'Split times' table (PB fastest each split, ⚡); /fitness Milestones card shows the progress ring '8 to 10' + Streak card shows '1 Streak Freeze banked'. Do NOT ride to completion. Prior iters 78-81 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "FOUR MORE FEATURES (round 4). (1) CLIMB DETAIL PAGE: GET /api/analysis/climb-detail?id=<climb-id> returns {found, name, gain_m/length_m/grad_pct, profile:[{d,ele}], attempts:[{...,series:[{d,speed,t}]}]}. New screen app/climb/[id].tsx (elevation profile area + every attempt's speed overlaid base->summit + attempt list). Reached from /climbs expanded section link 'View elevation & overlay' (testID climb-detail-<id>). climb ids like 'climb-45.2-6.1108'. (2) TAPER AUTO-APPLY: POST /api/coach/taper-apply {coach_name} eases the plan week leading into the event via companion_plan.auto_ease_ops (reuses adaptive engine); returns {applied:true, week} for structured plans (greenlantern couch-to-road), {applied:false, reason:'unstructured'|'no_plan'} otherwise (demo has unstructured plan). Idempotent (already:true). FormTargetCard taper block now has an 'Apply taper to my plan' button (testID taper-apply-btn) shown when not fresh. (3) MILESTONES: GET /api/analysis/milestones returns lifetime {total_rides,total_km,total_hours,total_tss}, `recent` (milestone just crossed by last ride, else null) + next_rides/next_km w/ remaining. /fitness 'Milestones' card (tiles + progress-to-next; celebration banner+Share testID milestone-celebrate/milestone-share only when recent!=null). (4) STREAK REMINDERS (in-app, NOT push): /api/analysis/streak now returns at_risk (active streak && 0 rides this week && weekday>=Thu), days_left, weekday; StreakCard shows an amber nudge (testID streak-at-risk) when at_risk. TEST REQUEST: BACKEND — climb-detail shapes (demo id climb-45.2-6.1108: found, profile>=2, 2 attempts w/ series); milestones shapes (demo: 2 rides, next_rides 10, next_km 100, recent null); taper-apply demo->unstructured, greenlantern->applied:true week N (idempotent already:true on 2nd call); streak at_risk/days_left present. FRONTEND (demo, landscape ~1024x1000): /fitness shows Milestones card + Consistency Streak; /climbs expand -> 'View elevation & overlay' link opens /climb/[id] showing overlay chart + 'Every attempt'; Form Target taper block has 'Apply taper to my plan' button (demo unstructured -> tapping shows the 'needs a structured plan' message). Do NOT ride to completion. Prior iters 78/79/80 PASS. Server ~2026-08. NOTE: greenlantern plan week may already be eased from main-agent curl test (idempotent)."

    -agent: "main"
    -comment: "FOUR MORE FEATURES (round 3). (1) CLIMB MAP PREVIEW: GET /api/analysis/climb-leaderboard now includes per-climb `path` ([[lat,lng]...] ~24pts of the PR attempt) rendered as an SVG mini-map thumbnail on /climbs cards. (2) RECORD CELEBRATION: climb-leaderboard also returns `new_pr` (fastest attempt is the rider's most recent ride AND beats prior best) + `pr_improvement_s`; /climbs shows a celebration banner (testID pr-celebrate) + Share (pr-share) and a 'PB' flame tag on the climb. (3) TAPER PLAN: GET /api/coach/taper-note?coach_name=&coach_gender= -> when form-target is not fresh, LLM returns {note, actions[]} suggesting the final-week taper (cached per event+coach in udb.settings). FormTargetCard shows it (testID taper-plan) with Listen TTS (taper-play) when projected form isn't fresh. Returns {has_event:false} if no event, {fresh:true} if already fresh. (4) SHARE STREAKS: GET /api/analysis/streak -> {current_weeks,best_weeks,this_week_rides,active,weeks_ridden} consecutive ISO weeks with >=1 ride; /fitness 'Consistency Streak' card + Share streak button (testID streak-share) opens ShareCardModal. TEST DATA: demo@roujaune.app/demo9900 has 2 'Col de Test' GPS rides (climb path + new_pr:true improvement 190s) and an event 'Gran Fondo' (~21 days out, NOT fresh -> taper triggers). Green Lantern greenlantern/rideon9900 has ride history (streak works) but no GPS climbs (/climbs empty). TEST REQUEST: BACKEND — climb-leaderboard path len>=2 & new_pr/improvement correct; streak shapes; taper-note returns note+actions when event set & not fresh, {has_event:false} when no event. FRONTEND (demo, landscape ~1024x1000): /climbs shows pr-celebrate banner + mini-map + PB tag; /fitness shows Consistency Streak card (streak-share) + Form Target taper-plan block (Listen). Do NOT ride to completion. Prior iters 78/79 already PASS. Server ~2026-08."

    -agent: "main"
    -comment: "FOUR MORE FEATURES on top of forecast/digest/segment. (1) CLIMB LEADERBOARD: GET /api/analysis/climb-leaderboard clusters every GPS climb (backend/segments.py) into repeated climbs (>=2 attempts) ranked fastest-first with pr + gap_s. New screen /climbs (linked from /fitness Personal Records header, testID climbs-link). Demo account: 1 climb 'Col de Test' 171m x2 (PR 10:13, attempt 2 13:23 +3:10). (2) FORM TARGET: GET/PUT /api/analysis/event stores event_date/event_name; GET /api/analysis/form-target projects Form/TSB onto the event date (fresh if >5). /fitness 'Form Target' card: event name input + In 4/8/12 wks presets (testIDs event-in-4w etc) + Clear + result box (testID form-target-result). (3) DIGEST SHARE: 'Share' button (testID digest-share) on the Weekly Digest card opens the existing ShareCardModal with a branded WEEKLY RECAP card (TSS/rides/hours/distance). (4) COACH WEEKLY NOTE: GET /api/coach/weekly-note?coach_name=&coach_gender=&refresh= -> LLM (claude via emergentintegrations) returns {note, focus, has_activity}, cached per ISO-week+coach in udb.settings. /fitness 'Coach's Weekly Note' card shows note + 'This week:' focus + Listen TTS button (testID weekly-note-play) + Regenerate (weekly-note-refresh). TEST REQUEST: BACKEND — all 4 endpoint shapes; climb-leaderboard on demo returns 1 climb w/ 2 attempts & correct pr/gap; form-target after PUT event returns projected_form/state/fresh/days_out; weekly-note returns non-empty note+focus (LLM). FRONTEND (demo@roujaune.app / demo9900, landscape ~1024x1000): /fitness shows Coach's Weekly Note (Listen btn), Form Target (set 'In 4 wks' -> form-target-result appears; Clear removes it), Weekly Digest Share button opens modal; /climbs shows 'Col de Test' with Personal best (10:13) + Attempt 2 (13:23 +3:10). Green Lantern (greenlantern/rideon9900): /climbs shows empty state (no repeated GPS climbs), form-target has an event set only if PUT. Do NOT ride to completion. Server ~2026-08. Prior iter78 (forecast/digest/segment) already PASS."

    -agent: "main"
    -comment: "THREE ANALYSIS FEATURES added. (1) FORM FORECAST: GET /api/analysis/pmc also returns forecast[] (next forecast_days, default 14, projected from recent 14-day avg daily TSS) + forecast_fitness/forecast_form/forecast_state/projected_daily_tss. /fitness shows a dashed forecast on the PMC chart + an 'In 2 weeks' card. (2) WEEKLY DIGEST: GET /api/analysis/weekly-digest returns this_week{tss,hours,rides,distance_km}, deltas vs last week, new_records[]. Shown as a 'This Week' recap card atop /fitness. (3) SEGMENT COMPARE: GET /api/analysis/segment-compare?a=&b= (backend/segments.py) detects+matches the same GPS climb, returns aligned base->summit speed/elevation series + per-climb time/avg-speed + delta. /compare has a 'Whole ride'/'Same climb' toggle (testID mode-climb); climb mode shows an 'X faster up this climb' banner (testID segment-banner) + chart (testID segment-compare). TEST DATA on demo@roujaune.app / demo9900: TWO uploaded GPX rides both 'Col de Test' (same ~171m climb; a=scenic-trainer slower, b=scenic-trainer faster) -> matched:true 1 segment. Green Lantern has NO GPS rides -> matched:false (graceful, no crash). Do NOT ride to completion. Main agent will delete demo's test rides after testing."

    -agent: "main"
    -comment: "HEALTH SYNC (bidirectional Apple Health / Health Connect). NEW backend native-health endpoints in routes/connections.py + providers/native.py now registers health_connect alongside apple_health. TEST REQUEST — BACKEND ONLY (frontend native health can't run in preview): login greenlantern@roujaune.app / rideon9900. (a) GET /api/connections includes BOTH device_native providers 'apple_health' AND 'health_connect' (kind='device_native', requires_native_build true). (b) POST /api/connections/native/apple_health/link {\"permissions\":[\"read\",\"write\"]} returns connection_status='connected', connected=true. (c) POST /api/connections/native/health_connect/import {\"workouts\":[{\"id\":\"hc-1\",\"startDate\":\"2026-06-01T08:00:00Z\",\"endDate\":\"2026-06-01T09:00:00Z\",\"distanceMeters\":25000,\"calories\":600,\"title\":\"Cycling\"}]} returns imported>=1; the ride then appears in GET /api/connections/activities and GET /api/activities. (d) POST /api/connections/native/health_connect/pushed {\"count\":1} returns ok:true. (e) Unknown/non-native provider id (e.g. 'strava') on /native/{id}/link returns 404. (f) REGRESSION: existing OAuth connections flow unaffected (GET /api/connections still returns garmin+google_fit with correct not_configured/setup status). CLEANUP AFTER TEST: DELETE /api/connections/health_connect/data and POST /api/connections/apple_health/disconnect + /api/connections/health_connect/disconnect so Green Lantern stays pristine (no imported rides, native providers disconnected). Server date ~2026-08. Do NOT ride a route to completion."

    -agent: "main"
    -comment: "PREF PERSISTENCE + AUTO-REFRESH ADAPTATION NUDGE. Verified by me: GET/PUT /api/rider/settings persists per user; POST /api/coach/debrief background task regenerates couch-to-road note_at + detail_at (confirmed fresh timestamps in Mongo); /api/plan now surfaces adaptation_ai_alberto_at; PlanUpdatedNudge renders on the Today screen (testID present). Fixed duplicate training_plans docs + added unique index on id."

#====================================================================================================
    -agent: "main"
    -comment: "ROUND 5 — FINAL 4-FEATURE BLOCK + GEMINI COACH VOICE. (1) SEASON RECAP: GET /api/analysis/season-recap[?year=] returns {year, rides, distance_km, hours, tss, climbs_conquered, biggest_climb_m, longest_ride_km, records_set, has_data}. Rendered on /fitness as SeasonRecapCard (6 tiles) with a Share button (testID season-share) -> ShareCardModal, only shown when has_data. (2) MILESTONE WALL: GET /api/analysis/milestone-wall returns {categories:[{key,title,icon,current,rows:[{value,label,reached}]}], earned, total}. NEW screen app/milestones.tsx (progress bar + per-category earned/locked badges, testID badge-<key>-<value>). Linked from /fitness Milestones card header (testID milestone-wall-link). (3) SPLIT PR HIGHLIGHTS: GET /api/analysis/climb-detail now returns recent_split_prs:[{index,from_d,to_d,time_s}] (splits where the rider's MOST RECENT attempt was fastest even if not overall PB). In app/climb/[id].tsx the Split times card shows an amber highlight banner (testID split-pr-highlight) listing #indexes, and a flame icon next to those split rows. (4) FREEZE AUTO-SUGGEST: already wired in StreakCard (suggest_freeze -> 'Protect this week with a freeze' button testID streak-protect-btn inside the at-risk box). GEMINI VOICE: NEW GET /api/coach/speak?text=&coach_id=alberto|adriana streams natural WAV via Gemini TTS (google-genai 2.12.1, model gemini-2.5-flash-preview-tts, GEMINI_API_KEY in backend/.env; Alberto=Charon male, Adriana=Aoede female, English w/ light Spanish accent; cached by hash). useCoachSpeech hook rewritten to stream this (web=blob URL via patched fetch, native={uri,headers} bearer) and play via expo-audio, with expo-speech device fallback on failure. Real-time workout cues (useWorkoutAudio) UNCHANGED (still expo-speech). Verified by main-agent curl: /api/coach/speak (demo token) -> HTTP200 audio/wav 284KB valid RIFF/WAVE. TEST REQUEST: BACKEND — season-recap & milestone-wall shapes (demo@roujaune.app/demo9900); climb-detail (demo id climb-45.2-6.1108 or discover via climb-leaderboard) includes recent_split_prs array; /api/coach/speak returns 200 audio/wav for both coach_ids (401 without token). FRONTEND (demo, landscape ~1024x1000): /fitness shows Season Recap card (season-share) + Milestones card with 'Milestone wall' link -> /milestones shows badges & progress bar; /climb/[id] Split times shows split-pr-highlight banner when recent_split_prs present; Coach's Weekly Note 'Listen' button (weekly-note-play) triggers GET /api/coach/speak (200 audio/wav) and toggles to Stop. Do NOT ride to completion. Prior iters 78-82 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 6 — 4 UX ENHANCEMENTS + RESEND EMAIL (own account). ENHANCEMENTS: (1) SEASON PHOTO: AchievementCard now renders a 6-stat GRID when stats.length>3; shareSeason() on /fitness passes 6 stats (Distance/Rides/Hours/Climbs/Records/Big climb) so ShareCardModal produces a saveable/shareable branded IMAGE (testID season-share -> share-card-share / share-card-save). (2) RECAP REMINDER: SeasonRecapCard has a year picker (testID season-prev / season-next); /fitness holds seasonYear state, refetches fetchSeasonRecap(year); past years with no data show an empty message; season-next disabled at current year. (3) BADGE NUDGE: new src/components/MilestoneNudgeBanner.tsx (+useMilestoneNudge) shows on HOME (index.tsx via HomeNotificationArea, lowest priority, testID milestone-nudge) when within 3 rides or 25 km of the next badge; tap -> /milestones. (4) VOICE PREVIEW: settings coach cards 'Hear a sample' button (testID preview-alberto / preview-adriana) now plays the ACTUAL Gemini voice via useCoachSpeech (was device TTS); device-voice picker in Voice fine-tuning still uses expo-speech. RESEND EMAIL (own account, sender 'Harmony Wellness Group <noreply@harmonywellnessgroup.com.au>', RESEND_API_KEY in backend/.env, domain verified): emailer.py send_email() switched from Emergent proxy to direct Resend API (api.resend.com/emails, Bearer, idempotency key). New templates welcome_email_html + weekly_digest_email_html. Welcome email sent on POST /api/auth/register (best-effort). Existing verification (register/resend-verification/verify-email) + password reset (forgot-password/reset-password) flows UNCHANGED except transport. WEEKLY DIGEST: GET/PUT /api/analysis/email-prefs {weekly_digest}; POST /api/analysis/email-digest sends the signed-in rider their weekly recap now; weekly_digest_loop() in server startup emails opted-in verified riders Mondays ~08:00 UTC (dedup by ISO week). Settings 'EMAIL' card: weekly toggle (testID tg-emailWeekly) + 'Email me this week's recap now' (testID send-digest-now, msg send-digest-msg). Weekly Digest card on /fitness has an 'Email me' button (testID digest-email, msg digest-email-msg) beside Share. Verified by main-agent curl (demo token): email-prefs GET/PUT OK; POST email-digest -> {ok:true} HTTP200 (Resend accepted send from verified domain). Demo opt-in reset to false after test. TEST REQUEST: BACKEND — GET/PUT /api/analysis/email-prefs; POST /api/analysis/email-digest -> 200 {ok:true} (demo@roujaune.app/demo9900); POST /api/auth/register with a single throwaway email returns token (welcome is best-effort, do NOT assert delivery; use ONE fake address to limit bounces). FRONTEND (demo, landscape ~1024x1000): /fitness Weekly Digest card shows 'Email me' + 'Share'; tapping 'Email me' shows digest-email-msg; Season Recap card shows year picker (season-prev/season-next) and Share; /settings EMAIL card toggle + 'send-digest-now' shows send-digest-msg; settings coach 'Hear a sample' (preview-alberto) fires GET /api/coach/speak 200 audio/wav; HOME may show milestone-nudge (only if within threshold — demo has 2 rides so likely shows rides nudge). Prior iters 78-83 PASS. Server ~2026-08. Reset demo email-prefs to false after testing. Do NOT ride to completion."

    -agent: "main"
    -comment: "ROUND 7 — EMAIL UNSUBSCRIBE + SEND-DAY CHOICE + SEASON PHOTO THEME. (1) UNSUBSCRIBE: weekly digest email footer now has a one-tap 'Unsubscribe in one tap' link -> public GET /api/analysis/unsubscribe?token=<unsub_token> (added to auth _PUBLIC allowlist) which sets weekly_digest=false and returns a branded HTML confirmation page. Per-rider unsub_token stored in settings email_prefs (secrets.token_urlsafe, created on first send via _ensure_unsub_token). Base URL for links cached from any request via auth.cached_base_url() (fallback env PUBLIC_BASE_URL). VERIFIED by main-agent curl: bad token -> 'Link not recognised'; real token -> 'You're unsubscribed' + email-prefs weekly_digest flips to false. (2) SEND-DAY CHOICE: email_prefs now has digest_weekday (0=Mon..6=Sun). GET/PUT /api/analysis/email-prefs now return/accept digest_weekday (PUT is PARTIAL — only provided keys change). weekly_digest_loop now fires daily at 08:00 UTC and sends to each rider on THEIR chosen weekday (dedup by ISO week). Settings EMAIL card shows a day picker (testID digest-day-picker, chips digest-day-0..6) when the weekly toggle is on. VERIFIED: PUT {weekly_digest:true,digest_weekday:3} -> GET returns weekday 3. (3) SEASON PHOTO THEME: AchievementCardData gained variant:'season', hero:{label,value}, watermark. AchievementCard renders a bold year-in-review look: giant faint year watermark backdrop, no big star badge (small trending-up mark), a hero band featuring the BIGGEST CLIMB, then a 6-stat grid. shareSeason() on /fitness now passes variant='season', watermark=year, hero=biggest climb, 6 stats (Distance/Rides/Hours/Climbs/Records/Longest). ShareCardModal (season-share -> share-card-share/share-card-save) captures it to an image. Demo email-prefs left weekly_digest=false, weekday=0 (pristine). TEST REQUEST: BACKEND (already curl-verified by main, light recheck ok) — GET/PUT email-prefs digest_weekday partial update; GET /api/analysis/unsubscribe?token=bad -> HTML 'not recognised' (200). Do NOT send more real digest emails (POST email-digest) — main already sent 2. FRONTEND (demo, landscape ~1024x1000): /settings EMAIL card -> toggle tg-emailWeekly ON reveals digest-day-picker; tap digest-day-3 persists (re-open shows Thu selected). /fitness Season Recap 'Share' (season-share) opens ShareCardModal showing the NEW themed season card (year watermark + BIGGEST CLIMB hero band + 6-stat grid) — screenshot the modal to confirm it renders without clipping. Regression: settings coach 'Hear a sample' still works; /fitness digest 'Email me' still works. Prior iters 78-84 PASS. Server ~2026-08. Do NOT ride to completion."

    -agent: "main"
    -comment: "ROUND 8 — EXTERNAL HWG ADMIN CONSOLE ACCESS (service token). User wants an external admin console to drive the existing /api/admin/* backend using a security token (no new admin features). Implemented per integration_expert playbook: added a static service-token branch at the TOP of auth._resolve_token — if Authorization: Bearer <token> equals env ADMIN_API_TOKEN (constant-time secrets.compare_digest), the request resolves to a synthetic admin principal {user_id:svc_admin_console, role:admin} so require_admin passes on ALL /api/admin/* routes. ADMIN_API_TOKEN generated (secrets.token_urlsafe(48)) and stored in backend/.env (also recorded in /app/memory/test_credentials.md). Existing interactive admin login (POST /api/admin/login -> admin_sessions Bearer) UNCHANGED and still works. CORS remains env-driven via CORS_ORIGINS (default '*'); to lock to the console's browser origin set CORS_ORIGINS=https://<admin-domain> (user approved locking but hasn't provided the domain yet; console uses a server-side token so CORS is not the auth boundary). MAIN-AGENT CURL VERIFIED: GET /api/admin/me with service token -> 200 {admin_id:svc_admin_console,...}; wrong token -> 401; no token -> 401; GET /api/admin/users?limit=1 with token -> 200; interactive admin login (roger.parenzee@gmail.com/letmein9900) -> token -> /api/admin/me 200. TEST REQUEST (BACKEND ONLY, skip frontend): (1) service token (in backend/.env ADMIN_API_TOKEN, also in test_credentials.md) authorizes a sample of admin endpoints (/api/admin/me, /api/admin/users, /api/admin/dashboard, /api/admin/metrics) -> 200; (2) wrong/empty Bearer -> 401 on /api/admin/me; (3) rider session token (login demo@roujaune.app/demo9900) must NOT access /api/admin/* -> 403; (4) interactive admin login still yields a working admin token. Do NOT mutate/delete rider data via admin endpoints during tests (read-only GETs + a no-op). Prior iters 78-85 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 8b — HWG service token finalized per HWG spec. Renamed env to HWG_SERVICE_TOKEN (fixed value provided by HWG). auth._resolve_token accepts Authorization: Bearer <HWG_SERVICE_TOKEN> (constant-time) -> admin principal {user_id:hwg_console, name:'HWG Console', email:console@harmonywellnessgroup.com.au, role:admin}; GET /api/admin/me returns 200 (console health check). CORS locked via CORS_ORIGINS to: harmonywellnessgroup.com.au, www.harmonywellnessgroup.com.au, ageless-workout.emergent.host, ageless-workout.preview.emergentagent.com (Authorization header + all methods allowed). Old ADMIN_API_TOKEN removed. MAIN-AGENT CURL VERIFIED: /api/admin/me with HWG token -> 200 (name 'HWG Console'); old token -> 401; CORS preflight from ALL 4 allowed origins echoes Access-Control-Allow-Origin + allow-headers: authorization; disallowed origin -> no allow-origin. Rider web app still loads (same-origin /api, unaffected by CORS lock). Token not logged. (Service-token admin mechanism itself already passed iter 86, 11/11.)"

    -agent: "main"
    -comment: "ROUND 9 — RESUMED 3 EMAIL/UX FEATURES. (1) MILESTONE EMAIL: new emailer.milestone_email_html(name, items). New analysis.check_and_email_milestones() computes reached rides/km/hours thresholds, BASELINES silently on first run (settings id 'milestone_emails', {baselined, emailed}) so historical milestones never spam, then emails only NEWLY crossed ones (biggest first) and updates the emailed set. Hooked (fire-and-forget asyncio.create_task, context preserved) after ride_history.insert_one in routes/workouts.py record path. VERIFIED by main: greenlantern (6 rides/88km/2.6h -> no milestone) baselines with 0 sent, no error; emailer.milestone_email_html renders + Resend send -> ok True (one real test email). (2) RECAP BACKDROP PHOTO: AchievementCardData gained bgUri; AchievementCard uses source={bgUri?{uri}:BG}. ShareCardModal (season variant only) shows 'Add your own backdrop photo' button (testID season-backdrop-pick) using expo-image-picker with permission handling (getMediaLibraryPermissionsAsync -> request -> denied shows Open Settings); picked photo becomes the season card backdrop (with a remove 'x'); capture/save/share include it. Photo perms already declared in app.json. (3) EMAIL PREVIEW: new src/components/WeeklyEmailPreview.tsx renders a compact in-app rendition of the weekly recap email (subject bar 'Harmony Wellness Group / Your week in review', ROUJAUNE brand, 4 tiles TSS/Time/Rides/Distance from fetchWeeklyDigest with deltas, records line, unsubscribe note). Settings EMAIL card has a 'Preview the email' toggle (testID toggle-email-preview) that shows/hides it (testID email-preview). TEST REQUEST: FRONTEND ONLY (backend milestone already verified by main; do NOT drive a full ride to avoid emails). demo@roujaune.app/demo9900, landscape ~1024x1000: (a) /settings EMAIL card -> tap 'Preview the email' (toggle-email-preview) -> email-preview card renders with 4 stat tiles; tap again hides it. (b) /fitness Season Recap 'Share' (season-share) opens ShareCardModal -> confirm a 'Add your own backdrop photo' button (season-backdrop-pick) is present under the card (season variant only). Do not need to complete a native photo pick on web. Regression: settings tg-emailWeekly + digest-day-picker still work; ShareCardModal share/save buttons present. Prior iters 78-86 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 10 — 3 FEATURES. (A) DISCOVERY BACKDROP: ShareCardModal (season variant) now also shows a horizontal strip of the rider's Discoveries scrapbook photos (testID season-discovery-picker, thumbs season-discovery-thumb) fetched via fetchDiscoveries(); tapping a thumb sets it as the season card backdrop (bgUri) with a check overlay; camera-roll button (season-backdrop-pick) still present. (B) SEND DIGEST TEST: on-demand POST /api/analysis/email-digest now sends a CLEARLY-LABELLED PREVIEW — subject '[Preview] Your ROUJAUNE week in review' + an amber 'This is a PREVIEW…' banner (emailer.weekly_digest_email_html(..., preview=True)). Settings button relabelled 'Send me a test now' (testID send-digest-now) with hint text + success msg 'Preview sent — check your inbox 📬'; fitness Weekly Digest button relabelled 'Send test' (testID digest-email). VERIFIED by main: preview=True renders banner, preview=False omits it; unsub link still present. (C) MILESTONE SHARE CARD: /milestones earned badges are now Pressable (testID badge-<key>-<value>) with a share-social icon; tapping opens ShareCardModal with a milestone AchievementCard (kicker 'MILESTONE UNLOCKED', title e.g. '1,000 km'/'100 rides'/'250 hours', subtitle '<Category> milestone · ROUJAUNE'). NOTE: demo & greenlantern have NOT earned any milestone (min 10 rides/100km/10h; demo=2 rides, greenlantern=6 rides/88km) so ALL wall badges are LOCKED for these accounts — earned-badge share cannot be exercised with existing data; verify the wall renders and locked badges are non-interactive. The ShareCardModal itself is proven via Season share. TEST REQUEST: FRONTEND ONLY (backend preview render + milestone-email already verified by main; do NOT tap 'send-digest-now'/'Send test' to avoid real emails). demo@roujaune.app/demo9900, landscape ~1024x1000: (1) /settings EMAIL: 'Send me a test now' button + hint 'We'll email you a clearly-labelled preview…' present (do NOT tap). 'Preview the email' (toggle-email-preview) still shows email-preview. (2) /fitness Season 'Share' (season-share) -> ShareCardModal: season-backdrop-pick present; if demo has Discoveries, season-discovery-picker strip renders and tapping season-discovery-thumb visibly sets the card backdrop. (3) /milestones renders; locked badges present (likely all locked for demo) — confirm no crash tapping a locked badge (disabled). Regression: settings tg-emailWeekly + digest-day-picker; ShareCardModal share-card-share/share-card-save. Prior iters 78-87 PASS. Server ~2026-08. Do NOT ride to completion."

    -agent: "main"
    -comment: "ROUND 11 — ADMIN PREMIUM GRANT/GIFT/REVOKE + PLAN BADGE + RIDE-EXPERIENCE BUTTON. (1) ADMIN GRANT FROM CONSOLE: new POST /api/admin/riders/{user_id}/premium body {action:'grant'|'revoke', plan:'yearly'|'monthly'|'gift_month'}. grant yearly=365d/premium_yearly, monthly=31d/premium_monthly, gift_month=30d/premium_monthly source 'admin_gift'. revoke sets premium_until=now. Admin user-detail (GET /api/admin/users/{id}) now returns a 'billing' object {premium, plan, plan_label, product_id, premium_until, source}. Audit-logged. MAIN-AGENT CURL VERIFIED with HWG service token: grant yearly->premium true Annual; gift_month->premium true Monthly source admin_gift; user detail shows billing; revoke->premium false; unknown rider->404. (2) PLAN BADGE: profile.tsx shows a yellow 'Premium · Annual/Monthly' badge (testID premium-badge) when useEntitlement().premium (reads /api/billing/status plan). (3) RIDE EXPERIENCE BUTTON: TodayModeButton (testID today-mode-button) — REMOVED the biking icon bubble and now shows the eyebrow 'EXPERIENCE' + the CURRENT experience label (meta.label / compact meta.shortLabel) with a chevron-down; opens the same experience menu. NOTE FOR TEST: demo@roujaune.app has been TEMPORARILY granted yearly premium so the badge is visible; main agent will REVOKE it right after this test. TEST REQUEST FRONTEND ONLY (admin endpoints already curl-verified): demo@roujaune.app/demo9900, landscape ~1024x1000: (a) /profile shows a 'Premium · Annual' badge (testID premium-badge) near the tier badge; (b) the Today/home ride-experience button (today-mode-button) shows the current experience text (e.g. 'Training' or 'Take a scenic ride') and NO biking icon; tapping it opens the experience menu (today-mode-option-*) and selecting a different mode updates the button label. Regression: home renders; profile renders. Prior iters 78-88 PASS. Server ~2026-08. Do NOT ride to completion."

    -agent: "main"
    -comment: "ROUND 12 — AUTOMATED STORE SCREEN-CAPTURE + STORE-LISTING SYSTEM (admin-only). NEW backend/screen_capture.py (self-contained router capture_router, prefix /api/admin/screen-captures, gated by auth.require_admin). Uses Playwright headless Chromium (installed) to log into the Expo WEB build as demo@roujaune.app/demo9900, traverse 10 screens (home, plan, workouts, workout_list, scenic, progress, fitness, calendar, profile, wellness), capture raw viewport PNGs (1280x800 @2x), frame each on a branded 2048x1536 App-Store canvas via Pillow (caption headline + yellow accent + device bezel + rounded screenshot + ROUJAUNE wordmark), thumbnail, and store raw/framed/thumb base64 in Mongo `screen_captures`; app-listing copy (title/subtitle/promotional_text/description/keywords) generated via Emergent LLM (claude-sonnet-4-6) into `app_meta` key='store_listing'. Job state in `capture_jobs` (_id='current'). ENDPOINTS (all require admin; HWG service token or admin session): GET /screens (catalogue), POST /refresh {screens?:[keys]} (async background job, 409 if running), GET /status (job progress {status,total,done,screens:[{key,state}]}), GET '' (list metadata+thumb, no heavy raw/framed), GET /export (ZIP of raw+framed+store-listing.txt/json), GET /store-listing, PUT /store-listing (partial edit), POST /store-listing/generate (LLM regen), GET /{key}?variant=framed|raw|thumb (PNG). MAIN-AGENT VERIFIED via curl with HWG service token (hwg_svc_roujaune_...): no-token->401; /screens->10; POST /refresh {screens:['home','plan']}->job runs->status done 2/2; framed home PNG=2048x1536 valid, raw=2560x1600; login worked (real logged-in home content, bezel, wordmark, caption); full 10-screen refresh->all 10 done; /export ZIP=22 entries (10 raw + 10 framed + 2 listing files, ~17MB); LLM store copy generated real (title 'ROUJAUNE: Indoor Cycling Coach' etc, NOT fallback). Also set demo@roujaune.app email_verified=true so store shots have no verify banner. TEST REQUEST (BACKEND ONLY, skip frontend — this system is 100% backend/admin console): using HWG service token from /app/memory/test_credentials.md: (1) auth: no/wrong Bearer->401 on GET /api/admin/screen-captures/screens; rider session token (login demo@roujaune.app/demo9900)->403 on same. (2) GET /screens returns 10 screens. (3) GET /status returns a valid shape (idle or last job). (4) GET '' (list) returns items with thumb_base64 but NO raw_base64/framed_base64 keys. (5) GET /store-listing returns the 5 copy fields. (6) PUT /store-listing {subtitle:'Test subtitle'} partial-updates only subtitle and returns it. (7) GET /{key}?variant=framed for an existing key (e.g. home) returns image/png 200; variant=bogus->422; unknown key->404. (8) GET /export returns application/zip 200 (Content-Disposition attachment). (9) POST /refresh while a job is running returns 409 (only if you can trigger overlap; otherwise skip — captures take ~90s and hit the live preview URL, so it's OK to NOT trigger a fresh full /refresh during testing to save time; the DB is already populated with 10 captures). Do NOT delete screen_captures. Prior iters 78-89 PASS. Server ~2026-08."


    -agent: "main"
    -comment: "ROUND 13 — RATE THE APP + FEEDBACK. NEW backend routes/feedback.py mounted under /api: (a) POST /api/feedback {rating(1-5),message,screenshot_path?,meta?} (require_user) -> saves to Mongo `feedback` {id,user_id,email,name,rating,message,screenshot_path,meta,status:'new',created_at} -> {ok:true,id}; (b) POST /api/feedback/screenshot multipart file (require_user) -> uploads image to Emergent Object Storage (backend/storage.py, path roujaune/uploads/{user_id}/{uuid}.{ext}, 8MB cap, jpg/png/webp/heic only) -> {path}; (c) GET /api/admin/feedback (require_admin) -> {feedback:[...],count}; (d) GET /api/feedback/image/{path} (require_admin) proxies the stored screenshot. Storage init at startup (init_storage). FRONTEND: app/about.tsx has a NEW 'Rate & feedback' card (testID about-feedback): 5 tappable stars (feedback-star-1..5), message TextInput (feedback-message), 'Attach a screenshot' (feedback-attach, expo-image-picker w/ permission handling) with local preview + remove (feedback-shot-remove), 'Send feedback' (feedback-submit) -> uploads screenshot (if any) then POSTs feedback -> success state (feedback-thanks) with 'Send more feedback' (feedback-again). app/settings.tsx ABOUT card rows (Privacy/Terms/Help & Support, testID about-0/1/2) now navigate to /about. MAIN-AGENT CURL VERIFIED (demo@roujaune.app/demo9900): POST /api/feedback rating 5 -> {ok:true,id}; POST /api/feedback/screenshot with a PNG -> {path: roujaune/uploads/...}. TEST REQUEST: BACKEND — POST /api/feedback (valid rating->200 ok; rating out of 1..5 -> 422; no token -> 401); POST /api/feedback/screenshot (valid PNG/JPEG -> 200 {path}; non-image content-type -> 400; no token -> 401); GET /api/admin/feedback with rider token -> 403, with HWG service token (in /app/memory/test_credentials.md) -> 200 {feedback,count} and includes the just-submitted entry. FRONTEND (demo@roujaune.app/demo9900): /settings ABOUT card -> tap 'Help & Support' (about-2) navigates to About & Support screen; the 'Rate & feedback' card renders; tap a star (feedback-star-4) selects 4 stars (stars fill yellow); type in feedback-message; tap feedback-submit -> success 'Thanks for the feedback!' state (feedback-thanks) appears. Screenshot attach on web can be skipped (native picker); verify the button (feedback-attach) is present. Prior iters 78-90 PASS. Server ~2026-08. Do NOT ride to completion."

    -agent: "main"
    -comment: "ROUND 14 — DISTANCE TICKS (scenic climb profile) + YOUTUBE PICKER IN WORKOUTS. FRONTEND ONLY (no backend changes). (1) DISTANCE TICKS: src/components/scenic/ElevationChart.tsx now renders km markers under the climb-profile curve — 5 evenly-spaced tick marks along the base + a labels row (0 … distance km, e.g. '0 / 3 / 7 / 10 / 14 km') via new showTicks prop (default true). Shown on app/scenic-ride.tsx CLIMB PROFILE block (testID elevation-chart) during a scenic ride. (2) YOUTUBE PICKER IN WORKOUTS: app/workout.tsx now reuses StreamingSourceSheet (same thumbnail+title recents picker as scenic rides). New 'Ride screen' source button overlay on the embedded video slot (testID workout-source, top-right) opens the sheet; picking a YouTube link (yt-input/yt-play) or a RECENT (yt-recent-<id>, thumbnail+title) sets customVideoId and the embedded video slot renders YouTubePlayer instead of the avatar VirtualRidePlayer; picking 'Virtual ride (avatar)' (source-route, relabelled via new routeLabel/routeDesc props on the sheet) clears it back to the avatar. Fullscreen (expand) renders fullscreen YouTube + exit button (vr-exit-fullscreen) when a video is active, else the avatar player as before. StreamingSourceSheet gained optional routeLabel/routeDesc props (default unchanged for scenic rides). TEST REQUEST: FRONTEND ONLY (demo@roujaune.app/demo9900, landscape ~1024x1000). (A) SCENIC: start a scenic ride (Today -> scenic/experience -> pick a route with elevation e.g. Norway/Dolomites -> begin) and confirm the CLIMB PROFILE (elevation-chart) shows km tick labels underneath ending in 'N km'. Do NOT ride to completion. (B) WORKOUT: start a structured workout (Today -> Start workout / from plan) -> on the live workout screen tap the 'Ride screen' button (workout-source) -> StreamingSourceSheet opens -> expand 'My YouTube video' (source-youtube), paste https://youtu.be/dQw4w9WgXcQ into yt-input and tap yt-play -> sheet closes and the embedded video area swaps to the YouTube player; re-open workout-source -> a RECENT row (yt-recent-*) with thumbnail+title now shows; tapping it re-selects. Also confirm 'Virtual ride (avatar)' (source-route) option is present and switches back to the avatar. Do NOT ride to completion. Prior iters 78-91 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 15 — ROUTE ELEVATION BACKFILL + WORKOUT MUSIC (Spotify/Apple Music playlists). (1) BACKFILL (backend data only, no new API): routes/scenic.py backfill_route_metrics() (called from seed_scenic_routes at startup) sets realistic distance_km + elevation_m on the 15 published scenic routes that had null values (tyrol-three-lakes, adige-valley-to-garda, walchensee-loop, dolomites-cortina-calalzo, hells-gate-safari, isarco-river-path, brixen-vineyards-loop, adige-bozen-lavis, bavarian-roman-roads, isar-autumn, fedaia-dam-descent, passo-fedaia-climb, ledro-to-garda-ponale, garda-sunrise-promenade, brixen-to-kiens-pustertal). Idempotent; force-corrects the two Fedaia routes' elevation. MAIN-AGENT VERIFIED via GET /api/scenic/routes: all 27 routes now have distance_km, elevation_m AND elevation_profile length>1 (missing dist/elev = [], no climb profile = []). (2) WORKOUT MUSIC (frontend only, user chose deep-link launch inside existing Music & audio panel): new src/lib/music-playlists.ts (detectProvider/addPlaylist/removePlaylist/openPlaylist via Linking + AsyncStorage persistence, key workout_music_playlists_v1). New PlaylistSection inside MusicPanel (src/components/workout.tsx) rendered in the workout 'Music & audio' panel: 'Your music · Spotify or Apple Music' with a paste-link input (testID playlist-input) + add button (playlist-add); recognised Spotify (open.spotify.com / spotify:) and Apple Music (music.apple.com) links become rows (playlist-row-<id>) with provider icon + title, Play (playlist-play-<id>, opens the app via deep link — NATIVE ONLY) and remove (playlist-remove-<id>); a non-music link shows an inline error. TEST REQUEST: FRONTEND ONLY (demo@roujaune.app/demo9900, landscape ~1024x1000; demo account already has premium granted from iter92). Start a structured workout -> open the 'Music & audio' panel (music-button) -> the 'Your music' PlaylistSection (testID playlist-section) is visible -> paste https://open.spotify.com/playlist/37i9dQZF1DX70RN3TfWWJh into playlist-input, tap playlist-add -> a row (playlist-row-*) appears labelled 'Spotify playlist' with a green Spotify icon, Play + remove buttons -> add an Apple link https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb -> second row appears labelled from the slug with red icon -> paste a bogus link e.g. 'hello' and tap add -> inline error shows and no row is added -> tap remove on a row -> it disappears. NOTE: the Play button opens the external Spotify/Apple Music app via Linking (native build only) — on web just confirm the button is present, do NOT assert playback. Prior iters 78-92 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 16 — LIVE-BY-DEFAULT + SHARE CARD + WATCH RENAME + CONTROL OVERLAP FIX. (1) OVERLAP/SIZE: workout.tsx embedded video top-right controls no longer overlap — the source button is now inside VirtualRidePlayer's embedTopRow (testID vr-embed-source) alongside video (vr-embed-view) + fullscreen (vr-embed-fullscreen), all enlarged ~25% (embedIcon 52->65). YouTube branch has its own non-overlapping row (workout-source + workout-yt-fullscreen). (2) WATCH RENAME: source button label 'Ride screen' -> 'Watch' with a chevron-down chooser affordance (both avatar & youtube states). (3) LIVE BY DEFAULT: backend server.py TrainerSim now has mode live|demo; LIVE emits NO fabricated data (power/hr/cad=0, source 'disconnected') and only real BLE sensor readings override (source 'sensor'); DEMO simulates (source 'estimated'). Frontend useTelemetry(demo) sends {type:'mode'} on connect+change. workout.tsx: trainerOn/wearableOn now = demoMode || real BLE (removed fake settings.hasTrainer/hasWearable). bc-live pill is LIVE by default (live={!demoMode}); tapping it toggles Demo (only a button turns on demo). virtual-route.tsx same (sensorsOn = demoMode||BLE; 'Not connected' label). scenic-ride already only shows real BLE. settings.tsx: removed fake Smart trainer/Heart-rate toggles, added a 'Bluetooth sensors' nav row + kept Demo mode toggle. In-ride SettingsPanel equipment rows updated (removed hasTrainer/hasWearable, added demoMode). VERIFIED via screenshots: default shows LIVE pill + 'Some data inactive' + duration cards (no fake HR/power); tapping bc-live -> DEMO + simulated HR/Power/Cadence + 'All ride data active'. Backend WS verified: live->power 0 src disconnected; after sensor push->power 210 hr 148 src sensor. (4) SHARE CARD: summary.tsx BottomActionBar 'action-share' now captures the summary card (react-native-view-shot captureRef on the modal card ref) and opens the native share sheet (expo-sharing) as a PNG 'ride card'; web shows a toast (native-only). TEST REQUEST: FRONTEND (demo@roujaune.app/demo9900, landscape ~1400x820, navigate to /workout): (a) confirm the three top-right video controls (vr-embed-source 'Watch', vr-embed-view, vr-embed-fullscreen) do NOT overlap and are sized larger; (b) bottom-left pill shows LIVE by default (testID bc-live); metrics show no fabricated sensor numbers and ConnectionsPanel shows 'Some data inactive'; (c) tap bc-live -> pill shows DEMO and simulated HR/Speed/Cadence/Power appear + 'All ride data active'; tap again -> back to LIVE. (d) /settings EQUIPMENT & RIDE: no 'Smart trainer'/'Heart-rate' toggles; has 'Bluetooth sensors' row (row-ble-sensors) + 'Demo mode' toggle (tg-demoMode). (e) summary screen: 'action-share' button present and tapping it on web shows a toast (does not crash). BACKEND: WS /api/ws/telemetry — send {type:'mode',mode:'live'} then read telemetry: power/hr/cadence=0 and source='disconnected'; send {type:'sensor',power:210,cadence:92,hr:148} then source='sensor' with those values; send {type:'mode',mode:'demo'} then source='estimated' with non-zero simulated power. NOTE: real BLE + native share only work on a device build, not web/Expo Go. Prior iters 78-92 PASS. Server ~2026-08."

    -agent: "main"
    -comment: "ROUND 17 — AUTO-RECONNECT SENSORS + SENSOR BATTERY + LIVE RIDE SHARING CAPTION. (Feedback Inbox: NOT built in-app per user — admin/feedback is handled by the EXTERNAL admin console via existing GET /api/admin/feedback; reverted the in-app screen + settings admin row + ADMIN_EMAILS change.) (1) AUTO-RECONNECT: src/hooks/useBleSensors.ts refactored — extracted setupDevice/openConnection; on UNEXPECTED disconnect it now auto-retries with backoff (up to 8 tries) instead of dropping, exposes reconnecting:string[]; user-initiated disconnect() marks intentional (no retry). Timers cleared on unmount/disconnect. (2) SENSOR BATTERY: reads BLE Battery Service 0x180F/0x2A19 on connect + subscribes; exposes battery:Record<id,number>. Added UUID.battery/batteryLevel to src/lib/ble/parse.ts. BleSensorsPanel shows a battery pill (green/amber/red) per CONNECTED device + a 'Reconnecting…' spinner badge when reconnecting; new optional props battery/reconnecting passed from connections.tsx, workout.tsx, virtual-route.tsx, wheel-calibration.tsx; web stub returns {}/[]. (3) LIVE RIDE SHARING: summary.tsx shareRideCard now builds a caption from stats+route (route name, duration, distance, elevation, avg power, avg HR, calories, #Roujaune) and shares the captured ride-card PNG WITH the caption — iOS Share.share({url,message}); Android expo-sharing image + caption copied to clipboard; web shows a toast. TEST REQUEST: FRONTEND (demo@roujaune.app/demo9900): (a) regression — /workout live screen still loads, LIVE/DEMO pill works, 'Watch' controls present; /connections opens the Bluetooth sensors panel (ble-panel) which on web shows the 'native build' unsupported notice (BLE battery + auto-reconnect are DEVICE-ONLY, cannot verify on web — just confirm no crash and the panel renders). (b) summary screen 'action-share' present; tapping on web shows a toast, no crash. BACKEND: GET /api/admin/feedback still returns 200 with the HWG service token (external console) and 403 with a rider token — the external admin console consumes this (no in-app screen). NOTE: auto-reconnect, battery levels, and the native share sheet only work on a real device build. Prior iters 78-93 PASS."

    -agent: "main"
    -comment: "ROUND 18 — MORE RIDE MODES (Gravel / Mountain Bike / Running now fully functional). Previously these 3 modes were 'coming-soon' preview-only. Now they are real, selectable & executable ride experiences that reuse the scenic-ride infrastructure. BACKEND (routes/scenic.py): (a) scenic routes gained an `activity` field (cycling|gravel|mountain-bike|running; missing => 'cycling'); returned by _public and settable via admin create/update. (b) GET /api/scenic/routes?activity=X filters by activity (cycling also matches legacy routes with no activity). (c) new seed_activity_routes() idempotently upserts 9 POV routes (3 gravel, 3 mtb, 3 running) by id at startup — additive, never clobbers admin edits. MAIN-AGENT VERIFIED via curl (demo token): activity=cycling->27, gravel->3, mountain-bike->3, running->3. FRONTEND: (a) useScenicRoutes(activity?) + ScenicRoute.activity. (b) ScenicCyclingTodayView generalized with an `activity` prop + per-activity FRAMING copy (descriptor/feel/CTA/resume/surprise); index.tsx renders it for scenic-cycling(cycling), gravel, mountain-bike, running; walking/rowing/climbing stay FutureActivityTodayView coming-soon. (c) today-mode.ts: gravel/mtb/running availability flipped to 'available'; their nav 'Find/Explore' items route to /scenic-destinations?activity=X (available), Saved Routes->/saved-destinations, Rides & Analysis->/activities; secondary items stay coming-soon. (d) scenic-destinations.tsx reads ?activity= param, filters catalog + retitles ('Find Gravel Routes'/'Find Trails'/'Scenic Runs'). Rides open the existing /scenic-ride immersive player (records to history as scenic-<id>). MAIN-AGENT SCREENSHOT VERIFIED: login demo@roujaune.app -> experience menu -> select Gravel -> Today shows gravel hero (Tuscan Gravel Roads), 'Where shall we go off-road today?', START GRAVEL ADVENTURE, gravel nav rail, Recommended-for-you gravel routes. TEST REQUEST (demo@roujaune.app/demo9900, landscape ~1280x900): FRONTEND — (1) from home tap today-mode-button -> today-mode-option-gravel selects Gravel (no coming-soon preview); Today renders gravel hero + 'Recommended for you' cards; tap begin-scenic-journey (or a dest card) -> /scenic-ride opens & plays (do NOT ride to completion; YouTube may show 'unavailable' in headless — that's expected). (2) repeat for today-mode-option-mountain-bike and today-mode-option-running (each shows their own routes + framing). (3) sidebar 'Find Gravel Routes'/'Find Trails'/'Scenic Runs' opens /scenic-destinations filtered to that activity (3 routes each) with the correct title. (4) REGRESSION: today-mode-option-scenic-cycling still shows the cycling catalog (~27 routes, NOT the gravel/mtb/run ones); today-mode-option-walking still shows the coming-soon preview (future-activity-walking). BACKEND — GET /api/scenic/routes?activity=gravel|mountain-bike|running each return exactly the 3 seeded routes; activity=cycling returns the full cycling catalog and NONE of the 9 new activity routes. Prior iters 78-98 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 19 — 'MY APPS' custom streaming-app shortcuts + pre-loaded AU services. USER REQUEST: rider wanted to watch their own streaming apps (SBS On Demand, 9Now, etc.) behind a ride via PiP. Native 'installed apps' picker is impossible on iOS and Play-restricted on Android, so we built one-tap shortcuts. CHANGES (frontend only): (a) src/lib/streaming.ts — StreamingService.icon now optional + new `label` monogram field; appended 8 AU services to STREAMING_SERVICES (sbs/9now/7plus/10play/iview/stan/binge/kayo) using universal https links; NEW custom-app storage: CustomStreamingApp type + AsyncStorage key roujaune.streaming.customapps + loadCustomApps/addCustomApp/removeCustomApp/launchCustomApp + normalizeAppUrl (keeps explicit scheme, else prefixes https). (b) src/components/streaming/StreamingSourceSheet.tsx — grid tiles now render brand icon OR colored monogram (TileFace); added a 'MY APPS' section listing saved custom apps (long-press to remove) plus a dashed 'Add app' tile (testID stream-add-app) that toggles an inline form (testID add-name / add-url / add-save) which persists a shortcut and shows it as a one-tap tile. Launch shows the existing pipTip Alert then opens the app link. MAIN-AGENT SCREENSHOT VERIFIED: started a Gravel scenic ride -> tapped scenic-source -> 'Ride screen' sheet shows Netflix/Prime/Disney+/Apple TV/YouTube + SBS On Demand (SBS monogram). (Note: RN-web renders the Modal in a portal so inner_text of #root won't include sheet text — must assert via visible locators/screenshot.) TEST REQUEST (demo@roujaune.app/demo9900): FRONTEND — (1) login, switch to Gravel, tap begin-scenic-journey to enter /scenic-ride, tap scenic-source to open the sheet. (2) scroll the sheet and confirm the AU tiles render: SBS On Demand, 9Now, 7plus, 10 play, ABC iview, Stan, Binge, Kayo Sports (monograms show, no blank icons). (3) tap stream-add-app -> fill add-name='My Test App' and add-url='https://example.com' -> tap add-save; a new tile 'My Test App' appears under MY APPS. (4) close the sheet and reopen (scenic-source) -> 'My Test App' shortcut PERSISTS (AsyncStorage). (5) long-press the custom tile -> a Remove confirm appears (on web Alert may auto-dismiss; just verify no crash). Do NOT verify actual app launching / deep links (cannot open external apps in headless; PiP is native-build only). Regression: the default 'Scenic route video' and 'My YouTube video' options still work. Prior iters 78-100 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 20 — (A) Favourite/reorder streaming apps + (B) BLE scan/connect/reconnect made demonstrable & discovery hardened. USER ASK: 'reorder favourite apps to the top' + 'check scanning/connecting/reconnecting Bluetooth'. (A) STREAMING FAVOURITES (frontend): src/lib/streaming.ts — new FAV_KEY 'roujaune.streaming.favorites' + loadFavorites()/toggleFavorite(id) (pins to front / unpins). StreamingSourceSheet.tsx — every app tile (built-in + custom) now has a ★ star toggle (testID fav-<id>) top-right; tapping it pins/unpins WITHOUT launching the app. Pinned apps render first in a new 'FAVOURITES' section (testID stream-favourites) and are excluded from their normal section. Persists via AsyncStorage. (B) BLE: (b1) src/hooks/useBleSensors.web.ts REWRITTEN from a dead stub (supported:false) into a full DEMO SIMULATION (supported:true) — startScan reveals 3 demo sensors over ~2.7s ('Demo Smart Trainer (Demo)','Demo Heart Rate (Demo)','Demo Cadence (Demo)'), connect() moves a device to CONNECTED with battery+rssi and streams live power/cadence/hr/speed each 1s, disconnect() clears it; connecting the trainer triggers a one-off ~6s-later 'Reconnecting…' cycle (2.5s) so that UI is visible. (b2) BleSensorsPanel.tsx shows a yellow 'Preview demo' banner (testID ble-demo-banner) when Platform.OS==='web'. (b3) NATIVE src/hooks/useBleSensors.ts startScan hardened: was startDeviceScan(RELEVANT_SERVICES,...) which hides sensors that don't advertise service UUIDs; now scans ALL (startDeviceScan(null,{allowDuplicates:false},...)) and keeps a device if it advertises a relevant service UUID OR its name matches a bike-sensor keyword regex (SENSOR_NAME_HINT); also stores/clears the 15s auto-stop timeout in scanTimeoutRef. MAIN-AGENT SCREENSHOT VERIFIED (connections screen): opened BLE panel -> demo banner shown -> Scan -> 3 demo devices -> connected Demo Smart Trainer -> 92% battery + Disconnect + live POWER 198W/CADENCE 83rpm/SPEED 31km/h. NOTE: native BLE (real sensors) + the hardened native scan CANNOT be validated in web/testing-agent (native build only). TEST REQUEST (demo@roujaune.app/demo9900, landscape ~1280x900): FRONTEND — FAVOURITES: (1) enter a scenic ride (switch Gravel -> begin-scenic-journey -> /scenic-ride -> tap scenic-source) OR just note the sheet; tap a star e.g. fav-netflix -> a FAVOURITES section (stream-favourites) appears with Netflix first and Netflix is removed from the 'OR WATCH YOUR OWN APP' grid; (2) close & reopen sheet -> favourite persists; (3) tap fav-netflix again to unpin -> FAVOURITES section drops it. BLE DEMO (easier surface = /connections): (4) go to Connections, tap a device card button (device-btn-*) to open ble-panel; confirm ble-demo-banner visible; (5) tap ble-scan -> after ~3s three ble-connect-* demo devices appear; (6) tap ble-connect-demo-trainer -> it moves to CONNECTED with a battery pill + ble-disconnect-demo-trainer, and the POWER/CADENCE/SPEED readings become live (non-'—'); (7) wait ~6-9s -> the connected trainer row shows 'Reconnecting…' spinner briefly then returns to Disconnect; (8) tap ble-disconnect-demo-trainer -> row leaves CONNECTED. Prior iters 78-101 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 21 — BUG: rider couldn't connect Google Fit on the Connections screen. ROOT CAUSE: two health paths existed — (1) a `google_fit` CLOUD OAuth provider (providers/google_fit.py) built on Google's DEPRECATED Fitness REST API, which also needed GOOGLE_CLIENT_ID/SECRET (unset -> 'Set up' dead-end); and (2) the modern native `health_connect` provider ('Health Connect'/Google Health, providers/native.py via react-native-health-connect) which reads Google Fit + Samsung Health on-device. FIX: retired the deprecated Google Fit cloud provider — providers/__init__.py no longer imports/registers `google_fit` (added a comment explaining Google's Fit API deprecation -> Health Connect). So Google Health now flows ONLY through native Health Connect. No other code referenced google_fit except the dead-code CONNECTIONS_DATA mock in routes/plan.py (unused by any endpoint — left as-is). MAIN-AGENT VERIFIED via curl (demo token): GET /api/connections now returns exactly [apple_health (device_native), health_connect (device_native)] and NO google_fit. TEST REQUEST (demo@roujaune.app/demo9900): BACKEND — GET /api/connections must list health_connect + apple_health and MUST NOT contain any provider with id 'google_fit' or name 'Google Fit'. FRONTEND — open /connections screen: (1) the 'Ride sync'/services area shows Apple Health and Health Connect provider cards (testIDs provider-apple_health, provider-health_connect) with subtitle 'On-device health data' and the note 'Available in an installed iOS/Android build with your permission.'; (2) there is NO 'Google Fit' card anywhere; (3) no crash / red screen; (4) REGRESSION: the Bluetooth demo still works (device-btn-* opens ble-panel, ble-scan finds demo devices) and the Imported rides card renders. NOTE: actual Health Connect on-device sync is native-build-only and out of scope for automated testing. Prior iters 78-102 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 22 — (A) renamed Health Connect -> 'Google Health (Health Connect)' and (B) added Strava cloud OAuth import. (A) backend providers/native.py HealthConnectProvider name -> 'Google Health (Health Connect)'; frontend platformLabel() (health.ts) + HealthSyncCard blurb + 'not available' message updated. (B) NEW providers/strava.py (StravaProvider, cloud_oauth, id 'strava') per the integration playbook: authorize scope activity:read_all (no PKCE — Strava web flow is client-secret based; accepts code_challenge arg but doesn't send it), exchange_code/refresh via https://www.strava.com/oauth/token (converts Strava absolute expires_at -> relative expires_in for the core), fetch_activities pages /athlete/activities (after/before epoch, per_page 200) filtering ride sport_types and normalizing to NormalizedActivity. Registered in providers/__init__.py. Reads STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET (added empty to backend/.env) -> is_configured False until keys added, so it shows 'Set up'. Reuses the existing generic OAuth flow (ridesync.startConnect -> /connections/{id}/authorize + /callback). MAIN-AGENT VERIFIED via curl (demo token): /api/connections lists apple_health, health_connect ('Google Health (Health Connect)'), strava (cloud_oauth, configured=false, status=not_configured). SCREENSHOT VERIFIED: Connections screen shows OUTDOOR RIDE SYNC -> Strava card ('Setup required' chip, 'Set up' button, 'Requires Strava credentials') and HEALTH SYNC blurb mentioning 'Google Health (Health Connect, Android — covers Samsung Health & Google Fit)'. TEST REQUEST (demo@roujaune.app/demo9900): BACKEND — GET /api/connections must include a provider id='strava' name='Strava' kind='cloud_oauth' connection_status='not_configured' configured=false; and health_connect name must equal 'Google Health (Health Connect)'; no google_fit. POST /api/connections/strava/authorize (body {redirect_uri:'roujaune://oauth/strava'}) must return {setup_required:true} (creds unset). FRONTEND — /connections shows a Strava card under OUTDOOR RIDE SYNC with a 'Set up' button (testID connect-strava); REGRESSION: Bluetooth demo (device-btn-* -> ble-panel -> ble-scan) and IMPORTED OUTDOOR RIDES card still work. NOTE: full Strava OAuth round-trip needs real STRAVA_CLIENT_ID/SECRET + callback-domain config and is out of scope until the user supplies keys. Prior iters 78-103 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 23 — Push indoor rides to Strava with per-second power/HR graph (+ auto & manual, 'Synced' state). CHANGES: providers/strava.py — SCOPES now include activity:write (WRITE_SCOPE const); added build_tcx() (Garmin TCX w/ per-trackpoint Watts/Cadence/HR/Speed), upload_tcx() (POST /uploads data_type=tcx, polls /uploads/{id} for activity_id), create_manual_activity() (summary-only fallback via POST /activities). routes/workouts.py _save_ride_history() now persists a compact ~1Hz `samples` track (cap 3600) + max_power/avg_hr/max_hr/avg_cadence + strava_activity_id=None, and fires asyncio auto_push_strava(user_id, rid). routes/connections.py — _fresh_access_token() (refresh+rotate), _ride_to_strava(), _do_strava_push() (TCX when samples else manual; records strava_activity_id/upload_id/status on the ride; idempotent), auto_push_strava() (silent; respects strava_auto_push pref default True + WRITE_SCOPE present), GET /connections/strava/ride-status?ride_id -> {connected,can_write,synced,pending}, POST /connections/strava/push {ride_id} (400 if not connected, {reauth_required:true} if no write scope, {already:true} if already pushed, else uploads). settings PATCH + _account_view now include strava_auto_push. FRONTEND: ridesync.ts pushRideToStrava()/stravaRideStatus(); components/summary.tsx new <StravaPushButton rideId onToast/> (hidden unless Strava connected; states: 'Send to Strava' -> 'Synced to Strava' (green check) / 'Uploading…' / 'Reconnect Strava to upload'; auto-refreshes status on mount + after 3s to catch server-side auto-push); rendered in app/summary.tsx main column. MAIN-AGENT VERIFIED via curl (demo, NOT strava-connected): POST /workouts/summarize with 40 fake samples -> returns id, and GET /rides/history shows samples:40, avg_hr:144, strava_activity_id:null; GET /connections/strava/ride-status -> {connected:false,...}; POST /connections/strava/push -> 400 (not connected); providers.strava.build_tcx() returns valid XML; authorize URL now contains activity:write. TEST REQUEST: BACKEND — (1) POST /workouts/summarize with >=30 samples returns {id}; GET /rides/history[0] has non-empty samples[] + avg_hr; (2) GET /connections/strava/ride-status?ride_id=<that id> returns connected=false for the (unconnected) demo user; (3) POST /connections/strava/push {ride_id} -> HTTP 400 when Strava not connected (NOT 500); (4) PATCH /connections/strava/settings {strava_auto_push:false} returns 200 with strava_auto_push=false in the account view (note: strava provider must exist). FRONTEND — the /connections screen still renders Strava (Connect) with no regressions; completing/opening a summary must not crash (StravaPushButton returns null when Strava is not connected, so no button shows for the demo account — that is expected). NOTE: the real TCX upload + 'Synced to Strava' state require the user to RECONNECT Strava granting activity:write and a real Strava account — out of scope for automated tests. Prior iters 78-104 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 24 — In-app per-ride PHOTO GALLERY (Emergent Object Storage) + editable Strava note. PHOTOS: new backend routes/ride_photos.py — POST /rides/{ride_id}/photos (multipart, image types jpg/png/webp/heic, 12MB cap, max 12/ride) -> uploads to Object Storage path roujaune/uploads/{user_id}/{uuid}.{ext} via storage.py and $push to ride_history.photos [{id,path,created_at}]; GET /rides/{ride_id}/photos -> {photos:[{id,path}]}; DELETE /rides/{ride_id}/photos/{photo_id} ($pull, storage has no delete API); GET /rides/photo/{path} proxies bytes (ownership: path must start with the caller's roujaune/uploads/{uid}/ prefix -> 403 otherwise). AuthMiddleware (auth.py) now also accepts a `?token=` query param so web <img> reads authenticate. Registered ride_photos router in server.py. Frontend: src/lib/ride-photos.ts (list/upload/delete + ridePhotoUri with ?token), src/components/RidePhotos.tsx (grid + Add tile via expo-image-picker with full permission contract incl. Open Settings, long-press/x to remove), rendered on the summary screen (rideId=stats.id, the guaranteed ride_history id). EDITABLE STRAVA NOTE: StravaPushButton now has an 'Edit note sent to Strava' toggle (testID strava-edit-note) + TextInput (testID strava-note-input) seeded from the coach debrief; the edited text is sent as coach_summary on push. Backend _describe already appends 'ROUJAUNE — Your strongest ride is your own.'. MAIN-AGENT VERIFIED end-to-end via curl with REAL object storage (demo token): uploaded a 1x1 PNG -> list shows it -> GET /rides/photo/{path}?token=200 image/png; GET without auth ->401; cross-user prefix ->403; DELETE -> list empty. iOS photo permission strings already in app.json. TEST REQUEST: BACKEND — (1) create a ride (POST /workouts/summarize w/ samples) -> get id; (2) POST /rides/{id}/photos multipart PNG -> {ok,photo}; (3) GET /rides/{id}/photos lists it; (4) GET /rides/photo/{path}?token=<sess> -> 200 image; without token -> 401; a path under another user's prefix -> 403; (5) DELETE /rides/{id}/photos/{photo_id} -> list empty. FRONTEND regression only — app loads, /connections still fine, no red screen from summary.tsx changes. NOTE: the OS image picker cannot be driven headlessly, so the photo-ADD UI and the real TCX/Strava upload are out of scope for automated UI testing; backend upload path is fully covered above. Prior iters 78-105 PASS. Server ~2026-09."

    -agent: "main"
    -comment: "ROUND 25 — EXPO SDK 54 -> 57 UPGRADE. (1) Bumped expo to ^57 (expo 57.0.20) + `yarn expo install --fix` aligned all deps (react-native 0.86.3, react 19.2.3, reanimated 4.5.1, screens 4.26.2, svg 15.15.4, etc.). (2) app.json housekeeping: removed `newArchEnabled` (SDK55) and android `edgeToEdgeEnabled` (SDK55 schema removal); bumped expo-build-properties ios.deploymentTarget 15.1 -> 16.4 (SDK57 minimum). (3) VECTOR ICONS MIGRATION (SDK56 breaking): replaced deprecated `@expo/vector-icons` with `@react-native-vector-icons/ionicons` + `@react-native-vector-icons/material-design-icons` across 117 files (barrel imports -> default imports); added both to app.json plugins. The new component drops `.glyphMap`, so `keyof typeof Ionicons.glyphMap` was replaced by a shared `IoniconName` type (src/lib/icon-types.ts = ComponentProps<typeof Ionicons>['name']) in 9 files. Rewrote src/hooks/use-icon-fonts.ts to preload the two bundled TTFs (Ionicons/MaterialDesignIcons) via expo-font instead of the old @expo/vector-icons CDN hack. (4) SDK57 expo-media-library BREAKING: the default entry now requires native module `ExpoMediaLibraryNext` (no web impl) AND the legacy funcs (getPermissions/requestPermissions/saveToLibraryAsync) THROW from the root export. Switched ShareCardModal.tsx + ScenicRecapShareModal.tsx to import from `expo-media-library/legacy` (web-safe: uses old ExpoMediaLibrary which HAS a .web stub; funcs still work on native). Both already guard Platform.OS==='web' before any call. (5) Installed missing peer dep expo-asset (+plugin). MAIN-AGENT VERIFIED: web preview boots to the login screen (Expo 57 dev banner), Google 'G' + mail icons render (icon migration OK); console shows only expected pre-login 401s + the harmless expo-notifications web warning; NO module/JS crashes. Lint = identical baseline to pre-upgrade (0 new errors from the migration). expo-doctor 17/20 (remaining 3 non-blocking: app.config.js-vs-app.json heuristic [app.config.js DOES spread app.json], transitive duplicate @expo/fingerprint via react-native-health, RN-Directory 'no metadata' for the new vector-icon pkgs). TEST REQUEST (demo@roujaune.app/demo9900, landscape): FRONTEND regression only — verify these screens render with icons and NO red-screen after the upgrade: (1) login -> home/today; (2) /connections (Bluetooth demo device-btn-* -> ble-panel -> ble-scan; Strava/Health cards); (3) switch experience to Gravel and open /scenic-destinations; (4) enter a scenic ride via begin-scenic-journey (YouTube may show 'unavailable' headless — expected), open scenic-source sheet; (5) settings screen; (6) open a ride summary (RidePhotos grid + StravaPushButton null-when-not-connected). Confirm Ionicons/MaterialCommunityIcons glyphs are visible (not blank boxes) across these screens. NATIVE-ONLY (out of scope): real BLE, PiP, Health Connect, IAP. Prior iters 78-106 PASS. Server ~2026-09."
