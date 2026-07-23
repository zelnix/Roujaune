"""TEST-ONLY sandbox generator to validate the outdoor-import pipeline (normalize
-> classify -> dedup -> persist -> wire into history) WITHOUT live provider
credentials. This is NOT a user-facing provider and produces clearly-labelled
demo rides. Do not expose in production.
"""
from __future__ import annotations
import time
from typing import List
from .base import NormalizedActivity

_SAMPLES = [
    {"name": "Morning Hill Loop", "dur": 5400, "dist": 42000, "gain": 780, "ahr": 148, "mhr": 172,
     "ap": 195, "mp": 640, "np": 210, "cad": 82, "type": "ROAD_BIKING", "spd": 7.8},
    {"name": "Recovery Spin by the River", "dur": 2400, "dist": 14000, "gain": 60, "ahr": 108, "mhr": 128,
     "ap": 110, "mp": 210, "np": 118, "cad": 88, "type": "ROAD_BIKING", "spd": 5.8},
    {"name": "Café Ride", "dur": 6600, "dist": 55000, "gain": 320, "ahr": 132, "mhr": 158,
     "ap": 165, "mp": 480, "np": 172, "cad": 84, "type": "GRAVEL_CYCLING", "spd": 8.3},
    {"name": "Sunset Sprints", "dur": 3000, "dist": 22000, "gain": 140, "ahr": 156, "mhr": 184,
     "ap": 220, "mp": 910, "np": 245, "cad": 90, "type": "ROAD_BIKING", "spd": 7.3},
]


def generate_sandbox_activities(count: int = 3) -> List[NormalizedActivity]:
    now = int(time.time())
    out: List[NormalizedActivity] = []
    for i in range(min(count, len(_SAMPLES))):
        s = _SAMPLES[i]
        start = now - (i + 1) * 86400
        out.append(NormalizedActivity(
            external_activity_id=f"sandbox-{start}-{i}",
            provider="sandbox",
            name=f"[Demo] {s['name']}",
            started_at=time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(start)),
            timezone="UTC+0",
            elapsed_seconds=s["dur"], moving_seconds=int(s["dur"] * 0.96),
            distance_metres=float(s["dist"]),
            elevation_gain_metres=float(s["gain"]), elevation_loss_metres=float(s["gain"]),
            average_speed=s["spd"], maximum_speed=round(s["spd"] * 1.9, 2),
            average_heart_rate=s["ahr"], maximum_heart_rate=s["mhr"],
            average_cadence=s["cad"], maximum_cadence=s["cad"] + 20,
            average_power=float(s["ap"]), maximum_power=float(s["mp"]), normalised_power=float(s["np"]),
            calories=float(int(s["ap"] * s["dur"] / 1000)),
            training_load=float(int(s["np"] * s["dur"] / 3600)), training_effect=round(2.5 + i * 0.4, 1),
            time_in_hr_zones=None, time_in_power_zones=None,
            route_data=None, laps=None,
            device_name="Garmin Edge (demo)", activity_type=s["type"],
            indoor_outdoor="outdoor",
            source_payload_reference=f"sandbox-{start}-{i}",
        ))
    return out
