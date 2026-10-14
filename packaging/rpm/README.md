# RPM (Fedora)

`adwaita-shell.spec` builds a noarch package with no build step:

| path | what |
|---|---|
| `/usr/share/adwaita-shell/` | the project: `tessela.toml`, `src/`, `kit/`, `assets/`, `types/`, `plugins/*.py` (byte-compiled at build time, so a read-only install never makes Python write `__pycache__`) |
| `/usr/bin/adwaita-shell` | `exec tessela run /usr/share/adwaita-shell "$@"` (extra arguments go to `tessela run`: `--dev`, `--devtools`, `--nested`) |
| `/usr/lib/systemd/user/adwaita-shell.service` | starts the shell with `graphical-session.target` |
| `/usr/share/fonts/adwaita-shell/Phosphor-Fill.ttf` | the icon font the kit draws glyphs with |

It needs the `tessela` package (built from `../tessela/packaging/rpm`).

## Building

```sh
packaging/rpm/make-sources.sh ~/rpmbuild/SOURCES   # git archive of HEAD + the icon font
sudo dnf builddep packaging/rpm/adwaita-shell.spec
rpmbuild -ba packaging/rpm/adwaita-shell.spec
sudo dnf install ~/rpmbuild/RPMS/noarch/adwaita-shell-*.rpm ~/rpmbuild/RPMS/x86_64/tessela-*.rpm
systemctl --user enable --now adwaita-shell.service   # or run `adwaita-shell`
```

With Hyprland under uwsm, the unit starts with the session; otherwise put
`exec-once = adwaita-shell` in hyprland.conf instead of enabling the unit.

## Runtime dependencies

The plugins run on the system's `python3` and call these commands; the spec
requires the files, so any package that provides them will do (e.g.
`tuned-ppd`'s `powerprofilesctl` on Fedora Workstation instead of
`power-profiles-daemon`):

| command | plugin | Fedora package |
|---|---|---|
| `wpctl` | audio | wireplumber |
| `pw-dump` | audio | pipewire-utils |
| `nmcli` | network | NetworkManager |
| `bluetoothctl` | network | bluez |
| `ip` | network | iproute |
| `playerctl` | media | playerctl |
| `busctl` | notifications, media | systemd |
| `systemd-inhibit` | power (caffeine) | systemd |
| `powerprofilesctl` | power | power-profiles-daemon / tuned-ppd |
| `brightnessctl` | brightness | brightnessctl |

Recommended, not required: `hyprland` (workspaces, windows, the power strip's
actions; the rest runs on any layer-shell compositor) and
`cascadia-mono-fonts`. The theme asks for "CaskaydiaCove Nerd Font", which
Fedora does not ship; without it fontconfig falls back to another font.
Commands that only some setups have are not dependencies: `ai-usage` (the AI
quota chip), `uwsm`, and the apps pinned in `src/data` (ghostty, zeditor, ...).

## License

`(MIT OR Apache-2.0) AND CC-BY-4.0 AND MIT`: the project, the NixOS
snowflake in `assets/` (nixos-artwork, CC-BY-4.0) and the Phosphor font.
