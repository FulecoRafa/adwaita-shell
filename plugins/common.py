"""Helpers shared by the plugins: run a command, poll, follow output lines."""

from __future__ import annotations

import asyncio
import sys
from typing import Any, Awaitable, Callable


async def run(*cmd: str, timeout: float = 5.0) -> str:
    """stdout of `cmd`, or "" if it fails or is missing."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
        return out.decode(errors="replace") if proc.returncode == 0 else ""
    except (OSError, asyncio.TimeoutError):
        return ""


async def poll(read: Callable[[], Awaitable[Any]], interval: float, wake: asyncio.Event | None = None) -> None:
    """Call `read` every `interval` seconds, or sooner when `wake` is set."""
    while True:
        try:
            await read()
        except Exception as e:  # keep serving; the next round may work
            print(f"read failed: {e}", file=sys.stderr)
        if wake is None:
            await asyncio.sleep(interval)
            continue
        try:
            await asyncio.wait_for(wake.wait(), interval)
        except asyncio.TimeoutError:
            pass
        wake.clear()


async def follow(cmd: list[str], on_line: Callable[[str], None], restart: float = 5.0) -> None:
    """Run a long-lived command and hand each output line to `on_line`."""
    while True:
        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
            )
            assert proc.stdout
            while line := await proc.stdout.readline():
                on_line(line.decode(errors="replace").rstrip("\n"))
            await proc.wait()
        except OSError as e:
            print(f"{cmd[0]}: {e}", file=sys.stderr)
        finally:
            # Cancelled (the plugin is stopping): do not leave it running.
            if proc and proc.returncode is None:
                proc.kill()
        await asyncio.sleep(restart)


async def run_status(*cmd: str, timeout: float = 30.0) -> tuple[bool, str]:
    """(succeeded, stdout or the error message) of `cmd`, for actions that report why they failed."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except (OSError, asyncio.TimeoutError) as e:
        return False, str(e) or "timeout"
    if proc.returncode == 0:
        return True, out.decode(errors="replace")
    return False, (err or out).decode(errors="replace").strip()
