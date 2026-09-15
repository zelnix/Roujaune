"""Backend tests for ROUJAUNE telemetry (REST + WebSocket).

Uses the public preview URL from EXPO_PUBLIC_BACKEND_URL (frontend/.env) for
REST and internal ws://localhost:8001 for the WebSocket (per test brief).
"""
import json
import os
import time
import asyncio
from pathlib import Path

import pytest
import requests
import websockets

# Load EXPO_PUBLIC_BACKEND_URL from frontend/.env
_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = None
for line in _env.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"

INTERNAL_WS = "ws://localhost:8001/api/ws/telemetry"

# /api/ and /api/workouts/* require a bearer token now (P0 security hardening).
# The WS stream itself does not (it carries no rider-identifying data).
_SESSION = requests.Session()
_r = _SESSION.post(f"{BASE_URL}/api/auth/login",
                    json={"email": "greenlantern@roujaune.app", "password": "rideon9900"}, timeout=20)
assert _r.status_code == 200, f"login failed: {_r.status_code} {_r.text}"
_SESSION.headers.update({"Authorization": f"Bearer {_r.json()['token']}"})


# ---------------- REST: workouts CRUD ----------------
class TestWorkouts:
    session_id = None

    def test_root_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 401

    def test_root(self):
        r = _SESSION.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_start_workout(self):
        r = _SESSION.post(
            f"{BASE_URL}/api/workouts/start",
            json={"workout": "TEST_Threshold", "route": "TEST_Route"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "active"
        assert data["workout"] == "TEST_Threshold"
        assert data["route"] == "TEST_Route"
        assert "id" in data and data["id"]
        TestWorkouts.session_id = data["id"]

    def test_get_workout(self):
        assert TestWorkouts.session_id, "start_workout must succeed first"
        r = _SESSION.get(f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == TestWorkouts.session_id
        assert data["status"] == "active"
        assert "_id" not in data  # ObjectId must be excluded

    def test_list_workouts(self):
        r = _SESSION.get(f"{BASE_URL}/api/workouts", timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(row["id"] == TestWorkouts.session_id for row in rows)

    def test_end_workout(self):
        assert TestWorkouts.session_id
        summary = {"elapsed": 1500, "avg_power": 240.5, "avg_hr": 158.2,
                   "distance": 25.0, "tss": 90.0, "calories": 520.0}
        r = _SESSION.post(
            f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}/end",
            json=summary, timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ended"
        assert data["summary"]["avg_power"] == 240.5
        # verify persistence
        r2 = _SESSION.get(f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}", timeout=10)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["status"] == "ended"
        assert d2["ended_at"] is not None
        assert d2["summary"]["tss"] == 90.0

    def test_get_unknown_workout_404(self):
        r = _SESSION.get(f"{BASE_URL}/api/workouts/does-not-exist-xyz", timeout=10)
        assert r.status_code == 404


# ---------------- WebSocket: telemetry ----------------
class TestTelemetryWS:
    """Telemetry now follows a strict 'never fabricate' policy (see
    server.py RideState.step()) — power/cadence/hr/speed are always 0
    ('disconnected') unless a real BLE sensor frame was pushed in the last
    4s. The old erg/target-driven fake-physics simulation (this file used to
    assert on: base power ~ erg target, pause freezing a non-zero value,
    etc.) was intentionally removed so the app never shows a rider a fake
    number. This class now verifies that contract plus the real-sensor
    override + expiry path, and that pause/resume still gate elapsed time."""

    def _collect(self, ws, count, timeout=6):
        end = time.time() + timeout
        frames = []
        while len(frames) < count and time.time() < end:
            try:
                raw = asyncio.get_event_loop().run_until_complete(
                    asyncio.wait_for(ws.recv(), timeout=end - time.time()))
            except Exception:
                break
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("type") == "telemetry":
                frames.append(msg["data"])
        return frames

    def test_disconnected_by_default_and_ignores_erg_target(self):
        async def run():
            async with websockets.connect(INTERNAL_WS, open_timeout=5) as ws:
                first = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
                assert first == {"type": "status", "state": "connected"}

                base = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        base.append(m["data"])
                assert len(base) >= 3, f"expected ~5Hz stream, got {len(base)}"
                # Never fabricate: no sensor pushed yet -> disconnected + zero.
                assert all(b["source"] == "disconnected" for b in base), base
                assert all(b["power"] == 0 for b in base), base

                # erg/target no longer drive fake power — still disconnected/zero.
                await ws.send(json.dumps({"type": "erg", "intensity": 120}))
                await ws.send(json.dumps({"type": "target", "watts": 320}))
                await asyncio.sleep(0.6)
                after = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        after.append(m["data"])
                assert after and all(a["source"] == "disconnected" and a["power"] == 0 for a in after), after

        asyncio.new_event_loop().run_until_complete(run())

    def test_real_sensor_override_then_expires_to_disconnected(self):
        async def run():
            async with websockets.connect(INTERNAL_WS, open_timeout=5) as ws:
                json.loads(await asyncio.wait_for(ws.recv(), timeout=3))  # status frame

                # Drain any frames already buffered before the sensor push so we
                # don't pick up stale pre-sensor frames below.
                try:
                    while True:
                        await asyncio.wait_for(ws.recv(), timeout=0.15)
                except asyncio.TimeoutError:
                    pass

                await ws.send(json.dumps({"type": "sensor", "power": 240, "cadence": 90, "hr": 150}))
                await asyncio.sleep(0.3)  # let the server tick pick up the new sensor state
                sensor_frames = []
                end = time.time() + 2.0
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        sensor_frames.append(m["data"])
                assert sensor_frames
                assert all(f["source"] == "sensor" for f in sensor_frames), sensor_frames
                assert all(f["power"] == 240 for f in sensor_frames), sensor_frames

                # Pause -> elapsed frozen (still real sensor values, just paused).
                await ws.send(json.dumps({"type": "pause"}))
                await asyncio.sleep(0.6)
                paused = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        paused.append(m["data"])
                assert paused, "no frames after pause"
                assert all(f["paused"] is True for f in paused[-4:])

                await ws.send(json.dumps({"type": "resume"}))
                await asyncio.sleep(0.4)
                resumed = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        resumed.append(m["data"])
                assert resumed and resumed[-1]["paused"] is False

                # After the 4s freshness window, source falls back to disconnected/zero.
                await asyncio.sleep(3.0)
                fallback = []
                end = time.time() + 1.5
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        fallback.append(m["data"])
                assert fallback
                assert any(f["source"] == "disconnected" and f["power"] == 0 for f in fallback), fallback

        asyncio.new_event_loop().run_until_complete(run())
