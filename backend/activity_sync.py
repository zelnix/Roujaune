"""Core outdoor-ride import pipeline: classify -> dedup/canonicalize -> persist
-> mirror into ride_history so imported rides flow through history, calendar,
progress, weekly totals, readiness, rider level and coach context.

Indoor and outdoor stats stay separable via the `indoor_outdoor` field.
"""
from __future__ import annotations
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger(__name__)


def _num(v):
    return None if v is None else float(v)


def _intensity_factor(a: dict, ftp: int) -> Optional[float]:
    """Best-available intensity proxy (0–1.3). Missing data returns None."""
    p = a.get("normalised_power") or a.get("average_power")
    if p and ftp:
        return round(float(p) / float(ftp), 3)
    ahr, mhr = a.get("average_heart_rate"), a.get("maximum_heart_rate")
    if ahr and mhr:
        return round(float(ahr) / float(mhr), 3)
    return None


def classify_ride(a: dict, ftp: int) -> str:
    """Classify an outdoor cycling activity from whatever fields are available."""
    if a.get("indoor_outdoor") == "indoor":
        return "indoor_ride"
    dur = a.get("elapsed_seconds") or 0
    dist_km = (a.get("distance_metres") or 0) / 1000.0
    gain = a.get("elevation_gain_metres")
    gain_per_km = (gain / dist_km) if (gain and dist_km) else None
    ifv = _intensity_factor(a, ftp)
    ap, mp = a.get("average_power"), a.get("maximum_power")
    surge = (mp / ap) if (ap and mp) else None
    te = a.get("training_effect")

    # Event: long + far.
    if dur >= 10800 and dist_km >= 80:
        return "outdoor_event"
    # Climbing: lots of vertical per km.
    if gain_per_km is not None and gain_per_km >= 15 and dur >= 2400:
        return "outdoor_climbing"
    # Intervals: big power surges or a very high training effect.
    if (surge is not None and surge >= 3.0) or (te is not None and te >= 4.0):
        return "outdoor_intervals"
    if ifv is not None:
        if ifv < 0.62:
            return "outdoor_recovery"
        if ifv < 0.80:
            return "outdoor_endurance"
        if ifv < 0.95:
            return "outdoor_tempo"
        return "outdoor_intervals"
    # No intensity data: fall back on duration.
    if dur and dur < 2100:
        return "outdoor_recovery"
    if dur and dur >= 2100:
        return "outdoor_recreational"
    return "unknown_outdoor_ride"


def completeness(a: dict) -> int:
    """How complete the cycling data is — used to pick the canonical source."""
    fields = ["average_power", "normalised_power", "maximum_power", "average_heart_rate",
              "maximum_heart_rate", "average_cadence", "distance_metres",
              "elevation_gain_metres", "training_load", "route_data", "calories"]
    return sum(1 for f in fields if a.get(f) is not None)


def _fingerprint(a: dict) -> Optional[str]:
    """Cross-provider dedup key: start(5min) + duration(60s) + distance(100m)."""
    start = a.get("started_at")
    dur = a.get("elapsed_seconds")
    dist = a.get("distance_metres")
    if not start or dur is None or dist is None:
        return None
    try:
        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        bucket = int(dt.timestamp() // 300)
    except Exception:
        return None
    return f"{bucket}:{round(dur/60)}:{round(dist/100)}"


def _now():
    return datetime.now(timezone.utc).isoformat()


# Fields that identify WHICH source record this is — never overwritten when a
# richer cross-provider source is merged in, otherwise the original source's
# identity is lost and its next periodic re-sync (providers routinely re-send
# already-seen activities) can no longer find `existing` by provider+external
# id, silently re-creating it as a brand new duplicate every sync cycle.
_IDENTITY_FIELDS = {
    "user_id", "provider", "external_activity_id", "device_name",
    "activity_type", "source_payload_reference", "fingerprint",
}


async def ingest_activities(db, user_id: str, activities: List[dict], ftp: int,
                            disable_route: bool = False) -> dict:
    """Persist normalized activities with dedup + classification, and mirror the
    canonical ride into ride_history. Returns a validated summary."""
    imported, updated, duplicates = 0, 0, 0
    for a in activities:
        a = dict(a)
        if disable_route:
            a["route_data"] = None
        provider = a.get("provider")
        ext = a.get("external_activity_id")
        if not provider or not ext:
            continue
        ride_type = classify_ride(a, ftp)
        comp = completeness(a)
        fp = _fingerprint(a)

        existing = await db.cycling_activities.find_one({"provider": provider, "external_activity_id": ext})

        base_doc = {
            "user_id": user_id, "provider": provider,
            "external_activity_id": ext,
            "ride_type": ride_type, "indoor_outdoor": a.get("indoor_outdoor"),
            "started_at": a.get("started_at"), "timezone": a.get("timezone"),
            "elapsed_seconds": a.get("elapsed_seconds"), "moving_seconds": a.get("moving_seconds"),
            "distance_metres": _num(a.get("distance_metres")),
            "elevation_gain_metres": _num(a.get("elevation_gain_metres")),
            "elevation_loss_metres": _num(a.get("elevation_loss_metres")),
            "average_heart_rate": a.get("average_heart_rate"), "maximum_heart_rate": a.get("maximum_heart_rate"),
            "average_cadence": a.get("average_cadence"), "maximum_cadence": a.get("maximum_cadence"),
            "average_power": _num(a.get("average_power")), "maximum_power": _num(a.get("maximum_power")),
            "normalised_power": _num(a.get("normalised_power")),
            "calories": _num(a.get("calories")), "average_speed": _num(a.get("average_speed")),
            "maximum_speed": _num(a.get("maximum_speed")),
            "training_load": _num(a.get("training_load")), "training_effect": _num(a.get("training_effect")),
            "time_in_hr_zones": a.get("time_in_hr_zones"), "time_in_power_zones": a.get("time_in_power_zones"),
            "route_data": a.get("route_data"), "laps": a.get("laps"),
            "device_name": a.get("device_name"), "activity_type": a.get("activity_type"),
            "name": a.get("name"),
            "source_payload_reference": a.get("source_payload_reference"),
            "fingerprint": fp, "completeness": comp, "updated_at": _now(),
        }

        if existing:
            # Same source, already imported -> refresh in place.
            doc_id = existing["id"]
            canonical_id = existing.get("canonical_activity_id") or doc_id
            is_canonical = existing.get("is_canonical", True)
            await db.cycling_activities.update_one(
                {"id": doc_id},
                {"$set": {**base_doc, "canonical_activity_id": canonical_id, "is_canonical": is_canonical},
                 "$addToSet": {"source_references": f"{provider}:{ext}"}})
            updated += 1
            if is_canonical:
                await _mirror_history(db, await db.cycling_activities.find_one({"id": doc_id}), ftp)
            continue

        # New source: is this the same ride already imported from another provider?
        canonical_doc = None
        if fp:
            canonical_doc = await db.cycling_activities.find_one(
                {"user_id": user_id, "fingerprint": fp, "is_canonical": True,
                 "provider": {"$ne": provider}})

        doc_id = str(uuid.uuid4())
        if canonical_doc:
            # Cross-provider duplicate: keep one canonical, record the extra source.
            duplicates += 1
            canonical_id = canonical_doc["id"]
            await db.cycling_activities.insert_one(
                {**base_doc, "id": doc_id, "canonical_activity_id": canonical_id,
                 "is_canonical": False, "imported_at": _now(),
                 "source_references": [f"{provider}:{ext}"]})
            refs = sorted(set(canonical_doc.get("source_references", [])) | {f"{provider}:{ext}"})
            update = {"source_references": refs, "updated_at": _now()}
            # Prefer the most complete source's METRICS as canonical, but never
            # overwrite the canonical record's own identity (provider/external
            # id/device/fingerprint) — otherwise its next re-sync from that
            # original provider can no longer recognise it as already-imported
            # and will re-insert it as a fresh duplicate every sync cycle.
            if comp > (canonical_doc.get("completeness") or 0):
                merged_metrics = {k: v for k, v in base_doc.items() if k not in _IDENTITY_FIELDS}
                update = {**merged_metrics, "completeness": comp, "source_references": refs,
                          "updated_at": _now()}
            await db.cycling_activities.update_one({"id": canonical_id}, {"$set": update})
            await _mirror_history(db, await db.cycling_activities.find_one({"id": canonical_id}), ftp)
        else:
            # Brand new canonical ride.
            await db.cycling_activities.insert_one(
                {**base_doc, "id": doc_id, "canonical_activity_id": doc_id,
                 "is_canonical": True, "imported_at": _now(),
                 "source_references": [f"{provider}:{ext}"]})
            imported += 1
            await _mirror_history(db, await db.cycling_activities.find_one({"id": doc_id}), ftp)

    return {"imported": imported, "updated": updated, "duplicates": duplicates,
            "total": imported + updated}


async def _mirror_history(db, doc: dict, ftp: int = 200):
    """Mirror the canonical cycling activity into ride_history (one record) so it
    flows into season/progress/coach context — AND into the longitudinal
    adaptation engine (EF/VI/intensity trends), which previously only ever saw
    indoor rides because these fields were never populated for imports.

    `moving_seconds` (auto-pause aware — excludes coasting/stopped time the
    provider already detected) is preferred over raw `elapsed_seconds` for
    duration/TSS so a ride with several traffic-light stops isn't penalised
    or over-credited versus an indoor session of the same pedalling time.
    Never overwrites indoor workouts (separate `id` namespace)."""
    hid = f"import-{doc.get('canonical_activity_id') or doc['id']}"
    dist = doc.get("distance_metres")
    dur_sec = doc.get("moving_seconds") or doc.get("elapsed_seconds") or 0
    dur_hr = dur_sec / 3600.0 if dur_sec else 0.0

    npv, apv, avg_hr = doc.get("normalised_power"), doc.get("average_power"), doc.get("average_heart_rate")
    ifv = _intensity_factor(doc, ftp)
    ef = round(npv / avg_hr, 3) if npv and avg_hr else (round(apv / avg_hr, 3) if apv and avg_hr else None)
    vi = round(npv / apv, 3) if npv and apv else None

    tss = doc.get("training_load")
    if tss is None and ifv is not None and dur_hr:
        tss = round(dur_hr * ifv * ifv * 100)          # standard TSS = hours * IF^2 * 100
    if tss is None:
        # No power/HR data at all — crude duration-only estimate.
        te = doc.get("training_effect") or 2.5
        tss = round(dur_hr * (30 + te * 12))

    mirror = {
        "id": hid,
        "user_id": doc.get("user_id"),
        "created_at": doc.get("started_at") or _now(),
        "workout": doc.get("name") or "Outdoor Ride",
        "route": "Outdoor",
        "indoor_outdoor": "outdoor",
        "source": doc.get("provider"),
        "external_activity_id": doc.get("external_activity_id"),
        "cycling_activity_id": doc.get("canonical_activity_id") or doc["id"],
        "ride_type": doc.get("ride_type"),
        "duration_sec": dur_sec,
        "distance_km": None if dist is None else round(dist / 1000.0, 2),
        "elevation_m": doc.get("elevation_gain_metres"),
        "avg_power": apv,
        "norm_power": npv,
        "avg_hr": avg_hr,
        "ef": ef,
        "vi": vi,
        "intensity": ifv,
        "tss": tss,
        "computed": True,
        "imported": True,
        "debrief": None,
    }
    await db.ride_history.update_one({"id": hid}, {"$set": mirror}, upsert=True)


async def delete_imported(db, user_id: str, provider: Optional[str] = None) -> dict:
    """Remove imported rides (and their history mirrors) for a user/provider."""
    q = {"user_id": user_id}
    if provider:
        q["provider"] = provider
    acts = await db.cycling_activities.find(q).to_list(length=5000)
    canon_ids = {a.get("canonical_activity_id") or a["id"] for a in acts}
    await db.cycling_activities.delete_many(q)
    if canon_ids:
        await db.ride_history.delete_many(
            {"id": {"$in": [f"import-{cid}" for cid in canon_ids]}})
    return {"deleted_activities": len(acts)}
