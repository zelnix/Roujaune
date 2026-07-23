"""Device-native providers. These read data on-device and therefore CANNOT run
in Expo Go or web preview — they require a native development build. Registered
so the Connections screen can surface them with a "Requires app build" status.
"""
from __future__ import annotations
from typing import List
from .base import BaseProvider, NormalizedActivity, ProviderMeta, register


class _NativeProvider(BaseProvider):
    def is_configured(self) -> bool:
        return False  # activated only inside a native build with permissions granted

    async def build_authorize_url(self, state, code_challenge, redirect_uri) -> str:
        raise NotImplementedError("Native providers authorise on-device via a build.")

    async def exchange_code(self, code, code_verifier, redirect_uri) -> dict:
        raise NotImplementedError

    async def refresh(self, refresh_token) -> dict:
        raise NotImplementedError

    async def fetch_activities(self, access_token, since_epoch, until_epoch) -> List[NormalizedActivity]:
        return []


class AppleHealthProvider(_NativeProvider):
    meta: ProviderMeta = {
        "id": "apple_health", "name": "Apple Health", "kind": "device_native",
        "requires_native_build": True, "icon": "logo-apple",
    }


class HealthConnectProvider(_NativeProvider):
    meta: ProviderMeta = {
        "id": "health_connect", "name": "Android Health Connect", "kind": "device_native",
        "requires_native_build": True, "icon": "logo-android",
    }


apple = register(AppleHealthProvider())
health_connect = register(HealthConnectProvider())
