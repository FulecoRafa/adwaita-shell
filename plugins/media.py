"""media: the active MPRIS player, through playerctl.

topic  player  {"identity", "title", "artist", "album", "art", "playing",
                "position": s, "length": s} | null
call   play_pause · next · previous

Metadata follows `playerctl --follow`; the position is re-read every second
while playing (MPRIS does not announce it).
"""

import asyncio
from urllib.parse import unquote, urlparse

from common import follow, run
from marathon_service import Service

svc = Service("media")
player = svc.topic("player", None)

FIELDS = ["playerName", "status", "title", "artist", "album", "mpris:artUrl", "mpris:length"]
FORMAT = "\t".join("{{" + f + "}}" for f in FIELDS)


def art_source(url: str) -> str:
    """Only local covers can be shown; http(s) ones are skipped."""
    u = urlparse(url)
    return f"file:{unquote(u.path)}" if u.scheme == "file" else ""


def on_line(line: str) -> None:
    parts = line.split("\t")
    if len(parts) != len(FIELDS) or not parts[0]:
        player.publish(None)
        return
    name, status, title, artist, album, art, length = parts
    old = player.value or {}
    player.publish({
        "identity": name,
        "title": title,
        "artist": artist,
        "album": album,
        "art": art_source(art),
        "playing": status == "Playing",
        "position": old.get("position", 0) if old.get("title") == title else 0,
        "length": int(length or 0) / 1_000_000,
    })


async def positions():
    while True:
        await asyncio.sleep(1)
        p = player.value
        if not p or not p["playing"]:
            continue
        out = (await run("playerctl", "position")).strip()
        if out:
            player.publish({**p, "position": round(float(out))})


def control(cmd: str):
    async def call(_args):
        await run("playerctl", cmd)
    return call


svc.method("play_pause")(control("play-pause"))
svc.method("next")(control("next"))
svc.method("previous")(control("previous"))

svc.run(follow(["playerctl", "--follow", "metadata", "--format", FORMAT], on_line), positions())
