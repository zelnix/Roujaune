"""Rider Level classifier for Roujaune (Beginner / Intermediate / Advanced).

Classifies from recent (≈6–8 week) riding ability, consistency, completion,
recovery and performance — never age alone. Missing wearable/power data is not
treated as poor; available criteria are re-weighted. Promotions require sustained
performance over several consecutive weeks; reductions only after a consistent
4-week decline or a prolonged break. Supportive and tuned for indoor 50+ riders.

All inputs OPTIONAL. Suggested payload keys:
  rides_per_week, avg_duration_min, longest_ride_min, completion_rate(0–1|0–100),
  avg_rpe(0–10), zone_control(0–1|0–100), cadence_control(0–1|0–100),
  recovery(0–1|0–100), consistent_weeks(int), missed_or_stopped(int),
  readiness_concerns(bool), improving(bool),
  completed_types: {endurance,tempo,cadence,interval,threshold: bool},
  current_level|previous_level: "Beginner"|"Intermediate"|"Advanced",
  weeks_meeting_intermediate(int), weeks_meeting_advanced(int),
  weeks_below_current(int), returning_from_break(bool)
"""

from typing import Any, Optional

LEVELS = ["Beginner", "Intermediate", "Advanced"]


def _num(v: Any) -> Optional[float]:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _frac(v: Any) -> Optional[float]:
    """Normalise a 0–1 or 0–100 value to 0–1."""
    n = _num(v)
    if n is None:
        return None
    return n / 100.0 if n > 1.0 else n


def _bool(v: Any) -> Optional[bool]:
    return None if v is None else bool(v)


def _criteria(payload: dict, level: str) -> list:
    """Return [(name, met, available)] for the given level's core criteria."""
    rpw = _num(payload.get("rides_per_week"))
    dur = _num(payload.get("avg_duration_min"))
    comp = _frac(payload.get("completion_rate"))
    rpe = _num(payload.get("avg_rpe"))
    zc = _frac(payload.get("zone_control"))
    cc = _frac(payload.get("cadence_control"))
    rec = _frac(payload.get("recovery"))
    weeks = _num(payload.get("consistent_weeks"))
    types = payload.get("completed_types") or {}

    def t(name):
        return _bool(types.get(name))

    if level == "Intermediate":
        return [
            ("rides", rpw is not None and rpw >= 2, rpw is not None),
            ("duration", dur is not None and dur >= 35, dur is not None),
            ("completion", comp is not None and comp >= 0.8, comp is not None),
            ("rpe", rpe is not None and rpe <= 7.0, rpe is not None),
            ("recovery", rec is not None and rec >= 0.6, rec is not None),
            ("consistency", weeks is not None and weeks >= 6, weeks is not None),
            ("endurance_tempo", bool(t("endurance") and t("tempo")), t("endurance") is not None or t("tempo") is not None),
        ]
    if level == "Advanced":
        return [
            ("rides", rpw is not None and rpw >= 4, rpw is not None),
            ("duration", dur is not None and dur >= 45, dur is not None),
            ("completion", comp is not None and comp >= 0.9, comp is not None),
            ("zone_control", zc is not None and zc >= 0.75, zc is not None),
            ("cadence_control", cc is not None and cc >= 0.75, cc is not None),
            ("recovery", rec is not None and rec >= 0.7, rec is not None),
            ("consistency", weeks is not None and weeks >= 8, weeks is not None),
            ("intervals", bool(t("threshold") or t("interval")), t("threshold") is not None or t("interval") is not None),
        ]
    return []


def _match_fraction(payload: dict, level: str):
    crit = _criteria(payload, level)
    avail = [c for c in crit if c[2]]
    if not avail:
        return 0.0, 0, 0
    met = sum(1 for c in avail if c[1])
    return met / len(avail), met, len(avail)


def compute_rider_level(payload: dict) -> dict:
    previous = payload.get("current_level") or payload.get("previous_level") or "Beginner"
    if previous not in LEVELS:
        previous = "Beginner"

    int_frac, int_met, int_tot = _match_fraction(payload, "Intermediate")
    adv_frac, adv_met, adv_tot = _match_fraction(payload, "Advanced")

    meets_int = int_tot >= 3 and int_frac >= 0.7
    meets_adv = adv_tot >= 4 and adv_frac >= 0.7
    band = "Advanced" if meets_adv else "Intermediate" if meets_int else "Beginner"

    rpw = _num(payload.get("rides_per_week")) or 0
    comp = _frac(payload.get("completion_rate")) or 0
    rec = _frac(payload.get("recovery"))
    concerns = bool(payload.get("readiness_concerns"))
    missed = _num(payload.get("missed_or_stopped"))
    improving = _bool(payload.get("improving"))
    longest = _num(payload.get("longest_ride_min"))
    # A repeated pattern of reduced/stopped workouts is treated as a safety/consistency concern.
    if missed is not None and missed >= 3:
        concerns = True
    weeks_int = _num(payload.get("weeks_meeting_intermediate")) or 0
    weeks_adv = _num(payload.get("weeks_meeting_advanced")) or 0
    weeks_below = _num(payload.get("weeks_below_current")) or 0
    returning = bool(payload.get("returning_from_break"))

    prev_idx = LEVELS.index(previous)
    band_idx = LEVELS.index(band)
    new_level = previous

    # ── Promotion (one step, sustained-weeks gated) ───────────────────────────
    if band_idx > prev_idx:
        if previous == "Beginner":
            if (weeks_int >= 4 and rpw >= 2 and comp >= 0.8 and (rec is None or rec >= 0.6) and not concerns):
                new_level = "Intermediate"
        elif previous == "Intermediate":
            if (weeks_adv >= 6 and rpw >= 4 and comp >= 0.9 and not concerns):
                new_level = "Advanced"
    # ── Reduction (only on sustained decline / long break) ────────────────────
    elif band_idx < prev_idx:
        if returning or weeks_below >= 4:
            new_level = LEVELS[prev_idx - 1]

    # ── Progress toward next level ────────────────────────────────────────────
    if new_level == "Advanced":
        # Top level — reflect how well advanced criteria are still met.
        progress = int(round(adv_frac * 100)) if adv_tot else 100
        target = None
    else:
        target = LEVELS[LEVELS.index(new_level) + 1]
        met_frac, _, tot = _match_fraction(payload, target)
        req_weeks = 4 if new_level == "Beginner" else 6
        have_weeks = weeks_int if new_level == "Beginner" else weeks_adv
        weeks_frac = min(1.0, (have_weeks / req_weeks)) if req_weeks else 0.0
        progress = int(round(60 * met_frac + 40 * weeks_frac)) if tot else int(round(60 * (int_frac if new_level == "Beginner" else adv_frac)))
        progress = max(0, min(99, progress))

    # ── Confidence ────────────────────────────────────────────────────────────
    key_fields = ["rides_per_week", "avg_duration_min", "completion_rate", "avg_rpe",
                  "recovery", "consistent_weeks", "completed_types"]
    present = sum(1 for k in key_fields if payload.get(k) is not None)
    coverage = present / len(key_fields)
    if coverage >= 0.7 and payload.get("completion_rate") is not None and payload.get("consistent_weeks") is not None:
        confidence = "high"
    elif coverage >= 0.4:
        confidence = "medium"
    else:
        confidence = "low"

    # ── Main reasons (supportive, from met criteria) ──────────────────────────
    reasons = []
    if comp:
        reasons.append(f"Completed {int(round(comp * 100))}% of planned workouts")
    if rpw:
        reasons.append(f"Riding about {int(round(rpw))} times per week")
    if payload.get("consistent_weeks") is not None:
        reasons.append(f"Trained consistently for {int(_num(payload.get('consistent_weeks')))} weeks")
    if _frac(payload.get("cadence_control")) is not None and _frac(payload.get("cadence_control")) >= 0.75:
        reasons.append("Maintained consistent cadence control")
    if _num(payload.get("avg_rpe")) is not None and _num(payload.get("avg_rpe")) <= 7:
        reasons.append("Controlled RPE across sessions")
    if rec is not None and rec >= 0.7:
        reasons.append("Recovering reliably between sessions")
    if improving:
        reasons.append("Improving in duration, workload or efficiency")
    if longest is not None and longest >= 45:
        reasons.append(f"Completed a {int(longest)}-minute indoor ride")
    if not reasons:
        reasons = ["Building your recent training picture"]

    # ── Next-level requirements (from unmet target criteria) ──────────────────
    req_labels = {
        "rides": {"Intermediate": "Ride at least 2 times per week", "Advanced": "Ride at least 4 times per week"},
        "duration": {"Intermediate": "Build sessions toward 35–60 minutes", "Advanced": "Build sessions toward 45–75 minutes"},
        "completion": {"Intermediate": "Complete at least 80% of planned workouts", "Advanced": "Complete at least 90% of planned workouts"},
        "rpe": {"Intermediate": "Keep RPE controlled through sessions", "Advanced": "Hold precise pacing and intensity"},
        "zone_control": {"Advanced": "Sharpen HR / power-zone control"},
        "cadence_control": {"Advanced": "Sharpen cadence control"},
        "recovery": {"Intermediate": "Recover reliably between sessions", "Advanced": "Recover well from higher loads"},
        "consistency": {"Intermediate": "Reach 6 consistent training weeks", "Advanced": "Reach 8+ consistent training weeks"},
        "endurance_tempo": {"Intermediate": "Complete endurance and tempo workouts"},
        "intervals": {"Advanced": "Complete threshold / interval preparation workouts"},
    }
    next_reqs = []
    if target:
        for name, met, avail in _criteria(payload, target):
            if not met and name in req_labels and target in req_labels[name]:
                next_reqs.append(req_labels[name][target])
        req_weeks = 4 if new_level == "Beginner" else 6
        have_weeks = weeks_int if new_level == "Beginner" else weeks_adv
        if have_weeks < req_weeks:
            next_reqs.append(f"Sustain the criteria for {req_weeks} consecutive weeks")
        next_reqs = next_reqs[:4] or [f"Maintain your {target} criteria consistently"]
    else:
        next_reqs = ["Maintain your advanced training load and recovery"]

    return {
        "riderLevel": new_level,
        "previousLevel": previous,
        "levelChanged": new_level != previous,
        "progressTowardNextLevel": progress,
        "confidence": confidence,
        "mainReasons": reasons[:4],
        "nextLevelRequirements": next_reqs,
    }
