"""Normalized Power (NP), Intensity Factor (IF), Training Stress Score (TSS).

Algorithms follow the TrainingPeaks model:
  NP  — 30-second rolling average → raise each to 4th power → mean → 4th root
  IF  — NP / FTP
  TSS — (seconds × NP × IF) / (FTP × 3600) × 100

The raw 1-second power array MUST include zeros (coasting / trainer drops).
Missing timestamps must be zero-padded so the 30-second window stays anchored
to real-world seconds.
"""
from __future__ import annotations
from collections import deque
from typing import List, Optional, Tuple


def pad_gaps(samples: list[dict], time_key: str = "t") -> list[int]:
    """Expand a potentially gap-ridden sample list into a continuous 1-second
    power array, zero-padding any missing timestamps.  Returns a plain list of
    ints whose length equals the ride duration in seconds."""
    if not samples:
        return []
    # If samples lack timestamps, just use them in order.
    has_t = any(s.get(time_key) for s in samples)
    if not has_t:
        return [int(s.get("power") or 0) for s in samples]
    # Build a continuous array, zero-filling BLE dropouts.
    t0 = samples[0].get(time_key, 0)
    out: list[int] = []
    idx = 0
    for sec in range(int(samples[-1].get(time_key, 0) - t0) + 1):
        ts = t0 + sec
        while idx < len(samples) - 1 and (samples[idx].get(time_key, 0) or 0) < ts:
            idx += 1
        s = samples[idx]
        if abs((s.get(time_key, 0) or 0) - ts) < 1.5:
            out.append(int(s.get("power") or 0))
        else:
            out.append(0)  # dropout → zero, not skipped
    return out


def normalized_power(power: list[int]) -> Optional[int]:
    """Calculate NP from a 1-second power array.  Returns None if < 30 s."""
    p = [max(0, v) for v in power]
    n = len(p)
    if n < 30:
        return round(sum(p) / n) if n > 0 else None
    # 30-second simple moving average
    window: deque[int] = deque()
    acc = 0.0
    rolling: list[float] = []
    for v in p:
        window.append(v)
        acc += v
        if len(window) > 30:
            acc -= window.popleft()
        if len(window) == 30:
            rolling.append(acc / 30.0)
    if not rolling:
        return round(sum(p) / n)
    # 4th power → mean → 4th root
    fourth_mean = sum(r ** 4 for r in rolling) / len(rolling)
    return round(fourth_mean ** 0.25)


def intensity_factor(np_watts: int, ftp: int) -> Optional[float]:
    """IF = NP / FTP.  Returns None if inputs are invalid."""
    if not np_watts or not ftp or ftp <= 0:
        return None
    return round(np_watts / ftp, 3)


def training_stress_score(duration_sec: int, np_watts: int, if_value: float, ftp: int) -> Optional[float]:
    """TSS = (sec × NP × IF) / (FTP × 3600) × 100."""
    if not all((duration_sec, np_watts, if_value, ftp)):
        return None
    return round((duration_sec * np_watts * if_value) / (ftp * 3600) * 100, 1)


def compute_all(power: list[int], duration_sec: int, ftp: int) -> dict:
    """Convenience: compute NP, IF, TSS in one call."""
    np_val = normalized_power(power)
    if_val = intensity_factor(np_val, ftp) if np_val else None
    tss_val = training_stress_score(duration_sec, np_val, if_val, ftp) if (np_val and if_val) else None
    avg_power = round(sum(power) / len(power)) if power else 0
    max_power = max(power) if power else 0
    return {
        "avg_power": avg_power,
        "max_power": max_power,
        "normalized_power": np_val,
        "intensity_factor": if_val,
        "tss": tss_val,
    }
