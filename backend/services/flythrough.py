"""3D-style animated route flythrough video generator.

Architecture:
  1. Pre-render ONE large overview map tile of the entire route (single fetch).
  2. For each frame, crop + pan over the overview to simulate camera tracking.
  3. Draw the animated progress line and rider marker using PIL.
  4. Composite with power graph strip + stat overlays.
  5. Stitch frames into MP4 with ffmpeg.

This avoids per-frame tile fetching (the main bottleneck) and produces smooth
camera panning across the route landscape.
"""
from __future__ import annotations

import io
import math
import os
import subprocess
import tempfile
from typing import List

from PIL import Image, ImageDraw, ImageFont
from staticmap import StaticMap, Line, CircleMarker

import imageio_ffmpeg

from services.route_gps import ROUTE_GPS, bearing as calc_bearing

# ── Brand palette ───────────────────────────────────────────────────────
YELLOW = (245, 197, 24)
GREEN = (52, 199, 89)
RED = (255, 69, 58)
WHITE = (255, 255, 255)
DIM = (102, 102, 128)
BG_COLOR = (13, 13, 15)

# ── Video params ────────────────────────────────────────────────────────
FPS = 20
DURATION_SEC = 12
FRAME_W, FRAME_H = 1920, 1080
MAP_DISPLAY_H = 820    # map takes most of the height in landscape
STAT_H = FRAME_H - MAP_DISPLAY_H  # 260px stats strip at bottom

# Overview map: render at high resolution so we can crop sub-regions.
OVERVIEW_W, OVERVIEW_H = 2400, 2400
OVERVIEW_ZOOM = 13


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


def _coord_at_progress(coords: list[list[float]], progress: float) -> tuple[list[float], int]:
    n = len(coords)
    if n == 0:
        return [0, 0], 0
    idx_f = progress * (n - 1)
    idx = min(int(idx_f), n - 2)
    frac = idx_f - idx
    lng = _lerp(coords[idx][0], coords[idx + 1][0], frac)
    lat = _lerp(coords[idx][1], coords[idx + 1][1], frac)
    return [lng, lat], idx


def _lnglat_to_pixel(lng: float, lat: float, zoom: int, img_w: int, img_h: int,
                      center_lng: float, center_lat: float) -> tuple[int, int]:
    """Convert [lng, lat] to pixel coordinates on a Mercator tile image."""
    scale = 2 ** zoom * 256
    # World pixel coordinates
    cx = (lng + 180) / 360 * scale
    cy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * scale
    # Center world pixel
    ocx = (center_lng + 180) / 360 * scale
    ocy = (1 - math.log(math.tan(math.radians(center_lat)) + 1 / math.cos(math.radians(center_lat))) / math.pi) / 2 * scale
    # Image pixel
    px = int(cx - ocx + img_w / 2)
    py = int(cy - ocy + img_h / 2)
    return px, py


def _render_overview(coords: list[list[float]]) -> tuple[Image.Image, float, float, int]:
    """Render a single large overview map of the entire route.
    Returns (image, center_lng, center_lat, zoom)."""
    m = StaticMap(OVERVIEW_W, OVERVIEW_H,
                  url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  tile_request_timeout=15)

    # Full route line (dim)
    if len(coords) >= 2:
        m.add_line(Line([(c[0], c[1]) for c in coords], color="rgb(80,80,100)", width=3))

    # Start/end markers
    m.add_marker(CircleMarker((coords[0][0], coords[0][1]), color="rgb(52,199,89)", width=10))
    m.add_marker(CircleMarker((coords[-1][0], coords[-1][1]), color="rgb(255,69,58)", width=10))

    # Compute center
    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    center_lng = (min(lngs) + max(lngs)) / 2
    center_lat = (min(lats) + max(lats)) / 2

    try:
        img = m.render(zoom=OVERVIEW_ZOOM, center=(center_lng, center_lat))
    except Exception:
        try:
            img = m.render()
        except Exception:
            img = Image.new("RGB", (OVERVIEW_W, OVERVIEW_H), BG_COLOR)

    return img.convert("RGBA"), center_lng, center_lat, OVERVIEW_ZOOM


def _render_frame(
    overview: Image.Image,
    center_lng: float,
    center_lat: float,
    zoom: int,
    coords: list[list[float]],
    progress: float,
) -> Image.Image:
    """Crop/pan the overview map to follow the rider at `progress`, then draw
    the animated progress line and rider marker."""
    rider_pos, rider_idx = _coord_at_progress(coords, progress)

    # Determine the pixel position of the rider on the overview image.
    rpx, rpy = _lnglat_to_pixel(rider_pos[0], rider_pos[1], zoom,
                                  OVERVIEW_W, OVERVIEW_H, center_lng, center_lat)

    # Look-ahead for smooth camera
    la = min(1.0, progress + 0.08)
    la_pos, _ = _coord_at_progress(coords, la)
    lapx, lapy = _lnglat_to_pixel(la_pos[0], la_pos[1], zoom,
                                    OVERVIEW_W, OVERVIEW_H, center_lng, center_lat)
    cam_x = int(_lerp(rpx, lapx, 0.35))
    cam_y = int(_lerp(rpy, lapy, 0.35))

    # Crop a viewport centred on the camera position
    vw, vh = FRAME_W, MAP_DISPLAY_H
    half_w, half_h = vw // 2, vh // 2
    left = max(0, min(cam_x - half_w, OVERVIEW_W - vw))
    top = max(0, min(cam_y - half_h, OVERVIEW_H - vh))

    crop = overview.copy().crop((left, top, left + vw, top + vh))
    frame = crop.convert("RGBA")

    draw = ImageDraw.Draw(frame)

    # Draw completed route portion on the cropped viewport
    n = len(coords)
    split_idx = max(1, int(progress * (n - 1)))

    def to_local(lng: float, lat: float) -> tuple[int, int]:
        px, py = _lnglat_to_pixel(lng, lat, zoom, OVERVIEW_W, OVERVIEW_H, center_lng, center_lat)
        return px - left, py - top

    # Completed line (yellow)
    for i in range(1, split_idx + 1):
        x1, y1 = to_local(coords[i - 1][0], coords[i - 1][1])
        x2, y2 = to_local(coords[i][0], coords[i][1])
        draw.line([(x1, y1), (x2, y2)], fill=YELLOW, width=5)

    # Rider dot with glow
    rx, ry = to_local(rider_pos[0], rider_pos[1])
    draw.ellipse((rx - 16, ry - 16, rx + 16, ry + 16), fill=(245, 197, 24, 80))
    draw.ellipse((rx - 8, ry - 8, rx + 8, ry + 8), fill=YELLOW)

    return frame.convert("RGB")


def _render_stats_strip(
    progress: float,
    metrics: dict,
    workout_name: str,
    route_name: str | None,
    power: list[float],
) -> Image.Image:
    img = Image.new("RGBA", (FRAME_W, STAT_H), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)

    # Mini power graph
    graph_h = 60
    graph_y = 15
    if power:
        n = len(power)
        reveal = max(1, int(progress * n))
        pw_max = max(max(power), 1)
        for i in range(1, reveal):
            x1 = int((i - 1) / n * FRAME_W)
            x2 = int(i / n * FRAME_W)
            y1 = graph_y + graph_h - int(power[i - 1] / pw_max * graph_h)
            y2 = graph_y + graph_h - int(power[i] / pw_max * graph_h)
            draw.line([(x1, y1), (x2, y2)], fill=YELLOW, width=2)

    ty = graph_y + graph_h + 15

    try:
        font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        font_med = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except Exception:
        font_big = font_med = font_sm = ImageFont.load_default()

    draw.text((40, ty), "ROUJAUNE", fill=YELLOW, font=font_sm)
    ty += 22
    draw.text((40, ty), workout_name.upper(), fill=WHITE, font=font_big)
    ty += 42
    if route_name:
        draw.text((40, ty), route_name, fill=DIM, font=font_med)
        ty += 30

    # Stats
    stats_data = []
    if progress > 0.1:
        stats_data.append(("DURATION", metrics.get("duration_label", ""), YELLOW))
    if progress > 0.25 and metrics.get("avg_power"):
        stats_data.append(("AVG POWER", f"{metrics['avg_power']} W", GREEN))
    if progress > 0.45 and metrics.get("normalized_power"):
        stats_data.append(("NP", f"{metrics['normalized_power']} W", (90, 200, 250)))
    if progress > 0.60 and metrics.get("avg_hr"):
        stats_data.append(("AVG HR", f"{metrics['avg_hr']} bpm", RED))
    if progress > 0.75 and metrics.get("tss"):
        stats_data.append(("TSS", f"{round(metrics['tss'])}", YELLOW))

    ty += 10
    col_w = FRAME_W // 3
    for i, (label, value, color) in enumerate(stats_data):
        col = i % 3
        row = i // 3
        x = 40 + col * col_w
        y = ty + row * 55
        draw.text((x, y), label, fill=DIM, font=font_sm)
        draw.text((x, y + 18), value, fill=color, font=font_med)

    draw.text((40, STAT_H - 25), "#IndoorCycling  #ERGMode", fill=(58, 58, 76), font=font_sm)

    return img


def generate_flythrough_video(
    *,
    route_id: str,
    samples: list[dict],
    metrics: dict,
    workout_name: str = "Indoor Ride",
    route_name: str | None = None,
    duration_sec: int = DURATION_SEC,
    fps: int = FPS,
) -> bytes | None:
    """Generate an animated 3D route flythrough MP4.

    Pre-renders one overview map tile (single network fetch), then crops/pans
    across it per frame for the camera tracking effect.

    Returns MP4 bytes, or None if the route has no GPS coordinates.
    """
    coords = ROUTE_GPS.get(route_id)
    if not coords or len(coords) < 2:
        return None

    power = [float(s.get("power") or 0) for s in samples]
    total_frames = duration_sec * fps

    # Step 1: Render the overview map (single tile-fetch)
    overview, center_lng, center_lat, zoom = _render_overview(coords)

    # Step 2: Stitch frames into MP4
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        out_path = tmp.name

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
        progress = i / max(1, total_frames - 1)

        # Map frame (crop from overview — fast, no network)
        map_img = _render_frame(overview, center_lng, center_lat, zoom, coords, progress)

        # Stats strip
        stats_img = _render_stats_strip(progress, metrics, workout_name, route_name, power)

        # Composite
        frame = Image.new("RGB", (FRAME_W, FRAME_H), BG_COLOR)
        frame.paste(map_img, (0, 0))
        frame.paste(stats_img.convert("RGB"), (0, MAP_DISPLAY_H))

        buf = io.BytesIO()
        frame.save(buf, format="PNG")
        proc.stdin.write(buf.getvalue())

    proc.stdin.close()
    proc.wait(timeout=180)

    with open(out_path, "rb") as f:
        mp4_bytes = f.read()

    try:
        os.unlink(out_path)
    except OSError:
        pass

    return mp4_bytes
