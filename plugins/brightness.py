"""brightness: the screen backlight, read from sysfs, set with brightnessctl.

topic  state  {"value": 0..1} | null   (null: no backlight)
call   set    {"value": 0..1}          (at least 1 %, so the screen never goes black)
call   step   {"delta": -1..1}

sysfs does not announce changes: read every 2 s, and right after a set.
"""

import asyncio
import time
from pathlib import Path

from common import poll, run
from marathon_service import Service

svc = Service("brightness")
state = svc.topic("state", None)
wake = asyncio.Event()
# Right after a write sysfs may still report the old level.
last_set = 0.0


def device() -> Path | None:
    return next(iter(sorted(Path("/sys/class/backlight").glob("*"))), None)


async def read():
    d = device()
    if d is None:
        state.publish(None)
        return
    current, maximum = int((d / "brightness").read_text()), int((d / "max_brightness").read_text())
    if maximum > 0 and time.monotonic() - last_set > 1.5:
        state.publish({"value": round(current / maximum, 2)})


async def set_level(value: float):
    global last_set
    percent = round(max(0.01, min(1.0, value)) * 100)
    last_set = time.monotonic()
    state.publish({"value": percent / 100})
    await run("brightnessctl", "-q", "set", f"{percent}%")
    return percent / 100


@svc.method("set")
async def set_(args):
    return await set_level(float((args or {}).get("value", 0)))


@svc.method("step")
async def step(args):
    current = (state.value or {}).get("value", 0.0)
    return await set_level(round((current + float((args or {}).get("delta", 0))) * 20) / 20)


svc.run(poll(read, 2.0, wake))
