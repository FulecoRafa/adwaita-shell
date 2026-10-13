"""notifications: the notification history and do-not-disturb.

The desktop's own shell owns org.freedesktop.Notifications, so this plugin
watches the bus instead of serving it (`busctl monitor`): each Notify call
and the id its reply carries make an entry; NotificationClosed removes it.
Dismissing asks the server to close the notification, so it goes away there
too. Actions cannot be invoked from outside the server, so they are not
offered. The history is kept in $XDG_STATE_HOME/adwaita-shell, so restarting
the plugin keeps it.

topic  state  {"count": n, "dnd": bool}
topic  list   [{"id", "app", "summary", "body", "icon", "urgency": 0|1|2, "time": epoch s}]
              newest first; `body` is plain text (markup removed)
call   dismiss     {"id"}
call   clear
call   toggle_dnd
call   set_dnd     {"on": bool}
"""

import html
import json
import os
import re
import sys
import time
from pathlib import Path

from common import follow, run
from marathon_service import Service

KEEP = 50
IFACE = "org.freedesktop.Notifications"
STORE = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "adwaita-shell" / "notifications.json"

svc = Service("notifications")
state = svc.topic("state", {"count": 0, "dnd": False})
history = svc.topic("list", [])
# Notify calls waiting for their reply: (sender, cookie) -> entry without id.
pending: dict[tuple[str, int], dict] = {}


def load():
    try:
        saved = json.loads(STORE.read_text())
        history.publish(saved.get("list", [])[:KEEP])
        state.publish({"count": len(history.value), "dnd": bool(saved.get("dnd"))})
    except (OSError, ValueError):
        pass


def save():
    try:
        STORE.parent.mkdir(parents=True, exist_ok=True)
        STORE.write_text(json.dumps({"list": history.value, "dnd": state.value["dnd"]}))
    except OSError as e:
        print(f"cannot save {STORE}: {e}", file=sys.stderr)


def publish(items: list[dict]):
    history.publish(items[:KEEP])
    state.publish({**state.value, "count": len(history.value)})
    save()


def plain(body: str) -> str:
    """The spec's markup (b, i, u, a, img, br) as plain text."""
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    body = re.sub(r"<[^>]+>", "", body)
    return html.unescape(body).strip()


def hint(hints: dict, key: str):
    v = hints.get(key)
    return v.get("data") if isinstance(v, dict) else None


def on_line(line: str) -> None:
    try:
        msg = json.loads(line)
    except ValueError:
        return
    kind, data = msg.get("type"), (msg.get("payload") or {}).get("data") or []
    if kind == "method_call" and msg.get("member") == "Notify" and len(data) >= 8:
        app, replaces, icon, summary, body, _actions, hints, _timeout = data[:8]
        image = hint(hints, "image-path") or hint(hints, "image_path") or ""
        pending[(msg.get("sender", ""), msg.get("cookie", 0))] = {
            "replaces": replaces,
            "app": app,
            "summary": summary,
            "body": plain(body),
            "icon": icon or (image if not str(image).startswith("file://") else "") or hint(hints, "desktop-entry") or "",
            "urgency": hint(hints, "urgency") or 1,
            "time": int(time.time()),
        }
    elif kind == "method_return":
        entry = pending.pop((msg.get("destination", ""), msg.get("reply_cookie", 0)), None)
        if entry is None or not data:
            return
        entry["id"] = data[0]
        replaces = entry.pop("replaces")
        items = [n for n in history.value if n["id"] not in (entry["id"], replaces)]
        publish([entry, *items])
    elif kind == "signal" and msg.get("member") == "NotificationClosed" and data:
        if any(n["id"] == data[0] for n in history.value):
            publish([n for n in history.value if n["id"] != data[0]])
    # A sender that never gets a reply (it died) must not pile up.
    while len(pending) > 64:
        pending.pop(next(iter(pending)))


async def close(nid: int):
    await run("busctl", "--user", "call", IFACE, "/org/freedesktop/Notifications", IFACE, "CloseNotification", "u", str(int(nid)))


@svc.method("dismiss")
async def dismiss(args):
    nid = int((args or {})["id"])
    publish([n for n in history.value if n["id"] != nid])
    await close(nid)


@svc.method("clear")
async def clear(_args):
    ids = [n["id"] for n in history.value]
    publish([])
    for nid in ids:
        await close(nid)


@svc.method("toggle_dnd")
def toggle_dnd(_args):
    state.publish({**state.value, "dnd": not state.value["dnd"]})
    save()


@svc.method("set_dnd")
def set_dnd(args):
    state.publish({**state.value, "dnd": bool((args or {}).get("on"))})
    save()


load()
svc.run(follow([
    "busctl", "--user", "monitor", "--json=short",
    "--match", f"type=method_call,interface={IFACE},member=Notify",
    "--match", f"type=method_return,sender={IFACE}",
    "--match", f"type=signal,interface={IFACE},member=NotificationClosed",
], on_line))
