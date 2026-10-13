"""audio: default sink volume and mute, through PipeWire's wpctl.

topic  state   {"volume": 0..1, "muted": bool} | null
call   change  {"delta": -1..1}  (or {"event": {"delta": ±1}} from a scroll action, 5 % a step)
call   set     {"value": 0..1}
call   toggle_mute
"""

import asyncio
import re

from common import poll, run
from marathon_service import Service

SINK = "@DEFAULT_AUDIO_SINK@"
svc = Service("audio")
state = svc.topic("state", None)
wake = asyncio.Event()


def parse(out: str):
    m = re.search(r"Volume:\s*([\d.]+)", out)
    if not m:
        return None
    return {"volume": round(float(m.group(1)), 2), "muted": "[MUTED]" in out}


async def read():
    state.publish(parse(await run("wpctl", "get-volume", SINK)))


async def set_volume(value: float):
    value = max(0.0, min(1.0, value))
    await run("wpctl", "set-volume", SINK, f"{value:.2f}")
    wake.set()
    return value


@svc.method("change")
async def change(args):
    args = args or {}
    delta = args.get("delta")
    if delta is None:
        delta = 0.05 * (args.get("event") or {}).get("delta", 0)
    current = (state.value or {}).get("volume", 0.0)
    return await set_volume(current + float(delta))


@svc.method("set")
async def set_(args):
    return await set_volume(float((args or {}).get("value", 0)))


@svc.method("toggle_mute")
async def toggle_mute(_args):
    await run("wpctl", "set-mute", SINK, "toggle")
    wake.set()


svc.run(poll(read, 1.0, wake))
