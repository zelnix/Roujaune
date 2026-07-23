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

user_problem_statement: "ROUJAUNE cycling app — fork session: multiple profile/home/audio/connections enhancements."

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
    - "POST /api/rider/checkin — stores daily check-in, returns readiness (incl. safety override on symptoms)"
    - "GET /api/rider/readiness/today — returns latest stored readiness"
    - "GET /api/calendar/week — today's readiness ring overridden by latest check-in (source 'Daily check-in')"
    - "Daily Check-in screen (/checkin): scales, sleep stepper, symptoms, submit -> result card"
    - "Home: live READINESS cell (tap -> /checkin), ReadinessGate banner when score<55 or safety override"
    - "Plan screen: CalendarCard live 'THIS WEEK'S PLAN', 3-goal limit in Edit Goals, header pills removed"
    - "12 new leveled workouts (VO2/Threshold/Sprint/Recovery Foundation/Development/Performance) in catalog"
    - "rider_level.py enhanced with longest_ride/missed/improving signals"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -comment: "New P1 batch: Daily Check-in + readiness engine wiring, live readiness on Home/Calendar, readiness plan gating banner (CTAs: Start recovery ride -> /workout, Browse recovery -> /workout-list?type=recovery), 12 new leveled workouts, rider_level enhancements. Backend self-tested via curl (checkin/today/calendar override/safety override all pass). Please validate backend endpoints and frontend flows. Note: readiness is stored as a singleton 'latest' + per-date; calendar overrides only the selected_date day. Current demo readiness reset to a healthy ~76-82. To test the gate, POST a low check-in."

#====================================================================================================