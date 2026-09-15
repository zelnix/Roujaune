"""Iter 23 — Verify:
  1) POST /api/coach/cue with seated:true returns a cue that does NOT reference
     standing / out-of-saddle. Also seated:false still works.
  2) WS /api/ws/telemetry accepts {type:'sensor', power, cadence, hr} — the
     resulting frames should carry those exact values with data.source ==
     'sensor' for ~4 s, then fall back to source 'trainer'.
"""
import os
import re
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None

# Fallback: read from frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/telemetry"

STANDING_RE = re.compile(r"\b(stand|standing|out.of.the.saddle|out.of.saddle|out.saddle|climb.out|lift.off.the.saddle)\b", re.IGNORECASE)

_SESSION = requests.Session()
_r = _SESSION.post(f"{BASE_URL}/api/auth/login",
                    json={"email": "greenlantern@roujaune.app", "password": "rideon9900"}, timeout=20)
assert _r.status_code == 200, f"login failed: {_r.status_code} {_r.text}"
_SESSION.headers.update({"Authorization": f"Bearer {_r.json()['token']}"})


class TestCoachCueSeated:
    def _payload(self, seated: bool):
        return {
            "power": 130, "hr": 138, "cadence": 88, "speed": 24.5,
            "elapsed": 480, "power_target": 140, "cadence_low": 85, "cadence_high": 95,
            "workout": "Welcome Ride", "segment": "Endurance", "zone": "Z2",
            "seated": seated, "coach_name": "Alberto", "coach_gender": "male",
        }

    def test_coach_cue_seated_true(self):
        r = _SESSION.post(f"{BASE_URL}/api/coach/cue", json=self._payload(True), timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        cue = data.get("cue", "")
        assert isinstance(cue, str) and len(cue) > 5, data
        assert not STANDING_RE.search(cue), f"Seated cue must not mention standing: {cue!r}"

    def test_coach_cue_seated_false(self):
        r = _SESSION.post(f"{BASE_URL}/api/coach/cue", json=self._payload(False), timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        cue = data.get("cue", "")
        assert isinstance(cue, str) and len(cue) > 5, data


class TestWsTelemetrySensor:
    """'Never fabricate' policy: without a real sensor push the stream is
    'disconnected'/zero (not a fabricated 'trainer' simulation — see
    server.py RideState.step()). This still verifies the important
    contract: a real sensor push overrides exactly, and expires back to
    disconnected/zero after ~4s."""

    @pytest.mark.asyncio
    async def test_sensor_override_and_fallback(self):
        async with websockets.connect(WS_URL, open_timeout=10) as ws:
            # Drain initial status message + a couple of pre-sensor frames.
            pre_frames = []
            end = asyncio.get_event_loop().time() + 1.5
            while asyncio.get_event_loop().time() < end:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    break
                d = json.loads(msg)
                if d.get("type") == "telemetry":
                    pre_frames.append(d["data"])
            assert any(f.get("source") == "disconnected" for f in pre_frames), \
                f"expected pre-sensor disconnected frames, got {pre_frames[:2]}"

            # Push a real BLE sensor frame.
            await ws.send(json.dumps({"type": "sensor", "power": 222, "cadence": 77, "hr": 155}))
            await asyncio.sleep(0.3)  # let the server tick pick up the new sensor state

            # Collect ~2s of frames – all should be sensor with our exact values.
            sensor_frames = []
            end = asyncio.get_event_loop().time() + 2.0
            while asyncio.get_event_loop().time() < end:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    break
                d = json.loads(msg)
                if d.get("type") == "telemetry":
                    sensor_frames.append(d["data"])

            assert sensor_frames, "no telemetry received after sensor push"
            assert all(f.get("source") == "sensor" for f in sensor_frames), \
                f"expected all sensor source, got sources={[f.get('source') for f in sensor_frames]}"
            assert all(f.get("power") == 222 for f in sensor_frames), \
                f"power mismatch: {[f.get('power') for f in sensor_frames]}"
            assert all(f.get("cadence") == 77 for f in sensor_frames), \
                f"cadence mismatch: {[f.get('cadence') for f in sensor_frames]}"
            assert all(f.get("hr") == 155 for f in sensor_frames), \
                f"hr mismatch: {[f.get('hr') for f in sensor_frames]}"

            # After the 4s freshness window elapses (we already used ~2s), wait
            # another ~2.5s and confirm source falls back to disconnected/zero
            # (never a fabricated 'trainer' simulation).
            await asyncio.sleep(2.6)
            fallback_frames = []
            end = asyncio.get_event_loop().time() + 1.5
            while asyncio.get_event_loop().time() < end:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    break
                d = json.loads(msg)
                if d.get("type") == "telemetry":
                    fallback_frames.append(d["data"])
            assert fallback_frames, "no post-expiry telemetry received"
            assert any(f.get("source") == "disconnected" and f.get("power") == 0 for f in fallback_frames), \
                f"expected disconnected/zero fallback, got {[(f.get('source'), f.get('power')) for f in fallback_frames]}"
