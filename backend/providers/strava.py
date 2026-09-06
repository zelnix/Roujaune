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
# `activity:read_all` also includes rides marked "Only You".
SCOPES = "activity:read_all"
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
