#!/bin/sh
# adwaita-shell inside the Flatpak sandbox. Extra arguments go to
# `tessela run` (e.g. --dev, --devtools).
#
# PATH, in order:
#   /app/bin                 tessela
#   /app/lib/adwaita-shell/host-bin
#                            the tools the services and the power strip call;
#                            always the host's, even when the runtime has
#                            its own (they must match the host's daemons)
#   /usr/bin                 the runtime (sh, ...)
#   $shims                   every other command on the host's PATH, made at
#                            each start, so apps launched from the shell
#                            (desktop entries, pinned apps) and the services'
#                            optional ai-usage start on the host
set -eu

forward=/app/lib/adwaita-shell/host-command
shims=${XDG_RUNTIME_DIR:-/tmp}/app/${FLATPAK_ID:-io.github.fuleco.AdwaitaShell}/host-commands
rm -rf "$shims"
mkdir -p "$shims"
flatpak-spawn --host sh -c 'IFS=:; for d in $PATH; do [ -d "$d" ] && ls -1 "$d"; done' 2>/dev/null |
    sort -u |
    while IFS= read -r cmd; do
        case $cmd in '' | .* | */*) continue ;; esac
        command -v "$cmd" > /dev/null 2>&1 && continue
        ln -s "$forward" "$shims/$cmd"
    done
export PATH="/app/bin:/app/lib/adwaita-shell/host-bin:/usr/bin:$shims"

# Desktop entries and icons: the app's own, the user's and the host's.
# (host-os exposes the host's /usr under /run/host/usr.)
export XDG_DATA_DIRS="${XDG_DATA_DIRS:-/app/share:/usr/share}:$HOME/.local/share:$HOME/.local/share/flatpak/exports/share:/var/lib/flatpak/exports/share:/run/host/usr/local/share:/run/host/usr/share"

# Wayland: Flatpak unsets WAYLAND_DISPLAY when the app has no --socket=wayland
# (see the manifest for why it has none). ADWAITA_SHELL_WAYLAND_DISPLAY names
# the socket; otherwise the first of wayland-0, wayland-1 that was shared.
if [ -n "${ADWAITA_SHELL_WAYLAND_DISPLAY:-}" ]; then
    export WAYLAND_DISPLAY="$ADWAITA_SHELL_WAYLAND_DISPLAY"
else
    for d in wayland-0 wayland-1; do
        if [ -S "$XDG_RUNTIME_DIR/$d" ]; then
            export WAYLAND_DISPLAY="$d"
            break
        fi
    done
fi
case " $* " in
*" --headless "*) ;;
*)
    if [ ! -S "$XDG_RUNTIME_DIR/${WAYLAND_DISPLAY:-none}" ]; then
        echo "adwaita-shell: no Wayland socket shared with the sandbox (see README.md)" >&2
        exit 1
    fi
    ;;
esac

exec tessela run /app/share/adwaita-shell "$@"
