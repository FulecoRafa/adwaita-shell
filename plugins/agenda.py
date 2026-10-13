"""agenda: calcure events (~/.config/calcure/events.csv).

topic  events  [{"date": "2026-10-12", "time": "15:00" | "", "title", "status"}]

A time at the start of the name ("15:00 revisão") becomes the event's time.
Re-read when the file changes (checked every 5 s).
"""

import re
from pathlib import Path

from common import poll
from marathon_service import Service

FILE = Path.home() / ".config" / "calcure" / "events.csv"
LINE = re.compile(r'^(\d+),(\d+),(\d+),(\d+),"((?:[^"]|"")*)",(\d+),(\w+),(\w+)')
TIMED = re.compile(r"^(\d{1,2}[:h]\d{2})\s*[-–—·]?\s*(.*)$")

svc = Service("agenda")
events = svc.topic("events", [])
seen = {"mtime": None}


def parse(line: str):
    m = LINE.match(line)
    if not m:
        return None
    name = m.group(5).replace('""', '"')
    t = TIMED.match(name)
    return {
        "date": f"{int(m.group(2)):04d}-{int(m.group(3)):02d}-{int(m.group(4)):02d}",
        "time": t.group(1).replace("h", ":").rjust(5, "0") if t else "",
        "title": t.group(2) if t else name,
        "status": m.group(8),
    }


async def read():
    mtime = FILE.stat().st_mtime if FILE.exists() else None
    if mtime == seen["mtime"]:
        return
    seen["mtime"] = mtime
    lines = FILE.read_text().splitlines() if mtime else []
    events.publish(sorted((e for e in map(parse, lines) if e), key=lambda e: (e["date"], e["time"])))


svc.run(poll(read, 5.0))
