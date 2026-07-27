#!/usr/bin/env python3
"""Generate the Roujaune Architecture & Security Peer Review as a styled PDF."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem, HRFlowable, PageBreak
)

OUT = "/app/Roujaune_Architecture_Security_Review.pdf"

INK = colors.HexColor("#1A1A1A"); YELLOW = colors.HexColor("#F5B301"); RED = colors.HexColor("#E01E2B")
ORANGE = colors.HexColor("#FF7A1A"); AMBER = colors.HexColor("#E0A800"); GREEN = colors.HexColor("#2E9E5B")
GREY = colors.HexColor("#555555"); LIGHT = colors.HexColor("#F3F1EC"); BORDER = colors.HexColor("#DDD8CE")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=19, textColor=INK, spaceAfter=3, leading=23)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontSize=9, textColor=GREY, spaceAfter=8, leading=12)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, textColor=INK, spaceBefore=11, spaceAfter=4, leading=16)
H3 = ParagraphStyle("H3", parent=ss["Heading3"], fontSize=10.5, textColor=INK, spaceBefore=6, spaceAfter=2)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontSize=9.3, textColor=INK, leading=13.5, spaceAfter=5)
SMALL = ParagraphStyle("SMALL", parent=ss["Normal"], fontSize=8, textColor=GREY, leading=11)
CELL = ParagraphStyle("CELL", parent=ss["Normal"], fontSize=7.6, textColor=INK, leading=10)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
CODE = ParagraphStyle("CODE", parent=ss["Code"], fontSize=7.6, textColor=colors.HexColor("#222"), leading=10, backColor=LIGHT, borderPadding=5)
BULLET = ParagraphStyle("BULLET", parent=BODY, spaceAfter=2)

S = []


def hr():
    S.append(Spacer(1, 3)); S.append(HRFlowable(width="100%", thickness=0.7, color=BORDER)); S.append(Spacer(1, 3))


def bullets(items):
    return ListFlowable([ListItem(Paragraph(t, BULLET), leftIndent=6, value="\u2022") for t in items],
                        bulletType="bullet", start="\u2022", leftIndent=12)


def sev(label, color):
    t = Table([[Paragraph(f'<font color="white"><b>{label}</b></font>', CELL)]], colWidths=[150])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 8)]))
    return t


# Cover
band = Table([[Paragraph('<font color="#1A1A1A"><b>ROU</b></font><font color="#E01E2B"><b>JAUNE</b></font>', ParagraphStyle("l", fontSize=22))]], colWidths=[170])
band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), YELLOW), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 12)]))
S.append(band); S.append(Spacer(1, 10))
S.append(Paragraph("Architecture &amp; Security Peer Review", H1))
S.append(Paragraph("Roujaune \u2014 personalised cycling training for riders 50+ &nbsp;|&nbsp; Formal pre-production review &nbsp;|&nbsp; Read-only (no code modified)", SUB))

verdict = Table([[
    Paragraph('<font color="white"><b>Production Verdict</b></font>', CELL),
    Paragraph('<font color="white"><b>Requires Significant Changes \u2014 Not Ready</b></font>', ParagraphStyle("v", fontSize=12, textColor=colors.white)),
]], colWidths=[110, 360])
verdict.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), RED), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
S.append(verdict)
S.append(Spacer(1, 4))
S.append(Paragraph("<b>Verification method &amp; scope.</b> Read-only static review of the current worktree plus two independent sub-audits (functional/architecture and security/privacy). <b>No code was changed.</b> [CONFIRMED] = backed by cited code; [LIKELY] = needs runtime confirmation. This preview environment has no CI/CD, load/DR/backup infra, device lab, or 50+ tester panel, so areas 30\u201339 are assessed from code + config only and infra/human items are marked <i>Unable to verify (needs operational validation)</i>.", SMALL))

# A. Executive summary
S.append(Paragraph("A. Executive Summary", H2))
S.append(Paragraph("<b>Architecture C+:</b> sound Expo \u2194 FastAPI \u2194 MongoDB separation, good per-user scoping proxy and Fernet-encrypted OAuth tokens, but a 4,270-line <b>server.py monolith</b> with business logic (incl. the benchmark decision engine) in route handlers. <b>Code quality C+:</b> modular helpers + ~30 backend pytest files, but untyped Dict[str,Any] bodies, magic numbers, and no tests for the coaching/benchmark decision logic. <b>Production: Requires significant changes</b> \u2014 two confirmed HIGH defects plus privacy gaps block release for a health app serving over-50s.", BODY))
S.append(Paragraph("Five strongest aspects (preserve)", H3))
S.append(bullets([
    "Per-user isolation via _ScopedDB + manual user_id filters; benchmark :sid/:rid endpoints re-check ownership (audit PASS).",
    "Daily readiness gating screens critical symptoms (readiness.py CRITICAL_SYMPTOMS: chest pain, dizziness, SOB, illness, new pain).",
    "Shared coach intelligence \u2014 coach_system(name, gender) parametrises persona; no duplicated engine.",
    "OAuth tokens encrypted at rest (Fernet); client tokens in SecureStore (not AsyncStorage).",
    "LLM \u201cadjust my plan\u201d writes constrained by a sanitize_ops allow-list rather than trusting model output.",
]))
S.append(Paragraph("Five highest-risk issues", H3))
S.append(bullets([
    "<b>[HIGH/CONFIRMED] Cross-tenant plan mutation</b> \u2014 any rider can PUT/PATCH/DELETE /api/plans/{id} (plans_admin.py:152-177); plans collection is global; no admin role.",
    "<b>[HIGH/CONFIRMED] Dead benchmark safety triggers</b> \u2014 illness/injury/return/equipment branches (server.py:1435-1449) read top-level check-in fields but data persists nested under doc[\u2018checkin\u2019]; frontend never collects them \u2192 never fire.",
    "<b>[HIGH/CONFIRMED] Benchmark decision engine incomplete/route-embedded/untested</b> (server.py:1420-1484, 1727-1795).",
    "<b>[MEDIUM/CONFIRMED] Privacy gaps</b> \u2014 no account deletion/export; health data to third-party LLM without consent (server.py:2311-2369).",
    "<b>[MEDIUM/CONFIRMED] Secrets not git-ignored</b> \u2014 backend/.env not in .gitignore (untracked but at risk).",
]))
S.append(Paragraph("<b>Immediate direction (no rewrite):</b> (1) admin-gate /api/plans/*; (2) fix benchmark check-in field path + collect missing questions; (3) extract deterministic, unit-tested BenchmarkDecisionService; (4) .gitignore .env + rotate; (5) add deletion/export/consent.", BODY))

# B. Architecture map
S.append(Paragraph("B. Architecture Map", H2))
S.append(bullets([
    "<b>Layers:</b> Expo Router screens \u2192 src/lib services (+ SecureStore token, global-fetch bearer) \u2192 FastAPI AuthMiddleware \u2192 api_router + sub-routers \u2192 _ScopedDB \u2192 MongoDB. LLM via emergentintegrations.",
    "<b>Coaching flow:</b> rider context \u2192 coach_system(name,gender) prompt \u2192 LLM \u2192 display copy. Chat \u201cadjust plan\u201d \u2192 sanitize_ops allow-list \u2192 plans_admin.adapt_plan.",
    "<b>Benchmark-decision flow:</b> benchmark_plan_gate \u2192 _benchmark_recommendation + BM_* tables \u2192 status(required|recommended|approved|submaximal) \u2192 week (_default_week_days, _maximal_spacing_ok).",
    "<b>External:</b> Emergent LLM / Google &amp; Apple OAuth / Email / Push; Garmin + Google Fit (activity_sync.py); Open-Meteo (keyless).",
]))

S.append(PageBreak())

# C. Findings register
S.append(Paragraph("C. Findings Register", H2))
findings = [
    ("F-01", "Any rider can edit/delete shared training plans", "High", "AuthZ / BFLA", "plans_admin.py:152-177; server.py:2960-2971", "A rider rewrites/deletes the plan others follow \u2014 safety + integrity.", "Admin-role gate; per-user plan copies for rider edits.", "M", "Yes"),
    ("F-02", "Benchmark illness/injury/equipment retest triggers are dead code", "High", "Functional / Safety", "server.py:1435-1449; checkin.ts:18-24", "PRD safety retests never fire; riders resume on stale FTP.", "Read nested checkin (or persist flat) + add questions.", "S", "Yes"),
    ("F-03", "Benchmark decision engine incomplete, route-embedded, untested", "High", "Architecture", "server.py:1420-1484, 1727-1795", "Non-auditable; misses continuity, performance-change, progression, confidence/evidence.", "Extract deterministic BenchmarkDecisionService + unit tests.", "M", "Yes"),
    ("F-04", "Coach identity \u2018Alberto\u2019 leaks under Adriana", "Medium", "Content / Product rule", "calendar.tsx:385,387; summary.ts:67; PlanReviewCard.tsx:13,77", "Breaks locked identity-consistency requirement.", "Thread useCoach() persona; remove literal defaults.", "S", "Before prod"),
    ("F-05", "Accepting an older benchmark overwrites current FTP", "Medium", "Data integrity", "server.py:1267-1284, 1311/1327", "Zones regress to stale value while looking \u2018fresh\u2019.", "Apply only if newest-accepted per metric.", "S", "No"),
    ("F-06", "Benchmark collections not in USER_SCOPED; no per-user indexes", "Medium", "AuthZ / Perf", "auth.py:40-45,118-126,212-217", "Missed user_id filter \u2192 cross-tenant; unindexed scans.", "Add to USER_SCOPED; create user_id/id indexes.", "S", "No"),
    ("F-07", "No account deletion/export; health data to AI w/o consent", "Medium", "Privacy (GDPR)", "server.py:2311-2369,2408", "Erasure/portability/consent unmet for health data.", "Add erasure+export endpoints; AI data-sharing consent.", "M", "Before prod"),
    ("F-08", "backend/.env not git-ignored", "Medium", "Secrets / Misconfig", ".gitignore (no .env rule)", "Accidental secret commit.", "Add ignore rule; rotate on exposure.", "S", "Before prod"),
    ("F-09", "Coach LLM session_id not per-user", "Medium (Likely)", "AuthZ / BOLA", "server.py:787,890,989,1409\u2026; companion_plan.py:115", "Potential cross-user coach-memory bleed (provider-dependent).", "Include user_id in every session_id.", "S", "Before prod"),
    ("F-10", "Push registration trusts client user_id", "Medium", "AuthZ / BOLA", "push.py:50-64", "Spoof recipient / register against another rider.", "Derive user_id from session; ignore body.", "S", "Before prod"),
    ("F-11", "Client-side benchmark calc trusted verbatim by server", "Medium", "Integrity", "calc.ts:130; create_benchmark_result", "Manipulated FTP/confidence accepted.", "Server-side recompute/validate + bounds.", "M", "Next cycle"),
    ("F-12", "Wildcard CORS with credentials", "Low", "Misconfig", "server.py:4201-4207", "Broad origin trust (bearer, not cookie \u2192 limited).", "Explicit allow-list origins.", "S", "Next cycle"),
    ("F-13", "Weak auth controls (6-char, no rate-limit, soft-verify, 409 enum)", "Low", "Auth hardening", "auth.py:312,496,310-311,317-324", "Brute-force + enumeration + weak passwords.", "Rate-limit + strength policy; neutral responses.", "M", "Next cycle"),
    ("F-14", "server.py monolith + untyped bodies + date F821", "Low/Info", "Maintainability", "server.py (4270 LOC); L1607", "Slows change; hides contracts.", "Routers/services split; Pydantic models.", "L", "Next cycle"),
    ("F-15", "Activity dedup lookup omits user_id", "Low", "Isolation", "activity_sync.py:113", "Improbable cross-user collision.", "Scope by user_id.", "S", "Next cycle"),
]
sev_c = {"High": ORANGE, "Medium": AMBER, "Medium (Likely)": AMBER, "Low": GREEN, "Low/Info": GREY}
rows = [[Paragraph("<b>ID</b>", CELLB), Paragraph("<b>Title</b>", CELLB), Paragraph("<b>Sev</b>", CELLB),
         Paragraph("<b>Category</b>", CELLB), Paragraph("<b>Files / Evidence</b>", CELLB),
         Paragraph("<b>Recommended fix</b>", CELLB), Paragraph("<b>Cx</b>", CELLB), Paragraph("<b>Blocks</b>", CELLB)]]
for fid, title, s, cat, files, why, fix, cx, blocks in findings:
    c = sev_c.get(s, GREY)
    rows.append([
        Paragraph(fid, CELLB),
        Paragraph(title, CELL),
        Paragraph(f'<font color="#{c.hexval()[2:]}"><b>{s}</b></font>', CELL),
        Paragraph(cat, CELL),
        Paragraph(files, CELL),
        Paragraph(fix, CELL),
        Paragraph(cx, CELL),
        Paragraph(blocks, CELL),
    ])
ft = Table(rows, colWidths=[26, 96, 44, 60, 104, 104, 16, 34], repeatRows=1)
ft.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.35, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
]))
S.append(ft)
S.append(Paragraph("Cx = complexity (S/M/L). Blocks = blocks production release.", SMALL))

S.append(PageBreak())

# D. Code-level
S.append(Paragraph("D. Code-Level Review (selected)", H2))
S.append(Paragraph("<b>F-03 \u2014 extract the decision (pattern)</b>", H3))
S.append(Paragraph(
    "Problematic: decision + LLM copy inside the route (server.py:1421-1484). Recommended: a pure, testable "
    "service returning {status, reason, evidence[], recommendedTestType, confidence}; the route stays thin and the "
    "LLM only phrases decision.reason for display. Improvement: deterministic, unit-testable, auditable.", BODY))
S.append(Paragraph("<b>F-02 \u2014 field-path bug:</b> gate reads checkin.illness, but writes land under checkin[\u2018checkin\u2019][\u2026]. Read the correct nested path (or persist flat) and add the questions to checkin.ts.", BODY))
S.append(Paragraph("<b>F-01 \u2014 role gate:</b> plans_admin routes need Depends(require_admin); rider-initiated changes should target a per-user plan instance, not the shared definition.", BODY))

# E. Training & benchmark
S.append(Paragraph("E. Training &amp; Benchmark Assessment", H2))
S.append(bullets([
    "Personalisation: level classifier (rider_level.py) + benchmark-aware gate exist. \u2018Advanced as default\u2019 \u2014 <b>Unable to verify</b> (no code path asserts it).",
    "Progression/recovery: \u2018no two maximal tests on consecutive days\u2019 enforced (_maximal_spacing_ok) \u2014 good. Broader load-escalation caps not evidenced server-side.",
    "Benchmark validity/retesting: recency thresholds present, but continuity, performance-change, direct-progression and structured confidence are missing (F-03); illness/equipment triggers dead (F-02).",
    "Data-confidence: computed client-side and trusted (F-11); no server bounds.",
    "Illness/injury: strong at daily-readiness layer (readiness.py); absent at benchmark layer.",
    "Explainability: free-text reasons + warm LLM copy, but not structured evidence/confidence for audit.",
    "\u26a0 Requires independent sports-science sign-off (not automatable here): progression/recovery/workload limits, return-to-training, FB50 age adaptations. Software verification \u2260 coaching validation.",
]))

# F. Security
S.append(Paragraph("F. Security Assessment (STRIDE)", H2))
S.append(bullets([
    "<b>Spoofing:</b> push user_id spoofing (F-10); OAuth auto-trust of provider email.",
    "<b>Tampering:</b> shared-plan mutation (F-01); client-supplied benchmark metrics (F-11).",
    "<b>Repudiation:</b> no audit log for plan/admin actions (no admin role exists).",
    "<b>Info disclosure:</b> health data \u2192 third-party LLM w/o consent (F-07); potential cross-user LLM memory (F-09); .env exposure risk (F-08).",
    "<b>DoS:</b> no rate limiting (F-13); no size caps on base64 avatar uploads.",
    "<b>Elevation:</b> no RBAC \u2014 every rider has admin-level plan power (F-01).",
]))
S.append(Paragraph("Authorization matrix (as-built)", H3))
amrows = [
    [Paragraph("<b>Action</b>", CELLB), Paragraph("<b>Anonymous</b>", CELLB), Paragraph("<b>Authenticated rider</b>", CELLB), Paragraph("<b>Admin/Support</b>", CELLB)],
    [Paragraph("Own profile / rides / benchmarks / check-ins", CELL), Paragraph("No", CELL), Paragraph("Yes (scoped, verified)", CELL), Paragraph("role does not exist", CELL)],
    [Paragraph("Another rider's data", CELL), Paragraph("No", CELL), Paragraph("No (correctly blocked)", CELL), Paragraph("\u2014", CELL)],
    [Paragraph("Create/replace/delete SHARED plans", CELL), Paragraph("No", CELL), Paragraph("YES \u2014 defect F-01", CELLB), Paragraph("\u2014", CELL)],
    [Paragraph("Register push token for arbitrary user", CELL), Paragraph("No", CELL), Paragraph("Yes \u2014 defect F-10", CELL), Paragraph("\u2014", CELL)],
]
amt = Table(amrows, colWidths=[210, 62, 130, 82])
amt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.35, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
]))
S.append(amt)
S.append(Paragraph("Community (/api/community) = static read-only demo data \u2192 no UGC/report/block/moderation \u2192 trust-&-safety <b>not implemented</b>. Subscriptions/payments: <b>none exist \u2192 N/A</b>.", SMALL))

S.append(PageBreak())

# G. Testing
S.append(Paragraph("G. Testing Assessment", H2))
S.append(bullets([
    "Current: ~30 backend pytest files (auth/multi-user isolation, benchmark CRUD, calendar, ride-sync, prefs) + 2 frontend script tests \u2014 good CRUD breadth.",
    "Major gaps: benchmark DECISION logic; workout progression; illness/injury adaptation; Alberto\u2194Adriana consistency; calc numerical correctness; property/invariant tests.",
    "Priority edge cases: new rider (no benchmark); direct plan\u2192plan (no auto-repeat); recent vs expired benchmark; return after illness/injury; bike/power-meter change; no power meter; incomplete HR; missed workouts; over-training; declining performance; Intermediate\u2192Advanced; conflicting fitness data.",
    "Architecture: pure-function services \u2192 fast table-driven unit tests; API/integration vs ephemeral Mongo; a coaching-eval suite re-run on any prompt/model/rule change and diffed vs an approved baseline.",
]))

# H. Action plan
S.append(Paragraph("H. Prioritised Action Plan", H2))
plan = [
    ("Fix immediately (blocks prod)", RED, [
        "F-01 admin-gate /api/plans/* (~0.5\u20131d) \u2014 prevents cross-tenant plan destruction.",
        "F-02 benchmark check-in field path + questions (~0.5d) \u2014 restores safety retests.",
        "F-03 extract BenchmarkDecisionService + unit tests (~2\u20133d) \u2014 auditable, correct decisions.",
    ]),
    ("Fix before production", ORANGE, [
        "F-07 deletion/export + consent (~2\u20133d); F-08 .gitignore + rotate (~1h); F-09 per-user session_id (~0.5d); F-10 push user_id from session (~0.5h); F-04/F-05/F-06 coach leaks, FTP recency guard, USER_SCOPED+indexes (~1\u20132d).",
    ]),
    ("Next development cycle", AMBER, [
        "F-11 server-side calc validation; F-12 CORS allow-list; F-13 rate-limit + password policy; coaching-eval + property tests; begin server.py router/service split (F-14).",
    ]),
    ("Longer-term", GREEN, [
        "Migration framework; observability/audit logging (no PII); activity-import fuzzing (FIT/TCX/GPX untrusted input); feature flags for AI/plan-gen/sync; SBOM + dependency scanning in CI.",
    ]),
]
for title, c, items in plan:
    S.append(Spacer(1, 3)); S.append(sev(title, c)); S.append(bullets(items))

# I. Verdict
S.append(Paragraph("I. Final Production-Readiness Verdict", H2))
S.append(Paragraph("<b>Requires significant changes \u2014 Not ready for production.</b> Two CONFIRMED HIGH defects affect safety and multi-tenant integrity for a health app serving over-50s: (F-01) any rider can rewrite/delete the plan others follow, and (F-02) illness/injury/equipment benchmark-retest safeguards never execute \u2014 compounded by (F-03) an unaudited/untested decision engine and (F-07) missing privacy controls. The foundation is solid (good isolation, encrypted tokens, strong daily-readiness gating, shared coach engine), so these are incremental fixes, not a rewrite. After the \u2018Fix immediately\u2019 + \u2018Fix before production\u2019 batches and independent sports-science sign-off, this could move to \u2018Ready with minor changes\u2019.", BODY))

hr()
S.append(Paragraph("Not verifiable in this environment (need operational/human validation): 22 device/FIT-file fuzzing, 23 live sandbox contract tests, 24 migration/rollback on prod-sized data, 29 WCAG 2.2 AA with real 50+ users, 30 device matrix, 31 load/soak/battery, 32 chaos, 33 backup/DR restoration, 34 observability/on-call, 35 CI/CD controls, 36 SBOM/supply-chain, 38 feature-flag/rollback, 39 field UAT. No code was implemented as part of this review.", SMALL))


def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(BORDER); canvas.setLineWidth(0.5)
    canvas.line(16 * mm, 12 * mm, A4[0] - 16 * mm, 12 * mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(GREY)
    canvas.drawString(16 * mm, 7 * mm, "Roujaune Architecture & Security Peer Review \u2014 Confidential")
    canvas.drawRightString(A4[0] - 16 * mm, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=15 * mm, bottomMargin=16 * mm,
                        title="Roujaune Architecture & Security Review", author="Roujaune Engineering")
doc.build(S, onFirstPage=footer, onLaterPages=footer)
print("WROTE", OUT)
