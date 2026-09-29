"""Build a binary .FIT (Flexible and Interoperable Data Transfer) activity file.

Uses the `fit-tool` library to produce a Garmin-compatible binary file that
Strava, Garmin Connect, TrainingPeaks, and other platforms can ingest.

Structure: FileId → DeviceInfo → Record[] → Lap → Session → Activity

Rules applied:
  • Records use RAW un-smoothed 1-second power (platforms need this for NP/TSS).
  • BLE dropouts are SKIPPED (no zero-padding in the binary — platforms interpolate
    timestamp gaps correctly).  Only genuine zero-power (coasting) is written as 0 W.
  • Session message carries NP, IF, TSS with correct FIT scaling.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import List

from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.device_info_message import DeviceInfoMessage
from fit_tool.profile.messages.record_message import RecordMessage
from fit_tool.profile.messages.lap_message import LapMessage
from fit_tool.profile.messages.session_message import SessionMessage
from fit_tool.profile.messages.activity_message import ActivityMessage
from fit_tool.profile.profile_type import (
    FileType, Manufacturer, Sport, SubSport, Event, EventType,
)

from services.power_metrics import compute_all, pad_gaps


def _to_fit_ms(dt: datetime) -> int:
    """Convert a UTC datetime to fit-tool's expected millisecond timestamp."""
    return round(dt.timestamp() * 1000)


def build_fit_activity(
    *,
    samples: List[dict],
    start_time: datetime,
    elapsed_sec: int,
    ftp: int = 200,
    workout_name: str = "Indoor Ride",
    trainer_name: str = "Smart Trainer",
    calories: int = 0,
) -> bytes:
    """Build a complete .FIT activity binary from raw 1-second sample dicts.

    Each sample dict should have:
      power (W), cadence (rpm), hr (bpm), speed (km/h), t (epoch sec, optional)
    """
    builder = FitFileBuilder(auto_define=True, min_string_size=50)
    start_ms = _to_fit_ms(start_time)

    # ── FileId ───────────────────────────────────────────────────────
    fid = FileIdMessage()
    fid.type = FileType.ACTIVITY
    fid.manufacturer = Manufacturer.DEVELOPMENT.value
    fid.product = 1
    fid.serial_number = 0x524A5545  # "RJUE"
    fid.time_created = start_ms
    builder.add(fid)

    # ── DeviceInfo ───────────────────────────────────────────────────
    dev = DeviceInfoMessage()
    dev.manufacturer = Manufacturer.DEVELOPMENT.value
    dev.product = 1
    dev.device_index = 0
    dev.timestamp = start_ms
    builder.add(dev)

    # ── Record messages (the core per-second loop) ───────────────────
    has_timestamps = any(s.get("t") for s in samples)
    power_array: list[int] = []
    hr_vals: list[int] = []
    cad_vals: list[int] = []

    for i, s in enumerate(samples):
        if has_timestamps and s.get("t") is not None:
            # 't' is relative seconds from start, not Unix timestamp
            ts = start_time + timedelta(seconds=s["t"])
        else:
            ts = start_time + timedelta(seconds=i)

        pw = int(round(float(s.get("power") or 0)))
        hr = int(round(float(s.get("hr") or 0)))
        cad = int(round(float(s.get("cadence") or 0)))
        spd_kmh = float(s.get("speed") or 0)

        # Skip genuine BLE dropouts: all sensors zero while previous was non-zero.
        # Platforms see the timestamp gap and interpolate correctly.
        if pw == 0 and hr == 0 and cad == 0 and i > 0:
            prev = samples[i - 1]
            if int(prev.get("power") or 0) > 0 or int(prev.get("hr") or 0) > 0:
                continue

        rec = RecordMessage()
        rec.timestamp = _to_fit_ms(ts)
        rec.power = pw
        if hr > 0:
            rec.heart_rate = hr
        if cad > 0:
            rec.cadence = cad
        if spd_kmh > 0:
            rec.enhanced_speed = round(spd_kmh / 3.6 * 1000)  # mm/s
        builder.add(rec)

        power_array.append(pw)
        if hr > 0:
            hr_vals.append(hr)
        if cad > 0:
            cad_vals.append(cad)

    # ── Compute metrics ──────────────────────────────────────────────
    metrics = compute_all(pad_gaps(samples), elapsed_sec, ftp)
    np_val = metrics["normalized_power"]
    if_val = metrics["intensity_factor"]
    tss_val = metrics["tss"]

    avg_power = metrics["avg_power"]
    max_power = metrics["max_power"]
    avg_hr = round(sum(hr_vals) / len(hr_vals)) if hr_vals else None
    max_hr = max(hr_vals) if hr_vals else None
    avg_cad = round(sum(cad_vals) / len(cad_vals)) if cad_vals else None
    max_cad = max(cad_vals) if cad_vals else None

    end_ms = _to_fit_ms(start_time + timedelta(seconds=elapsed_sec))
    elapsed_ms = float(elapsed_sec * 1000)

    # ── Lap ──────────────────────────────────────────────────────────
    lap = LapMessage()
    lap.timestamp = end_ms
    lap.start_time = start_ms
    lap.total_elapsed_time = elapsed_ms
    lap.total_timer_time = elapsed_ms
    lap.sport = Sport.CYCLING
    lap.sub_sport = SubSport.INDOOR_CYCLING
    lap.avg_power = avg_power
    lap.max_power = max_power
    if avg_hr is not None:
        lap.avg_heart_rate = avg_hr
    if max_hr is not None:
        lap.max_heart_rate = max_hr
    if avg_cad is not None:
        lap.avg_cadence = avg_cad
    if max_cad is not None:
        lap.max_cadence = max_cad
    if calories:
        lap.total_calories = calories
    builder.add(lap)

    # ── Session ──────────────────────────────────────────────────────
    ses = SessionMessage()
    ses.timestamp = end_ms
    ses.start_time = start_ms
    ses.total_elapsed_time = elapsed_ms
    ses.total_timer_time = elapsed_ms
    ses.sport = Sport.CYCLING
    ses.sub_sport = SubSport.INDOOR_CYCLING
    ses.first_lap_index = 0
    ses.num_laps = 1
    ses.avg_power = avg_power
    ses.max_power = max_power
    if avg_hr is not None:
        ses.avg_heart_rate = avg_hr
    if max_hr is not None:
        ses.max_heart_rate = max_hr
    if avg_cad is not None:
        ses.avg_cadence = avg_cad
    if max_cad is not None:
        ses.max_cadence = max_cad
    if calories:
        ses.total_calories = calories
    # NP / IF / TSS — fit-tool handles the FIT binary scaling internally:
    #   Pass the RAW float values (the library applies ×1000 / ×10 encoding).
    if np_val is not None:
        ses.normalized_power = np_val
    if tss_val is not None:
        ses.training_stress_score = tss_val       # library scales ×10
    if if_val is not None:
        ses.intensity_factor = if_val              # library scales ×1000
    ses.threshold_power = ftp
    builder.add(ses)

    # ── Activity ─────────────────────────────────────────────────────
    act = ActivityMessage()
    act.timestamp = end_ms
    act.total_timer_time = elapsed_ms
    act.num_sessions = 1
    act.type = 0  # manual
    act.event = Event.ACTIVITY
    act.event_type = EventType.STOP
    builder.add(act)

    # ── Build binary ─────────────────────────────────────────────────
    fit_file = builder.build()
    return fit_file.to_bytes()
