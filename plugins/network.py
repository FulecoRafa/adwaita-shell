"""network: wifi, wired and bluetooth, from nmcli and bluetoothctl.

topic  state      {"online", "wired", "wifiEnabled", "strength": 0..1, "ssid", "ip",
                   "bluetooth": {"present", "enabled", "connected": [names]}} | null
topic  wifi       [{"ssid", "strength": 0..1, "security": "wpa2"|"wpa3"|"aberta"|...,
                    "secure", "connected", "known"}]  strongest first, the active one on top
topic  bluetooth  {"discovering": bool, "devices": [{"address", "name", "paired", "connected",
                    "trusted", "battery": 0..100 | -1}]}  paired first, then (while
                   discovering) named devices nearby
call   set_wifi       {"enabled": bool}
call   set_bluetooth  {"enabled": bool}
call   scan           rescan wifi networks
call   connect        {"ssid", "password"?}   -> error text on failure
call   disconnect     {"ssid"}
call   forget         {"ssid"}
call   discover       {"on": bool}             bluetooth discovery (stops by itself after 60 s)
call   bt             {"action": "connect"|"disconnect"|"pair"|"cancel"|"forget", "address"}

Read every 10 s, and right away when `nmcli monitor` reports a change or
after an action.
"""

import asyncio
import re

from common import follow, poll, run, run_status
from marathon_service import Service

svc = Service("network")
state = svc.topic("state", None)
wifi = svc.topic("wifi", [])
bt = svc.topic("bluetooth", {"discovering": False, "devices": []})
wake = asyncio.Event()
wake_bt = asyncio.Event()
discovery: asyncio.subprocess.Process | None = None


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


def security(raw: str) -> str:
    raw = raw.upper()
    if not raw or raw == "--":
        return "aberta"
    if "OWE" in raw:
        return "aberta · owe"
    if "802.1X" in raw:
        return "enterprise"
    if "SAE" in raw or "WPA3" in raw:
        return "wpa3"
    if "WPA2" in raw:
        return "wpa2"
    if "WPA" in raw:
        return "wpa"
    if "WEP" in raw:
        return "wep"
    return "protegida"


async def bluetooth_summary():
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


def device_lines(out: str) -> list[tuple[str, str]]:
    found = []
    for line in out.splitlines():
        parts = line.split(" ", 2)
        if len(parts) >= 2 and parts[0] == "Device":
            found.append((parts[1], parts[2] if len(parts) == 3 else ""))
    return found


async def read_bluetooth():
    if not (await run("bluetoothctl", "show")):
        bt.publish({"discovering": False, "devices": []})
        return
    devices = []
    paired = device_lines(await run("bluetoothctl", "devices", "Paired"))
    for address, name in paired:
        info = await run("bluetoothctl", "info", address)
        battery = re.search(r"Battery Percentage: \S+ \((\d+)\)", info)
        devices.append({
            "address": address,
            "name": name or address,
            "paired": True,
            "connected": "Connected: yes" in info,
            "trusted": "Trusted: yes" in info,
            "battery": int(battery.group(1)) if battery else -1,
        })
    scanning = discovery is not None and discovery.returncode is None
    if scanning:
        known = {a for a, _ in paired}
        for address, name in device_lines(await run("bluetoothctl", "devices")):
            # Unnamed devices show their address with dashes as the name.
            if address in known or not name or name.replace("-", ":") == address:
                continue
            devices.append({"address": address, "name": name, "paired": False, "connected": False, "trusted": False, "battery": -1})
    bt.publish({"discovering": scanning, "devices": devices})


async def read():
    devices = [fields(l) for l in (await run("nmcli", "-t", "-f", "DEVICE,TYPE,STATE", "device")).splitlines()]
    wired = any(d[1] == "ethernet" and d[2] == "connected" for d in devices if len(d) >= 3)
    iface = next((d[0] for d in devices if len(d) >= 3 and d[1] == "wifi"), "")
    wifi_on = (await run("nmcli", "radio", "wifi")).strip() == "enabled"
    known = {
        f[0] for f in map(fields, (await run("nmcli", "-t", "-f", "NAME,TYPE", "connection", "show")).splitlines())
        if len(f) >= 2 and f[1] == "802-11-wireless"
    }
    networks: dict[str, dict] = {}
    if wifi_on:
        for line in (await run("nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "no")).splitlines():
            f = fields(line)
            if len(f) < 4 or not f[1]:
                continue
            net = {
                "ssid": f[1],
                "strength": int(f[2] or 0) / 100,
                "security": security(f[3]),
                "secure": security(f[3]) not in ("aberta", "aberta · owe"),
                "connected": f[0] == "*",
                "known": f[1] in known,
            }
            # One row per name: the access point in use, else the strongest.
            old = networks.get(net["ssid"])
            if old is None or net["connected"] or (not old["connected"] and net["strength"] > old["strength"]):
                networks[net["ssid"]] = net
    listed = sorted(networks.values(), key=lambda n: (not n["connected"], -n["strength"]))
    wifi.publish(listed)
    active = next((n for n in listed if n["connected"]), None)
    ip = ""
    if iface and active:
        out = await run("ip", "-4", "-o", "addr", "show", "dev", iface)
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", out)
        ip = m.group(1) if m else ""
    state.publish({
        "online": wired or active is not None,
        "wired": wired,
        "wifiEnabled": wifi_on,
        "strength": active["strength"] if active else 0.0,
        "ssid": active["ssid"] if active else "",
        "ip": ip,
        "bluetooth": await bluetooth_summary(),
    })


def changed():
    wake.set()
    wake_bt.set()


@svc.method("set_wifi")
async def set_wifi(args):
    await run("nmcli", "radio", "wifi", "on" if (args or {}).get("enabled") else "off")
    changed()


@svc.method("set_bluetooth")
async def set_bluetooth(args):
    await run("bluetoothctl", "power", "on" if (args or {}).get("enabled") else "off")
    changed()


@svc.method("scan")
async def scan(_args):
    await run("nmcli", "device", "wifi", "rescan", timeout=15)
    wake.set()


@svc.method("connect")
async def connect(args):
    args = args or {}
    ssid, password = str(args["ssid"]), args.get("password")
    known = any(n["ssid"] == ssid and n["known"] for n in wifi.value)
    if known and not password:
        ok, out = await run_status("nmcli", "connection", "up", "id", ssid, timeout=45)
    elif password:
        ok, out = await run_status("nmcli", "device", "wifi", "connect", ssid, "password", str(password), timeout=45)
    else:
        ok, out = await run_status("nmcli", "device", "wifi", "connect", ssid, timeout=45)
    changed()
    if ok:
        return ""
    if re.search(r"secrets|password|802-1x|psk", out, re.I):
        return "senha incorreta"
    if re.search(r"not found|no network", out, re.I):
        return "rede fora de alcance"
    if re.search(r"timeout", out, re.I):
        return "tempo esgotado na autenticação"
    return "não foi possível conectar"


@svc.method("disconnect")
async def disconnect(args):
    await run("nmcli", "connection", "down", "id", str((args or {})["ssid"]))
    changed()


@svc.method("forget")
async def forget(args):
    await run("nmcli", "connection", "delete", "id", str((args or {})["ssid"]))
    changed()


@svc.method("discover")
async def discover(args):
    global discovery
    on = bool((args or {}).get("on"))
    if discovery is not None and discovery.returncode is None:
        discovery.kill()
        await discovery.wait()
        discovery = None
    if on:
        discovery = await asyncio.create_subprocess_exec(
            "bluetoothctl", "--timeout", "60", "scan", "on",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
    wake_bt.set()


@svc.method("bt")
async def bt_action(args):
    args = args or {}
    action, address = args.get("action"), str(args.get("address", ""))
    if not re.fullmatch(r"[0-9A-F]{2}(:[0-9A-F]{2}){5}", address, re.I):
        raise ValueError(f"bad address {address!r}")
    command = {"connect": "connect", "disconnect": "disconnect", "pair": "pair", "cancel": "cancel-pairing", "forget": "remove"}.get(action)
    if not command:
        raise ValueError(f"unknown action {action!r}")
    if action == "pair":
        # Trusted, so it reconnects by itself later.
        ok, out = await run_status("bluetoothctl", "--timeout", "30", "pair", address, timeout=40)
        if ok:
            await run("bluetoothctl", "trust", address)
            await run("bluetoothctl", "connect", address, timeout=20)
    else:
        ok, out = await run_status("bluetoothctl", command, address, timeout=20)
    changed()
    return "" if ok else out.splitlines()[-1] if out else "falhou"


async def watch_discovery():
    """Publish when discovery ends by its own timeout."""
    while True:
        await asyncio.sleep(2)
        if discovery is not None and discovery.returncode is not None and bt.value.get("discovering"):
            wake_bt.set()
        elif discovery is not None and discovery.returncode is None:
            wake_bt.set()  # new devices show up while it runs


svc.run(
    poll(read, 10.0, wake),
    poll(read_bluetooth, 10.0, wake_bt),
    follow(["nmcli", "monitor"], lambda _line: wake.set()),
    watch_discovery(),
)
