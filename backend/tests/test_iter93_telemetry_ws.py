"""Iteration 93 — LIVE-by-default telemetry websocket contract.

Contract:
- {type: 'mode', mode: 'live'} → subsequent frames have power/hr/cadence == 0
  and source == 'disconnected'.
- {type: 'sensor', power, cadence, hr} → next frames have source == 'sensor'
  and the sensor values propagate (power == sent power, hr == sent hr, etc.).
- {type: 'mode', mode: 'demo'} → frames have source == 'estimated' and
  simulated non-zero power/cadence/hr.
"""
import asyncio
import json
import os

import pytest
import websockets

BACKEND_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
)
assert BACKEND_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL must be set"

WS_URL = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/telemetry"


async def _next_telemetry(ws, tries: int = 30) -> dict:
    """Read frames until we see a telemetry frame, ignoring status frames."""
    for _ in range(tries):
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        msg = json.loads(raw)
        if msg.get("type") == "telemetry":
            return msg["data"]
    raise AssertionError("No telemetry frame received in time")


async def _drain_frames(ws, count: int) -> list:
    frames = []
    for _ in range(count):
        frames.append(await _next_telemetry(ws))
    return frames


@pytest.mark.asyncio
async def test_ws_live_mode_zeros_and_disconnected():
    async with websockets.connect(WS_URL, open_timeout=10) as ws:
        # first frame is a status ("connected") — _next_telemetry ignores it.
        await ws.send(json.dumps({"type": "mode", "mode": "live"}))
        # skip a few frames to let mode change take effect
        await _drain_frames(ws, 3)
        frames = await _drain_frames(ws, 5)
        for f in frames:
            assert f["source"] == "disconnected", f
            assert f["power"] == 0, f
            assert f["hr"] == 0, f
            assert f["cadence"] == 0, f


@pytest.mark.asyncio
async def test_ws_sensor_pushes_real_values_and_source_sensor():
    async with websockets.connect(WS_URL, open_timeout=10) as ws:
        await ws.send(json.dumps({"type": "mode", "mode": "live"}))
        await _drain_frames(ws, 2)
        await ws.send(json.dumps({"type": "sensor", "power": 210, "cadence": 92, "hr": 148}))
        # Give the sim a couple of ticks to pick up the sensor push
        await _drain_frames(ws, 2)
        frames = await _drain_frames(ws, 5)
        assert any(f["source"] == "sensor" for f in frames), frames
        sensor_frames = [f for f in frames if f["source"] == "sensor"]
        assert sensor_frames, "expected at least one sensor-sourced frame"
        f = sensor_frames[-1]
        assert f["power"] == 210, f
        assert f["hr"] == 148, f
        assert f["cadence"] == 92, f


@pytest.mark.asyncio
async def test_ws_demo_mode_source_estimated_and_nonzero_power():
    async with websockets.connect(WS_URL, open_timeout=10) as ws:
        await ws.send(json.dumps({"type": "mode", "mode": "demo"}))
        # Let the mode change propagate
        await _drain_frames(ws, 3)
        frames = await _drain_frames(ws, 5)
        for f in frames:
            assert f["source"] == "estimated", f
        assert any(f["power"] > 0 for f in frames), frames
        assert any(f["cadence"] > 0 for f in frames), frames
        assert any(f["hr"] > 0 for f in frames), frames
