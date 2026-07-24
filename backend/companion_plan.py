"""
Coaching-companion plan editing.

Two entry points used by server.py:
  - extract_plan_ops(): turn a rider's chat request into safe, structured plan edits (LLM).
  - auto_ease_ops(): deterministic easing of an upcoming week when ride compliance is low.

Both return a list of ops in the shape plans_admin understands; server.py applies
them via plans_admin.adapt_plan (which reloads the app's plan cache).
"""
from __future__ import annotations

import json
import re
from typing import Any

# Only these fields may be edited by the companion (safety allowlist).
SAFE_DAY_KEYS = {"duration", "zone", "tss", "title", "rpe"}
SAFE_WEEK_KEYS = {"objective", "title"}

_INTENT_KEYWORDS = [
    "easier", "harder", "lighter", "shorten", "shorter", "longer", "reduce",
    "increase", "rest day", "recovery", "add a", "remove", "skip", "swap",
    "change my plan", "adjust my plan", "adjust the plan", "next week",
    "this week", "too hard", "too easy", "too much", "cut back", "ease off",
]


_INTENT_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in _INTENT_KEYWORDS) + r")\b",
    re.IGNORECASE,
)


def has_plan_edit_intent(message: str) -> bool:
    return bool(_INTENT_RE.search(message or ""))


def _pm(s: Any) -> int:
    mm = re.search(r"\d+", str(s or ""))
    return int(mm.group()) if mm else 0


def _weeks_brief(plan_def: dict, week_numbers: list[int]) -> list[dict]:
    wmap = {w["number"]: w for w in plan_def.get("weeks", [])}
    out = []
    for n in week_numbers:
        w = wmap.get(n)
        if not w:
            continue
        days = [
            {"day_index": i, "kind": d.get("kind"), "title": d.get("title"),
             "duration": d.get("duration"), "workout_id": d.get("workout_id")}
            for i, d in enumerate(w.get("days", []))
        ]
        out.append({"week": n, "objective": w.get("objective"), "days": days})
    return out


def sanitize_ops(ops: list[dict] | None, plan_def: dict) -> list[dict]:
    """Drop anything outside the allowlist / valid week+day range. Cap at 8 ops."""
    wmap = {w["number"]: w for w in plan_def.get("weeks", [])}
    clean: list[dict] = []
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        t = o.get("target")
        if t == "day":
            wk, di, patch = o.get("week"), o.get("day_index"), o.get("patch") or {}
            w = wmap.get(wk)
            if not w or not isinstance(di, int) or di < 0 or di >= len(w.get("days", [])):
                continue
            p = {k: v for k, v in patch.items() if k in SAFE_DAY_KEYS}
            if p:
                clean.append({"target": "day", "week": wk, "day_index": di, "patch": p})
        elif t == "week_field":
            wk, key = o.get("week"), o.get("key")
            if wmap.get(wk) and key in SAFE_WEEK_KEYS:
                clean.append({"target": "week_field", "week": wk, "key": key, "value": o.get("value")})
    return clean[:8]


def _parse_json(raw: str | None) -> dict:
    if not raw:
        return {}
    s = raw.strip()
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        s = m.group(0)
    try:
        return json.loads(s)
    except Exception:
        return {}


async def extract_plan_ops(message: str, plan_def: dict, cur_week: int,
                           coach_name: str, coach_gender: str, llm_key: str) -> tuple[list[dict], str]:
    """Ask the LLM to convert the rider's request into structured plan edits.
    Returns (sanitized_ops, human_summary). Empty ops when it's not a concrete edit."""
    weeks = [n for n in (cur_week, cur_week + 1, cur_week + 2)
             if any(w["number"] == n for w in plan_def.get("weeks", []))]
    brief = _weeks_brief(plan_def, weeks)
    system = (
        "You convert a rider's plan-change request into strict JSON edits for their cycling plan. "
        "Only edit the weeks provided in the input. Allowed day patch keys: duration (e.g. '25 min'), "
        "zone, tss, title, rpe. Allowed week_field keys: objective, title. "
        "Return ONLY JSON of the form "
        '{"ops":[{"target":"day","week":N,"day_index":I,"patch":{"duration":"25 min"}},'
        '{"target":"week_field","week":N,"key":"objective","value":"..."}],'
        '"summary":"one short sentence describing the change"}. '
        'If the message is NOT a concrete plan edit, return {"ops":[],"summary":""}.'
    )
    prompt = f"Plan weeks (JSON):\n{json.dumps(brief)}\n\nRider request: {message}\n\nJSON:"
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=llm_key, session_id=f"{coach_name.lower()}-planedit", system_message=system) \
        .with_model("anthropic", "claude-sonnet-4-6")
    raw = await chat.send_message(UserMessage(text=prompt))
    data = _parse_json(raw)
    ops = sanitize_ops(data.get("ops"), plan_def)
    return ops, (str(data.get("summary") or "").strip())


def auto_ease_ops(plan_def: dict, target_week: int) -> tuple[list[dict], str]:
    """Deterministically reduce each cycling day in `target_week` by ~10%
    (floor 15 min). Returns (ops, human_summary)."""
    wmap = {w["number"]: w for w in plan_def.get("weeks", [])}
    w = wmap.get(target_week)
    if not w:
        return [], ""
    ops, changed = [], []
    for i, d in enumerate(w.get("days", [])):
        if d.get("kind") != "cycling":
            continue
        mins = _pm(d.get("duration"))
        if mins >= 20:
            new = max(15, round(mins * 0.9))
            if new != mins:
                ops.append({"target": "day", "week": target_week, "day_index": i,
                            "patch": {"duration": f"{new} min"}})
                changed.append(f"{d.get('title')} {mins}\u2192{new} min")
    summary = f"eased week {target_week} rides ({'; '.join(changed)})" if changed else ""
    return ops, summary
