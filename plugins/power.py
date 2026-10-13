"""power: the power-profiles-daemon profile, and caffeine (no idle suspend).

topic  profile   "power-saver" | "balanced" | "performance" | null
topic  caffeine  {"on": bool, "until": epoch ms (0 = no end), "minutes": n}
call   set       {"profile": ...}
call   caffeine  {"minutes": n}   on for n minutes; 0 = until turned off
call   caffeine_off

Caffeine holds a systemd idle inhibitor (`systemd-inhibit --what=idle`),
which hypridle honors, like the reference's idle inhibitor on the bar.
"""

import asyncio
import time

from common import poll, run
from marathon_service import Service

PROFILES = ("power-saver", "balanced", "performance")
svc = Service("power")
profile = svc.topic("profile", None)
caffeine = svc.topic("caffeine", {"on": False, "until": 0, "minutes": 0})
wake = asyncio.Event()
inhibitor: asyncio.subprocess.Process | None = None


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


async def release():
    global inhibitor
    if inhibitor is not None and inhibitor.returncode is None:
        inhibitor.terminate()
        await inhibitor.wait()
    inhibitor = None


@svc.method("caffeine")
async def caffeine_on(args):
    global inhibitor
    minutes = max(0, int((args or {}).get("minutes", 0)))
    await release()
    inhibitor = await asyncio.create_subprocess_exec(
        "systemd-inhibit", "--what=idle", "--who=adwaita-shell", "--why=cafeína", "--mode=block",
        "sleep", str(minutes * 60) if minutes else "infinity",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    until = int(time.time() * 1000) + minutes * 60000 if minutes else 0
    caffeine.publish({"on": True, "until": until, "minutes": minutes})


@svc.method("caffeine_off")
async def caffeine_off(_args):
    await release()
    caffeine.publish({"on": False, "until": 0, "minutes": 0})


async def watch_caffeine():
    """The timed inhibitor ends by itself; reflect that."""
    while True:
        await asyncio.sleep(2)
        if caffeine.value["on"] and (inhibitor is None or inhibitor.returncode is not None):
            caffeine.publish({"on": False, "until": 0, "minutes": 0})


svc.run(poll(read, 5.0, wake), watch_caffeine())
