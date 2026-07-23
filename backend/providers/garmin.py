"""Garmin Connect Activity API adapter (OAuth 2.0 PKCE, cloud-to-cloud).

Reads credentials from the environment. When credentials are absent the adapter
reports `is_configured() == False` so the UI can show "Setup required" instead
of failing. No scraping and no username/password are ever used.
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

CLIENT_ID = os.environ.get("GARMIN_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GARMIN_CLIENT_SECRET", "").strip()
AUTHORIZE_URL = os.environ.get("GARMIN_OAUTH_AUTHORIZE_URL", "https://connect.garmin.com/oauth2Confirm").strip()
TOKEN_URL = os.environ.get("GARMIN_OAUTH_TOKEN_URL", "https://diauth.garmin.com/di-oauth2-service/oauth/token").strip()
API_BASE = os.environ.get("GARMIN_API_BASE", "https://apis.garmin.com/wellness-api/rest").strip()
SCOPES = "ACTIVITY_EXPORT"


def _mps_from_kph(v):
    return None if v is None else round(float(v) / 3.6, 3)


class GarminProvider(BaseProvider):
    meta: ProviderMeta = {
        "id": "garmin",
        "name": "Garmin Connect",
        "kind": "cloud_oauth",
        "requires_native_build": False,
        "icon": "watch-outline",
    }

    def is_configured(self) -> bool:
        return bool(CLIENT_ID and CLIENT_SECRET)

    async def build_authorize_url(self, state: str, code_challenge: str, redirect_uri: str) -> str:
        q = {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": SCOPES,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{AUTHORIZE_URL}?{urlencode(q)}"

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "grant_type": "authorization_code",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
            })
            res.raise_for_status()
            d = res.json()
        return {
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token"),
            "expires_in": d.get("expires_in", 3600),
            "provider_account_id": d.get("user_id") or d.get("sub"),
            "permissions": SCOPES.split(),
        }

    async def refresh(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "grant_type": "refresh_token",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": refresh_token,
            })
            res.raise_for_status()
            d = res.json()
        return {
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token", refresh_token),
            "expires_in": d.get("expires_in", 3600),
        }

    async def fetch_activities(self, access_token: str, since_epoch: int, until_epoch: int) -> List[NormalizedActivity]:
        out: List[NormalizedActivity] = []
        headers = {"Authorization": f"Bearer {access_token}"}
        # Garmin caps each request window; request the details endpoint.
        params = {"uploadStartTimeInSeconds": int(since_epoch), "uploadEndTimeInSeconds": int(until_epoch)}
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(f"{API_BASE}/activityDetails", headers=headers, params=params)
            res.raise_for_status()
            payload = res.json()
        for a in payload if isinstance(payload, list) else payload.get("activities", []):
            s = a.get("summary", a)
            atype = (s.get("activityType") or "").upper()
            if "CYCLING" not in atype and "BIKING" not in atype and "BIKE" not in atype:
                continue
            out.append(self._normalize(a, s))
        return out

    def _normalize(self, a: dict, s: dict) -> NormalizedActivity:
        atype = s.get("activityType")
        is_indoor = bool(s.get("isIndoor")) or "INDOOR" in (atype or "").upper() or "VIRTUAL" in (atype or "").upper()
        start = s.get("startTimeInSeconds")
        return NormalizedActivity(
            external_activity_id=str(a.get("summaryId") or a.get("activityId") or s.get("summaryId")),
            provider="garmin",
            name=s.get("activityName"),
            started_at=None if start is None else time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(int(start))),
            timezone=None if s.get("startTimeOffsetInSeconds") is None else f"UTC{s['startTimeOffsetInSeconds']//3600:+d}",
            elapsed_seconds=s.get("durationInSeconds"),
            moving_seconds=s.get("movingDurationInSeconds"),
            distance_metres=s.get("distanceInMeters"),
            elevation_gain_metres=s.get("totalElevationGainInMeters"),
            elevation_loss_metres=s.get("totalElevationLossInMeters"),
            average_speed=s.get("averageSpeedInMetersPerSecond"),
            maximum_speed=s.get("maxSpeedInMetersPerSecond"),
            average_heart_rate=s.get("averageHeartRateInBeatsPerMinute"),
            maximum_heart_rate=s.get("maxHeartRateInBeatsPerMinute"),
            average_cadence=s.get("averageBikeCadenceInRoundsPerMinute"),
            maximum_cadence=s.get("maxBikeCadenceInRoundsPerMinute"),
            average_power=s.get("averagePowerInWatts"),
            maximum_power=s.get("maxPowerInWatts"),
            normalised_power=s.get("normalizedPowerInWatts"),
            calories=s.get("activeKilocalories"),
            training_load=s.get("trainingLoad"),
            training_effect=s.get("aerobicTrainingEffect"),
            time_in_hr_zones=None,
            time_in_power_zones=None,
            route_data=a.get("samples") and {"samples": a["samples"]},
            laps=a.get("laps"),
            device_name=s.get("deviceName"),
            activity_type=atype,
            indoor_outdoor="indoor" if is_indoor else "outdoor",
            source_payload_reference=str(a.get("summaryId") or a.get("activityId")),
        )


garmin_provider = register(GarminProvider())
