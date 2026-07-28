"""Weather endpoint — current temperature via Open-Meteo (keyless)."""
import asyncio
import json
import logging

from fastapi import APIRouter

router = APIRouter()


def _http_get_json(url: str):
    import urllib.request
    with urllib.request.urlopen(url, timeout=6) as r:
        return json.loads(r.read().decode())


@router.get("/weather")
async def get_weather(city: str = "", region: str = "", country: str = ""):
    """Current temperature for the rider's location via Open-Meteo (keyless)."""
    query = ", ".join([p for p in [city, region, country] if p]).strip()
    if not query:
        return {"available": False}
    try:
        import urllib.parse
        geo = await asyncio.to_thread(
            _http_get_json,
            f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(city or query)}&count=1&language=en&format=json",
        )
        res = (geo.get("results") or [None])[0]
        if not res:
            return {"available": False}
        lat, lon = res["latitude"], res["longitude"]
        place = res.get("name", city)
        wx = await asyncio.to_thread(
            _http_get_json,
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature",
        )
        cur = wx.get("current", {})
        return {
            "available": True,
            "temp_c": round(cur.get("temperature_2m", 0)),
            "feels_c": round(cur.get("apparent_temperature", cur.get("temperature_2m", 0))),
            "place": place,
        }
    except Exception:
        logging.warning("weather lookup failed")
        return {"available": False}
