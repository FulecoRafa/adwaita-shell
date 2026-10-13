"""network: wifi, wired and bluetooth state, from nmcli and bluetoothctl.

topic  state  {"online", "wired", "wifiEnabled", "strength": 0..1, "ssid",
               "bluetooth": {"present", "enabled", "connected": [names]}} | null

Read every 10 s, and right away when `nmcli monitor` reports a change.
"""

import asyncio

from common import follow, poll, run
from marathon_service import Service

svc = Service("network")
state = svc.topic("state", None)
wake = asyncio.Event()


def fields(line: str) -> list[str]:
    """nmcli -t escapes ':' inside values as '\\:'."""
    out, cur, esc = [], "", False
    for c in line:
        if esc:
            cur += c
            esc = False
        elif c == "\\":
            esc = True
        elif c == ":":
            out.append(cur)
            cur = ""
        else:
            cur += c
    out.append(cur)
    return out


async def bluetooth():
    show = await run("bluetoothctl", "show")
    if not show:
        return {"present": False, "enabled": False, "connected": []}
    enabled = "Powered: yes" in show
    connected = []
    if enabled:
        for line in (await run("bluetoothctl", "devices", "Connected")).splitlines():
            parts = line.split(" ", 2)
            if len(parts) == 3 and parts[0] == "Device":
                connected.append(parts[2])
    return {"present": True, "enabled": enabled, "connected": connected}


async def read():
    devices = [fields(l) for l in (await run("nmcli", "-t", "-f", "TYPE,STATE", "device")).splitlines()]
    wired = any(d[0] == "ethernet" and d[1] == "connected" for d in devices if len(d) >= 2)
    wifi_on = (await run("nmcli", "radio", "wifi")).strip() == "enabled"
    ssid, strength = "", 0.0
    for line in (await run("nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi", "list", "--rescan", "no")).splitlines():
        f = fields(line)
        if len(f) >= 3 and f[0] == "yes":
            ssid, strength = f[1], int(f[2] or 0) / 100
            break
    state.publish({
        "online": wired or bool(ssid),
        "wired": wired,
        "wifiEnabled": wifi_on,
        "strength": strength,
        "ssid": ssid,
        "bluetooth": await bluetooth(),
    })


svc.run(poll(read, 10.0, wake), follow(["nmcli", "monitor"], lambda _line: wake.set()))
