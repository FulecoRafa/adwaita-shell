"""media: the active MPRIS player, through playerctl.

topic  player   {"instance", "identity", "title", "artist", "album", "art",
                 "playing", "position": s, "length": s, "rate", "at": ms} | null
topic  players  [{"instance", "identity", "playing"}]
call   play_pause · next · previous · seek {position: s} · choose {instance}

With several players it shows the one that started playing last, like the
reference; `choose` pins one until another starts playing or it goes away. Metadata follows `playerctl --all-players --follow`; the position
is re-read every second while playing (MPRIS does not announce it) and right
after a track change or a seek. `at` is when `position` was read (ms since the epoch): with `rate`
(1 at normal speed) the UI advances the position by itself between reports.

`art` is an image source the renderer may show, "" until there is one. Every
`mpris:artUrl` (local files, Chromium's extension-less temp files, http(s)
and data: URLs) is copied to ~/.cache/tessela/adwaita-shell/art/, named by
its content with the extension of its real format.
"""

import asyncio
import base64
import hashlib
import os
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urlparse

from common import follow, run
from marathon_service import Service

svc = Service("media")
player = svc.topic("player", None)
everyone = svc.topic("players", [])

FIELDS = ["playerInstance", "playerName", "status", "title", "artist", "album", "mpris:artUrl", "mpris:length"]
FORMAT = "\t".join("{{" + f + "}}" for f in FIELDS)

CACHE = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "tessela" / "adwaita-shell" / "art"
MAX_BYTES = 8 << 20
KEEP = 64

# The instance the topic describes (`-p` for every command).
instance = ""
# Last metadata line of every player, and who started playing last.
players: dict[str, list[str]] = {}
recent: list[str] = []
# Chosen by hand ("" = automatic).
pinned = ""
# artUrl → image source, "" when it cannot be shown.
covers: dict[str, str] = {}


# ---------------------------------------------------------------- covers

def sniff(data: bytes) -> str:
    """Extension of an image by its first bytes, "" if not one we draw."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"BM"):
        return "bmp"
    return ""


def read_url(url: str) -> bytes:
    """The bytes behind an artUrl (blocking; runs in a thread)."""
    u = urlparse(url)
    if u.scheme == "file":
        path = Path(unquote(u.path))
        if not path.is_file() or path.stat().st_size > MAX_BYTES:
            return b""
        return path.read_bytes()
    if u.scheme in ("http", "https"):
        req = urllib.request.Request(url, headers={"User-Agent": "adwaita-shell"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read(MAX_BYTES + 1)[:MAX_BYTES]
    if u.scheme == "data" and ";base64," in url:
        return base64.b64decode(url.split(";base64,", 1)[1])[:MAX_BYTES]
    return b""


def store(data: bytes) -> str:
    """Save a cover under its content hash; its image source, or ""."""
    ext = sniff(data)
    if not ext:
        return ""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{hashlib.sha1(data).hexdigest()[:20]}.{ext}"
    if not path.exists():
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    os.utime(path)
    old = sorted(CACHE.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)[KEEP:]
    for p in old:
        p.unlink(missing_ok=True)
    return f"file:{path}"


def cover_key(url: str) -> str:
    """Local files can be rewritten in place (Chromium reuses temp names)."""
    u = urlparse(url)
    if u.scheme == "file":
        try:
            st = Path(unquote(u.path)).stat()
            return f"{url}@{st.st_mtime_ns}:{st.st_size}"
        except OSError:
            return url
    return url


async def resolve_cover(url: str) -> None:
    key = cover_key(url)
    if key in covers:
        return
    try:
        data = await asyncio.to_thread(read_url, url)
        covers[key] = await asyncio.to_thread(store, data) if data else ""
    except Exception as e:  # a dead link only costs the picture
        print(f"cover {url[:80]}: {e}", file=sys.stderr)
        covers[key] = ""
    p = player.value
    if p and p.get("artUrl") == url:
        player.publish({**p, "art": covers[key]})


# ---------------------------------------------------------------- player

def ctl(*args: str) -> list[str]:
    return ["playerctl", *(["-p", instance] if instance else []), *args]


async def read_rate() -> float:
    out = await run("busctl", "--user", "get-property", f"org.mpris.MediaPlayer2.{instance}",
                    "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "Rate")
    try:
        return float(out.split()[1])
    except (IndexError, ValueError):
        return 1.0


async def refresh_position() -> None:
    p = player.value
    if not p:
        return
    out = (await run(*ctl("position"))).strip()
    at = time.time() * 1000
    p = player.value
    if out and p:
        player.publish({**p, "position": round(float(out), 3), "at": round(at)})


async def refresh_rate() -> None:
    rate = await read_rate()
    p = player.value
    if p and p.get("rate") != rate:
        player.publish({**p, "rate": rate})


def track(inst: str, parts: list[str]) -> dict:
    """The topic value for a player's metadata line."""
    _, name, status, title, artist, album, art, length = parts
    old = player.value if instance == inst and player.value else {}
    same = old.get("title") == title
    now = round(time.time() * 1000)
    return {
        "instance": inst,
        "identity": name,
        "title": title,
        "artist": artist,
        "album": album,
        "art": covers.get(cover_key(art), old.get("art", "") if old.get("artUrl") == art else ""),
        "artUrl": art,
        "playing": status == "Playing",
        "position": old.get("position", 0) if same else 0,
        "at": old.get("at", now) if same else now,
        "rate": old.get("rate", 1.0) if same else 1.0,
        "length": int(length or 0) / 1_000_000,
    }


def current() -> str:
    """The player to show: the last one that started playing and still
    plays, else the last that played, else any."""
    if pinned in players:
        return pinned
    order = [i for i in recent if i in players] + [i for i in players if i not in recent]
    playing = [i for i in order if players[i][2] == "Playing"]
    return (playing or order or [""])[0]


def show() -> None:
    global instance
    listed = [{"instance": i, "identity": p[1], "playing": p[2] == "Playing"} for i, p in sorted(players.items())]
    if everyone.value != listed:
        everyone.publish(listed)
    inst = current()
    if not inst:
        instance = ""
        if player.value is not None:
            player.publish(None)
        return
    value = track(inst, players[inst])
    switched = inst != instance
    instance = inst
    if value == player.value:
        return
    player.publish(value)
    loop = asyncio.get_running_loop()
    if value["artUrl"]:
        loop.create_task(resolve_cover(value["artUrl"]))
    loop.create_task(refresh_position())
    if switched:
        loop.create_task(refresh_rate())


def update(parts: list[str]) -> None:
    """Take a player's metadata line; a player that starts playing goes first."""
    global pinned
    inst, status = parts[0], parts[2]
    was = players.get(inst)
    players[inst] = parts
    if status == "Playing" and (was is None or was[2] != "Playing"):
        recent[:] = [inst] + [i for i in recent if i != inst]
        # Another player started: the choice by hand no longer holds.
        if pinned != inst:
            pinned = ""


def on_line(line: str) -> None:
    parts = line.split("\t")
    if len(parts) != len(FIELDS) or not parts[0]:
        # A player went away (its line is empty): ask who is left.
        asyncio.get_running_loop().create_task(scan())
        return
    update(parts)
    show()


async def scan() -> None:
    """Every player's metadata. `--follow` reports one player at a time, so
    the others (and the ones that went away) come from here."""
    global pinned
    out = await run("playerctl", "--all-players", "metadata", "--format", FORMAT)
    lines = [l.split("\t") for l in out.splitlines()]
    lines = [p for p in lines if len(p) == len(FIELDS) and p[0]]
    alive = {p[0] for p in lines}
    for inst in [i for i in players if i not in alive]:
        del players[inst]
    recent[:] = [i for i in recent if i in alive]
    if pinned not in alive:
        pinned = ""
    for p in lines:
        update(p)
    show()


async def positions():
    tick = 0
    while True:
        await asyncio.sleep(1)
        tick += 1
        if tick % 5 == 1:
            await scan()
        p = player.value
        if p and p["playing"]:
            await refresh_position()


def control(cmd: str):
    async def call(_args):
        await run(*ctl(cmd))
    return call


@svc.method("seek")
async def seek(args):
    p = player.value
    if not p:
        return
    position = max(0.0, min(float(args["position"]), p.get("length") or float(args["position"])))
    await run(*ctl("position", f"{position:.3f}"))
    await refresh_position()


@svc.method("choose")
def choose(args):
    global pinned
    if args["instance"] in players:
        pinned = args["instance"]
        show()


svc.method("play_pause")(control("play-pause"))
svc.method("next")(control("next"))
svc.method("previous")(control("previous"))

svc.run(follow(["playerctl", "--all-players", "--follow", "metadata", "--format", FORMAT], on_line), positions())
