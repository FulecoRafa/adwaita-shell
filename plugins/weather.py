"""weather: current conditions and the next hours, from wttr.in every 30 min.

topic  state  {"place", "temperature", "feelsLike", "description", "icon",
               "color", "hours": [{"hour", "temperature", "icon", "color", "rain"}]} | null

The last answer is cached in ~/.cache/adwaita-shell/weather.json, so the card
starts filled even offline.
"""

import asyncio
import json
import urllib.request
from datetime import datetime
from pathlib import Path

from common import poll
from marathon_service import Service

URL = "https://wttr.in/?format=j1&lang=pt"
CACHE = Path.home() / ".cache" / "adwaita-shell" / "weather.json"

svc = Service("weather")
state = svc.topic("state", None)

DESCRIPTIONS = {
    113: "céu limpo", 116: "parcialmente nublado", 119: "nublado", 122: "encoberto",
    143: "névoa", 248: "neblina", 260: "neblina", 176: "chuva isolada", 263: "garoa",
    266: "garoa", 293: "chuva fraca", 296: "chuva fraca", 299: "chuva", 302: "chuva",
    305: "chuva forte", 308: "chuva forte", 353: "pancadas de chuva", 356: "pancadas fortes",
    359: "temporal", 200: "trovoadas", 386: "chuva com trovões", 389: "tempestade",
    392: "neve com trovões", 395: "neve forte",
}
RAIN = {263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359, 176}


def icon_for(code: int, night: bool) -> str:
    if code == 113:
        return "moon-stars" if night else "sun"
    if code == 116:
        return "cloud-moon" if night else "cloud-sun"
    if code in (119, 122):
        return "cloud"
    if code in (143, 248, 260):
        return "cloud-fog"
    if code in (200, 386, 389, 392, 395):
        return "cloud-lightning"
    if 179 <= code <= 377 and code not in RAIN:
        return "cloud-snow"
    return "cloud-rain"


def color_for(icon: str) -> str:
    if icon in ("sun", "cloud-sun"):
        return "$yellow"
    if icon in ("moon-stars", "cloud-moon"):
        return "$purple"
    if icon in ("cloud-rain", "cloud-lightning", "cloud-snow"):
        return "$cyan"
    return "$textMuted"


def parse(data: dict):
    current = (data.get("current_condition") or [None])[0]
    if not current:
        return None
    hour = datetime.now().hour
    night = hour < 6 or hour >= 18
    code = int(current["weatherCode"])
    icon = icon_for(code, night)
    upcoming = []
    for day_index, day in enumerate((data.get("weather") or [])[:2]):
        for slot in day.get("hourly") or []:
            slot_hour = int(slot["time"]) // 100
            if day_index == 0 and slot_hour <= hour:
                continue
            slot_icon = icon_for(int(slot["weatherCode"]), slot_hour < 6 or slot_hour >= 18)
            upcoming.append({
                "hour": f"{slot_hour:02d}h",
                "temperature": int(slot["tempC"]),
                "icon": slot_icon,
                "color": color_for(slot_icon),
                "rain": int(slot["chanceofrain"]) / 100,
            })
    area = ((data.get("nearest_area") or [{}])[0].get("areaName") or [{}])[0].get("value", "")
    return {
        "place": area.lower(),
        "temperature": int(current["temp_C"]),
        "feelsLike": int(current["FeelsLikeC"]),
        "description": DESCRIPTIONS.get(code, ""),
        "icon": icon,
        "color": color_for(icon),
        "hours": upcoming[:3],
    }


def fetch() -> dict:
    with urllib.request.urlopen(URL, timeout=20) as r:
        data = json.load(r)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data))
    return data


async def read():
    if state.value is None and CACHE.exists():
        state.publish(parse(json.loads(CACHE.read_text())))
    data = await asyncio.to_thread(fetch)
    state.publish(parse(data))


svc.run(poll(read, 1800.0))
