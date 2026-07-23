"""Rider Readiness engine for Roujaune.

Produces a single 0–100 readiness score from whatever data is available, with
automatic re-weighting of missing inputs, personal-baseline comparison for
wearable metrics, anti-double-counting, safety overrides, score banding and a
confidence rating. Device-neutral and tuned for indoor cyclists aged 50+.

All inputs are OPTIONAL. Missing data is never treated as zero — the category is
simply dropped and the remaining weights are renormalised to 100%.

Scales (defaults, all 0–10 unless noted):
  Positive (higher = better): feeling, energy, recovery, mood, motivation,
      sleep_quality, completion(0–1 or 0–100)
  Negative (higher = worse):  fatigue, soreness, joint_discomfort, pain, stress
  Absolute: sleep_hours (hours), rpe(0–10), resting_hr(bpm), hrv(ms)
"""

from typing import Any, Optional

# Base category weights (must sum to 100).
BASE_WEIGHTS = {
    "feeling": 20,      # current feeling, energy, fatigue, recovery
    "sleep": 15,        # sleep duration + quality
    "load": 15,         # recent training / activity load
    "pain": 15,         # soreness, joint discomfort, pain
    "hr": 10,           # resting HR + HRV vs personal baseline
    "prev": 10,         # previous workout RPE + completion
    "wearable": 5,      # combined recovery / readiness / Body Battery / energy
    "mood": 5,          # stress, mood, motivation
    "other": 5,         # other physiological indicators
}

CRITICAL_SYMPTOMS = [
    "chest_discomfort", "chest_pain", "fainting", "faint", "severe_dizziness",
    "shortness_of_breath", "unusual_shortness_of_breath", "severe_palpitations",
    "palpitations", "fever", "significant_illness", "illness",
    "severe_pain", "new_pain", "worsening_pain",
]

SYMPTOM_LABELS = {
    "chest_discomfort": "chest discomfort", "chest_pain": "chest pain",
    "fainting": "fainting", "faint": "fainting", "severe_dizziness": "severe dizziness",
    "shortness_of_breath": "unusual shortness of breath",
    "unusual_shortness_of_breath": "unusual shortness of breath",
    "severe_palpitations": "severe palpitations", "palpitations": "severe palpitations",
    "fever": "fever", "significant_illness": "significant illness", "illness": "illness",
    "severe_pain": "severe pain", "new_pain": "new pain", "worsening_pain": "worsening pain",
}


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _num(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _pos(v: Any, mx: float = 10.0) -> Optional[float]:
    n = _num(v)
    return None if n is None else _clamp(n / mx * 100.0)


def _neg(v: Any, mx: float = 10.0) -> Optional[float]:
    n = _num(v)
    return None if n is None else _clamp((1.0 - n / mx) * 100.0)


def _avg(vals: list) -> Optional[float]:
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def _sleep_hours_score(h: Optional[float]) -> Optional[float]:
    if h is None:
        return None
    # Optimal 7.5–9h. Gentle penalties for short/long sleep.
    if 7.5 <= h <= 9.0:
        return 100.0
    if 6.5 <= h < 7.5:
        return 70.0 + (h - 6.5) * 30.0
    if 9.0 < h <= 10.0:
        return 100.0 - (h - 9.0) * 20.0
    if 5.5 <= h < 6.5:
        return 45.0 + (h - 5.5) * 25.0
    if h > 10.0:
        return _clamp(80.0 - (h - 10.0) * 15.0)
    return _clamp(h / 5.5 * 45.0)  # very short sleep


def _load_score(acute: Optional[float], chronic: Optional[float]) -> Optional[float]:
    """Freshness from acute:chronic load ratio (higher recent load = less ready)."""
    a, c = _num(acute), _num(chronic)
    if a is None or c is None or c <= 0:
        return None
    ratio = a / c
    if ratio <= 1.0:
        return 100.0
    if ratio <= 1.3:
        return 85.0
    if ratio <= 1.6:
        return 65.0
    return 45.0


def _baseline_hr_score(rhr: Optional[float], hrv: Optional[float],
                       rhr_base: Optional[float], hrv_base: Optional[float]) -> Optional[float]:
    parts = []
    r, rb = _num(rhr), _num(rhr_base)
    if r is not None and rb and rb > 0:
        # RHR elevated vs baseline is bad. +5% => ~ -20 pts.
        parts.append(_clamp(80.0 - (r / rb - 1.0) * 400.0))
    v, vb = _num(hrv), _num(hrv_base)
    if v is not None and vb and vb > 0:
        # HRV above baseline is good. +10% => 100, -10% => ~55.
        parts.append(_clamp(80.0 + (v / vb - 1.0) * 200.0))
    return _avg(parts)


def _prev_score(rpe: Optional[float], completion: Optional[float]) -> Optional[float]:
    parts = []
    r = _num(rpe)
    if r is not None:
        parts.append(_neg(r, 10.0))  # a very hard last session lowers readiness
    comp = _num(completion)
    if comp is not None:
        parts.append(_clamp((comp * 100.0) if comp <= 1.0 else comp))
    return _avg(parts)


def _wearable_combined(w: dict) -> Optional[float]:
    parts = []
    for k in ("recovery_score", "readiness_score", "body_battery", "energy_score"):
        n = _num(w.get(k))
        if n is not None:
            parts.append(_clamp(n))
    return _avg(parts)


def _band(score: float) -> str:
    if score >= 85:
        return "Ready to Perform"
    if score >= 70:
        return "Ready to Train"
    if score >= 55:
        return "Proceed with Caution"
    if score >= 40:
        return "Recovery Recommended"
    return "Rest and Reassess"


def compute_readiness(payload: dict) -> dict:
    checkin = payload.get("checkin") or {}
    wearable = payload.get("wearable") or {}
    baseline = payload.get("baseline") or {}
    activity = payload.get("activity") or {}
    prev = payload.get("previous_workout") or {}
    symptoms = payload.get("symptoms") or {}

    # ── 1. Safety overrides (checked before any scoring) ──────────────────────
    flagged = []
    if isinstance(symptoms, dict):
        for key, val in symptoms.items():
            if val and key.lower() in CRITICAL_SYMPTOMS:
                flagged.append(SYMPTOM_LABELS.get(key.lower(), key.replace("_", " ")))
    elif isinstance(symptoms, list):
        for key in symptoms:
            if str(key).lower() in CRITICAL_SYMPTOMS:
                flagged.append(SYMPTOM_LABELS.get(str(key).lower(), str(key).replace("_", " ")))
    # Numeric severe pain (>= 7/10) also triggers the override.
    pain_val = _num(checkin.get("pain"))
    if pain_val is not None and pain_val >= 7:
        flagged.append("severe pain")

    if flagged:
        uniq = list(dict.fromkeys(flagged))
        return {
            "readinessScore": 0,
            "status": "Do Not Train",
            "safetyOverride": True,
            "confidence": "high",
            "mainFactors": [f"Reported {s}" for s in uniq[:4]],
            "dataUsed": ["daily check-in", "symptom screen"],
        }

    # ── 2. Category subscores (only when data is available) ───────────────────
    sub: dict = {}

    feeling = _avg([
        _pos(checkin.get("feeling")), _pos(checkin.get("energy")),
        _neg(checkin.get("fatigue")), _pos(checkin.get("recovery")),
    ])
    if feeling is not None:
        sub["feeling"] = feeling

    sleep = _avg([
        _sleep_hours_score(_num(checkin.get("sleep_hours")) if checkin.get("sleep_hours") is not None else _num(wearable.get("sleep_hours"))),
        _pos(checkin.get("sleep_quality")) if checkin.get("sleep_quality") is not None else _pos(wearable.get("sleep_quality")),
    ])
    if sleep is not None:
        sub["sleep"] = sleep

    load = _load_score(activity.get("acute_load"), activity.get("chronic_load"))
    if load is not None:
        sub["load"] = load

    pain = _avg([
        _neg(checkin.get("soreness")), _neg(checkin.get("joint_discomfort")),
        _neg(checkin.get("pain")),
    ])
    if pain is not None:
        sub["pain"] = pain

    hr = _baseline_hr_score(
        wearable.get("resting_hr") if wearable.get("resting_hr") is not None else checkin.get("resting_hr"),
        wearable.get("hrv") if wearable.get("hrv") is not None else checkin.get("hrv"),
        baseline.get("resting_hr_7d") or baseline.get("resting_hr_28d"),
        baseline.get("hrv_7d") or baseline.get("hrv_28d"),
    )
    if hr is not None:
        sub["hr"] = hr

    prev_s = _prev_score(prev.get("rpe"), prev.get("completion"))
    if prev_s is not None:
        sub["prev"] = prev_s

    wear = _wearable_combined(wearable)
    if wear is not None:
        sub["wearable"] = wear

    mood = _avg([
        _neg(checkin.get("stress")), _pos(checkin.get("mood")),
        _pos(checkin.get("motivation")),
    ])
    if mood is not None:
        sub["mood"] = mood

    other = _avg([
        _pos(wearable.get("spo2"), 100.0) if wearable.get("spo2") is not None else None,
        _pos(checkin.get("hydration")) if checkin.get("hydration") is not None else None,
    ])
    if other is not None:
        sub["other"] = other

    if not sub:
        return {
            "readinessScore": 60,
            "status": "Proceed with Caution",
            "safetyOverride": False,
            "confidence": "low",
            "mainFactors": ["Not enough data to personalise your score"],
            "dataUsed": [],
        }

    # ── 3. Weights + anti-double-counting ─────────────────────────────────────
    weights = {k: BASE_WEIGHTS[k] for k in sub}
    # If a combined wearable score is present AND the raw components it usually
    # bundles (sleep, HRV/RHR, stress, load) are also available, down-weight it.
    if "wearable" in weights:
        raw_overlap = sum(1 for k in ("sleep", "hr", "mood", "load") if k in sub)
        if raw_overlap >= 3:
            weights["wearable"] = 1
        elif raw_overlap == 2:
            weights["wearable"] = 2
        elif raw_overlap == 1:
            weights["wearable"] = 3

    total_w = sum(weights.values())
    score = sum(sub[k] * weights[k] for k in sub) / total_w
    score = int(round(_clamp(score)))
    status = _band(score)

    # ── 4. Confidence ─────────────────────────────────────────────────────────
    coverage = len(sub) / len(BASE_WEIGHTS)
    spread = (max(sub.values()) - min(sub.values())) if len(sub) > 1 else 0
    has_checkin = bool(checkin)
    has_objective = ("hr" in sub) or ("wearable" in sub)
    if coverage >= 0.65 and has_checkin and has_objective and spread <= 45:
        confidence = "high"
    elif coverage >= 0.4 and spread <= 60:
        confidence = "medium"
    else:
        confidence = "low"

    # ── 5. Main factors (human-readable, strongest signals) ───────────────────
    labels_hi = {
        "feeling": "Feeling fresh and energised", "sleep": "Good sleep",
        "load": "Training load well balanced", "pain": "No notable soreness or pain",
        "hr": "HR & HRV in a healthy range vs baseline", "prev": "Recovered well from last session",
        "wearable": "Strong wearable recovery score", "mood": "Positive mood and motivation",
        "other": "Good physiological markers",
    }
    labels_lo = {
        "feeling": "Low energy / elevated fatigue", "sleep": "Short or poor sleep",
        "load": "Recent training load is high", "pain": "Muscle soreness or joint discomfort",
        "hr": "Resting HR up / HRV down vs baseline", "prev": "Hard or incomplete last session",
        "wearable": "Low wearable recovery score", "mood": "Elevated stress / low motivation",
        "other": "Physiological markers below baseline",
    }
    ordered = sorted(sub.items(), key=lambda kv: kv[1])
    factors = []
    for k, v in reversed(ordered):  # strongest positives first
        if v >= 70:
            factors.append(labels_hi[k])
    for k, v in ordered:  # then notable concerns
        if v < 55:
            factors.append(labels_lo[k])
    if not factors:
        factors = ["A balanced mix of moderate signals"]
    main_factors = factors[:4]

    # ── 6. Data used ──────────────────────────────────────────────────────────
    data_used = []
    if checkin:
        data_used.append("daily check-in")
    if wearable:
        data_used.append("connected wearable")
    if activity:
        data_used.append("recent Roujaune activity")
    if prev:
        data_used.append("previous workout history")
    if baseline:
        data_used.append("personal HR/HRV baseline")

    return {
        "readinessScore": score,
        "status": status,
        "safetyOverride": False,
        "confidence": confidence,
        "mainFactors": main_factors,
        "dataUsed": data_used,
    }
