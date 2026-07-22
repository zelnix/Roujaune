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


# ---------------- REST: workouts CRUD ----------------
class TestWorkouts:
    session_id = None

    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_start_workout(self):
        r = requests.post(
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
        r = requests.get(f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == TestWorkouts.session_id
        assert data["status"] == "active"
        assert "_id" not in data  # ObjectId must be excluded

    def test_list_workouts(self):
        r = requests.get(f"{BASE_URL}/api/workouts", timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(row["id"] == TestWorkouts.session_id for row in rows)

    def test_end_workout(self):
        assert TestWorkouts.session_id
        summary = {"elapsed": 1500, "avg_power": 240.5, "avg_hr": 158.2,
                   "distance": 25.0, "tss": 90.0, "calories": 520.0}
        r = requests.post(
            f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}/end",
            json=summary, timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ended"
        assert data["summary"]["avg_power"] == 240.5
        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/workouts/{TestWorkouts.session_id}", timeout=10)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["status"] == "ended"
        assert d2["ended_at"] is not None
        assert d2["summary"]["tss"] == 90.0

    def test_get_unknown_workout_404(self):
        r = requests.get(f"{BASE_URL}/api/workouts/does-not-exist-xyz", timeout=10)
        assert r.status_code == 404


# ---------------- WebSocket: telemetry ----------------
class TestTelemetryWS:
    """Verify the WS stream, ERG control, pause/resume via internal endpoint."""

    def _collect(self, ws, count, timeout=6):
        """Collect `count` telemetry frames within timeout secs."""
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

    def test_full_ws_flow(self):
        async def run():
            async with websockets.connect(INTERNAL_WS, open_timeout=5) as ws:
                # first frame should be status:connected
                first = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
                assert first == {"type": "status", "state": "connected"}

                # Collect ~1s baseline
                base = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        base.append(m["data"])
                assert len(base) >= 3, f"expected ~5Hz stream, got {len(base)}"
                # values change over time
                powers = [b["power"] for b in base]
                assert len(set(powers)) > 1
                assert base[0]["erg"] == 100

                # ERG 120 -> higher target power (~301)
                await ws.send(json.dumps({"type": "erg", "intensity": 120}))
                # allow physics to converge
                await asyncio.sleep(1.2)
                hi = []
                end = time.time() + 1.5
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        hi.append(m["data"])
                assert hi and hi[-1]["erg"] == 120
                avg_hi = sum(h["power"] for h in hi) / len(hi)
                avg_base = sum(b["power"] for b in base) / len(base)
                assert avg_hi > avg_base + 20, (
                    f"expected higher avg power after erg=120 (base={avg_base:.1f}, hi={avg_hi:.1f})")

                # Pause -> paused flag true, values frozen
                await ws.send(json.dumps({"type": "pause"}))
                await asyncio.sleep(0.6)
                # drain any queued frames
                paused_frames = []
                end = time.time() + 1.2
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        paused_frames.append(m["data"])
                assert paused_frames, "no frames after pause"
                # After pause takes effect, power/cadence should be constant
                tail = paused_frames[-4:]
                assert all(f["paused"] is True for f in tail)
                assert len({f["power"] for f in tail}) == 1
                assert len({f["cadence"] for f in tail}) == 1

                # Resume -> paused False, values changing again
                await ws.send(json.dumps({"type": "resume"}))
                await asyncio.sleep(0.4)
                resumed = []
                end = time.time() + 1.5
                while time.time() < end:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    if m.get("type") == "telemetry":
                        resumed.append(m["data"])
                assert resumed and resumed[-1]["paused"] is False
                assert len({f["power"] for f in resumed}) > 1

        asyncio.new_event_loop().run_until_complete(run())
