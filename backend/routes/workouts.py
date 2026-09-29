"""Live workout sessions, ride summarisation, ride history and energy stats.

Self-contained: only the per-user scoped DB (udb) + workout models.
"""
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException

from auth import udb
from core import now_iso
from models import WorkoutSession, WorkoutStart, WorkoutSummary, SummarizeRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/workouts/start", response_model=WorkoutSession)
async def start_workout(body: WorkoutStart):
    session = WorkoutSession(workout=body.workout, route=body.route)
    await udb.workout_sessions.insert_one(session.dict())
    return session


@router.get("/workouts/{session_id}", response_model=WorkoutSession)
async def get_workout(session_id: str):
    doc = await udb.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc.pop("_id", None)
    return WorkoutSession(**doc)


@router.get("/workouts", response_model=List[WorkoutSession])
async def list_workouts():
    rows = await udb.workout_sessions.find().sort("started_at", -1).to_list(50)
    for r in rows:
        r.pop("_id", None)
    return [WorkoutSession(**r) for r in rows]


@router.post("/workouts/{session_id}/end", response_model=WorkoutSession)
async def end_workout(session_id: str, summary: WorkoutSummary):
    doc = await udb.workout_sessions.find_one({"id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    await udb.workout_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "ended", "ended_at": now_iso(), "summary": summary.dict()}},
    )
    doc.update({"status": "ended", "ended_at": now_iso(), "summary": summary.dict()})
    doc.pop("_id", None)
    return WorkoutSession(**doc)


# ----------------------- Post-ride summary aggregation -----------------------




# Polished reference dataset — matches the design mock. Returned when a ride
# has too few recorded samples to compute meaningful aggregates (e.g. demo).
REFERENCE_SUMMARY = {
    "computed": False,
    "duration_sec": 3600,
    "distance_km": 23.7,
    "elevation_m": 1050,
    "avg_power": 248,
    "norm_power": 251,
    "avg_cadence": 89,
    "avg_hr": 148,
    "max_hr": 172,
    "calories": 622,
    "tss": 92,
    "intensity": 0.87,
    "power_curve": [210, 358, 372, 376, 360, 352, 366, 372, 360, 300, 214],
    "power_target": 250,
    "power_max_axis": 400,
    "hr_curve": [96, 108, 122, 134, 141, 145, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162],
    "hr_max_axis": 180,
    "zones": [
        {"z": "Z1", "time": "0:02:15", "pct": 6, "w": 0.16},
        {"z": "Z2", "time": "0:05:30", "pct": 15, "w": 0.42},
        {"z": "Z3", "time": "0:08:45", "pct": 24, "w": 0.68},
        {"z": "Z4", "time": "0:22:00", "pct": 36, "w": 1.0},
        {"z": "Z5", "time": "0:05:30", "pct": 9, "w": 0.25},
    ],
    "compliance": {"overall": 96, "power": 96, "cadence": 91, "zone4_min": 36, "completed": 100},
}


def _fmt_hms(sec: int) -> str:
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f"{h}:{m:02d}:{s:02d}"


def _downsample(vals: List[float], n: int) -> List[float]:
    if not vals:
        return []
    if len(vals) <= n:
        return [round(v) for v in vals]
    step = len(vals) / n
    out = []
    for i in range(n):
        a = int(i * step)
        b = max(a + 1, int((i + 1) * step))
        chunk = vals[a:b]
        out.append(round(sum(chunk) / len(chunk)))
    return out


def _normalized_power(power: List[float]) -> float:
    # 30s rolling average (samples assumed ~5 Hz -> 150-wide window) then 4th-power mean.
    win = 150
    if len(power) < win:
        avg = sum(power) / len(power)
        return round(avg)
    rolled = []
    acc = sum(power[:win])
    rolled.append(acc / win)
    for i in range(win, len(power)):
        acc += power[i] - power[i - win]
        rolled.append(acc / win)
    fourth = sum(p ** 4 for p in rolled) / len(rolled)
    return round(fourth ** 0.25)


@router.post("/workouts/summarize")
async def summarize_workout(body: SummarizeRequest):
    """Compute real ride aggregates from recorded telemetry samples.

    When the rider enters data manually (no trainer/wearable telemetry) we build
    the summary from those values instead of a demo dataset."""
    if body.manual:
        result = _manual_summary(body)
        rid = await _save_ride_history(body, result)
        return {**result, "id": rid}
    powers = [s.power for s in body.samples if s.power is not None]
    if len(body.samples) < 30 or not powers:
        ref = dict(REFERENCE_SUMMARY)
        # Carry the live in-ride kcal estimate so a no-telemetry (time-based) ride's
        # saved calories match exactly what the rider saw during the session.
        if body.est_calories > 0:
            ref["calories"] = body.est_calories
        rid = await _save_ride_history(body, ref)
        return {**ref, "id": rid}

    hrs = [s.hr for s in body.samples if s.hr]
    cads = [s.cadence for s in body.samples if s.cadence]
    speeds = [s.speed for s in body.samples if s.speed]
    dur = body.elapsed or int(len(body.samples) * 0.2)
    ftp = max(1, body.ftp)

    avg_power = round(sum(powers) / len(powers))
    np_val = _normalized_power(powers)
    avg_hr = round(sum(hrs) / len(hrs)) if hrs else 0
    max_hr = round(max(hrs)) if hrs else 0
    avg_cad = round(sum(cads) / len(cads)) if cads else 0
    avg_speed = (sum(speeds) / len(speeds)) if speeds else 0
    distance = round(avg_speed * dur / 3600.0, 1)
    kj = avg_power * dur / 1000.0
    calories = round(kj * 0.7)  # ~24% efficiency approximation
    intensity = round(np_val / ftp, 2)
    tss = round((dur * np_val * intensity) / (ftp * 3600) * 100)

    # time in zones (fraction of FTP)
    bounds = [0.55, 0.75, 0.90, 1.05]
    counts = [0, 0, 0, 0, 0]
    for p in powers:
        f = p / ftp
        idx = 4
        for i, b in enumerate(bounds):
            if f < b:
                idx = i
                break
        counts[idx] += 1
    dt = dur / len(powers)
    zones = []
    zmax = max(counts) or 1
    for i, c in enumerate(counts):
        secs = int(c * dt)
        zones.append({
            "z": f"Z{i+1}",
            "time": _fmt_hms(secs),
            "pct": round(c / len(powers) * 100),
            "w": round(c / zmax, 2),
        })

    zone4_min = round(counts[3] * dt / 60)
    target = np_val
    in_band = sum(1 for p in powers if abs(p - target) <= target * 0.08)
    power_compliance = round(in_band / len(powers) * 100)
    cad_in = sum(1 for c in cads if 85 <= c <= 100) if cads else 0
    cadence_compliance = round(cad_in / len(cads) * 100) if cads else 0
    overall = round((power_compliance + cadence_compliance) / 2)

    result = {
        "computed": True,
        "duration_sec": dur,
        "distance_km": distance,
        "elevation_m": round(distance * 44),  # ~ climb estimate
        "avg_power": avg_power,
        "norm_power": np_val,
        "avg_cadence": avg_cad,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "calories": calories,
        "tss": tss,
        "intensity": intensity,
        "power_curve": _downsample(powers, 11),
        "power_target": target,
        "power_max_axis": 400,
        "hr_curve": _downsample(hrs, 20) if hrs else [],
        "hr_max_axis": 180,
        "zones": zones,
        "compliance": {
            "overall": overall,
            "power": power_compliance,
            "cadence": cadence_compliance,
            "zone4_min": zone4_min,
            "completed": 100,
        },
    }
    # Longitudinal adaptation metrics (EF, VI, aerobic decoupling, HRR, W' drain,
    # time-in-zone). Persisted per ride so trends can be computed over weeks.
    result.update(_longitudinal_metrics(body.samples, dur, ftp, np_val, avg_power, avg_hr, zones))
    rid = await _save_ride_history(body, result)
    return {**result, "id": rid}


def _longitudinal_metrics(samples, dur: int, ftp: int, np_val: float,
                          avg_power: float, avg_hr: float, zones: list) -> dict:
    """Per-ride assessment metrics for longitudinal tracking:
      - ef: Efficiency Factor = NP / avg HR (aerobic efficiency; higher is better)
      - vi: Variability Index = NP / avg power (how steady the effort was)
      - decoupling: aerobic decoupling % — Pw:HR drift, 1st half vs 2nd half
      - hrr60: heart-rate recovery over the final 60s (bpm drop in cool-down)
      - w_prime_min_pct: lowest anaerobic-reserve % reached (Skiba W' balance)
      - tiz: seconds in each power zone (from the zones table)
    """
    out: dict = {}
    powers = [s.power for s in samples if s.power is not None]
    if avg_hr and np_val:
        out["ef"] = round(np_val / avg_hr, 3)
    if avg_power and np_val:
        out["vi"] = round(np_val / avg_power, 3)

    # Aerobic decoupling: compare power:HR efficiency of the first vs second half.
    pairs = [(s.power, s.hr) for s in samples if s.power is not None and s.hr]
    if len(pairs) >= 20:
        half = len(pairs) // 2
        def _ratio(seg):
            ps = [p for p, _ in seg]
            hs = [h for _, h in seg]
            ap = sum(ps) / len(ps)
            ah = sum(hs) / len(hs)
            return (ap / ah) if ah else None
        r1 = _ratio(pairs[:half])
        r2 = _ratio(pairs[half:])
        if r1 and r2:
            out["decoupling"] = round((r1 - r2) / r1 * 100, 1)  # + = fatigue drift

    # Heart-rate recovery over the last 60 seconds of the session.
    hrs_seq = [s.hr for s in samples if s.hr]
    if len(hrs_seq) >= 20 and dur > 90:
        dt = dur / len(samples)
        back = max(1, int(60 / dt))
        if len(hrs_seq) > back:
            drop = hrs_seq[-back] - hrs_seq[-1]
            if drop > 0:
                out["hrr60"] = round(drop)

    # W' balance drain (Skiba): lowest anaerobic reserve reached at this FTP.
    if powers and ftp > 0:
        w_prime = max(9000, ftp * 70)
        w_bal = float(w_prime)
        w_min = float(w_prime)
        dt = dur / len(powers) if len(powers) else 1.0
        for p in powers:
            if p > ftp:
                w_bal -= (p - ftp) * dt
            else:
                dcp = ftp - p
                tau = 546 * math.exp(-0.01 * dcp) + 316
                w_bal += (w_prime - w_bal) * (1 - math.exp(-dt / tau))
            w_bal = max(0.0, min(float(w_prime), w_bal))
            w_min = min(w_min, w_bal)
        out["w_prime_min_pct"] = round(w_min / w_prime * 100)

    # Time-in-zone seconds (parse the zones table's H:MM:SS strings).
    tiz = {}
    for z in zones or []:
        t = str(z.get("time") or "0:00:00").split(":")
        try:
            secs = int(t[0]) * 3600 + int(t[1]) * 60 + int(t[2])
        except Exception:
            secs = 0
        tiz[z.get("z")] = secs
    if tiz:
        out["tiz"] = tiz
    return out


def _manual_summary(body: SummarizeRequest) -> dict:
    """Build a ride summary from user-entered metrics. TSS is derived from power
    when supplied, otherwise estimated from perceived effort (RPE) + duration."""
    m = body.manual or {}
    ftp = max(1, body.ftp)

    def _num(key, cast=int, default=0):
        try:
            v = m.get(key)
            return cast(v) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    dur = _num("duration_sec", int, 0) or int(body.elapsed or 0)
    avg_power = _num("avg_power", int, 0)
    distance = round(_num("distance_km", float, 0.0), 1)
    elev = _num("elevation_m", int, 0)
    avg_hr = _num("avg_hr", int, 0)
    avg_cad = _num("avg_cadence", int, 0)
    rpe = _num("rpe", float, 0.0)

    if avg_power and dur:
        intensity = round(avg_power / ftp, 2)
        tss = round((dur * avg_power * intensity) / (ftp * 3600) * 100)
        calories = round(avg_power * dur / 1000.0 * 0.9)
    elif rpe and dur:
        if_map = {1: 0.40, 2: 0.50, 3: 0.60, 4: 0.68, 5: 0.75, 6: 0.82, 7: 0.88, 8: 0.94, 9: 1.0, 10: 1.05}
        intensity = if_map.get(int(round(rpe)), 0.60)
        tss = round((dur / 3600.0) * intensity * intensity * 100)
        calories = body.est_calories if body.est_calories > 0 else round((dur / 60.0) * (6 + rpe))
    else:
        intensity = 0.0
        tss = 0
        calories = body.est_calories if body.est_calories > 0 else 0

    return {
        "computed": True,
        "manual": True,
        "duration_sec": dur,
        "distance_km": distance,
        "elevation_m": elev,
        "avg_power": avg_power,
        "norm_power": avg_power,
        "avg_cadence": avg_cad,
        "avg_hr": avg_hr,
        "max_hr": avg_hr,
        "calories": calories,
        "tss": tss,
        "intensity": intensity,
        "power_curve": [],
        "power_target": avg_power,
        "power_max_axis": max(400, avg_power + 50),
        "hr_curve": [],
        "hr_max_axis": 180,
        "zones": [],
        "compliance": {"overall": 0, "power": 0, "cadence": 0, "zone4_min": 0, "completed": 100},
    }



async def _save_ride_history(body: SummarizeRequest, result: dict) -> Optional[str]:
    """Persist a lightweight ride-history record (route + key metrics).

    Returns the new record id so the debrief can later be cached against it."""
    try:
        rid = str(uuid.uuid4())
        # Persist a compact ~1 Hz sample track so the power/HR graph can be
        # rebuilt later and pushed to Strava as a full ride file.
        raw = [{"power": s.power, "hr": s.hr, "cadence": s.cadence, "speed": s.speed}
               for s in (body.samples or [])]
        step = max(1, len(raw) // 3600)  # cap ~3600 points (1 Hz for a 1h ride)
        samples = raw[::step][:3600] if raw else []

        # ── Compute NP / IF / TSS from raw power (TrainingPeaks model) ──
        from services.power_metrics import compute_all
        power_arr = [int(s.get("power") or 0) for s in samples]
        dur_sec = int(result.get("duration_sec") or len(samples) or 0)
        ftp = 200
        try:
            from auth import udb as _udb
            settings_doc = await _udb.settings.find_one({"id": "app"})
            if settings_doc and settings_doc.get("ftp"):
                ftp = int(settings_doc["ftp"])
        except Exception:
            pass
        pm = compute_all(power_arr, dur_sec, ftp)

        doc = {
            "id": rid,
            "created_at": now_iso(),
            "workout": body.workout,
            "workout_id": body.workout_id,
            "route": body.route,
            "duration_sec": result.get("duration_sec"),
            "distance_km": result.get("distance_km"),
            "elevation_m": result.get("elevation_m"),
            "avg_power": pm.get("avg_power") or result.get("avg_power"),
            "max_power": pm.get("max_power") or result.get("max_power") or result.get("norm_power"),
            "avg_hr": result.get("avg_hr"),
            "max_hr": result.get("max_hr"),
            "avg_cadence": result.get("avg_cadence"),
            "tss": pm.get("tss") or result.get("tss"),
            "calories": result.get("calories", 0),
            "computed": result.get("computed", False),
            "intensity": result.get("intensity"),
            "norm_power": pm.get("normalized_power") or result.get("norm_power"),
            "intensity_factor": pm.get("intensity_factor"),
            "ftp_used": ftp,
            # Longitudinal adaptation metrics (present for computed rides).
            "ef": result.get("ef"),
            "vi": result.get("vi"),
            "decoupling": result.get("decoupling"),
            "hrr60": result.get("hrr60"),
            "w_prime_min_pct": result.get("w_prime_min_pct"),
            "tiz": result.get("tiz"),
            "samples": samples,
            "strava_activity_id": None,
            "debrief": None,
            # Live struggle-detection events flagged during the ride (cadence
            # decay, HR decoupling, power drops, W' depletion) — feeds the
            # weekly Struggle Recap trend card, and had_safety_event drives
            # next-session recovery coaching (auto-easier suggestion).
            "struggle_count": len(body.struggles or []),
            "struggle_types": [s.get("primary") for s in (body.struggles or []) if s.get("primary")],
            "had_safety_event": any((s.get("safety")) for s in (body.struggles or [])),
        }
        await udb.ride_history.insert_one(doc)
        try:
            import asyncio
            import auth
            from routes.analysis import check_and_email_milestones
            from routes.connections import auto_push_strava
            asyncio.create_task(check_and_email_milestones())  # celebratory email, non-blocking
            uid = auth.current_user_id()
            asyncio.create_task(auto_push_strava(uid, rid))  # auto-upload to Strava if enabled
        except Exception as e:
            logger.warning(f"post-save hooks failed: {e}")
        return rid
    except Exception as e:  # never block the summary on history write
        logger.warning(f"ride_history insert failed: {e}")
        return None


@router.get("/rides/history")
async def ride_history(limit: int = 20):
    docs = await udb.ride_history.find().sort("created_at", -1).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return docs


@router.get("/stats/energy")
async def energy_rollup():
    """Roll up ride calories into today's + this-week's energy totals and a
    day-streak, for the home dashboard."""
    from datetime import date, timedelta
    rides = await udb.ride_history.find().sort("created_at", -1).to_list(length=5000)
    today = date.today()
    monday = today - timedelta(days=today.weekday())  # start of ISO week
    monday_str = monday.isoformat()
    today_str = today.isoformat()

    per_day: Dict[str, int] = {}
    week_kcal = 0
    today_kcal = 0
    week_rides = 0
    for r in rides:
        day = str(r.get("created_at") or "")[:10]
        if not day:
            continue
        kcal = int(r.get("calories") or 0)
        per_day[day] = per_day.get(day, 0) + kcal
        if day == today_str:
            today_kcal += kcal
        if day >= monday_str:
            week_kcal += kcal
            week_rides += 1

    # Streak: consecutive days (ending today, or yesterday if nothing yet today)
    # that have at least one ride.
    ride_days = {str(r.get("created_at") or "")[:10] for r in rides if r.get("created_at")}
    streak = 0
    cursor = today
    if today_str not in ride_days:
        cursor = today - timedelta(days=1)
    while cursor.isoformat() in ride_days:
        streak += 1
        cursor = cursor - timedelta(days=1)

    return {
        "today_kcal": today_kcal,
        "week_kcal": week_kcal,
        "week_rides": week_rides,
        "streak_days": streak,
    }


# ----------------------- Outdoor ride syncing (connections) -----------------------



# ── FIT file export ──────────────────────────────────────────────────────
from fastapi.responses import Response


@router.get("/rides/{ride_id}/export/fit")
async def export_fit(ride_id: str):
    """Download a binary .FIT file for an indoor ride.

    The file contains per-second raw power/cadence/HR records plus a Session
    message with NP, IF, TSS (correctly FIT-scaled).  Compatible with Strava,
    Garmin Connect, TrainingPeaks, and any other platform that accepts FIT.
    """
    h = await udb.ride_history.find_one({"id": ride_id})
    if not h:
        raise HTTPException(404, "Ride not found")
    samples = h.get("samples") or []
    if not samples:
        raise HTTPException(400, "No sample data for this ride")

    from services.fit_builder import build_fit_activity

    ftp = int(h.get("ftp_used") or 200)
    started = h.get("created_at")
    start_dt = datetime.now(timezone.utc)
    if started:
        try:
            start_dt = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    data = build_fit_activity(
        samples=samples,
        start_time=start_dt,
        elapsed_sec=int(h.get("duration_sec") or len(samples)),
        ftp=ftp,
        workout_name=h.get("workout") or "Indoor Ride",
        calories=int(h.get("calories") or 0),
    )
    name = (h.get("workout") or "ride").replace(" ", "_").lower()
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{name}_{ride_id[:8]}.fit"'},
    )


@router.get("/rides/{ride_id}/metrics")
async def ride_metrics(ride_id: str):
    """Return computed NP / IF / TSS for an indoor ride."""
    h = await udb.ride_history.find_one({"id": ride_id})
    if not h:
        raise HTTPException(404, "Ride not found")
    return {
        "id": ride_id,
        "avg_power": h.get("avg_power"),
        "max_power": h.get("max_power"),
        "normalized_power": h.get("norm_power"),
        "intensity_factor": h.get("intensity_factor"),
        "tss": h.get("tss"),
        "ftp_used": h.get("ftp_used"),
        "duration_sec": h.get("duration_sec"),
        "calories": h.get("calories"),
    }


@router.get("/rides/{ride_id}/share-video")
async def share_video(ride_id: str):
    """Generate an animated 12-second MP4 share video for a completed ride.

    The video shows the power curve drawing itself with HR overlay and key
    stats fading in — designed for Instagram Stories and TikTok."""
    h = await udb.ride_history.find_one({"id": ride_id})
    if not h:
        raise HTTPException(404, "Ride not found")
    samples = h.get("samples") or []
    if len(samples) < 10:
        raise HTTPException(400, "Not enough sample data for a share video")

    from services.share_video import generate_share_video

    def _mmss(sec: int) -> str:
        return f"{sec // 60}:{sec % 60:02d}"

    metrics = {
        "avg_power": h.get("avg_power"),
        "max_power": h.get("max_power"),
        "normalized_power": h.get("norm_power"),
        "intensity_factor": h.get("intensity_factor"),
        "tss": h.get("tss"),
        "avg_hr": h.get("avg_hr"),
        "avg_cadence": h.get("avg_cadence"),
        "duration_label": _mmss(int(h.get("duration_sec") or len(samples))),
        "calories": h.get("calories"),
    }
    mp4 = generate_share_video(
        samples=samples,
        metrics=metrics,
        workout_name=h.get("workout") or "Indoor Ride",
        route_name=h.get("route"),
    )
    name = (h.get("workout") or "ride").replace(" ", "_").lower()
    return Response(
        content=mp4,
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{name}_{ride_id[:8]}.mp4"'},
    )
