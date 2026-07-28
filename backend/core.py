"""Shared, dependency-light helpers used across route/model/service modules.

Kept intentionally free of DB/FastAPI imports so any module (models, services,
routes) can import from it without creating circular dependencies.
"""
from datetime import datetime, timezone


def now_iso() -> str:
    """Current UTC timestamp as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()
