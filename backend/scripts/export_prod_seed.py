"""One-off: export preview content + demo account into bundled seed JSON files
so production auto-populates them on startup. Uses bson.json_util so datetimes
round-trip correctly. Drops _id (seed upserts by natural key)."""
import asyncio
import os
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()
OUT = Path(__file__).resolve().parent.parent / "seed_data"
OUT.mkdir(exist_ok=True)
DEMO_EMAIL = "demo@roujaune.app"


def _strip(docs):
    for d in docs:
        d.pop("_id", None)
    return docs


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ.get("DB_NAME", "test_database")]

    user = await db.users.find_one({"email": DEMO_EMAIL})
    uid = user["user_id"]

    # ---- Global content (not user-scoped) --------------------------------- #
    content = {
        "scenic_routes": _strip(await db.scenic_routes.find({}).to_list(1000)),
        "scenic_poi": _strip(await db.scenic_poi.find({}).to_list(1000)),
        "screen_captures": _strip(await db.screen_captures.find({}).to_list(1000)),
        "app_meta": _strip(await db.app_meta.find({"key": "store_listing"}).to_list(10)),
    }

    # ---- Demo account + its data ------------------------------------------ #
    demo = {
        "users": _strip([user]),
        "rider_profile": _strip(await db.rider_profile.find({"user_id": uid}).to_list(50)),
        "rider_prefs": _strip(await db.rider_prefs.find({"user_id": uid}).to_list(50)),
        "ride_history": _strip(await db.ride_history.find({"user_id": uid}).to_list(500)),
        "cycling_activities": _strip(await db.cycling_activities.find({"user_id": uid}).to_list(500)),
        "calendar_weeks": _strip(await db.calendar_weeks.find({"user_id": uid}).to_list(200)),
    }

    (OUT / "content_seed.json").write_text(json_util.dumps(content))
    (OUT / "demo_seed.json").write_text(json_util.dumps(demo))

    for name, blob in (("content", content), ("demo", demo)):
        print(f"== {name} ==")
        for k, v in blob.items():
            print(f"   {k}: {len(v)}")
    print("content_seed.json bytes:", (OUT / "content_seed.json").stat().st_size)
    print("demo_seed.json bytes:", (OUT / "demo_seed.json").stat().st_size)


asyncio.run(main())
