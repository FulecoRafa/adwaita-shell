"""power: the power-profiles-daemon profile.

topic  profile  "power-saver" | "balanced" | "performance" | null
call   set      {"profile": ...}
"""

import asyncio

from common import poll, run
from marathon_service import Service

PROFILES = ("power-saver", "balanced", "performance")
svc = Service("power")
profile = svc.topic("profile", None)
wake = asyncio.Event()


async def read():
    out = (await run("powerprofilesctl", "get")).strip()
    profile.publish(out if out in PROFILES else None)


@svc.method("set")
async def set_(args):
    p = (args or {}).get("profile")
    if p not in PROFILES:
        raise ValueError(f"unknown profile {p!r}")
    await run("powerprofilesctl", "set", p)
    wake.set()
    return p


svc.run(poll(read, 5.0, wake))
