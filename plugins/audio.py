"""audio: PipeWire volumes, devices and app streams, through wpctl and pw-dump.

topic  state    {"volume": 0..1, "muted": bool, "micVolume": 0..1, "micMuted": bool} | null
topic  devices  {"sinks": [Device], "sources": [Device], "streams": [Stream]}
                Device = {"id", "name", "headphones": bool, "default": bool}
                Stream = {"id", "app", "volume": 0..1}
call   change   {"delta": -1..1}  (or {"event": {"delta": ±1}} from a scroll action, 5 % a step)
call   set      {"value": 0..1}   (unmutes, like the reference)
call   toggle_mute
call   set_mic  {"value": 0..1}
call   toggle_mic_mute
call   set_default  {"id": node id}
call   set_stream   {"id": node id, "value": 0..1}

Volumes are wpctl's (cubic, as the mixer shows them). Devices whose every
route is unavailable (HDMI with nothing plugged, the headset mic without a
headset) are left out, like the reference.
"""

import asyncio
import json
import re

from common import poll, run
from marathon_service import Service

SINK = "@DEFAULT_AUDIO_SINK@"
SOURCE = "@DEFAULT_AUDIO_SOURCE@"
svc = Service("audio")
state = svc.topic("state", None)
devices = svc.topic("devices", {"sinks": [], "sources": [], "streams": []})
wake = asyncio.Event()
wake_devices = asyncio.Event()


def parse(out: str):
    m = re.search(r"Volume:\s*([\d.]+)", out)
    if not m:
        return None
    return round(float(m.group(1)), 2), "[MUTED]" in out


async def read():
    sink = parse(await run("wpctl", "get-volume", SINK))
    if sink is None:
        state.publish(None)
        return
    mic = parse(await run("wpctl", "get-volume", SOURCE)) or (0.0, False)
    state.publish({"volume": sink[0], "muted": sink[1], "micVolume": mic[0], "micMuted": mic[1]})


def unavailable(objects) -> set[str]:
    """Node names whose device routes are all unavailable."""
    off: set[str] = set()
    for o in objects:
        if o.get("type") != "PipeWire:Interface:Device":
            continue
        routes = (o.get("info") or {}).get("params", {}).get("EnumRoute") or []
        # A node may serve several routes (speaker and headphones): one
        # available route is enough for it to count.
        for r in routes:
            if r.get("available") == "no":
                off.update(f"{o['id']}:{d}" for d in r.get("devices") or [])
        for r in routes:
            if r.get("available") != "no":
                off.difference_update(f"{o['id']}:{d}" for d in r.get("devices") or [])
    names = set()
    for o in objects:
        props = (o.get("info") or {}).get("props") or {}
        if o.get("type") == "PipeWire:Interface:Node" and f"{props.get('device.id')}:{props.get('card.profile.device')}" in off:
            names.add(props.get("node.name"))
    return names


def volume(node) -> float:
    """Linear channel volumes to wpctl's cubic scale."""
    params = ((node.get("info") or {}).get("params") or {}).get("Props") or [{}]
    channels = params[0].get("channelVolumes") or [0.0]
    return round(max(channels) ** (1 / 3), 2)


async def read_devices():
    out = await run("pw-dump", timeout=5)
    if not out:
        return
    objects = json.loads(out)
    defaults = {}
    for o in objects:
        if o.get("type") == "PipeWire:Interface:Metadata" and (o.get("props") or {}).get("metadata.name") == "default":
            for entry in o.get("metadata") or []:
                value = entry.get("value")
                if isinstance(value, dict):
                    defaults[entry.get("key")] = value.get("name")
    off = unavailable(objects)
    sinks, sources, streams = [], [], []
    for o in objects:
        if o.get("type") != "PipeWire:Interface:Node":
            continue
        props = (o.get("info") or {}).get("props") or {}
        kind, name = props.get("media.class"), props.get("node.name", "")
        if kind == "Stream/Output/Audio":
            streams.append({"id": o["id"], "app": props.get("application.name") or props.get("node.description") or name or "app", "volume": volume(o)})
            continue
        if kind not in ("Audio/Sink", "Audio/Source") or re.search(r"monitor$|dummy|null-sink", name, re.I):
            continue
        is_sink = kind == "Audio/Sink"
        default = name == defaults.get("default.audio.sink" if is_sink else "default.audio.source")
        if name in off and not default:
            continue
        label = props.get("device.profile.description") or props.get("node.nick") or props.get("node.description") or name
        form = props.get("device.form-factor") or ""
        (sinks if is_sink else sources).append({
            "id": o["id"],
            "name": str(label).lower(),
            "headphones": "head" in form or "headphone" in name.lower(),
            "default": default,
        })
    devices.publish({"sinks": sinks, "sources": sources, "streams": streams})


async def set_volume(target: str, value: float):
    value = max(0.0, min(1.0, value))
    await run("wpctl", "set-volume", target, f"{value:.2f}")
    wake.set()
    return value


@svc.method("change")
async def change(args):
    args = args or {}
    delta = args.get("delta")
    if delta is None:
        delta = 0.05 * (args.get("event") or {}).get("delta", 0)
    current = (state.value or {}).get("volume", 0.0)
    return await set_volume(SINK, current + float(delta))


@svc.method("set")
async def set_(args):
    if (state.value or {}).get("muted"):
        await run("wpctl", "set-mute", SINK, "0")
    return await set_volume(SINK, float((args or {}).get("value", 0)))


@svc.method("toggle_mute")
async def toggle_mute(_args):
    await run("wpctl", "set-mute", SINK, "toggle")
    wake.set()


@svc.method("set_mic")
async def set_mic(args):
    return await set_volume(SOURCE, float((args or {}).get("value", 0)))


@svc.method("toggle_mic_mute")
async def toggle_mic_mute(_args):
    await run("wpctl", "set-mute", SOURCE, "toggle")
    wake.set()


@svc.method("set_default")
async def set_default(args):
    await run("wpctl", "set-default", str(int((args or {})["id"])))
    wake.set()
    wake_devices.set()


@svc.method("set_stream")
async def set_stream(args):
    args = args or {}
    value = await set_volume(str(int(args["id"])), float(args.get("value", 0)))
    wake_devices.set()
    return value


svc.run(poll(read, 1.0, wake), poll(read_devices, 4.0, wake_devices))
