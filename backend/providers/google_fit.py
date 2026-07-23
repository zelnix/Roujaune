"""Google Fit adapter — "Sign in with Google" (OAuth 2.0, PKCE). We never see the
user's Google password; they approve access on Google's own consent page.

Reads credentials from the environment; reports is_configured() == False when
absent so the UI shows "Setup required".
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

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
FIT_BASE = "https://www.googleapis.com/fitness/v1/users/me"
SCOPES = " ".join([
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.location.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
])
CYCLING_ACTIVITY_TYPE = 1  # Google Fit activity code for biking


def _avg(points, key="fpVal"):
    vals = [p["value"][0].get(key) for p in points if p.get("value") and p["value"][0].get(key) is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _max(points, key="fpVal"):
    vals = [p["value"][0].get(key) for p in points if p.get("value") and p["value"][0].get(key) is not None]
    return round(max(vals), 2) if vals else None


def _sum(points, key="fpVal"):
    vals = [p["value"][0].get(key) for p in points if p.get("value") and p["value"][0].get(key) is not None]
    return round(sum(vals), 2) if vals else None


class GoogleFitProvider(BaseProvider):
    meta: ProviderMeta = {
        "id": "google_fit",
        "name": "Google Fit",
        "kind": "cloud_oauth",
        "requires_native_build": False,
        "icon": "logo-google",
    }

    def is_configured(self) -> bool:
        return bool(CLIENT_ID and CLIENT_SECRET)

    async def build_authorize_url(self, state: str, code_challenge: str, redirect_uri: str) -> str:
        q = {
            "response_type": "code", "client_id": CLIENT_ID, "redirect_uri": redirect_uri,
            "scope": SCOPES, "state": state, "access_type": "offline", "prompt": "consent",
            "code_challenge": code_challenge, "code_challenge_method": "S256",
        }
        return f"{AUTHORIZE_URL}?{urlencode(q)}"

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "grant_type": "authorization_code", "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET, "code": code,
                "code_verifier": code_verifier, "redirect_uri": redirect_uri,
            })
            res.raise_for_status()
            d = res.json()
        return {
            "access_token": d.get("access_token"), "refresh_token": d.get("refresh_token"),
            "expires_in": d.get("expires_in", 3600), "provider_account_id": None,
            "permissions": SCOPES.split(),
        }

    async def refresh(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "grant_type": "refresh_token", "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET, "refresh_token": refresh_token,
            })
            res.raise_for_status()
            d = res.json()
        return {"access_token": d.get("access_token"),
                "refresh_token": d.get("refresh_token", refresh_token),
                "expires_in": d.get("expires_in", 3600)}

    async def fetch_activities(self, access_token: str, since_epoch: int, until_epoch: int) -> List[NormalizedActivity]:
        headers = {"Authorization": f"Bearer {access_token}"}
        out: List[NormalizedActivity] = []
        params = {
            "startTime": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(since_epoch)),
            "endTime": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(until_epoch)),
            "activityType": CYCLING_ACTIVITY_TYPE,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(f"{FIT_BASE}/sessions", headers=headers, params=params)
            res.raise_for_status()
            sessions = res.json().get("session", [])
            for sess in sessions:
                if int(sess.get("activityType", -1)) != CYCLING_ACTIVITY_TYPE:
                    continue
                out.append(await self._normalize_session(client, headers, sess))
        return out

    async def _normalize_session(self, client, headers, sess) -> NormalizedActivity:
        start_ms = int(sess.get("startTimeMillis", 0))
        end_ms = int(sess.get("endTimeMillis", 0))
        dur = max(0, (end_ms - start_ms) // 1000)
        dist = calories = ahr = mhr = aspd = mspd = apow = mpow = None
        try:
            agg = await client.post(f"{FIT_BASE}/dataset:aggregate", headers=headers, json={
                "aggregateBy": [
                    {"dataTypeName": "com.google.distance.delta"},
                    {"dataTypeName": "com.google.calories.expended"},
                    {"dataTypeName": "com.google.heart_rate.bpm"},
                    {"dataTypeName": "com.google.speed"},
                    {"dataTypeName": "com.google.power.sample"},
                ],
                "bucketByTime": {"durationMillis": max(1, end_ms - start_ms)},
                "startTimeMillis": start_ms, "endTimeMillis": end_ms,
            })
            if agg.status_code == 200:
                buckets = agg.json().get("bucket", [])
                if buckets:
                    ds = buckets[0].get("dataset", [])
                    def pts(i):
                        return ds[i].get("point", []) if i < len(ds) else []
                    dist = _sum(pts(0))
                    calories = _sum(pts(1))
                    ahr, mhr = _avg(pts(2)), _max(pts(2))
                    aspd, mspd = _avg(pts(3)), _max(pts(3))
                    apow, mpow = _avg(pts(4)), _max(pts(4))
        except Exception as e:
            logger.warning(f"google fit aggregate failed: {e}")
        return NormalizedActivity(
            external_activity_id=str(sess.get("id")),
            provider="google_fit",
            name=sess.get("name") or "Cycling",
            started_at=None if not start_ms else time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(start_ms / 1000)),
            timezone=None,
            elapsed_seconds=dur, moving_seconds=None,
            distance_metres=dist, elevation_gain_metres=None, elevation_loss_metres=None,
            average_speed=aspd, maximum_speed=mspd,
            average_heart_rate=None if ahr is None else int(ahr),
            maximum_heart_rate=None if mhr is None else int(mhr),
            average_cadence=None, maximum_cadence=None,
            average_power=apow, maximum_power=mpow, normalised_power=None,
            calories=calories, training_load=None, training_effect=None,
            time_in_hr_zones=None, time_in_power_zones=None,
            route_data=None, laps=None,
            device_name=(sess.get("application") or {}).get("packageName"),
            activity_type="CYCLING",
            indoor_outdoor="outdoor",
            source_payload_reference=str(sess.get("id")),
        )


google_fit_provider = register(GoogleFitProvider())
