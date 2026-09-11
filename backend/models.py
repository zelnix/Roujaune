"""Pydantic request/response models for the Roujaune API.

Extracted verbatim from server.py during the routes/models/services
restructure. server.py re-imports these via `from models import *`, so no
call sites changed."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field

from core import now_iso

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: str = Field(default_factory=now_iso)


class StatusCheckCreate(BaseModel):
    client_name: str


class WorkoutStart(BaseModel):
    workout: str = "Threshold Climb"
    route: str = "Alpe d'Huez"


class WorkoutSummary(BaseModel):
    elapsed: int = 0
    avg_power: float = 0
    avg_hr: float = 0
    distance: float = 0
    tss: float = 0
    calories: float = 0


class WorkoutSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workout: str
    route: str
    status: str = "active"  # active | ended
    started_at: str = Field(default_factory=now_iso)
    ended_at: Optional[str] = None
    summary: WorkoutSummary = Field(default_factory=WorkoutSummary)


class TelemetrySample(BaseModel):
    power: float = 0
    hr: float = 0
    cadence: float = 0
    speed: float = 0


class SummarizeRequest(BaseModel):
    workout: str = "Threshold Climb"
    workout_id: Optional[str] = None
    route: Optional[Dict[str, Any]] = None   # {id,name,place,distance,elevation,tag}
    elapsed: int = 0          # seconds of the ride
    ftp: int = 287            # rider FTP (watts)
    weight: float = 78        # kg
    manual: Optional[Dict[str, Any]] = None  # user-entered metrics when no telemetry
    samples: List[TelemetrySample] = Field(default_factory=list)
    est_calories: int = 0     # live in-ride kcal estimate (used when no telemetry)


class CoachCueRequest(BaseModel):
    power: int = 0
    hr: int = 0
    cadence: int = 0
    speed: float = 0
    elapsed: int = 0
    power_target: int = 251
    cadence_low: int = 90
    cadence_high: int = 100
    workout: str = "Threshold Climb"
    segment: Optional[str] = None
    zone: Optional[str] = None
    route: Optional[str] = None
    seated: bool = False
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    cue_kind: str = "live"  # live | intro | next_preview | extend_advice | struggle | safety | recover
    next_segment: Optional[str] = None
    next_zone: Optional[str] = None
    next_target: Optional[int] = None
    # Struggle-detection context (cue_kind "struggle" | "safety").
    struggle_reasons: List[str] = Field(default_factory=list)
    struggle_primary: Optional[str] = None
    struggle_severity: Optional[str] = None
    struggle_safety: bool = False
    power_deficit_pct: float = 0
    w_prime_pct: float = 1
    near_max_hr_pct: float = 0
    place: Optional[str] = None
    eased_pct: int = 0


class ExtendAdviceRequest(BaseModel):
    power: int = 0
    hr: int = 0
    cadence: int = 0
    elapsed: int = 0            # seconds ridden
    workout: str = "Threshold Climb"
    type_id: str = "endurance"  # workout type: endurance/tempo/threshold/vo2max/sprints/climbing/recovery/restday/fb50
    route: Optional[str] = None
    wearable_on: bool = False
    coach_name: str = "Alberto"
    coach_gender: str = "male"


class CoachDebriefRequest(BaseModel):
    ride_id: Optional[str] = None
    workout: str = "Threshold Climb"
    route: Optional[str] = None
    duration_sec: int = 0
    distance_km: float = 0
    elevation_m: int = 0
    avg_power: int = 0
    norm_power: int = 0
    power_target: int = 0
    avg_cadence: int = 0
    avg_hr: int = 0
    max_hr: int = 0
    calories: int = 0
    tss: int = 0
    intensity: float = 0
    compliance: int = 0
    interval_compliance: int = 0
    intervals: List[Dict[str, Any]] = Field(default_factory=list)
    zones: List[Dict[str, Any]] = Field(default_factory=list)
    extended_min: int = 0
    adjustments: List[str] = Field(default_factory=list)
    struggles: List[Dict[str, Any]] = Field(default_factory=list)
    coach_name: str = "Alberto"
    coach_gender: str = "male"


class RiderProfileUpdate(BaseModel):
    name: Optional[str] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    capability: Optional[str] = None
    avatar: Optional[str] = None


class AppearanceUpdate(BaseModel):
    riderType: Optional[str] = None
    bikeType: Optional[str] = None
    clothingStyle: Optional[str] = None


class PrefsUpdate(BaseModel):
    coach_id: Optional[str] = None
    coach_style: Optional[str] = None
    voice_guidance: Optional[str] = None
    speech_rate: Optional[float] = None


class SegmentSplit(BaseModel):
    label: str
    km: float = 0
    time_sec: int = 0


class PRSubmit(BaseModel):
    route_id: str
    route_name: Optional[str] = None
    time_sec: int = 0            # total route completion time (seconds)
    avg_power: int = 0           # average power over the ride (W)
    completed: bool = True       # only score the route time PR when the route finished
    splits: List[SegmentSplit] = Field(default_factory=list)


class AssignPlanRequest(BaseModel):
    plan_id: str
    reset_progress: bool = False


class OnboardingReq(BaseModel):
    experience_years: float = 0
    weekly_rides: int = 0
    longest_ride_min: int = 0
    confident_60min: bool = False
    self_rating: str = "new"        # new | some | confident
    goal: str | None = None


class SupplementaryLog(BaseModel):
    kind: str = "strength"   # strength | mobility | recovery | balance
    title: str = "Supplementary session"
    date: Optional[str] = None


class CoachChatRequest(BaseModel):
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    coaching_style: str = "balanced"
    message: str


class AdaptationRequest(BaseModel):
    plan_id: str = "build-and-climb"
    coach_name: str = "Alberto"
    coach_gender: str = "male"
    refresh: bool = False


class PlanGoal(BaseModel):
    id: str
    title: str
    description: str = ""
    status: str = "incomplete"


class GoalsUpdateRequest(BaseModel):
    plan_id: str = "build-and-climb"
    goals: List[PlanGoal]


class FavToggleRequest(BaseModel):
    workout_id: str


class ScheduleRequest(BaseModel):
    workout_id: str
    workout_name: str
    duration: str = ""
    tss: str = ""
    zone: str = ""
    color: str = "rouge"
    date: str = "2025-05-13"


class MoveSessionRequest(BaseModel):
    week_start: str = "2025-05-12"
    session_type: str  # cycling | fb50 | wellness
    from_date: str
    to_date: str


class StartDateRequest(BaseModel):
    # Optional because /plan/undo-reschedule reuses this model but only needs
    # plan_id — /plan/start-date (which actually reschedules) always sends it.
    start_date: str = ""  # YYYY-MM-DD — new anchor day for the plan
    plan_id: str = ""


class MissedResolveRequest(BaseModel):
    entry_id: str
    action: str  # "skip" | "reschedule"
    date: str = ""  # required for reschedule; blank => use coach's safe pick


class ReviewRequest(BaseModel):
    session_title: str
    session_type: str = "cycling"
    from_day: str
    to_day: str
    to_focus: str = ""
    to_existing: str = ""
    coach_name: str = "Alberto"
    coach_gender: str = "male"


class WorkoutEdit(BaseModel):
    patch: Dict[str, Any] = Field(default_factory=dict)


class BenchmarkConfigPatch(BaseModel):
    retest_days: Optional[Dict[str, int]] = None
    ftp_retest_days: Optional[int] = None


class CoachesConfig(BaseModel):
    coaches: List[Dict[str, Any]]
