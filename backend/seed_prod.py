"""Production content + demo-account seeding.

Deploying pushes code, not data — preview and production have separate MongoDB
databases. This module bundles the scenic-ride catalog, the store screenshots +
listing copy, and a ready-to-use demo login (with a little data) so they
auto-populate a fresh production database on startup.

Idempotent: every document is upserted by a natural key, so re-running on each
boot never duplicates and never clobbers unrelated (real-user) data.
"""
from __future__ import annotations

import gzip
import logging
from pathlib import Path

from bson import json_util

logger = logging.getLogger("seed_prod")

SEED_DIR = Path(__file__).resolve().parent / "seed_data"

# collection -> natural key used for the upsert
CONTENT_KEYS = {
    "scenic_routes": "id",
    "scenic_poi": "route_id",
    "screen_captures": "key",
    "app_meta": "key",
}
DEMO_KEYS = {
    "users": "email",
    "rider_profile": "id",
    "rider_prefs": "id",
    "ride_history": "id",
    "cycling_activities": "id",
    "calendar_weeks": "id",
}


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json_util.loads(raw.decode("utf-8"))


async def _seed_bundle(db, bundle: dict, keys: dict[str, str]) -> int:
    written = 0
    for coll, docs in bundle.items():
        key = keys.get(coll)
        if not key or not docs:
            continue
        for doc in docs:
            if key not in doc:
                continue
            await db[coll].update_one({key: doc[key]}, {"$set": doc}, upsert=True)
            written += 1
    return written


async def seed_production_data(db) -> None:
    """Seed bundled content + demo account. Safe to run on every startup."""
    try:
        content = _load(SEED_DIR / "content_seed.json.gz")
        if not content:
            content = _load(SEED_DIR / "content_seed.json")
        demo = _load(SEED_DIR / "demo_seed.json")

        n1 = await _seed_bundle(db, content, CONTENT_KEYS)
        n2 = await _seed_bundle(db, demo, DEMO_KEYS)
        logger.info("Production seed complete — content docs: %s, demo docs: %s", n1, n2)
    except Exception:
        logger.exception("production seeding failed")
