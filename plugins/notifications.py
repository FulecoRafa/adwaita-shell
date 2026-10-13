"""notifications: how many notifications arrived, and do-not-disturb.

The desktop's own shell owns org.freedesktop.Notifications, so this plugin
watches the bus instead of serving it: it counts Notify calls since it
started, minus NotificationClosed signals. Notifications sent before it
started are not counted.

topic  state  {"count": n, "dnd": bool}
call   clear
call   toggle_dnd
"""

from common import follow
from marathon_service import Service

svc = Service("notifications")
state = svc.topic("state", {"count": 0, "dnd": False})

MATCHES = [
    "type='method_call',interface='org.freedesktop.Notifications',member='Notify'",
    "type='signal',interface='org.freedesktop.Notifications',member='NotificationClosed'",
]


def on_line(line: str) -> None:
    s = dict(state.value)
    if line.startswith("method call") and "member=Notify" in line:
        s["count"] += 1
    elif line.startswith("signal") and "member=NotificationClosed" in line:
        s["count"] = max(0, s["count"] - 1)
    else:
        return
    state.publish(s)


@svc.method("clear")
def clear(_args):
    state.publish({**state.value, "count": 0})


@svc.method("toggle_dnd")
def toggle_dnd(_args):
    state.publish({**state.value, "dnd": not state.value["dnd"]})


svc.run(follow(["dbus-monitor", "--session", *MATCHES], on_line))
