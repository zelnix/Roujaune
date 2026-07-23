"""Reusable provider-adapter system for importing outdoor cycling activities.

New platforms are added by implementing `BaseProvider` and registering it in
`PROVIDERS` — the core import/dedup/classification pipeline never changes.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, TypedDict


class NormalizedActivity(TypedDict, total=False):
    """A provider-agnostic cycling activity. Every optional field may be None —
    missing data is NEVER represented as zero."""
    external_activity_id: str
    provider: str
    name: Optional[str]
    started_at: Optional[str]        # ISO 8601
    timezone: Optional[str]
    elapsed_seconds: Optional[int]
    moving_seconds: Optional[int]
    distance_metres: Optional[float]
    elevation_gain_metres: Optional[float]
    elevation_loss_metres: Optional[float]
    average_speed: Optional[float]   # m/s
    maximum_speed: Optional[float]
    average_heart_rate: Optional[int]
    maximum_heart_rate: Optional[int]
    average_cadence: Optional[int]
    maximum_cadence: Optional[int]
    average_power: Optional[float]
    maximum_power: Optional[float]
    normalised_power: Optional[float]
    calories: Optional[float]
    training_load: Optional[float]
    training_effect: Optional[float]
    time_in_hr_zones: Optional[List[float]]
    time_in_power_zones: Optional[List[float]]
    route_data: Optional[dict]
    laps: Optional[list]
    device_name: Optional[str]
    activity_type: Optional[str]
    indoor_outdoor: Optional[str]    # "indoor" | "outdoor" | None
    source_payload_reference: Optional[str]


class ProviderMeta(TypedDict):
    id: str
    name: str
    kind: str          # "cloud_oauth" | "device_native"
    requires_native_build: bool
    icon: str


class BaseProvider(ABC):
    meta: ProviderMeta

    @abstractmethod
    def is_configured(self) -> bool:
        """True when the credentials/config needed to actually connect are present."""

    @abstractmethod
    async def build_authorize_url(self, state: str, code_challenge: str, redirect_uri: str) -> str:
        ...

    @abstractmethod
    async def exchange_code(self, code: str, code_verifier: str, redirect_uri: str) -> dict:
        """Return {access_token, refresh_token, expires_in, provider_account_id, permissions}."""

    @abstractmethod
    async def refresh(self, refresh_token: str) -> dict:
        ...

    @abstractmethod
    async def fetch_activities(self, access_token: str, since_epoch: int, until_epoch: int) -> List[NormalizedActivity]:
        """Return normalized cycling activities in the window."""


# --- registry -------------------------------------------------------------
PROVIDERS: Dict[str, BaseProvider] = {}


def register(provider: BaseProvider) -> BaseProvider:
    PROVIDERS[provider.meta["id"]] = provider
    return provider


def get_provider(provider_id: str) -> Optional[BaseProvider]:
    return PROVIDERS.get(provider_id)
