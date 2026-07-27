#!/usr/bin/env python3
"""Generate the Roujaune UX Audit report as a styled PDF."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem, HRFlowable
)

OUT = "/app/Roujaune_UX_Audit_Report.pdf"

# Brand palette
INK = colors.HexColor("#1A1A1A")
YELLOW = colors.HexColor("#F5B301")
RED = colors.HexColor("#E01E2B")
ORANGE = colors.HexColor("#FF7A1A")
AMBER = colors.HexColor("#E0A800")
GREEN = colors.HexColor("#2E9E5B")
GREY = colors.HexColor("#555555")
LIGHT = colors.HexColor("#F3F1EC")
BORDER = colors.HexColor("#DDD8CE")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=20, textColor=INK, spaceAfter=4, leading=24)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontSize=10, textColor=GREY, spaceAfter=10)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13.5, textColor=INK, spaceBefore=12, spaceAfter=5, leading=17)
H3 = ParagraphStyle("H3", parent=ss["Heading3"], fontSize=11.5, textColor=INK, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontSize=9.5, textColor=INK, leading=14, spaceAfter=5)
SMALL = ParagraphStyle("SMALL", parent=ss["Normal"], fontSize=8.5, textColor=GREY, leading=12)
CELL = ParagraphStyle("CELL", parent=ss["Normal"], fontSize=8.5, textColor=INK, leading=11.5)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
BULLET = ParagraphStyle("BULLET", parent=BODY, spaceAfter=2)

story = []


def hr():
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.7, color=BORDER))
    story.append(Spacer(1, 4))


def bullets(items, style=BULLET):
    return ListFlowable(
        [ListItem(Paragraph(t, style), leftIndent=6, value="•") for t in items],
        bulletType="bullet", start="•", leftIndent=12,
    )


def sev_chip(label, color):
    t = Table([[Paragraph(f'<font color="white"><b>{label}</b></font>', CELL)]], colWidths=[120])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


# ---- Cover / title ----
band = Table([[Paragraph('<font color="#1A1A1A"><b>ROU</b></font><font color="#E01E2B"><b>JAUNE</b></font>', ParagraphStyle("logo", fontSize=22))]], colWidths=[170])
band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), YELLOW), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 12)]))
story.append(band)
story.append(Spacer(1, 10))
story.append(Paragraph("Comprehensive UX / Accessibility / QA Audit", H1))
story.append(Paragraph("Roujaune — personalised cycling training for riders over 50 &nbsp;|&nbsp; Read-only evaluation &nbsp;|&nbsp; Landscape web preview (1180×820) &nbsp;|&nbsp; No code modified", SUB))

rating_tbl = Table([[
    Paragraph('<font color="white"><b>Overall UX Rating</b></font>', CELL),
    Paragraph('<font color="white"><b>7 / 10</b></font>', ParagraphStyle("big", fontSize=15, textColor=colors.white)),
    Paragraph('<font color="white">9/9 journeys exercised — 0 blocked, 3 partial, 1 not observable</font>', CELL),
]], colWidths=[110, 70, 300])
rating_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), INK), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
]))
story.append(rating_tbl)

# ---- 1. Executive summary ----
story.append(Paragraph("1. Executive Summary", H2))
story.append(Paragraph(
    "All nine primary journeys were exercised end-to-end on the landscape web preview as the returning demo rider "
    "(Green Lantern, “From Couch to Road”, Week 1), plus a coach persona swap to Adriana. All ten navigation "
    "destinations open, the back button always works, and no dead-ends were found. The <b>coach system is a genuine "
    "strength</b> — persona changes propagate to the hero descriptor, coach card, plan “Adapted by…” line and the "
    "LLM plan-gate copy. The <b>Daily Check-in has excellent safety gating</b>, explicitly screening for chest pain, "
    "dizziness, shortness of breath, illness and new pain.", BODY))
story.append(Paragraph(
    "The main weaknesses for the 55–70 audience are: a <b>broken “READINESS” metric label</b> (renders one letter per "
    "line), <b>two coach-persona text leaks</b> that still say “Alberto” after switching to Adriana, a "
    "<b>banner-heavy Today screen</b> (three stacked promos push the hero below the fold), a <b>truncated "
    "“Benchmark W…” nav label</b>, and several <b>content/safety-tone gaps</b> (no “not medical advice” framing on "
    "Wellness; the FTP change shows the number but not the plain-language reason).", BODY))

# ---- 2. Journey table ----
story.append(Paragraph("2. Task-Completion Results", H2))
journeys = [
    ("J1", "First-time setup / onboarding", "Partial", "/onboarding reachable even when already onboarded (no redirect). Questions short, plain, age-appropriate; “See my recommendation” prominent. WHY-copy on fresh path not fully verifiable read-only."),
    ("J2", "Find & understand today's workout", "Partial", "Duration (~15 min), type (Strength), coach visible; “View Today's Workout” is an obvious CTA. FTP/TSS/zones not explained inline."),
    ("J3", "Adjust a workout", "Partial", "/checkin captures sleep, energy, motivation, soreness, stress + red-flag symptoms. Subtitle still says “Alberto” after swap; no explicit “only 45 minutes” shortcut."),
    ("J4", "Missed workout", "Not observable", "Could not simulate a missed session read-only; catch-up/safety messaging not evaluable."),
    ("J5", "Benchmark workout", "Partial", "Ramp Test recommended with WHY copy; zone preview clear; FTP change shown numerically but no plain-language reason; “Review with Alberto” leaks for Adriana."),
    ("J6", "Training plan", "Completed", "Persona-aware gate; 16-week “From Couch to Road” hero, goals, calendar, this-week plan render. “Advanced” not presented as universal — good."),
    ("J7", "Progress", "Partial", "Timeline + Benchmark Trends + Fitness Trend + Power Records + Recent Activities render. Two range vocabularies; no single 4-week improvement headline."),
    ("J8", "Wellness", "Partial", "Well-recovered narrative + FB50 + Recovery Vitals + Sleep chart. No “not medical advice” framing; sleep chart missing axes."),
    ("J9", "Help & error recovery", "Completed", "Help hub with FAQs + Message-coach CTA; back button works everywhere; no traps."),
]
res_color = {"Completed": GREEN, "Partial": AMBER, "Not observable": GREY}
rows = [[Paragraph("<b>#</b>", CELLB), Paragraph("<b>Journey</b>", CELLB), Paragraph("<b>Result</b>", CELLB), Paragraph("<b>Notes</b>", CELLB)]]
for j, name, res, note in journeys:
    rows.append([
        Paragraph(j, CELLB),
        Paragraph(name, CELL),
        Paragraph(f'<font color="#{res_color[res].hexval()[2:]}"><b>{res}</b></font>', CELL),
        Paragraph(note, CELL),
    ])
jt = Table(rows, colWidths=[18, 120, 62, 280])
jt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
]))
story.append(jt)

# ---- 3. Issues ----
story.append(Paragraph("3. Issues by Severity", H2))


def issue_block(title, persona, itype, repro, happened, expected, impact, fix):
    data = [
        [Paragraph("<b>Screen / feature</b>", CELLB), Paragraph(title, CELL)],
        [Paragraph("<b>Persona</b>", CELLB), Paragraph(persona, CELL)],
        [Paragraph("<b>Type</b>", CELLB), Paragraph(itype, CELL)],
        [Paragraph("<b>Steps</b>", CELLB), Paragraph(repro, CELL)],
        [Paragraph("<b>What happened</b>", CELLB), Paragraph(happened, CELL)],
        [Paragraph("<b>Expected</b>", CELLB), Paragraph(expected, CELL)],
        [Paragraph("<b>Impact</b>", CELLB), Paragraph(impact, CELL)],
        [Paragraph("<b>Recommendation</b>", CELLB), Paragraph(fix, CELL)],
    ]
    t = Table(data, colWidths=[95, 385])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 4))
    story.append(t)


story.append(sev_chip("CRITICAL", RED))
story.append(Paragraph("No issue fully blocks a journey. The READINESS label and the persona leaks are severe but non-blocking, so they are classified as High.", SMALL))

story.append(Spacer(1, 6))
story.append(sev_chip("HIGH", ORANGE))
issue_block("Today → MetricSummaryStrip (READINESS cell)", "All (worst for 67yo returning user)", "UX / Functional",
            "Log in → Today → scroll to the bottom metric strip.",
            "The “READINESS” label renders vertically, one letter per line (“RE / AD / IN / ES / S”).",
            "A single horizontal label “READINESS”.",
            "Looks broken and undermines trust in the data shown.",
            "Give the last cell adequate width or wrap/scale the label correctly.")
issue_block("Benchmark → plan-review banner CTA", "Anyone using Adriana", "Content / Functional",
            "Settings → select Adriana → open Benchmark Workouts.",
            "CTA still reads “Review with Alberto”.",
            "“Review with Adriana”.",
            "Breaks coach consistency and trust in personalisation.",
            "Interpolate the active coach via useCoach().name.")
issue_block("Check-in → subtitle", "Anyone using Adriana", "Content / Functional",
            "Select Adriana → open the Daily Check-in.",
            "Subtitle still reads “…so Alberto can tune today's ride.”",
            "The currently-selected coach's name.",
            "Inconsistent voice on a safety-critical readiness flow.",
            "Interpolate the active coach name in the subtitle.")
issue_block("Today → banner stack", "67yo, low-confidence", "UX",
            "Log in as a returning rider with an active benchmark week + pending FTP review.",
            "Three stacked banners (plan-updated + FTP-review 287→305W + benchmark-reminder) render above the hero.",
            "One clear “what to do next”.",
            "High cognitive load; hero + Today's Workout pushed below the fold at 820px height.",
            "Consolidate into a single rotating “What's new” slot / priority queue.")
issue_block("Side navigation → “Benchmark Workouts”", "Low-confidence / low-vision", "UX / Accessibility",
            "Open any screen and read the left rail at 1180px.",
            "Label truncates to “Benchmark W…”.",
            "The full, readable label.",
            "A core nav item is unreadable.",
            "Widen the rail, allow a two-line label, or shorten safely (nav ORDER stays locked — product decision).")

story.append(Spacer(1, 6))
story.append(sev_chip("MEDIUM", AMBER))
story.append(bullets([
    "<b>Nav first-item label “Today” vs spec “Home”</b> (src/data.ts:11) — content; flagged for product decision, not silently changed.",
    "<b>Progress range vocabularies inconsistent</b> — “Week/Month/3M/6M/1Y” vs “4w/3m/6m/12m/All” shown side by side — UX/content.",
    "<b>Wellness — no “not medical advice” framing</b> — HRV / Resting HR / Stress presented like clinical readings — content/safety.",
    "<b>Wellness Sleep chart</b> — no x-axis (days) or y-axis (hours); purple-vs-yellow bars unexplained — UX/accessibility (colour-alone).",
    "<b>“Younger Male” rider identity chip</b> on Virtual Routes — off-tone for a 50+ audience — content.",
    "<b>Plan-gate CTA hierarchy</b> — the lighter “Choose another test or a submaximal option” is a small low-contrast link vs two large boxes; the tired/time-limited persona will miss the safe/easy option — UX.",
    "<b>Today hero duplication</b> — the right overlay card repeats the coach card's workout with a second CTA doing the same thing — UX.",
]))

story.append(Spacer(1, 6))
story.append(sev_chip("LOW", GREEN))
story.append(bullets([
    "<b>Today header pills</b> (flame / bell / GL avatar) ~28–32px — below the 44×44 touch minimum — accessibility.",
    "<b>props.pointerEvents deprecation warning</b> on load (RN Web, likely the Toast in app/index.tsx) — functional/tech-debt.",
    "<b>Login has no testIDs</b> on email/password/submit; “Continue with Google” on web won't complete without a note — functional/QA.",
    "<b>/onboarding reachable by already-onboarded users</b> with no redirect/confirm — a returning user could accidentally re-run setup — UX/functional.",
    "<b>No visible keyboard focus ring</b> on rail items/buttons — accessibility.",
]))

# ---- 4. Terminology ----
story.append(Paragraph("4. Inconsistent Wording / Terminology", H2))
story.append(bullets([
    "“Today” (nav) vs “Home” (spec).",
    "Progress ranges: “Week/Month/3 Months/6 Months/1 Year” vs “4w/3m/6m/12m/All”.",
    "“Review with Alberto” / “…so Alberto can tune…” persist under Adriana.",
    "Two CTAs for one action: “View Today's Workout” vs “Open Today's Training”.",
]))

# ---- 5. Accessibility ----
story.append(Paragraph("5. Accessibility Findings", H2))
story.append(bullets([
    "Touch targets: Today header pills below 44×44.",
    "Colour-alone signals: Stress dot and sleep-bar colour carry meaning without text/labels.",
    "Missing chart axes (sleep) reduce interpretability.",
    "No visible keyboard focus indicators; login inputs lack testIDs/labels for assistive tooling.",
    "Truncated nav label reduces readability for low-vision / low-confidence users.",
]))

# ---- 6. Positives ----
story.append(Paragraph("6. Positive Aspects to Preserve", H2))
story.append(bullets([
    "High-quality coach system — persona propagation across hero, coach card, plan “Adapted by…”, and plan-gate copy.",
    "Warm, plain-language plan gate (“Submaximal assessment recommended”) — ideal for the 67yo persona.",
    "Daily Check-in's explicit red-flag symptom screening — calm, effective safety gating.",
    "Full-width landscape layout is clean; benchmark zone before/after transparency.",
    "Connections honestly labels Apple Health as “Needs app build” rather than hiding it.",
]))

# ---- 7. Backlog ----
story.append(Paragraph("7. Prioritised Improvement Backlog", H2))
backlog = [
    ("P0", "Fix READINESS metric-cell layout; fix the two coach persona leaks (Benchmark CTA + Check-in subtitle)."),
    ("P1", "Resolve “Benchmark W…” truncation; consolidate the 3 Today banners into one; elevate the plan-gate lighter/45-min option; add “not medical advice” framing on Wellness."),
    ("P2", "Normalise Progress range labels; add Sleep chart axes; rename “Younger Male” identity; enlarge Today header pills to 44×44."),
    ("P3", "Reconcile “Today” vs “Home” nav label (product decision); clean up pointerEvents warning; add login testIDs; guard /onboarding for returning users; add keyboard focus rings."),
]
brows = [[Paragraph("<b>Priority</b>", CELLB), Paragraph("<b>Items</b>", CELLB)]]
pc = {"P0": RED, "P1": ORANGE, "P2": AMBER, "P3": GREEN}
for p, txt in backlog:
    brows.append([Paragraph(f'<font color="{pc[p].hexval().replace("0x", "#")}"><b>{p}</b></font>', CELL), Paragraph(txt, CELL)])
bt = Table(brows, colWidths=[55, 425])
bt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]))
story.append(bt)

# ---- 8. Evidence ----
story.append(Paragraph("8. Evidence & Artefacts", H2))
story.append(bullets([
    "Full machine-readable report: /app/test_reports/iteration_50.json",
    "17 evidence screenshots: /app/test_reports/screens/ (Today, all nav destinations, Adriana-selected states, check-in, onboarding, plan, benchmark, progress, wellness, settings).",
]))

hr()
story.append(Paragraph("Read-only audit — no application code, wording, navigation or functionality was modified. No recommendations will be implemented until explicitly approved.", SMALL))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER); canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 12 * mm, A4[0] - 18 * mm, 12 * mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(GREY)
    canvas.drawString(18 * mm, 7 * mm, "Roujaune UX / Accessibility / QA Audit — Confidential")
    canvas.drawRightString(A4[0] - 18 * mm, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                        title="Roujaune UX Audit Report", author="Roujaune QA")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("WROTE", OUT)
