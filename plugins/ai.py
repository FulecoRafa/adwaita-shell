"""ai: Claude Code and Codex quota windows, from `ai-usage show` every 5 min.

topic  state  {"claude": Quota, "codex": Quota, "updatedAt": epoch s} | null
       Quota = {"percent": 0..100 | -1, "resetsAt": epoch s | null}
       (the session windows, for the bar's chip)
topic  details  {"claude": Provider, "codex": Provider, "updatedAt": epoch s,
                 "history": {"claude": [7 daily peaks, oldest first], "codex": [...]}} | null
       Provider = {"available": bool, "model", "plan", "stale": bool,
                   "limits": [{"key", "percent", "resetsAt"}]}
       claude keys: session, week, opus, sonnet; codex keys: session, week
call   refresh

The daily peak of each session window is kept for 14 days in
$XDG_STATE_HOME/adwaita-shell/ai-history.json, seeded from the reference
shell's state file the first time.
"""

import asyncio
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

from common import poll, run
from marathon_service import Service

STATE = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state")
STORE = STATE / "adwaita-shell" / "ai-history.json"
REFERENCE = STATE / "fuleco-shell" / "state.json"

svc = Service("ai")
state = svc.topic("state", None)
details = svc.topic("details", None)
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


def load_history() -> dict:
    for path in (STORE, REFERENCE):
        try:
            data = json.loads(path.read_text())
            return data.get("aiHistory", data) if path == REFERENCE else data
        except (OSError, ValueError):
            continue
    return {}


history = load_history()


def record(name: str, percent: float):
    """Keep the day's peak; drop days older than 14."""
    if percent < 0:
        return
    today = date.today().isoformat()
    days = history.setdefault(name, {})
    if days.get(today, -1) >= percent:
        return
    days[today] = percent
    for old in sorted(days)[:-14]:
        del days[old]
    try:
        STORE.parent.mkdir(parents=True, exist_ok=True)
        STORE.write_text(json.dumps(history))
    except OSError:
        pass


def week(name: str) -> list[float]:
    days = history.get(name, {})
    return [days.get((date.today() - timedelta(days=i)).isoformat(), 0) for i in range(6, -1, -1)]


def limits(pairs) -> list[dict]:
    return [{"key": key, **quota(raw)} for key, raw in pairs if isinstance(raw, dict)]


async def read():
    out = await run("ai-usage", "show", timeout=30)
    if not out:
        return
    data = json.loads(out)
    claude, codex = data.get("claude") or {}, data.get("codex") or {}
    cl, cx = claude.get("limits") or {}, codex
    session = {"claude": quota(cl.get("five_hour")), "codex": quota(cx.get("primary"))}
    updated = max(claude.get("updatedAt") or 0, codex.get("updatedAt") or 0)
    for name, q in session.items():
        record(name, q["percent"])
    state.publish({**session, "updatedAt": updated})
    details.publish({
        "claude": {
            "available": claude.get("available") is True,
            "model": str(claude.get("model") or "").lower(),
            "plan": "",
            "stale": bool(claude.get("stale")),
            "limits": limits([("session", cl.get("five_hour")), ("week", cl.get("seven_day")),
                              ("opus", cl.get("seven_day_opus")), ("sonnet", cl.get("seven_day_sonnet"))]),
        },
        "codex": {
            "available": codex.get("available") is True,
            "model": "",
            "plan": str(codex.get("planType") or "").lower(),
            "stale": bool(codex.get("stale")),
            "limits": limits([("session", cx.get("primary")), ("week", cx.get("secondary"))]),
        },
        "updatedAt": updated,
        "history": {"claude": week("claude"), "codex": week("codex")},
    })


@svc.method("refresh")
def refresh(_args):
    wake.set()


svc.run(poll(read, 300.0, wake))
