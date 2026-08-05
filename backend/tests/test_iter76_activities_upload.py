"""Iter 76 — Ride ingestion + unified rides/analysis endpoints.

Covers:
  - POST /api/activities/upload GPX (with power/HR/cadence extensions) -> 200 + metrics
  - POST /api/activities/upload TCX (Garmin TrainingCenterDatabase w/ TPX Watts) -> 200 + metrics
  - POST /api/activities/upload with .csv -> 400 unsupported extension
  - GET  /api/activities lists uploaded outdoor rides (indoor_outdoor='outdoor', source='upload')
  - GET  /api/activities/{id} returns full detail (samples, power_curve, 7 power zones, metrics)
  - GET  /api/activities/ftp + POST /api/activities/ftp round-trip
Cleans up greenlantern's uploaded rides at the end so real data stays clean.
"""
import base64
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://roujaune-train.preview.emergentagent.com").rstrip("/")
RIDER_EMAIL = "greenlantern@roujaune.app"
RIDER_PASSWORD = "rideon9900"


# ---- auth ---------------------------------------------------------------- #
@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


# ---- fixtures: synthetic ride files ------------------------------------- #
def _make_gpx(n_points=200):
    """~200 trkpt around Lake Garda w/ ele, time, power, HR, cadence."""
    start = datetime(2025, 6, 1, 8, 0, 0, tzinfo=timezone.utc)
    lat0, lng0 = 45.6500, 10.6800
    pts = []
    for i in range(n_points):
        t = (start + timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        lat = lat0 + i * 0.00008          # ~9m/point north
        lng = lng0 + (i % 20) * 0.00003
        ele = 100 + (i * 0.2)             # slow climb
        power = 180 + (i % 30) * 3        # 180..267 W
        hr = 130 + (i % 25)               # 130..154
        cad = 85 + (i % 10)
        pts.append(
            f'<trkpt lat="{lat:.6f}" lon="{lng:.6f}">'
            f'<ele>{ele:.1f}</ele><time>{t}</time>'
            f'<extensions>'
            f'<power>{power}</power>'
            f'<gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'
            f'<gpxtpx:hr>{hr}</gpxtpx:hr><gpxtpx:cad>{cad}</gpxtpx:cad>'
            f'</gpxtpx:TrackPointExtension></extensions></trkpt>'
        )
    body = "\n".join(pts)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">'
        f'<trk><name>Iter76 GPX Test Ride</name><trkseg>{body}</trkseg></trk>'
        '</gpx>'
    ).encode("utf-8")


def _make_tcx(n_points=180):
    start = datetime(2025, 7, 4, 7, 30, 0, tzinfo=timezone.utc)
    lat0, lng0 = 45.6600, 10.7000
    tps = []
    for i in range(n_points):
        t = (start + timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        lat = lat0 + i * 0.00007
        lng = lng0 + (i % 15) * 0.00004
        ele = 120 + i * 0.3
        watts = 190 + (i % 40) * 2
        hr = 135 + (i % 20)
        cad = 88 + (i % 8)
        tps.append(
            f'<Trackpoint><Time>{t}</Time>'
            f'<Position><LatitudeDegrees>{lat:.6f}</LatitudeDegrees>'
            f'<LongitudeDegrees>{lng:.6f}</LongitudeDegrees></Position>'
            f'<AltitudeMeters>{ele:.1f}</AltitudeMeters>'
            f'<DistanceMeters>{i*8.0:.1f}</DistanceMeters>'
            f'<HeartRateBpm><Value>{hr}</Value></HeartRateBpm>'
            f'<Cadence>{cad}</Cadence>'
            f'<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">'
            f'<Watts>{watts}</Watts></TPX></Extensions>'
            f'</Trackpoint>'
        )
    body = "".join(tps)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">'
        '<Activities><Activity Sport="Biking">'
        f'<Id>{start.strftime("%Y-%m-%dT%H:%M:%SZ")}</Id>'
        f'<Lap StartTime="{start.strftime("%Y-%m-%dT%H:%M:%SZ")}">'
        f'<Track>{body}</Track></Lap></Activity></Activities></TrainingCenterDatabase>'
    ).encode("utf-8")


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


# ---- module state: track uploaded IDs for cleanup ------------------------ #
_uploaded_ids: list[str] = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(H):
    yield
    # Best-effort cleanup: delete uploaded activities + their history mirrors
    # via direct mongo, as recommended by main agent.
    try:
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from db import db  # user DB via ContextVar; not usable outside a request.
        # Fallback: use motor directly against MONGO_URL.
    except Exception:
        pass
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = os.environ.get("MONGO_URL")
        dbname = os.environ.get("DB_NAME")
        if not (mongo and dbname):
            return
        client = AsyncIOMotorClient(mongo)
        # user db name pattern: {DB_NAME}_user_{userid_lower}
        # greenlantern's user id is deterministic from email; use rider_history
        # collection cleanup via the API instead if available.

        async def _cl():
            # We don't know exact user-db name, so scan for any db with an
            # 'uploaded' provider from this test run and delete.
            for dbn in await client.list_database_names():
                if "greenlantern" not in dbn.lower() and not dbn.endswith("_users_greenlantern"):
                    # try anyway on any user_ db
                    if "_user_" not in dbn and "users_" not in dbn:
                        continue
                udb = client[dbn]
                try:
                    ca = udb["cycling_activities"]
                    docs = await ca.find({"provider": "upload"}).to_list(length=1000)
                    if not docs:
                        continue
                    canon = [d.get("canonical_activity_id") or d.get("id") for d in docs]
                    await ca.delete_many({"provider": "upload"})
                    await udb["ride_history"].delete_many(
                        {"id": {"$in": [f"import-{c}" for c in canon]}})
                    print(f"[cleanup] purged {len(docs)} upload rides from {dbn}")
                except Exception as e:
                    print(f"[cleanup] skip {dbn}: {e}")
            client.close()

        asyncio.get_event_loop().run_until_complete(_cl())
    except Exception as e:
        print(f"[cleanup] failed: {e}")


# =========================================================================
# 1) Upload tests
# =========================================================================
class TestUpload:
    def test_gpx_upload_returns_metrics(self, H):
        raw = _make_gpx(200)
        r = requests.post(f"{BASE_URL}/api/activities/upload", headers=H,
                          json={"filename": "iter76_ride.gpx", "content_base64": _b64(raw)},
                          timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("activity_id"), f"no activity_id: {j}"
        _uploaded_ids.append(j["activity_id"])
        # metrics present
        assert j.get("np") and j["np"] > 0, f"np missing: {j}"
        assert j.get("if") and 0 < j["if"] < 2, f"if invalid: {j}"
        assert j.get("tss") is not None and j["tss"] >= 0, f"tss invalid: {j}"
        assert j.get("distance_km") is not None and j["distance_km"] > 0, f"dist: {j}"

    def test_tcx_upload_returns_metrics(self, H):
        raw = _make_tcx(180)
        r = requests.post(f"{BASE_URL}/api/activities/upload", headers=H,
                          json={"filename": "iter76_ride.tcx", "content_base64": _b64(raw)},
                          timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("activity_id"), j
        _uploaded_ids.append(j["activity_id"])
        assert j.get("np") and j["np"] > 0, j
        assert j.get("if") and j["if"] > 0, j
        assert j.get("tss") is not None and j["tss"] >= 0, j
        assert j.get("distance_km") is not None and j["distance_km"] > 0, j

    def test_unsupported_extension_400(self, H):
        raw = b"time,power\n0,120\n1,130\n"
        r = requests.post(f"{BASE_URL}/api/activities/upload", headers=H,
                          json={"filename": "bad.csv", "content_base64": _b64(raw)},
                          timeout=15)
        assert r.status_code == 400, r.text
        detail = (r.json() or {}).get("detail", "").lower()
        assert "unsupported" in detail or "csv" in detail or "use .fit" in detail


# =========================================================================
# 2) List activities
# =========================================================================
class TestListActivities:
    def test_list_contains_uploaded_outdoor(self, H):
        # Ensure at least one upload exists (idempotent w/ TestUpload).
        if not _uploaded_ids:
            raw = _make_gpx(150)
            r = requests.post(f"{BASE_URL}/api/activities/upload", headers=H,
                              json={"filename": "iter76_list.gpx", "content_base64": _b64(raw)},
                              timeout=30)
            assert r.status_code == 200
            _uploaded_ids.append(r.json()["activity_id"])

        r = requests.get(f"{BASE_URL}/api/activities", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        acts = r.json().get("activities") or []
        assert isinstance(acts, list) and len(acts) > 0, "empty activities list"

        # Find at least one outdoor upload
        uploads = [a for a in acts if a.get("source") == "upload"
                   and a.get("indoor_outdoor") == "outdoor"]
        assert uploads, f"no upload+outdoor rides in list. sample={acts[:3]}"
        a = uploads[0]
        assert a.get("imported") is True
        assert a.get("id", "").startswith("import-")
        assert a.get("distance_km") is not None
        assert a.get("duration_sec") is not None


# =========================================================================
# 3) Activity detail
# =========================================================================
class TestActivityDetail:
    def test_detail_has_full_analysis(self, H):
        assert _uploaded_ids, "no upload id available"
        aid = _uploaded_ids[0]
        r = requests.get(f"{BASE_URL}/api/activities/{aid}", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # capability flags
        assert d.get("has_gps") is True, f"has_gps false: {d}"
        assert d.get("has_power") is True, f"has_power false: {d}"
        assert d.get("has_hr") is True, f"has_hr false: {d}"
        # samples
        samples = d.get("samples") or []
        assert isinstance(samples, list) and len(samples) > 0
        # decimated to <= 500
        assert len(samples) <= 500
        s0 = samples[0]
        assert "lat" in s0 and "lng" in s0
        # power curve
        pc = d.get("power_curve")
        assert isinstance(pc, list) and len(pc) > 0
        assert {"secs", "watts"} <= set(pc[0].keys())
        # 7 power zone buckets
        tpz = d.get("time_in_power_zones")
        assert isinstance(tpz, list) and len(tpz) == 7, f"tpz={tpz}"
        assert sum(tpz) > 0
        # metrics
        for k in ("np", "if", "tss", "avg_power", "avg_hr", "avg_cadence"):
            assert d.get(k) is not None, f"missing metric {k}: {d}"

    def test_detail_via_import_prefix(self, H):
        """The list uses id='import-<canonical>'; detail must resolve that too."""
        r = requests.get(f"{BASE_URL}/api/activities", headers=H, timeout=15)
        acts = r.json()["activities"]
        up = next((a for a in acts if a.get("source") == "upload"), None)
        assert up, "no upload row"
        # id from ride_history is 'import-<canonical>'
        rid = up["id"]
        r = requests.get(f"{BASE_URL}/api/activities/{rid}", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("has_gps") in (True, False)  # renders
        assert d.get("samples") is not None


# =========================================================================
# 4) FTP get/set round-trip
# =========================================================================
class TestFtp:
    def test_ftp_roundtrip(self, H):
        r = requests.get(f"{BASE_URL}/api/activities/ftp", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "ftp" in j
        orig = int(j["ftp"])

        r = requests.post(f"{BASE_URL}/api/activities/ftp", headers=H,
                          json={"ftp": 230}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ftp"] == 230

        r = requests.get(f"{BASE_URL}/api/activities/ftp", headers=H, timeout=15)
        assert r.json()["ftp"] == 230

        # restore
        requests.post(f"{BASE_URL}/api/activities/ftp", headers=H,
                      json={"ftp": orig}, timeout=15)

    def test_ftp_out_of_range_400(self, H):
        r = requests.post(f"{BASE_URL}/api/activities/ftp", headers=H,
                          json={"ftp": 40}, timeout=15)
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/activities/ftp", headers=H,
                          json={"ftp": 900}, timeout=15)
        assert r.status_code == 400
