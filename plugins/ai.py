"""ai: Claude Code and Codex quota windows, from `ai-usage show` every 5 min.

topic  state  {"claude": Quota, "codex": Quota, "updatedAt": epoch s} | null
       Quota = {"percent": 0..100 | -1, "resetsAt": epoch s | null}
call   refresh
"""

import asyncio
import json
from datetime import datetime

from common import poll, run
from marathon_service import Service

svc = Service("ai")
state = svc.topic("state", None)
wake = asyncio.Event()


def epoch(raw):
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    try:
        return int(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def quota(limit) -> dict:
    if not isinstance(limit, dict) or not isinstance(limit.get("usedPercent"), (int, float)):
        return {"percent": -1, "resetsAt": None}
    return {"percent": max(0.0, min(100.0, float(limit["usedPercent"]))), "resetsAt": epoch(limit.get("resetsAt"))}


async def read():
    out = await run("ai-usage", "show", timeout=30)
    if not out:
        return
    data = json.loads(out)
    claude, codex = data.get("claude") or {}, data.get("codex") or {}
    state.publish({
        "claude": quota((claude.get("limits") or {}).get("five_hour")),
        "codex": quota(codex.get("primary")),
        "updatedAt": max(claude.get("updatedAt") or 0, codex.get("updatedAt") or 0),
    })


@svc.method("refresh")
def refresh(_args):
    wake.set()


svc.run(poll(read, 300.0, wake))
