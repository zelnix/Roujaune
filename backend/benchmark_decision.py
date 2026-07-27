"""Deterministic Benchmark Decision Engine (F-03).

Pure, side-effect-free logic that decides whether a rider needs a fresh
benchmark before starting/continuing a training plan. It is intentionally
decoupled from database access, HTTP routing and LLM phrasing so that:

  * identical input always yields identical output (fully deterministic), and
  * the rules can be unit-tested in isolation.

The FastAPI route is responsible for gathering the inputs (DB reads) and for
turning the returned decision into warm, human-facing copy via the coach LLM.
This module never touches I/O.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

DEFAULT_FTP_RETEST_DAYS = 56

# The complete, closed set of decisions this engine can emit.
VALID_STATUSES = (
    "required",
    "recommended",
    "approved",
    "deferred",
    "submaximal",
    "coach_review",
)

# Statuses that mean the rider should be routed into a benchmark before/soon
# after starting the plan.
_BENCHMARK_STATUSES = ("required", "recommended")


@dataclass(frozen=True)
class BenchmarkDecisionInput:
    """Strict input contract for a benchmark decision.

    All fields are plain, already-resolved values (no DB docs, no LLM). The
    caller is responsible for deriving these from persisted rider state.
    """

    plan_level: str                       # e.g. "Beginner" / "Intermediate" / "Advanced"
    has_ftp: bool                          # a usable FTP benchmark exists on record
    days_since_last: Optional[int]         # days since last accepted benchmark (None if unknown)
    illness: bool = False                  # rider reported recent illness
    injury: bool = False                   # rider reported an injury / niggle
    returning: bool = False                # rider returning to training after a break
    equipment_changed: bool = False        # bike / trainer / setup changed
    low_confidence: bool = False           # last FTP result had low confidence
    ftp_retest_days: int = DEFAULT_FTP_RETEST_DAYS


@dataclass(frozen=True)
class BenchmarkDecision:
    """Strict output contract."""

    status: str
    reasons: List[str] = field(default_factory=list)
    requires_benchmark: bool = False


def decide_benchmark(inp: BenchmarkDecisionInput) -> BenchmarkDecision:
    """Return the deterministic benchmark decision for a rider.

    Rule precedence (first match wins):
      1. Beginner plan            -> submaximal (existing/lighter data is enough)
      2. No FTP on record         -> required
      3. Illness / injury / return-> required  (safety retest)
      4. Equipment changed        -> required
      5. Benchmark date unknown   -> required
      6. Stale > 2x retest window -> required
      7. Stale > retest window    -> recommended
      8. Low confidence last time -> recommended
      9. Otherwise                -> approved
    """
    retest = inp.ftp_retest_days or DEFAULT_FTP_RETEST_DAYS
    level = (inp.plan_level or "").strip().lower()
    reasons: List[str] = []

    if level == "beginner":
        status = "submaximal"
        reasons.append("beginner plan — a lighter assessment or your existing data is enough")
    elif not inp.has_ftp:
        status = "required"
        reasons.append("no valid FTP benchmark on record yet")
    elif inp.illness or inp.injury or inp.returning:
        status = "required"
        reasons.append("recent illness, injury or return to training")
    elif inp.equipment_changed:
        status = "required"
        reasons.append("your equipment has changed")
    elif inp.days_since_last is None:
        status = "required"
        reasons.append("benchmark date unknown")
    elif inp.days_since_last > 2 * retest:
        status = "required"
        reasons.append(f"last benchmark was {inp.days_since_last} days ago")
    elif inp.days_since_last > retest:
        status = "recommended"
        reasons.append(f"last benchmark was {inp.days_since_last} days ago")
    elif inp.low_confidence:
        status = "recommended"
        reasons.append("your previous FTP result had low confidence")
    else:
        status = "approved"
        reasons.append("recent benchmark with good confidence and consistent training")

    return BenchmarkDecision(
        status=status,
        reasons=reasons,
        requires_benchmark=status in _BENCHMARK_STATUSES,
    )
