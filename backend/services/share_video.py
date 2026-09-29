"""Animated ride share video generator.

Produces a 10–15 second MP4 showing the power curve drawing itself in real-time
with key metrics fading in.  Designed for Instagram Stories (9:16) and TikTok.

Pipeline:
  1. Render individual PNG frames using matplotlib (dark theme, ROUJAUNE brand).
  2. Stitch frames into MP4 using ffmpeg (via imageio-ffmpeg).

The video tells the story of the workout:
  - Power curve draws itself left-to-right (accelerated time-lapse).
  - HR line follows in red.
  - Route elevation profile draws underneath (terrain feel).
  - Key stat annotations fade in at strategic moments.
  - Final frame holds the summary stats.
"""
from __future__ import annotations

import io
import os
import tempfile
from typing import List

import numpy as np

import matplotlib
matplotlib.use("Agg")  # headless backend
import matplotlib.pyplot as plt
from matplotlib.figure import Figure

import imageio_ffmpeg

# ── Brand palette (matches frontend theme.ts) ──────────────────────────
BG = "#0D0D0F"
YELLOW = "#F5C518"
GREEN = "#34C759"
RED = "#FF453A"
CYAN = "#5AC8FA"
WHITE = "#FFFFFF"
DIM = "#666680"
FAINT = "#3A3A4C"

# ── Video params ────────────────────────────────────────────────────────
FPS = 30
DURATION_SEC = 12
W, H = 1080, 1920  # 9:16 portrait
DPI = 100


def _smooth(arr: list[float], window: int = 5) -> list[float]:
    if len(arr) < window:
        return arr
    out, buf = [], []
    for v in arr:
        buf.append(v)
        if len(buf) > window:
            buf.pop(0)
        out.append(sum(buf) / len(buf))
    return out


def _elevation_from_gradients(points: list[dict], total_km: float) -> tuple[list[float], list[float]]:
    """Convert gradient profile to (km[], elevation[]) arrays.
    Each point: {km, gradient}."""
    if not points:
        return [], []
    km_arr = [0.0]
    elev_arr = [0.0]
    for i in range(1, len(points)):
        prev, curr = points[i - 1], points[i]
        dk = curr["km"] - prev["km"]
        avg_grad = (prev.get("gradient", 0) + curr.get("gradient", 0)) / 2
        de = dk * 1000 * avg_grad / 100  # metres of elevation change
        km_arr.append(curr["km"])
        elev_arr.append(elev_arr[-1] + de)
    return km_arr, elev_arr


def _render_frame(
    frame_idx: int,
    total_frames: int,
    power: list[float],
    hr: list[float],
    metrics: dict,
    workout_name: str,
    route_name: str | None,
    route_km: list[float],
    route_elev: list[float],
) -> bytes:
    progress = frame_idx / max(1, total_frames - 1)
    n_samples = len(power)
    reveal_idx = max(1, int(progress * n_samples))

    pw_smooth = _smooth(power[:reveal_idx], 10)
    hr_smooth = _smooth(hr[:reveal_idx], 10) if any(v > 0 for v in hr) else []

    fig = Figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor=BG)

    # ── Route elevation profile (top graph area) ──────────────────
    if route_km and route_elev:
        ax_elev = fig.add_axes([0.08, 0.72, 0.84, 0.12])
        ax_elev.set_facecolor(BG)
        total_route_km = route_km[-1] if route_km else 1
        reveal_km = progress * total_route_km
        visible_km = [k for k in route_km if k <= reveal_km]
        visible_elev = route_elev[:len(visible_km)]
        if visible_km:
            ax_elev.fill_between(visible_km, visible_elev, alpha=0.12, color=GREEN)
            ax_elev.plot(visible_km, visible_elev, color=GREEN, linewidth=2, solid_capstyle="round")
            # Rider marker at the leading edge
            ax_elev.plot(visible_km[-1], visible_elev[-1], "o", color=YELLOW, markersize=8, zorder=5)
        ax_elev.set_xlim(0, max(1, total_route_km))
        if route_elev:
            mn, mx = min(route_elev), max(route_elev)
            pad = max(20, (mx - mn) * 0.2)
            ax_elev.set_ylim(mn - pad, mx + pad)
        ax_elev.set_ylabel("Elev (m)", color=GREEN, fontsize=8)
        ax_elev.tick_params(colors=DIM, labelsize=7)
        for sp in ax_elev.spines.values():
            sp.set_color(FAINT)
        if route_name:
            ax_elev.set_title(route_name, fontsize=10, color=DIM, loc="left", pad=4)

    # ── Power curve (main graph area) ─────────────────────────────
    ax_main = fig.add_axes([0.08, 0.35, 0.84, 0.30])
    ax_main.set_facecolor(BG)
    x = list(range(len(pw_smooth)))
    minutes = [v / 60 for v in x]

    if pw_smooth:
        ax_main.fill_between(minutes, pw_smooth, alpha=0.15, color=YELLOW)
        ax_main.plot(minutes, pw_smooth, color=YELLOW, linewidth=2.5, solid_capstyle="round")

    if hr_smooth and len(hr_smooth) == len(pw_smooth):
        ax_hr = ax_main.twinx()
        hr_mins = [v / 60 for v in range(len(hr_smooth))]
        ax_hr.plot(hr_mins, hr_smooth, color=RED, linewidth=1.5, alpha=0.7)
        ax_hr.set_ylim(min(hr_smooth) - 20, max(hr_smooth) + 20)
        ax_hr.tick_params(colors=DIM, labelsize=8)
        ax_hr.set_ylabel("HR (bpm)", color=RED, fontsize=9)
        ax_hr.spines["right"].set_color(FAINT)
        for sp in ["top", "bottom", "left"]:
            ax_hr.spines[sp].set_visible(False)

    ax_main.set_xlim(0, max(1, n_samples / 60))
    y_max = max(power) * 1.2 if power else 400
    ax_main.set_ylim(0, y_max)
    ax_main.set_xlabel("Minutes", color=DIM, fontsize=10)
    ax_main.set_ylabel("Power (W)", color=YELLOW, fontsize=10)
    ax_main.tick_params(colors=DIM, labelsize=8)
    for sp in ax_main.spines.values():
        sp.set_color(FAINT)

    # ── Header ────────────────────────────────────────────────────
    fig.text(0.08, 0.95, "ROUJAUNE", fontsize=14, color=YELLOW, fontweight="bold",
             fontfamily="monospace", ha="left")
    fig.text(0.08, 0.91, workout_name.upper(), fontsize=22, color=WHITE, fontweight="bold",
             ha="left")

    # ── Stat annotations (fade in progressively) ─────────────────
    stats = []
    np_val = metrics.get("normalized_power")
    tss_val = metrics.get("tss")
    avg_pw = metrics.get("avg_power")
    avg_hr_val = metrics.get("avg_hr")
    duration = metrics.get("duration_label", "")
    if_val = metrics.get("intensity_factor")

    if progress > 0.15:
        stats.append(("DURATION", duration, YELLOW))
    if progress > 0.30 and avg_pw:
        stats.append(("AVG POWER", f"{avg_pw} W", GREEN))
    if progress > 0.50 and np_val:
        stats.append(("NORM. POWER", f"{np_val} W", CYAN))
    if progress > 0.65 and avg_hr_val:
        stats.append(("AVG HR", f"{avg_hr_val} bpm", RED))
    if progress > 0.80 and tss_val:
        stats.append(("TSS", f"{round(tss_val)}", YELLOW))
    if progress > 0.90 and if_val:
        stats.append(("IF", f"{if_val:.2f}", CYAN))

    y_start = 0.28
    for i, (label, value, color) in enumerate(stats):
        col = i % 3
        row = i // 3
        x_pos = 0.08 + col * 0.32
        y_pos = y_start - row * 0.10
        alpha = min(1.0, max(0.0, (progress - (0.15 + i * 0.12)) * 5))
        fig.text(x_pos, y_pos, label, fontsize=9, color=DIM, alpha=alpha, fontweight="bold")
        fig.text(x_pos, y_pos - 0.025, value, fontsize=18, color=color, alpha=alpha, fontweight="bold")

    # ── Footer ────────────────────────────────────────────────────
    fig.text(0.08, 0.04, "#IndoorCycling  #ERGMode  #ROUJAUNE", fontsize=10, color=FAINT)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=DPI, facecolor=BG, bbox_inches=None, pad_inches=0)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def generate_share_video(
    *,
    samples: List[dict],
    metrics: dict,
    workout_name: str = "Indoor Ride",
    route_name: str | None = None,
    route_points: list[dict] | None = None,
    route_total_km: float = 0,
    duration_sec: int = DURATION_SEC,
    fps: int = FPS,
) -> bytes:
    """Generate an MP4 video of the animated workout summary.

    Returns the raw MP4 bytes ready to be sent as a file response.
    """
    power = [float(s.get("power") or 0) for s in samples]
    hr = [float(s.get("hr") or 0) for s in samples]

    # Build elevation profile from route gradient points
    route_km, route_elev = [], []
    if route_points:
        route_km, route_elev = _elevation_from_gradients(route_points, route_total_km or 20)

    total_frames = duration_sec * fps
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        out_path = tmp.name

    import subprocess
    cmd = [
        ffmpeg_exe, "-y",
        "-f", "image2pipe", "-vcodec", "png",
        "-framerate", str(fps), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "23",
        "-movflags", "+faststart",
        out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    for i in range(total_frames):
        frame_png = _render_frame(
            i, total_frames, power, hr, metrics, workout_name,
            route_name, route_km, route_elev,
        )
        proc.stdin.write(frame_png)

    proc.stdin.close()
    proc.wait(timeout=120)

    with open(out_path, "rb") as f:
        mp4_bytes = f.read()

    try:
        os.unlink(out_path)
    except OSError:
        pass

    return mp4_bytes
