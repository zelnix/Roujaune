"""Strava API adapter (OAuth 2.0 authorization-code, cloud-to-cloud).

Plugs into the generic connections pipeline: the app starts OAuth, the backend
owns the secret, exchanges/refreshes tokens, pulls the athlete's rides + detailed
streams (GPS / watts / heartrate / cadence / altitude / distance) and normalizes
them (incl. route_data.samples + power_curve) so they analyse exactly like an
uploaded .fit/.gpx. Credentials come from the environment; when absent,
`is_configured()` is False so the UI shows "Setup required".

Docs: https://developers.strava.com/docs/authentication/  /  streams API.
"""
from __future__ import annotations
import os
import time
import logging
from typing import List
from urllib.parse import urlencode

import httpx

from .base import BaseProvider, NormalizedActivity, ProviderMeta, register
from activity_parse import _power_curve, _decimate, _normalized_power  # reuse metric helpers

logger = logging.getLogger(__name__)

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "").strip()
AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API = "https://www.strava.com/api/v3"
SCOPES = "activity:read_all"
RIDE_TYPES = {"Ride", "MountainBikeRide", "GravelRide", "GravelCycling", "VirtualRide", "EBikeRide"}
STREAM_KEYS = "time,latlng,watts,heartrate,cadence,altitude,distance"
MAX_STREAM_ACTIVITIES = 30  # cap stream pulls per sync to respect rate limits


class StravaProvider(BaseProvider):
    meta: ProviderMeta = {
        "id": "strava",
        "name": "Strava",
        "kind": "cloud_oauth",
        "requires_native_build": True,  # custom-scheme OAuth won't run in Expo Go
        "icon": "bicycle-outline",
    }

    def is_configured(self) -> bool:
        return bool(CLIENT_ID and CLIENT_SECRET)

    async def build_authorize_url(self, state: str, code_challenge: str, redirect_uri: str) -> str:
        # Strava uses plain authorization-code (no PKCE); extra params are ignored.
        q = {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "approval_prompt": "auto",
            "scope": SCOPES,
            "state": state,
        }
        return f"{AUTHORIZE_URL}?{urlencode(q)}"

    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                "code": code, "grant_type": "authorization_code",
            })
            res.raise_for_status()
            d = res.json()
        expires_in = max(60, int(d.get("expires_at", time.time() + 21600)) - int(time.time()))
        return {
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token"),
            "expires_in": expires_in,
            "provider_account_id": str((d.get("athlete") or {}).get("id") or ""),
            "permissions": (d.get("scope") or SCOPES).replace(",", " ").split(),
        }

    async def refresh(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(TOKEN_URL, data={
                "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                "grant_type": "refresh_token", "refresh_token": refresh_token,
            })
            res.raise_for_status()
            d = res.json()
        expires_in = max(60, int(d.get("expires_at", time.time() + 21600)) - int(time.time()))
        return {
            # Refresh tokens rotate — always persist the newest.
            "access_token": d.get("access_token"),
            "refresh_token": d.get("refresh_token", refresh_token),
            "expires_in": expires_in,
        }

    async def fetch_activities(self, access_token: str, since_epoch: int, until_epoch: int) -> List[NormalizedActivity]:
        headers = {"Authorization": f"Bearer {access_token}"}
        out: List[NormalizedActivity] = []
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(f"{API}/athlete/activities", headers=headers,
                                    params={"after": int(since_epoch), "before": int(until_epoch), "per_page": 100, "page": 1})
            res.raise_for_status()
            rides = [a for a in res.json() if (a.get("type") in RIDE_TYPES or a.get("sport_type") in RIDE_TYPES)]

            streamed = 0
            for a in rides:
                route_data = None
                if streamed < MAX_STREAM_ACTIVITIES and a.get("id"):
                    try:
                        sres = await client.get(
                            f"{API}/activities/{a['id']}/streams", headers=headers,
                            params={"keys": STREAM_KEYS, "key_by_type": "true", "resolution": "medium", "series_type": "time"})
                        if sres.status_code == 200:
                            route_data = self._route_from_streams(sres.json())
                            streamed += 1
                    except Exception as e:
                        logger.warning("strava streams %s failed: %s", a.get("id"), e)
                out.append(self._normalize(a, route_data))
        return out

    def _route_from_streams(self, streams: dict) -> dict | None:
        def col(k):
            return (streams.get(k) or {}).get("data") or []
        t, ll, w, hr, cad, alt, dist = (col("time"), col("latlng"), col("watts"),
                                        col("heartrate"), col("cadence"), col("altitude"), col("distance"))
        n = max(len(t), len(ll), len(w), len(hr), len(cad), len(alt), len(dist))
        if not n:
            return None
        recs = []
        for i in range(n):
            latlng = ll[i] if i < len(ll) else None
            recs.append({
                "t": int(t[i]) if i < len(t) else i,
                "lat": latlng[0] if latlng else None,
                "lng": latlng[1] if latlng else None,
                "ele": alt[i] if i < len(alt) else None,
                "power": w[i] if i < len(w) else None,
                "hr": hr[i] if i < len(hr) else None,
                "cad": cad[i] if i < len(cad) else None,
                "dist": dist[i] if i < len(dist) else None,
            })
        powers = [r["power"] for r in recs]
        return {
            "has_gps": any(r["lat"] is not None for r in recs),
            "has_power": any(p is not None for p in powers),
            "has_hr": any(r["hr"] is not None for r in recs),
            "has_cadence": any(r["cad"] is not None for r in recs),
            "samples": _decimate(recs),
            "power_curve": _power_curve(powers) if any(p is not None for p in powers) else None,
            "time_in_power_zones": None,
            "time_in_hr_zones": None,
        }

    def _normalize(self, a: dict, route_data: dict | None) -> NormalizedActivity:
        stype = a.get("sport_type") or a.get("type") or ""
        is_indoor = bool(a.get("trainer")) or "Virtual" in stype
        return NormalizedActivity(
            external_activity_id=str(a.get("id")),
            provider="strava",
            name=a.get("name"),
            started_at=a.get("start_date"),
            timezone=a.get("timezone"),
            elapsed_seconds=a.get("elapsed_time"),
            moving_seconds=a.get("moving_time"),
            distance_metres=a.get("distance"),
            elevation_gain_metres=a.get("total_elevation_gain"),
            elevation_loss_metres=None,
            average_speed=a.get("average_speed"),
            maximum_speed=a.get("max_speed"),
            average_heart_rate=None if a.get("average_heartrate") is None else round(a["average_heartrate"]),
            maximum_heart_rate=None if a.get("max_heartrate") is None else round(a["max_heartrate"]),
            average_cadence=None if a.get("average_cadence") is None else round(a["average_cadence"]),
            maximum_cadence=None,
            average_power=a.get("average_watts"),
            maximum_power=a.get("max_watts"),
            normalised_power=a.get("weighted_average_watts") or (_normalized_power([r.get("power") for r in route_data["samples"]]) if route_data and route_data.get("has_power") else None),
            calories=a.get("kilojoules"),
            training_load=a.get("suffer_score"),
            training_effect=None,
            time_in_hr_zones=None,
            time_in_power_zones=None,
            route_data=route_data,
            laps=None,
            device_name=a.get("device_name"),
            activity_type=stype,
            indoor_outdoor="indoor" if is_indoor else "outdoor",
            source_payload_reference=str(a.get("id")),
        )


strava_provider = register(StravaProvider())
