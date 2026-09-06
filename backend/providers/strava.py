"""Strava adapter — OAuth 2.0 (cloud-to-cloud), imports outdoor cycling rides.

Follows Strava's documented web OAuth: the confidential authorization-code
exchange uses client_id + client_secret (NOT RFC 7636 PKCE), so we accept the
framework's `code_challenge`/`verifier` arguments for interface compatibility
but never send them. CSRF is covered by the one-time `state` the core stores.

Reads credentials from the environment; reports `is_configured() == False` when
absent so the UI shows "Set up" instead of failing. No scraping, no passwords.
"""
from __future__ import annotations
import os
import time
import logging
from typing import List, Optional
from urllib.parse import urlencode

import httpx

from .base import BaseProvider, NormalizedActivity, ProviderMeta, register

logger = logging.getLogger(__name__)

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "").strip()
AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API_BASE = "https://www.strava.com/api/v3"
# `activity:read_all` includes rides marked "Only You"; `activity:write` lets us
# upload the rider's indoor rides back to Strava.
SCOPES = "activity:read_all,activity:write"
WRITE_SCOPE = "activity:write"
# Strava sport/type values we treat as cycling rides.
RIDE_TYPES = {"Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "EMountainBikeRide", "Velomobile", "Handcycle"}


class StravaProvider(BaseProvider):
    meta: ProviderMeta = {
        "id": "strava",
        "name": "Strava",
        "kind": "cloud_oauth",
        "requires_native_build": False,
        "icon": "bicycle",
    }

    def is_configured(self) -> bool:
        return bool(CLIENT_ID and CLIENT_SECRET)

    async def build_authorize_url(self, state: str, code_challenge: str, redirect_uri: str) -> str:
        # code_challenge is accepted to satisfy the provider interface; Strava's
        # documented web flow is client-secret based and does not use PKCE.
        q = {
            "client_id": CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": SCOPES,
            "state": state,
        }
        return f"{AUTHORIZE_URL}?{urlencode(q)}"

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            })
            res.raise_for_status()
            d = res.json()
        athlete = d.get("athlete") or {}
        granted = (d.get("scope") or SCOPES).replace(",", " ").split()
        return {
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token"),
            "expires_in": self._expires_in(d),
            "provider_account_id": None if athlete.get("id") is None else str(athlete["id"]),
            "permissions": granted,
        }

    async def refresh(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            })
            res.raise_for_status()
            d = res.json()
        # Strava rotates the refresh token — always persist the newest one.
        return {
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token", refresh_token),
            "expires_in": self._expires_in(d),
        }

    @staticmethod
    def _expires_in(d: dict) -> int:
        # Strava returns absolute `expires_at` (epoch); the core expects a
        # relative `expires_in`.
        if d.get("expires_in") is not None:
            return int(d["expires_in"])
        if d.get("expires_at") is not None:
            return max(60, int(d["expires_at"]) - int(time.time()))
        return 21600  # ~6h default

    async def fetch_activities(self, access_token: str, since_epoch: int, until_epoch: int) -> List[NormalizedActivity]:
        headers = {"Authorization": f"Bearer {access_token}"}
        out: List[NormalizedActivity] = []
        page = 1
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                params = {"page": page, "per_page": 200,
                          "after": int(since_epoch), "before": int(until_epoch)}
                res = await client.get(f"{API_BASE}/athlete/activities", headers=headers, params=params)
                res.raise_for_status()
                batch = res.json()
                if not isinstance(batch, list) or not batch:
                    break
                for a in batch:
                    if (a.get("sport_type") or a.get("type")) in RIDE_TYPES:
                        out.append(self._normalize(a))
                if len(batch) < 200:
                    break
                page += 1
                if page > 20:  # safety cap (~4000 activities)
                    break
        return out

    def _normalize(self, a: dict) -> NormalizedActivity:
        sd = a.get("start_date") or ""
        started = sd[:19] if sd else None  # already "YYYY-MM-DDTHH:MM:SS" (UTC)
        is_indoor = bool(a.get("trainer")) or (a.get("type") == "VirtualRide") or (a.get("sport_type") == "VirtualRide")
        return NormalizedActivity(
            external_activity_id=str(a.get("id")),
            provider="strava",
            name=a.get("name") or "Ride",
            started_at=started,
            timezone=a.get("timezone"),
            elapsed_seconds=a.get("elapsed_time"),
            moving_seconds=a.get("moving_time"),
            distance_metres=a.get("distance"),
            elevation_gain_metres=a.get("total_elevation_gain"),
            elevation_loss_metres=None,
            average_speed=a.get("average_speed"),
            maximum_speed=a.get("max_speed"),
            average_heart_rate=None if a.get("average_heartrate") is None else int(round(a["average_heartrate"])),
            maximum_heart_rate=None if a.get("max_heartrate") is None else int(round(a["max_heartrate"])),
            average_cadence=None if a.get("average_cadence") is None else int(round(a["average_cadence"])),
            maximum_cadence=None,
            average_power=a.get("average_watts"),
            maximum_power=a.get("max_watts"),
            normalised_power=a.get("weighted_average_watts"),
            calories=a.get("calories"),
            training_load=None,
            training_effect=None,
            time_in_hr_zones=None,
            time_in_power_zones=None,
            route_data=(a.get("map") or {}).get("summary_polyline") and {"summary_polyline": a["map"]["summary_polyline"]},
            laps=None,
            device_name=a.get("device_name"),
            activity_type=a.get("sport_type") or a.get("type"),
            indoor_outdoor="indoor" if is_indoor else "outdoor",
            source_payload_reference=str(a.get("id")),
        )


strava_provider = register(StravaProvider())


# --------------------------------------------------------------------------- #
#  Pushing rides UP to Strava (requires the activity:write scope).            #
# --------------------------------------------------------------------------- #
import datetime as _dt

UPLOAD_URL = "https://www.strava.com/api/v3/uploads"
ACTIVITIES_URL = "https://www.strava.com/api/v3/activities"


def _iso_z(started_at) -> str:
    """Normalise a stored start time to Strava's ISO-8601 UTC (…Z)."""
    if not started_at:
        return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        s = str(started_at).replace("Z", "+00:00")
        d = _dt.datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=_dt.timezone.utc)
        return d.astimezone(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_tcx(ride: dict, samples: list) -> bytes:
    """Build a minimal Garmin TCX (Biking) with per-second Watts / Cadence /
    HeartRate / Speed trackpoints so Strava renders the full graphs."""
    start = _iso_z(ride.get("started_at"))
    start_dt = _dt.datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)
    total_s = int(ride.get("elapsed_seconds") or len(samples) or 0)
    total_m = float(ride.get("distance_metres") or 0)
    cal = int(ride.get("calories") or 0)
    n = max(1, len(samples))
    dt = (total_s / n) if total_s else 1.0
    pts = []
    for i, s in enumerate(samples):
        t = (start_dt + _dt.timedelta(seconds=i * dt)).strftime("%Y-%m-%dT%H:%M:%SZ")
        dist = round(total_m * (i + 1) / n, 1) if total_m else round((i + 1) * dt * (float(s.get("speed") or 0)), 1)
        power = int(round(float(s.get("power") or 0)))
        cad = int(round(float(s.get("cadence") or 0)))
        hr = int(round(float(s.get("hr") or 0)))
        spd = round(float(s.get("speed") or 0), 3)
        hr_xml = f"<HeartRateBpm><Value>{hr}</Value></HeartRateBpm>" if hr > 0 else ""
        cad_xml = f"<Cadence>{cad}</Cadence>" if cad > 0 else ""
        pts.append(
            f"<Trackpoint><Time>{t}</Time><DistanceMeters>{dist}</DistanceMeters>"
            f"{hr_xml}{cad_xml}"
            f"<Extensions><TPX xmlns=\"http://www.garmin.com/xmlschemas/ActivityExtension/v2\">"
            f"<Speed>{spd}</Speed><Watts>{power}</Watts></TPX></Extensions></Trackpoint>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" '
        'xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">'
        f'<Activities><Activity Sport="Biking"><Id>{start}</Id>'
        f'<Lap StartTime="{start}"><TotalTimeSeconds>{total_s}</TotalTimeSeconds>'
        f'<DistanceMeters>{round(total_m,1)}</DistanceMeters><Calories>{cal}</Calories>'
        f'<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>'
        f'<Track>{"".join(pts)}</Track></Lap>'
        '<Creator xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Device_t">'
        '<Name>ROUJAUNE</Name></Creator>'
        '</Activity></Activities></TrainingCenterDatabase>'
    )
    return xml.encode("utf-8")


def _describe(ride: dict) -> str:
    """Strava activity description: the coach's ride summary (when available)
    plus the app name and tagline."""
    lines = []
    coach = (ride.get("coach_summary") or "").strip()
    if coach:
        lines.append(coach)
    else:
        bits = []
        if ride.get("average_power"):
            bits.append(f"Avg power {int(ride['average_power'])} W")
        if ride.get("average_heart_rate"):
            bits.append(f"Avg HR {int(ride['average_heart_rate'])} bpm")
        if ride.get("tss"):
            bits.append(f"TSS {int(ride['tss'])}")
        if bits:
            lines.append(" · ".join(bits))
    lines.append("")
    lines.append("ROUJAUNE — Your strongest ride is your own.")
    return "\n".join(lines).strip()


async def upload_tcx(access_token: str, ride: dict, samples: list) -> dict:
    """Upload a TCX ride file to Strava and poll until it becomes an activity.
    Returns {activity_id, upload_id, status, error}."""
    tcx = build_tcx(ride, samples)
    ext_id = str(ride.get("id") or _dt.datetime.now().timestamp())
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=40) as client:
        files = {"file": (f"{ext_id}.tcx", tcx, "application/xml")}
        data = {"data_type": "tcx", "external_id": ext_id, "trainer": "1",
                "name": ride.get("name") or "Indoor Ride", "description": _describe(ride)}
        res = await client.post(UPLOAD_URL, headers=headers, data=data, files=files)
        if res.status_code >= 400:
            raise httpx.HTTPStatusError(f"upload {res.status_code}: {res.text[:200]}", request=res.request, response=res)
        up = res.json()
        upload_id = up.get("id")
        if up.get("error"):
            return {"activity_id": None, "upload_id": upload_id, "status": "error", "error": up["error"]}
        # Strava processes asynchronously — poll a few times for the activity id.
        import asyncio
        for _ in range(6):
            if up.get("activity_id"):
                return {"activity_id": up["activity_id"], "upload_id": upload_id, "status": "ready", "error": None}
            await asyncio.sleep(1.5)
            r2 = await client.get(f"{UPLOAD_URL}/{upload_id}", headers=headers)
            up = r2.json()
            if up.get("error"):
                return {"activity_id": None, "upload_id": upload_id, "status": "error", "error": up["error"]}
        return {"activity_id": up.get("activity_id"), "upload_id": upload_id,
                "status": "processing", "error": None}


async def create_manual_activity(access_token: str, ride: dict) -> dict:
    """Create a summary-only Strava activity (used when a ride has no per-second
    samples, e.g. a manually-entered indoor ride)."""
    headers = {"Authorization": f"Bearer {access_token}"}
    data = {
        "name": ride.get("name") or "Indoor Ride",
        "sport_type": "VirtualRide",
        "start_date_local": _iso_z(ride.get("started_at")),
        "elapsed_time": int(ride.get("elapsed_seconds") or 0),
        "trainer": 1,
        "description": _describe(ride),
    }
    if ride.get("distance_metres"):
        data["distance"] = round(float(ride["distance_metres"]))
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(ACTIVITIES_URL, headers=headers, data=data)
        res.raise_for_status()
        d = res.json()
    return {"activity_id": d.get("id"), "upload_id": None, "status": "ready", "error": None}
