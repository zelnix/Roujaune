"""Shared rider helpers used across the coach, benchmark and plan engines.

Kept here (rather than in a route module) so both the domain routers and the
still-monolithic engine in server.py can import them without a circular import.
"""
from auth import udb

# Default rider identity used when a rider has no stored profile yet.
RIDER_DEFAULT = {
    "id": "me", "name": "Rider One", "weight_kg": 78.0, "age": 42,
    "gender": "male", "city": "", "region": "", "country": "",
    "capability": "intermediate",
}


async def _rider_doc() -> dict:
    doc = await udb.rider_profile.find_one({"id": "me"})
    if not doc:
        doc = dict(RIDER_DEFAULT)
        await udb.rider_profile.insert_one(dict(doc))
    doc.pop("_id", None)
    # Backfill sensible defaults so incomplete profiles never surface NaN/undefined.
    for k, v in RIDER_DEFAULT.items():
        if doc.get(k) is None:
            doc[k] = v
    return doc


async def _rider_line() -> str:
    """One-line rider physical profile for coach prompts (best-effort)."""
    try:
        d = await _rider_doc()
        g = str(d.get("gender") or "").strip()
        gtxt = f", {g}" if g and g.lower() != "unspecified" else ""
        return (
            f"Rider: {d.get('name', 'Rider')}, {d.get('age')} years old, "
            f"{d.get('weight_kg')} kg{gtxt}. Tailor effort, power-to-weight, recovery and tone accordingly."
        )
    except Exception:
        return ""


def _cal_status(score: int) -> str:
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Steady"
    if score >= 40:
        return "Easy day"
    return "Rest"
